'use client';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { toast } from '@/lib/toast';

import { useEffect, useMemo, useRef, useState } from 'react';
import { d1 } from '@/lib/supabase';
import { CERTIFICATE_TYPES } from '@/lib/certificate-types';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import {
  alphaColor,
  fetchDocumentDesignStore,
  resolveDocumentDesign,
} from '@/lib/document-designs';
import {
  openIssuedCertificatePrintView,
  type IssuedCertificate,
  type IssuedCertificateContext,
} from '../마이페이지/certificate-print-utils';

function formatDateLabel(value?: string | null) {
  if (!value) return '현재';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function buildSerialNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const tail = String(Date.now()).slice(-6);
  return `CERT-${year}${month}-${tail}`;
}

function getClosingText(certType: string) {
  const map: Record<string, string> = {
    재직증명서: '위와 같이 현재 재직 중임을 증명합니다.',
    경력증명서: '위와 같이 재직 경력을 증명합니다.',
    퇴직증명서: '위와 같이 퇴직 사실을 증명합니다.',
    급여인증서: '위와 같이 급여 지급 사실을 증명합니다.',
    급여지급증명서: '위와 같이 급여 지급 사실을 증명합니다.',
    보수지급명세서: '위와 같이 보수 지급 사실을 증명합니다.',
    연봉금액확인서: '위와 같이 계약 연봉 금액을 확인합니다.',
    근무확인서: '위와 같이 근무 사실을 확인합니다.',
    '직무교육 이수확인서': '위와 같이 직무교육 이수 사실을 증명합니다.',
    원천징수영수증: '위와 같이 원천징수 사실을 확인합니다.',
    소득금액증명원: '위와 같이 소득 금액을 확인합니다.',
    소득금액증명서: '위와 같이 소득 금액을 확인합니다.',
    근로소득원천징수필증: '위와 같이 근로소득 원천징수 사실을 확인합니다.',
    '근로소득 원천징수확인': '위와 같이 근로소득 원천징수 사실을 확인합니다.',
  };

  return map[certType] || '위와 같이 증명합니다.';
}

export default function CertificateGenerator({ staffs: _staffs = [], selectedCo: _selectedCo = '전체' }: Record<string, unknown>) {
  const staffs = (_staffs as Record<string, unknown>[]);
  const selectedCo = _selectedCo as string;
  const filteredStaffs = useMemo(
    () => staffs.filter((staff: Record<string, unknown>) => selectedCo === '전체' || staff.company === selectedCo),
    [selectedCo, staffs],
  );

  const [selectedStaff, setSelectedStaff] = useState<Record<string, unknown> | null>(null);
  const [certType, setCertType] = useState<string>(CERTIFICATE_TYPES[0]?.id || '재직증명서');
  const [purpose, setPurpose] = useState('기관 제출용');
  const [serialNo, setSerialNo] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [seals, setSeals] = useState<Record<string, string>>({});
  const [design, setDesign] = useState(() => resolveDocumentDesign(null, 'certificate'));
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadResources = async () => {
      const [sealResult, designStore] = await Promise.all([
        d1.from('contract_templates').select('company_name, seal_url'),
        fetchDocumentDesignStore(),
      ]);

      const sealMap: Record<string, string> = {};
      (sealResult.data || []).forEach((row: any) => {
        if (row.company_name && row.seal_url) {
          sealMap[row.company_name] = row.seal_url;
        }
      });
      setSeals(sealMap);
      setDesign(resolveDocumentDesign(designStore, 'certificate', (selectedStaff?.company as string) || selectedCo));
    };

    loadResources().catch((error) => {
      console.error('증명서 리소스 로딩 실패:', error);
    });
  }, [selectedCo, selectedStaff?.company]);

  useEffect(() => {
    if (!showHistory) return;

    const loadHistory = async () => {
      const { data: certData } = await d1
        .from('certificate_issuances')
        .select('*')
        .order('issued_at', { ascending: false })
        .limit(50);

      const rawRows = (certData || []) as Array<Record<string, unknown>>;

      // staff_id 목록 수집 → staff_members 한 번에 조회
      const staffIds = Array.from(
        new Set(rawRows.map((r) => String(r.staff_id || '')).filter(Boolean)),
      );
      let staffLookup: Map<string, { name: string | null; company: string | null }> = new Map();
      if (staffIds.length > 0) {
        const { data: staffData } = await d1
          .from('staff_members')
          .select('id, name, company')
          .in('id', staffIds);
        for (const s of staffData || []) {
          staffLookup.set(String(s.id), { name: s.name ?? null, company: s.company ?? null });
        }
      }

      // JS에서 staff_members 병합
      const merged = rawRows.map((row) => ({
        ...row,
        staff_members: staffLookup.get(String(row.staff_id || '')) ?? null,
      }));

      const filtered = merged.filter((row) => {
        if (selectedCo === '전체') return true;
        return row.staff_members?.company === selectedCo;
      });

      setHistoryList(filtered);
    };

    loadHistory().catch((error) => {
      console.error('증명서 발급 이력 조회 실패:', error);
    });
  }, [selectedCo, showHistory]);

  const selectedCertificate = useMemo(
    () => CERTIFICATE_TYPES.find((item) => item.id === certType) || CERTIFICATE_TYPES[0],
    [certType],
  );

  const companyName = ((selectedStaff?.company as string) || selectedCo || 'SY INC.') as string;
  const companyLabel = design.companyLabel || companyName;
  const primaryColor = design.primaryColor;
  const borderColor = design.borderColor;
  const surface = alphaColor(primaryColor, 0.08);
  const watermarkSrc = seals[companyName] || '/sy-logo.png';
  const profilePhotoUrl = getProfilePhotoUrl(selectedStaff) || undefined;
  const joinedAt = selectedStaff?.joined_at || selectedStaff?.join_date;
  const totalPay = Number(selectedStaff?.base_salary || selectedStaff?.base || 0) + Number(selectedStaff?.meal_allowance || selectedStaff?.meal || 0);
  const rankLabel = selectedStaff?.rank || selectedStaff?.grade || selectedStaff?.level || '-';
  const dutyLabel =
    selectedStaff?.duty ||
    selectedStaff?.job_duty ||
    selectedStaff?.responsibility ||
    selectedStaff?.role ||
    '-';
  const identityRows: Array<[string, string]> = [
    ['성명', (selectedStaff?.name as string) || '-'],
    ['사번', (selectedStaff?.employee_no as string) || String(selectedStaff?.id || '-')],
    ['부서', (selectedStaff?.department as string) || '-'],
    ['직위', (selectedStaff?.position as string) || '-'],
  ];
  const isResigned = selectedStaff?.status === '퇴사';
  const resignedAt = selectedStaff?.resigned_at || selectedStaff?.resign_date;

  const getCertificateRows = () => {
    const baseRows: Array<[string, string]> = [
      ['근무부서', (selectedStaff?.department as string) || '-'],
      ['직위/직급', [(selectedStaff?.position as string), rankLabel].filter(Boolean).join(' / ') || '-'],
    ];

    const joinedLabel = formatDateLabel(joinedAt as string);
    const resignedLabel = resignedAt ? formatDateLabel(resignedAt as string) : '현재';

    if (certType === '퇴직증명서') {
      baseRows.push(
        ['입사일자', joinedLabel],
        ['퇴사일자', resignedAt ? formatDateLabel(resignedAt as string) : '-'],
        ['재직기간', joinedAt ? `${joinedLabel} ~ ${resignedAt ? formatDateLabel(resignedAt as string) : '-'}` : '-']
      );
    } else if (certType === '경력증명서') {
      baseRows.push(
        ['근무기간', joinedAt ? `${joinedLabel} ~ ${resignedLabel}` : '-']
      );
    } else {
      baseRows.push(
        ['입사일자', joinedLabel],
        ['재직기간', joinedAt ? `${joinedLabel} ~ ${resignedLabel}` : '-']
      );
    }

    baseRows.push(['담당업무', dutyLabel as string]);

    if (certType === '퇴직증명서' || (certType === '경력증명서' && isResigned)) {
      baseRows.push(['퇴사사유', (selectedStaff?.resigned_reason || selectedStaff?.resign_reason || '일신상의 사정') as string]);
    }

    const isSalaryCert =
      certType === '급여인증서' ||
      certType === '보수지급명세서' ||
      certType === '연봉금액확인서' ||
      certType === '소득금액증명원' ||
      certType === '원천징수영수증' ||
      certType === '근로소득원천징수필증' ||
      certType === '급여지급증명서' ||
      certType === '소득금액증명서';

    if (isSalaryCert) {
      baseRows.push(['기준 급여', `${totalPay.toLocaleString()}원`]);
    }

    baseRows.push(
      ['발급일자', formatDateLabel(new Date().toISOString())],
      ['발급번호', serialNo || '__SERIAL__']
    );

    return baseRows;
  };

  const certificateRows = getCertificateRows();

  const handleIssue = async () => {
    if (!selectedStaff) {
      toast('발급할 직원을 선택해 주세요.', 'warning');
      return;
    }

    const isMobilePrintFlow =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    let win: Window | null = null;
    if (!isMobilePrintFlow) {
      win = window.open('', '_blank');
      if (!win) {
        toast('인쇄 창을 열 수 없습니다. 팝업 차단을 확인해 주세요.', 'error');
        return;
      }
      try {
        win.document.write('<html><head><title>인쇄 준비 중...</title></head><body><div style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; color: #666;">인쇄를 준비하는 중입니다. 잠시만 기다려 주세요...</div></body></html>');
        win.document.close();
      } catch (e) {
        console.error('팝업 문서 쓰기 실패:', e);
      }
    }

    const nextSerial = buildSerialNo();
    setSerialNo(nextSerial);

    try {
      const rawUser = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEYS.USER) : null;
      const currentUser = rawUser ? JSON.parse(rawUser) : {};

      await d1.from('certificate_issuances').insert({
        staff_id: selectedStaff.id,
        cert_type: certType,
        serial_no: nextSerial,
        purpose,
        issued_by: currentUser?.id || null,
      });
    } catch (error) {
      console.error('증명서 발급 이력 저장 실패:', error);
    }

    // 마이페이지 발급 증명서와 동일한 자체 완결 HTML 빌더로 인쇄한다.
    // (Tailwind/CSS 변수에 의존하던 head 복제 방식은 새 창에서 본문이 비어 출력되는 문제가 있었다.)
    const isSalaryCert =
      certType === '급여인증서' ||
      certType === '보수지급명세서' ||
      certType === '연봉금액확인서' ||
      certType === '소득금액증명원' ||
      certType === '원천징수영수증' ||
      certType === '근로소득원천징수필증' ||
      certType === '급여지급증명서' ||
      certType === '소득금액증명서';
    const cert: IssuedCertificate = {
      id: String(selectedStaff.id ?? ''),
      cert_type: certType,
      serial_no: nextSerial,
      purpose,
      issued_at: new Date().toISOString(),
      staff_members: { name: (selectedStaff.name as string) || null },
    };
    const printContext: IssuedCertificateContext = {
      companyLabel,
      staffName: (selectedStaff.name as string) || null,
      position: (selectedStaff.position as string) || null,
      department: (selectedStaff.department as string) || null,
      joinedAt: (joinedAt as string | undefined) || null,
      sealImageUrl: seals[companyName] || null,
      primaryColor,
      borderColor,
      employeeNo: (selectedStaff.employee_no as string) || String(selectedStaff.id ?? '') || null,
      duty: (dutyLabel as string) || null,
      rank: (rankLabel as string) || null,
      profilePhotoUrl: profilePhotoUrl || null,
      extraInfoRows: isSalaryCert
        ? [{ label: '기준 급여', value: `${totalPay.toLocaleString()}원` }]
        : null,
      resignedAt: (resignedAt as string | undefined) || null,
      resignationReason: (selectedStaff.resigned_reason || selectedStaff.resign_reason || '일신상의 사정') as string,
      isResigned,
    };

    try {
      openIssuedCertificatePrintView(cert, printContext, win);
    } catch (error) {
      console.error('증명서 인쇄 창 열기 실패:', error);
      if (win) {
        try { win.close(); } catch (_) {}
      }
      toast('인쇄 창을 여는 중 오류가 발생했습니다.', 'error');
    }
  };

  const renderCertificatePaper = () => {
    const certificateTitle = selectedCertificate?.label || design.title || '재직증명서';
    const closingText = certificateTitle.includes('재직')
      ? '상기인은 아래와 같이 근무하고 있음을 증명합니다.'
      : getClosingText(selectedCertificate?.id || certType);

    return (
      <div
        ref={printRef}
        className="relative mx-auto w-full max-w-[780px] overflow-hidden bg-[var(--card)] px-5 py-5 shadow-[0_20px_80px_rgba(15,23,42,0.08)]"
        style={{
          border: `1px solid ${borderColor}`,
          minHeight: '980px',
          background: 'linear-gradient(180deg, #ffffff 0%, #fdfefe 78%, #f5f8fa 100%)',
        }}
      >
        <div className="pointer-events-none absolute inset-0">
          <img
            src={watermarkSrc}
            alt=""
            className="absolute left-1/2 top-[52%] h-32 w-32 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.06] mix-blend-multiply"
          />
        </div>

        <div className="relative z-10 flex h-full flex-col">
          <div className="flex items-start gap-4">
            <div
              className="flex h-[72px] w-[72px] items-center justify-center rounded-[var(--radius-lg)] bg-[var(--card)]"
              style={{ border: `1px solid ${borderColor}` }}
            >
              <img src="/sy-logo.png" alt="" className="h-11 w-11 object-contain" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h3 className="mt-1 text-[34px] font-black tracking-[-0.04em] text-[var(--foreground)]">{certificateTitle}</h3>
            </div>
          </div>

          <div className="mt-4 h-[3px] w-full" style={{ backgroundColor: primaryColor }} />

          <div className="mt-5 grid gap-3 md:grid-cols-[86px_1fr]">
            <div>
              <div
                className="overflow-hidden rounded bg-[var(--card)]"
                style={{ border: `1px solid ${borderColor}` }}
              >
                <div className="aspect-[3/4] overflow-hidden bg-[#eef2f6]" style={{ backgroundColor: profilePhotoUrl ? undefined : surface }}>
                {profilePhotoUrl ? (
              <ProfilePhotoThumbnail src={profilePhotoUrl} name={selectedStaff?.name as string} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl font-black text-[var(--toss-gray-3)]">
                    {String(selectedStaff?.name || '?').slice(0, 1)}
                  </div>
                )}
              </div>
              </div>
              <p className="mt-1 text-center text-[8px] font-medium text-[var(--toss-gray-3)]">사진</p>
            </div>

            <div className="space-y-1 pt-0.5">
              {identityRows.map(([label, value], index) => (
                <div
                  key={label}
                  className={`grid grid-cols-[42px_8px_1fr] items-start gap-1.5 ${index < identityRows.length - 1 ? 'border-b pb-1.5' : ''}`}
                  style={{ borderColor }}
                >
                  <span className="text-[9px] font-bold text-[var(--foreground)]">{label}</span>
                  <span className="text-[9px] font-bold text-[var(--foreground)]">:</span>
                  <span className="text-[9px] font-medium leading-[1.35] text-[var(--foreground)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 text-center">
            <p className="text-[14px] font-semibold leading-relaxed text-[var(--foreground)]">
              {closingText}
            </p>
            {design.footerText ? (
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--toss-gray-3)]">{design.footerText}</p>
            ) : null}
          </div>

          <div
            className="mt-5 overflow-hidden bg-[var(--card)]"
            style={{
              borderTop: `2px solid ${primaryColor}`,
              borderBottom: `2px solid ${primaryColor}`,
            }}
          >
            {certificateRows.map(([label, value], index) => (
              <div
                key={label}
                className={`grid grid-cols-[92px_14px_1fr] items-start gap-2 px-4 py-2.5 ${index < certificateRows.length - 1 ? 'border-b' : ''}`}
                style={{ borderColor }}
              >
                <span className="text-[11px] font-bold text-[var(--foreground)]">{label}</span>
                <span className="text-[11px] font-bold text-[var(--foreground)]">:</span>
                <span className="text-[11px] font-medium leading-[1.65] text-[var(--foreground)]">{value}</span>
              </div>
            ))}
          </div>

          {design.showSignArea ? (
            <div className="mt-auto pt-8 text-center">
              <p className="text-[12px] text-[var(--toss-gray-3)]">발급일자 {formatDateLabel(new Date().toISOString())}</p>
              {/* 직인은 회사명 끝에 겹치게 배치하여 위조 방지. 원형 테두리/배경 제거. */}
              <div className="mt-4 flex justify-center items-center">
                <div className="relative inline-flex items-end">
                  <div className="text-center">
                    <p className="text-[34px] font-black tracking-[-0.03em] text-[var(--foreground)]">{companyLabel}</p>
                    <p className="mt-1 text-[12px] font-medium text-[var(--toss-gray-3)]">대표자 / 직인</p>
                  </div>
                </div>
                <div className="-ml-10 relative z-10 flex h-[72px] w-[72px] items-center justify-center">
                  {seals[companyName] ? (
                    <img
                      src={seals[companyName]}
                      alt="seal"
                      className="relative h-[72px] w-[72px] rotate-12 object-contain opacity-95 mix-blend-multiply"
                    />
                  ) : (
                    <div className="relative flex h-[72px] w-[72px] items-center justify-center text-center text-[10px] font-black leading-4 text-red-700 opacity-80">
                      회사
                      <br />
                      직인
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="app-page space-y-5 p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-[var(--toss-gray-3)]">
            회사별 문서 서식을 공통으로 적용해 같은 브랜드 규칙으로 발급합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-[12px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            발급 이력 조회
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="certificate-staff-select"
                  className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]"
                >
                  1. 발급 직원 <span className="text-red-500" aria-hidden>*</span>
                </label>
                <select
                  id="certificate-staff-select"
                  aria-required="true"
                  value={(selectedStaff?.id as string) || ''}
                  onChange={(event) => setSelectedStaff(filteredStaffs.find((staff: any) => staff.id === event.target.value) || null)}
                  className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                >
                  <option value="">직원 선택</option>
                  {filteredStaffs.map((staff: any) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} ({staff.department} / {staff.position})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="certificate-purpose-input"
                  className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]"
                >
                  2. 제출 용도
                </label>
                <input
                  id="certificate-purpose-input"
                  type="text"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  placeholder="예: 금융기관 제출용"
                />
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">
                3. 증명서 종류
              </p>
              <div className="grid gap-2">
                {CERTIFICATE_TYPES.map((item) => {
                  const active = certType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCertType(item.id)}
                      className={`rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all ${
                        active
                          ? 'border-transparent text-white shadow-md'
                          : 'border-[var(--border)] bg-[var(--muted)]/60 text-[var(--foreground)] hover:bg-[var(--muted)]'
                      }`}
                      style={active ? { backgroundColor: primaryColor } : undefined}
                    >
                      <p className="text-sm font-bold">{item.label}</p>
                      <p className={`mt-1 text-[11px] ${active ? 'text-white/80' : 'text-[var(--toss-gray-3)]'}`}>
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleIssue}
              className="mt-4 w-full rounded-[var(--radius-lg)] px-5 py-4 text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              증명서 발급 및 인쇄
            </button>
          </div>

          <div
            className="rounded-[var(--radius-xl)] p-5"
            style={{ backgroundColor: surface, border: `1px solid ${borderColor}` }}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: primaryColor }}>
              문서 규칙
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--foreground)]">
              {companyLabel} 기준 서식이 적용됩니다. 같은 회사의 모든 증명서는 동일한 헤더, 테두리, 하단 문구, 직인 영역을 사용합니다.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm md:p-5">
          {selectedStaff ? renderCertificatePaper() : false ? (
            <div
              ref={printRef}
              className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl p-4 shadow-[0_20px_80px_rgba(15,23,42,0.08)] md:p-5"
              style={{
                border: `1px solid ${borderColor}`,
                background: `linear-gradient(180deg, #ffffff 0%, ${alphaColor(primaryColor, 0.035)} 100%)`,
              }}
            >
              <div className="pointer-events-none absolute inset-0">
                <div
                  className="absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
                  style={{ backgroundColor: alphaColor(primaryColor, 0.12) }}
                />
                <div
                  className="absolute -left-12 bottom-20 h-36 w-36 rounded-full blur-3xl"
                  style={{ backgroundColor: alphaColor(primaryColor, 0.08) }}
                />
                <div
                  className="absolute inset-x-8 top-8 h-px"
                  style={{ background: `linear-gradient(90deg, transparent, ${alphaColor(primaryColor, 0.3)}, transparent)` }}
                />
                <img
                  src={watermarkSrc}
                  alt=""
                  className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.025] mix-blend-multiply"
                />
              </div>

              <div className="relative z-10">
              <div
                className="rounded-[var(--radius-xl)] border px-4 py-4 text-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, ${alphaColor(primaryColor, 0.82)})`,
                  borderColor: alphaColor(primaryColor, 0.22),
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--card)]/95 shadow-sm">
                    <img src="/sy-logo.png" alt="" className="h-12 w-12 object-contain" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black tracking-[0.18em] opacity-80">{companyLabel}</p>
                    <h3 className="mt-2 text-4xl font-black tracking-tight">{selectedCertificate?.label || design.title}</h3>
                  </div>
                </div>
                <div
                  className="mt-5 h-[4px] rounded-full"
                  style={{ background: `linear-gradient(90deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.55) 100%)` }}
                />
              </div>

              <div
                className="mt-4 flex items-center justify-between rounded-[var(--radius-xl)] border px-5 py-4 shadow-sm"
                style={{
                  backgroundColor: alphaColor(primaryColor, 0.075),
                  borderColor: alphaColor(primaryColor, 0.15),
                }}
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">발급번호</p>
                  <p className="mt-1 text-base font-bold text-[var(--foreground)]">{serialNo || '__SERIAL__'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">발급일자</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{formatDateLabel(new Date().toISOString())}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[140px_1fr]">
                <div
                  className="rounded-[var(--radius-xl)] bg-[var(--card)]/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
                  style={{ border: `1px solid ${borderColor}` }}
                >
                  <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-xl)]" style={{ backgroundColor: surface }}>
                    {profilePhotoUrl ? (
                <ProfilePhotoThumbnail src={profilePhotoUrl} name={selectedStaff?.name as string} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl font-black text-[var(--toss-gray-3)]">
                        {String(selectedStaff?.name || '?').slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-center text-[11px] font-semibold text-[var(--toss-gray-3)]">사진</p>
                </div>

                <div
                  className="rounded-[var(--radius-xl)] bg-[var(--card)]/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
                  style={{ border: `1px solid ${borderColor}` }}
                >
                  {identityRows.map(([label, value], index) => (
                    <div
                      key={label}
                      className={`grid grid-cols-[84px_18px_1fr] items-start gap-3 ${index < identityRows.length - 1 ? 'border-b pb-3' : ''} ${index > 0 ? 'pt-3' : ''}`}
                      style={{ borderColor }}
                    >
                      <span className="text-[13px] font-black text-[var(--foreground)]">{label}</span>
                      <span className="text-[13px] font-black text-[var(--foreground)]">:</span>
                      <span className="text-[13px] font-semibold text-[var(--foreground)]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="mt-5 rounded-[var(--radius-xl)] border p-4 text-center"
                style={{
                  background: `linear-gradient(135deg, ${alphaColor(primaryColor, 0.12)}, rgba(255,255,255,0.88))`,
                  borderColor: alphaColor(primaryColor, 0.18),
                }}
              >
                <p className="text-[16px] font-black leading-relaxed text-[var(--foreground)]">
                  {getClosingText(selectedCertificate?.id || certType)}
                </p>
                {design.footerText && (
                  <p className="mt-3 text-[12px] leading-relaxed text-[var(--toss-gray-3)]">
                    {design.footerText}
                  </p>
                )}
              </div>

              <div
                className="mt-5 rounded-[var(--radius-xl)] bg-[var(--card)]/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
                style={{ border: `1px solid ${borderColor}` }}
              >
                {certificateRows.map(([label, value], index) => (
                  <div
                    key={label}
                    className={`grid grid-cols-[96px_18px_1fr] items-start gap-3 ${index < certificateRows.length - 1 ? 'border-b pb-3' : ''} ${index > 0 ? 'pt-3' : ''}`}
                    style={{ borderColor }}
                  >
                    <span className="text-[13px] font-black text-[var(--foreground)]">{label}</span>
                    <span className="text-[13px] font-black text-[var(--foreground)]">:</span>
                    <span className="text-[13px] font-semibold text-[var(--foreground)]">{value}</span>
                  </div>
                ))}
              </div>

              {design.showSignArea && (
                <div className="mt-10 flex justify-center border-t pt-6" style={{ borderColor }}>
                  <div
                    className="flex items-end gap-3 rounded-[var(--radius-xl)] border bg-[var(--card)]/90 px-4 py-4 shadow-sm"
                    style={{ borderColor: alphaColor(primaryColor, 0.18) }}
                  >
                    <div className="text-center">
                      <p className="text-3xl font-black tracking-tight text-[var(--foreground)]">{companyLabel}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">대표자 / 직인</p>
                    </div>
                    <div className="relative flex h-20 w-20 items-center justify-center">
                      <div
                        className="absolute inset-2 rounded-full blur-xl"
                        style={{ backgroundColor: alphaColor(primaryColor, 0.12) }}
                      />
                      {seals[companyName] ? (
                        <img
                          src={seals[companyName]}
                          alt="seal"
                          className="relative h-20 w-20 rotate-12 object-contain opacity-95 mix-blend-multiply"
                        />
                      ) : (
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-double border-red-600 text-[12px] font-black text-red-600 opacity-70">
                          직인
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[720px] flex-col items-center justify-center rounded-[var(--radius-xl)] bg-[var(--muted)]/50 text-center">
              <p className="text-5xl opacity-20">문서</p>
              <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">직원을 선택하면 미리보기가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-[var(--radius-xl)] bg-[var(--card)] p-4 shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--foreground)]">증명서 발급 이력</h3>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {historyList.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] p-4 text-center text-sm text-[var(--toss-gray-3)]">
                  조회된 발급 이력이 없습니다.
                </div>
              ) : (
                historyList.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">
                        {row.staff_members?.name || '직원'} · {row.cert_type}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                        {row.staff_members?.company || '-'} · {row.purpose || '용도 미입력'}
                      </p>
                    </div>
                    <div className="text-[12px] font-semibold text-[var(--toss-gray-3)]">
                      <p>{row.serial_no}</p>
                      <p className="mt-1">{formatDateLabel(row.issued_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
