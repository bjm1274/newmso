'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { usePayroll, usePayrollData } from '../payroll-context';

const LegacyTaxFileGenerator = dynamic(
  () => import('@/app/main/기능부품/인사관리서브/원천징수파일생성'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <span className="text-[12px] text-[var(--toss-gray-3)]">원천징수 파일 생성기 불러오는 중…</span>
      </div>
    ) },
);

/**
 * #7 원천징수 — 소득세·지방세 집계 + 국세청 제출 파일 생성 폼
 *
 * - 원천징수 신고 일자: 매월 10일까지 전월 분 (hardcoded)
 * - 신고 파일은 CSV(.txt) 다운로드만 — 실 서명·전송은 별도 외부 시스템
 *
 * JM5: 금액은 정수 toLocaleString — 부동소수 누적 X
 */

export default function ModWithholding() {
  const data = usePayrollData();
  const { yearMonth } = usePayroll();

  const summary = useMemo(() => {
    const incomeTax = data.records.reduce((acc, r) => acc + r.income_tax, 0);
    const localTax = data.records.reduce((acc, r) => acc + r.local_tax, 0);
    const taxable = data.records.reduce((acc, r) => acc + r.total_taxable, 0);
    return {
      incomeTax,
      localTax,
      total: incomeTax + localTax,
      taxable,
      count: data.records.length };
  }, [data.records]);

  const [companyName, setCompanyName] = useState<string>(data.selectedCo);
  const [businessNo, setBusinessNo] = useState<string>('');

  // 원천세는 '귀속월 다음 달 10일'까지 신고한다. 과거에는 귀속월 당월 10일을
  // 그대로 찍어(`${귀속월}/10`) 바로 아래 "매월 10일까지" 안내와 겹치며
  // 이미 지난 날짜를 예정일로 보여줬다(8차 D04-013).
  const filingDate = useMemo(() => {
    const [yStr, mStr] = yearMonth.split('-');
    const y = parseInt(yStr || '0', 10);
    const m = parseInt(mStr || '0', 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1) return '-';
    const next = new Date(y, m, 1); // m 은 1-base 이므로 Date 의 0-base 로는 '다음 달'
    return `${next.getMonth() + 1}/10`;
  }, [yearMonth]);

  const handleDownload = () => {
    // 주민번호 열은 값이 항상 상수 '-' 였다 — 이 간이 다운로드는 staffs 스냅샷만 보고
    // 주민번호를 아예 갖고 있지 않다. 있는 척하는 빈 열은 홈택스 제출본으로 오인시키므로
    // 제거한다. 실제 주민번호가 필요한 제출 파일은 아래 '원천징수파일생성' 이 만든다(8차 D04-013).
    const header = ['직원명', '과세대상', '소득세', '지방세'];
    const lines = data.records.map((r) => {
      const s = data.staffs.find((st) => String(st.id) === r.staff_id);
      return [s?.name ?? r.staff_id, r.total_taxable, r.income_tax, r.local_tax].join(',');
    });
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], {
      type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `원천징수_${yearMonth}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="payroll-utility-tax-file">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">정산 인원</div>
          <div className="text-[20px] font-extrabold">{summary.count}<span className="text-[12px] font-medium ml-1">명</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">소득세 합계</div>
          <div className="text-[18px] font-extrabold tabular-nums text-[var(--danger)]">
            {summary.incomeTax.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">지방세 합계</div>
          <div className="text-[18px] font-extrabold tabular-nums text-[var(--danger)]">
            {summary.localTax.toLocaleString()}<span className="text-[11px] font-medium ml-1">원</span>
          </div>
        </div>
        <div className="app-card p-3">
          <div className="text-[11px] text-[var(--toss-gray-4)]">신고 예정일</div>
          <div className="text-[20px] font-extrabold">{filingDate}</div>
          <div className="text-[10px] text-[var(--toss-gray-3)]">매월 10일까지</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <form
          className="app-card p-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleDownload();
          }}
        >
          <h3 className="section-title">국세청 제출 파일 생성</h3>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            회사명
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            사업자등록번호 (XXX-XX-XXXXX)
            <input
              type="text"
              value={businessNo}
              onChange={(e) => setBusinessNo(e.target.value)}
              placeholder="123-45-67890"
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
            귀속 월
            <input
              type="month"
              value={yearMonth}
              readOnly
              className="text-[13px] px-2 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]"
            />
          </label>
          <button
            type="submit"
            data-testid="payroll-tax-download-button"
            className="mt-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-[13px] font-bold hover:bg-[var(--accent-hover)]"
          >
            CSV 파일 다운로드
          </button>
          <p className="text-[10px] text-[var(--toss-gray-3)]">
            ※ 홈택스 일괄 업로드 양식에 맞게 가공 필요. 실 신고는 인증서 서명 후 진행.
          </p>
        </form>

        <div className="app-card p-0 overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
            <h3 className="section-title">홈택스 / EDI / 사내대장 파일 생성</h3>
          </div>
          <LegacyTaxFileGenerator staffs={data.staffs} selectedCo={data.selectedCo} />
        </div>
      </div>
    </div>
  );
}
