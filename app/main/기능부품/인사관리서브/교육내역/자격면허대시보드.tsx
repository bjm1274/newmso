'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getScopedActiveStaffs, getStaffDepartment, getStaffPosition } from './education-utils';

const COPY_URL_FIELDS = ['file_url', 'attachment_url', 'copy_url', 'document_url', 'document_file_url', 'license_file_url'];

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

export default function LicenseTracking({ staffs, selectedCo }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const [licenses, setLicenses] = useState<any[]>([]);
  const activeStaffs = useMemo(() => getScopedActiveStaffs(staffs, selectedCo), [staffs, selectedCo]);
  const staffMap = useMemo(() => new Map(activeStaffs.map((staff: any) => [String(staff.id), staff])), [activeStaffs]);

  useEffect(() => {
    const loadLicenses = async () => {
      const { data, error } = await supabase.from('staff_licenses').select('*');
      if (error) {
        console.error('자격면허 대시보드 로드 실패:', error);
        setLicenses([]);
        return;
      }
      setLicenses(data || []);
    };

    void loadLicenses();
  }, []);

  const realLicenses = useMemo(() => {
    return licenses
      .map((license: any) => {
        const staff = staffMap.get(String(license.staff_id));
        if (!staff) return null;

        const status = getLicenseStatus(license.expiry_date);

        return {
          ...license,
          staff,
          copyUrl: getCopyUrl(license),
          statusLabel: status.label,
          statusTone: status.tone,
          daysLeft: status.daysLeft,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const left = a.daysLeft ?? Number.POSITIVE_INFINITY;
        const right = b.daysLeft ?? Number.POSITIVE_INFINITY;
        return left - right;
      });
  }, [licenses, staffMap]);

  const filtered = useMemo(() => {
    const keyword = searchTerm.trim();
    if (!keyword) return realLicenses;

    return realLicenses.filter((item: any) =>
      [item.staff?.name, item.license_name, item.license_number, item.issuing_body].some((value) =>
        String(value ?? '').includes(keyword)
      )
    );
  }, [realLicenses, searchTerm]);

  const urgentCount = realLicenses.filter((item: any) => item.statusLabel === '만료됨' || item.statusLabel === '갱신요망(30일내)').length;
  const normalCount = realLicenses.filter((item: any) => item.statusLabel === '정상').length;
  const missingExpiryCount = realLicenses.filter((item: any) => item.statusLabel === '만료일 미등록').length;

  const handleCsvDownload = () => {
    if (filtered.length === 0) {
      alert('다운로드할 자격면허 데이터가 없습니다.');
      return;
    }

    const rows = [
      ['직원명', '회사', '부서', '직함', '자격/면허명', '자격번호', '발급기관', '발급일', '만료일', '상태', '비고'],
      ...filtered.map((item: any) => [
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
    link.download = `자격면허대시보드_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenCopy = (item: any) => {
    if (!item.copyUrl) {
      alert('등록된 사본 파일이 없습니다. 면허·자격증 관리 화면에서 사본 링크를 등록해 주세요.');
      return;
    }

    window.open(item.copyUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendNotification = async (item: any) => {
    if (!confirm(`${item.staff?.name}님에게 ${item.license_name} 갱신 알림을 보낼까요?`)) return;

    const expireMessage = item.expiry_date
      ? item.daysLeft !== null && item.daysLeft < 0
        ? `${Math.abs(item.daysLeft)}일 전에 만료되었습니다.`
        : `${item.expiry_date} 만료 예정입니다.`
      : '만료일이 등록되어 있지 않습니다.';

    const { error } = await supabase.from('notifications').insert({
      user_id: item.staff_id,
      type: 'license_expiry',
      title: `자격면허 갱신 안내 - ${item.license_name}`,
      body: `${item.license_name} 자격면허를 확인해 주세요. ${expireMessage} 발급기관: ${item.issuing_body || '미등록'}`,
      read_at: null,
    });

    if (error) {
      console.error('자격면허 알림 발송 실패:', error);
      alert('알림 발송 중 오류가 발생했습니다.');
      return;
    }

    alert(`${item.staff?.name}님에게 갱신 안내를 발송했습니다.`);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-sm font-black text-slate-800">자격 및 면허 갱신 대상 트래커</h3>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Certification & License Lifecycle</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="이름/자격명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 bg-white rounded-xl text-xs font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-primary/20 w-48"
          />
          <button
            type="button"
            onClick={handleCsvDownload}
            className="px-4 py-2 bg-white text-primary text-xs font-black rounded-xl border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">총 등록 자격증</p>
            <p className="text-2xl font-black text-slate-800">{realLicenses.length}건</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500">면허</div>
        </div>
        <div className="bg-danger/5 p-6 rounded-2xl border border-danger/10 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-danger/60 uppercase tracking-widest mb-1">갱신 필요</p>
            <p className="text-2xl font-black text-danger">{urgentCount}건</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center text-xs font-black text-danger">확인</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">정상 유지중</p>
            <p className="text-2xl font-black text-slate-800">{normalCount}건</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500">정상</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">만료일 미등록</p>
            <p className="text-2xl font-black text-slate-800">{missingExpiryCount}건</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500">보완</div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[980px]">
            <thead className="bg-slate-50 border-b border-slate-200/60">
              <tr>
                <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">직원 정보</th>
                <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">자격/면허명</th>
                <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">자격 번호</th>
                <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">발급기관</th>
                <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest">만료(갱신) 예정일</th>
                <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">상태</th>
                <th className="p-4 text-[11px] font-black text-slate-500 uppercase tracking-widest text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any) => {
                const statusToneClass =
                  item.statusTone === 'success'
                    ? 'bg-green-50 text-green-700'
                    : item.statusTone === 'warning'
                      ? 'bg-orange-50 text-orange-600'
                      : item.statusTone === 'danger'
                        ? 'bg-red-50 text-red-600 animate-pulse'
                        : 'bg-slate-100 text-slate-500';

                return (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <p className="text-xs font-black text-slate-800">{item.staff?.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">
                        {item.staff?.company} | {getStaffDepartment(item.staff)}
                        {getStaffPosition(item.staff) ? ` | ${getStaffPosition(item.staff)}` : ''}
                      </p>
                    </td>
                    <td className="p-4 text-xs font-bold text-slate-700">{item.license_name || '-'}</td>
                    <td className="p-4 text-[11px] font-mono text-slate-500 font-bold">{item.license_number || '-'}</td>
                    <td className="p-4 text-xs font-bold text-slate-700">{item.issuing_body || '-'}</td>
                    <td className="p-4 text-xs font-bold text-slate-700">
                      {item.expiry_date || '-'}
                      {item.daysLeft !== null && (
                        <span className={`ml-2 text-[10px] font-black ${item.daysLeft < 0 ? 'text-red-500' : item.daysLeft <= 30 ? 'text-orange-500' : 'text-green-600'}`}>
                          {item.daysLeft < 0 ? `${Math.abs(item.daysLeft)}일 경과` : `${item.daysLeft}일 남음`}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest ${statusToneClass}`}>
                        {item.statusLabel}
                      </span>
                    </td>
                    <td className="p-4 text-right">
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
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-xs font-bold text-slate-400">데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
