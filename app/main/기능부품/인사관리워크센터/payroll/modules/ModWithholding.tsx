'use client';

import { useMemo, useState } from 'react';
import { usePayroll, usePayrollData } from '../payroll-context';

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
      count: data.records.length,
    };
  }, [data.records]);

  const [companyName, setCompanyName] = useState<string>(data.selectedCo);
  const [businessNo, setBusinessNo] = useState<string>('');

  const [, mStr] = yearMonth.split('-');
  const filingDate = `${parseInt(mStr || '0', 10)}/10`;

  const handleDownload = () => {
    const header = ['직원명', '주민번호', '과세대상', '소득세', '지방세'];
    const lines = data.records.map((r) => {
      const s = data.staffs.find((st) => String(st.id) === r.staff_id);
      return [s?.name ?? r.staff_id, '-', r.total_taxable, r.income_tax, r.local_tax].join(',');
    });
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `원천징수_${yearMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
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
            className="mt-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-[13px] font-bold hover:bg-[var(--accent-hover)]"
          >
            CSV 파일 다운로드
          </button>
          <p className="text-[10px] text-[var(--toss-gray-3)]">
            ※ 홈택스 일괄 업로드 양식에 맞게 가공 필요. 실 신고는 인증서 서명 후 진행.
          </p>
        </form>

        <div className="app-card p-4">
          <h3 className="section-title">연말정산 / 신고 자료</h3>
          <ul className="mt-3 flex flex-col gap-2 text-[12px]">
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span>근로소득 지급명세서</span>
              <button type="button" className="text-[11px] font-semibold text-[var(--accent)]">다운로드</button>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span>일용근로 지급명세서</span>
              <button type="button" className="text-[11px] font-semibold text-[var(--accent)]">다운로드</button>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span>사업소득(3.3%) 지급명세서</span>
              <button type="button" className="text-[11px] font-semibold text-[var(--accent)]">다운로드</button>
            </li>
            <li className="flex justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[var(--muted)]">
              <span>지방소득세 신고서</span>
              <button type="button" className="text-[11px] font-semibold text-[var(--accent)]">다운로드</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
