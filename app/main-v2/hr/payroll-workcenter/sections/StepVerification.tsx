'use client';

/**
 * StepVerification.tsx — STEP 3: 검증 단계
 *
 * 포함 뷰:
 *   - 4대보험(#46): 보험료 집계 + 이상 내역
 *   - 퇴직연금(#48): DC 가입자 요약 + 점검 항목
 *
 * JM4: any 금지
 * JM6: 시맨틱 table, aria
 */

import React from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import Badge from '@/app/components/v2/Badge';
import Button from '@/app/components/v2/Button';
import Card from '@/app/components/v2/Card';
import Table from '@/app/components/v2/Table';
import {
  INSURANCE_RECORDS, RETIREMENT_PENSION_SUMMARY,
  getEmployeeName, formatKRW,
  type InsuranceRecord,
} from '../dummy-data';

// ── 서브뷰 ID ───────────────────────────────────────────────────────────────────

export type Step3View = 'insurance' | 'retirement-pension';

interface Props {
  activeView: Step3View;
}

// ── 4대보험 (#46) ──────────────────────────────────────────────────────────────

function ViewInsurance() {
  type Row = InsuranceRecord & { name: string } & Record<string, unknown>;
  const rows: Row[] = INSURANCE_RECORDS.map((r) => ({
    ...r,
    name: getEmployeeName(r.employeeId),
  }));

  // 합계 통계
  const totals = INSURANCE_RECORDS.reduce(
    (acc, r) => ({
      pension:    acc.pension    + r.nationalPension,
      health:     acc.health     + r.healthInsurance,
      employment: acc.employment + r.employmentInsurance,
      industrial: acc.industrial + Math.round(r.nationalPension * 0.16),
    }),
    { pension: 0, health: 0, employment: 0, industrial: 0 },
  );

  return (
    <section aria-labelledby="ttl-ins">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-ins" className="text-base font-bold flex items-center gap-2">
          4대보험 <Badge color="gray">#46</Badge>
        </h2>
        <Button variant="secondary" size="sm">EDI 파일 생성</Button>
      </div>

      {/* 합계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {[
          { label: '국민연금 (직원)',  value: totals.pension    },
          { label: '건강보험 (직원)',  value: totals.health     },
          { label: '고용보험 (직원)',  value: totals.employment },
          { label: '산재보험 (사업주)',value: totals.industrial },
        ].map(({ label, value }) => (
          <Card key={label} padding="md">
            <div className="text-xs text-[var(--toss-gray-4)] mb-1">{label}</div>
            <div className="text-lg font-bold">{formatKRW(value)}</div>
          </Card>
        ))}
      </div>

      {/* 명세 테이블 */}
      <Card padding="none">
        <Table<Row>
          ariaLabel="4대보험 명세"
          data={rows}
          rowKey={(r) => r.employeeId}
          columns={[
            { key: 'name',               header: '직원' },
            { key: 'nationalPension',    header: '국민연금',   render: (v) => formatKRW(v as number) },
            { key: 'healthInsurance',    header: '건강보험',   render: (v) => formatKRW(v as number) },
            { key: 'longTermCare',       header: '장기요양',   render: (v) => formatKRW(v as number) },
            { key: 'employmentInsurance',header: '고용보험',   render: (v) => formatKRW(v as number) },
            { key: 'totalDeduction',     header: '합계 공제',  render: (v) => formatKRW(v as number) },
            { key: 'hasIssue',           header: '이상',       render: (v, row) => {
              const r = row as Row;
              return r.hasIssue
                ? <Badge color="red">{r.issueNote ?? '이상'}</Badge>
                : <Badge color="green">정상</Badge>;
            }},
          ]}
        />
      </Card>
    </section>
  );
}

// ── 퇴직연금 (#48) ─────────────────────────────────────────────────────────────

function ViewRetirementPension() {
  const { dcMemberCount, plannedAmount, paymentDate } = RETIREMENT_PENSION_SUMMARY;

  const checkItems = [
    { type: 'ok'   as const, message: '이전 월 납입 완료 확인' },
    { type: 'warn' as const, message: '직원2 DC형 → DB형 전환 처리 필요' },
  ];

  return (
    <section aria-labelledby="ttl-rp">
      <div className="flex items-center justify-between mb-3">
        <h2 id="ttl-rp" className="text-base font-bold flex items-center gap-2">
          퇴직연금 <Badge color="gray">#48</Badge>
        </h2>
        <Button variant="primary" size="sm">납입 확인</Button>
      </div>
      <Card padding="md">
        {/* 요약 타일 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'DC 가입자',   value: `${dcMemberCount}명`          },
            { label: '납입 예정액', value: formatKRW(plannedAmount)       },
            { label: '납입일',      value: paymentDate                    },
          ].map(({ label, value }) => (
            <div key={label} className="text-center p-3 bg-[var(--muted)] rounded-[var(--radius-md)]">
              <div className="text-xs text-[var(--toss-gray-4)] mb-1">{label}</div>
              <div className="text-lg font-bold">{value}</div>
            </div>
          ))}
        </div>

        {/* 점검 항목 */}
        <ul className="flex flex-col gap-1.5" role="list" aria-label="퇴직연금 점검 항목">
          {checkItems.map((item, idx) => (
            <li
              key={idx}
              className={`flex items-center gap-2 p-2 rounded-[var(--radius-md)] text-sm ${
                item.type === 'ok' ? 'bg-[var(--success-light)]' : 'bg-[var(--warning-light)]'
              }`}
            >
              {item.type === 'ok'
                ? <CheckCircle   size={16} className="text-[var(--success)] shrink-0" aria-hidden="true" />
                : <AlertTriangle size={16} className="text-[var(--warning)] shrink-0" aria-hidden="true" />
              }
              <span>{item.message}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

// ── 메인 내보내기 ──────────────────────────────────────────────────────────────

export default function StepVerification({ activeView }: Props) {
  return (
    <>
      {activeView === 'insurance'          && <ViewInsurance />}
      {activeView === 'retirement-pension' && <ViewRetirementPension />}
    </>
  );
}
