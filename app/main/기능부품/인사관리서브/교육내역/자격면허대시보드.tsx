'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';

import { useEffect, useMemo, useState } from 'react';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { db, d1 } from '@/lib/db-client';
import {
  buildFallbackLicenseRows,
  getScopedActiveStaffs,
  getStaffDepartment,
  getStaffPosition,
  isLicenseQueryRecoverableError } from './education-utils';

const COPY_URL_FIELDS = ['file_url', 'attachment_url', 'copy_url', 'document_url', 'document_file_url', 'license_file_url'];

interface LicenseItem {
  id: unknown;
  rowId: string;
  staff_id?: unknown;
  staff?: StaffMember;
  copyUrl?: string | null;
  statusLabel?: string;
  statusTone?: string;
  daysLeft?: number | null;
  license_name?: unknown;
  license_number?: unknown;
  issuing_body?: unknown;
  issued_date?: unknown;
  expiry_date?: unknown;
  memo?: unknown;
  [key: string]: unknown;
}

function escapeCsvValue(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function getCopyUrl(item: any) {
  for (const field of COPY_URL_FIELDS) {
    const value = item?.[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getLicenseStatus(expiryDate?: string | null) {
  if (!expiryDate) {
    return { label: '만료일 미등록', tone: 'neutral', daysLeft: null as number | null };
  }

  const diffDays = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { label: '만료됨', tone: 'danger', daysLeft: diffDays };
  }
  if (diffDays <= 30) {
    return { label: '갱신요망(30일내)', tone: 'warning', daysLeft: diffDays };
  }
  return { label: '정상', tone: 'success', daysLeft: diffDays };
}

export default function LicenseTracking({ staffs, selectedCo }: Record<string, unknown>) {
  const { dialog, openConfirm } = useActionDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [licenses, setLicenses] = useState<any[]>([]);
  const [usingFallbackData, setUsingFallbackData] = useState(false);
  const activeStaffs = useMemo(() => getScopedActiveStaffs(staffs as any[] | undefined, selectedCo as string | undefined), [staffs, selectedCo]);
  const fallbackLicenses = useMemo(() => buildFallbackLicenseRows(activeStaffs), [activeStaffs]);
  const staffMap = useMemo(() => new Map(activeStaffs.map((staff: StaffMember) => [String(staff.id), staff])), [activeStaffs]);

  useEffect(() => {
    let isMounted = true;

    const loadLicenses = async () => {
      const { data, error } = await db.from('staff_licenses').select('*');
      if (!isMounted) return;

      if (error) {
        if (!isLicenseQueryRecoverableError(error)) {
          console.error('자격면허 대시보드 로드 실패:', error);
        }
        setLicenses(fallbackLicenses);
        setUsingFallbackData(true);
        return;
      }

      const nextLicenses = data && data.length > 0 ? data : fallbackLicenses;
      setLicenses(nextLicenses);
      setUsingFallbackData(nextLicenses === fallbackLicenses && fallbackLicenses.length > 0);
    };

    void loadLicenses();

    return () => {
      isMounted = false;
    };
  }, [fallbackLicenses]);

  const realLicenses = useMemo((): LicenseItem[] => {
    return licenses
      .map((license: any, index: number) => {
        const staff = staffMap.get(String(license.staff_id));
        if (!staff) return null;

        const status = getLicenseStatus(license.expiry_date);
        const rowId = license.id !== undefined && license.id !== null
          ? String(license.id)
          : `lic-${String(license.staff_id ?? 'unknown')}-${index}`;

        return {
          ...license,
          rowId,
          staff,
          copyUrl: getCopyUrl(license),
          statusLabel: status.label,
          statusTone: status.tone,
          daysLeft: status.daysLeft } as LicenseItem;
      })
      .filter((item): item is LicenseItem => item !== null)
      .sort((a: LicenseItem, b: LicenseItem) => {
        const left = a.daysLeft ?? Number.POSITIVE_INFINITY;
        const right = b.daysLeft ?? Number.POSITIVE_INFINITY;
        return (left as number) - (right as number);
      });
  }, [licenses, staffMap]);

  const filtered = useMemo((): LicenseItem[] => {
    const keyword = searchTerm.trim();
    if (!keyword) return realLicenses;

    return realLicenses.filter((item: LicenseItem) =>
      [item.staff?.name, item.license_name, item.license_number, item.issuing_body].some((value) =>
        String(value ?? '').includes(keyword)
      )
    );
  }, [realLicenses, searchTerm]);

  const urgentCount = realLicenses.filter((item: LicenseItem) => item.statusLabel === '만료됨' || item.statusLabel === '갱신요망(30일내)').length;
  const normalCount = realLicenses.filter((item: LicenseItem) => item.statusLabel === '정상').length;
  const missingExpiryCount = realLicenses.filter((item: LicenseItem) => item.statusLabel === '만료일 미등록').length;

  const handleCsvDownload = () => {
    if (filtered.length === 0) {
      toast('다운로드할 자격면허 데이터가 없습니다.');
      return;
    }

    const rows = [
      ['직원명', '회사', '부서', '직함', '자격/면허명', '자격번호', '발급기관', '발급일', '만료일', '상태', '비고'],
      ...filtered.map((item: LicenseItem) => [
        item.staff?.name || '',
        item.staff?.company || '',
        getStaffDepartment(item.staff),
        getStaffPosition(item.staff),
        item.license_name || '',
        item.license_number || '',
        item.issuing_body || '',
        item.issued_date || '',
        item.expiry_date || '',
        item.statusLabel,
        item.memo || '',
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `자격면허대시보드_${getKoreanTodayString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenCopy = (item: LicenseItem) => {
    if (!item.copyUrl) {
      toast('등록된 사본 파일이 없습니다. 면허·자격증 관리 화면에서 사본 링크를 등록해 주세요.', 'success');
      return;
    }

    window.open(item.copyUrl as string, '_blank', 'noopener,noreferrer');
  };

  const columns = useMemo((): Column<LicenseItem>[] => [
    {
      key: 'staff',
      label: '직원 정보',
      primary: true,
      render: (item) => (
        <div>
          <p className="text-xs font-black text-[var(--foreground)]">{(item.staff?.name as string) ?? '—'}</p>
          <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">
            {(item.staff?.company as string) ?? '—'} | {getStaffDepartment(item.staff)}
            {getStaffPosition(item.staff) ? ` | ${getStaffPosition(item.staff)}` : ''}
          </p>
        </div>
      ) },
    {
      key: 'license_name',
      label: '자격/면허명',
      render: (item) => (item.license_name as string) || '—' },
    {
      key: 'license_number',
      label: '자격 번호',
      render: (item) => (
        <span className="font-mono text-[11px]">{(item.license_number as string) || '—'}</span>
      ) },
    {
      key: 'issuing_body',
      label: '발급기관',
      showOnMobile: false,
      render: (item) => (item.issuing_body as string) || '—' },
    {
      key: 'expiry_date',
      label: '만료(갱신)',
      render: (item) => {
        const daysLeft = item.daysLeft ?? null;
        return (
          <span>
            {(item.expiry_date as string) || '—'}
            {daysLeft !== null && (
              <span className={`ml-2 text-[10px] font-black ${(daysLeft as number) < 0 ? 'text-red-500' : (daysLeft as number) <= 30 ? 'text-orange-500' : 'text-green-600'}`}>
                {(daysLeft as number) < 0 ? `${Math.abs(daysLeft as number)}일 경과` : `${daysLeft as number}일 남음`}
              </span>
            )}
          </span>
        );
      } },
    {
      key: 'statusLabel',
      label: '상태',
      align: 'center',
      render: (item) => {
        const statusToneClass =
          item.statusTone === 'success'
            ? 'bg-green-500/10 text-green-700'
            : item.statusTone === 'warning'
              ? 'bg-orange-500/10 text-orange-600'
              : item.statusTone === 'danger'
                ? 'bg-red-500/10 text-red-600 animate-pulse'
                : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]';
        return (
          <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest ${statusToneClass}`}>
            {(item.statusLabel as string) ?? '—'}
          </span>
        );
      } },
    {
      key: 'actions',
      label: '관리',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => handleOpenCopy(item)}
            className="text-[11px] font-black text-primary hover:underline transition-all"
          >
            사본 보기
          </button>
          {item.statusLabel !== '정상' && (
            <button
              type="button"
              onClick={() => handleSendNotification(item)}
              className="text-[11px] font-black text-white bg-primary px-3 py-1.5 rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-all"
            >
              알림톡
            </button>
          )}
        </div>
      ) },
     
  ], []);

  const handleSendNotification = async (item: LicenseItem) => {
    const confirmed = await openConfirm({
      title: '면허 갱신 알림',
      description: `${item.staff?.name || '대상자'}님에게 ${item.license_name as string} 갱신 알림을 발송합니다.`,
      confirmText: '발송',
      tone: 'accent' });
    if (!confirmed) return;

    const daysLeft = item.daysLeft ?? null;
    const expireMessage = item.expiry_date
      ? daysLeft !== null && (daysLeft as number) < 0
        ? `${Math.abs(daysLeft as number)}일 전에 만료되었습니다.`
        : `${item.expiry_date as string} 만료 예정입니다.`
      : '만료일이 등록되어 있지 않습니다.';

    const { error } = await d1.from('notifications').insert({
      user_id: item.staff_id,
      type: 'license_expiry',
      title: `자격면허 갱신 안내 - ${item.license_name as string}`,
      body: `${item.license_name as string} 자격면허를 확인해 주세요. ${expireMessage} 발급기관: ${(item.issuing_body as string) || '미등록'}`,
      read_at: null });

    if (error) {
      console.error('자격면허 알림 발송 실패:', error);
      toast('알림 발송 중 오류가 발생했습니다.', 'error');
      return;
    }

    toast(`${item.staff?.name}님에게 갱신 안내를 발송했습니다.`, 'success');
  };

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-5">
      {dialog}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-sm font-black text-[var(--foreground)]">자격 및 면허 갱신 대상 트래커</h3>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="이름/자격명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 bg-[var(--card)] rounded-xl text-xs font-bold border border-[var(--border)] outline-none focus:ring-2 focus:ring-primary/20 w-48"
          />
          <button
            type="button"
            onClick={handleCsvDownload}
            className="px-4 py-2 bg-[var(--card)] text-primary text-xs font-black rounded-xl border border-[var(--border)] shadow-sm hover:bg-[var(--tab-bg)] transition-colors"
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)]/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">총 등록 자격증</p>
            <p className="text-2xl font-black text-[var(--foreground)]">{realLicenses.length}건</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-[var(--tab-bg)] flex items-center justify-center text-xs font-black text-[var(--toss-gray-4)]">면허</div>
        </div>
        <div className="bg-danger/5 p-4 rounded-2xl border border-danger/10 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-danger/60 uppercase tracking-widest mb-1">갱신 필요</p>
            <p className="text-2xl font-black text-danger">{urgentCount}건</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center text-xs font-black text-danger">확인</div>
        </div>
        <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)]/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">정상 유지중</p>
            <p className="text-2xl font-black text-[var(--foreground)]">{normalCount}건</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-[var(--tab-bg)] flex items-center justify-center text-xs font-black text-[var(--toss-gray-4)]">정상</div>
        </div>
        <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)]/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">만료일 미등록</p>
            <p className="text-2xl font-black text-[var(--foreground)]">{missingExpiryCount}건</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-[var(--tab-bg)] flex items-center justify-center text-xs font-black text-[var(--toss-gray-4)]">보완</div>
        </div>
      </div>

      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)]/60 shadow-sm overflow-hidden p-2">
        <ResponsiveTable<LicenseItem>
          columns={columns}
          rows={filtered}
          keyField="rowId"
          emptyMessage="데이터가 없습니다."
        />
      </div>
    </div>
  );
}
