'use client';

/**
 * OccupancyChart.tsx — 입원·외래 비율 + 부서별 환자수
 * JM6: figure/figcaption, 색상+텍스트 라벨 병기
 * JM2: useMemo로 max 계산
 */

import { useMemo } from 'react';
import { DEPARTMENT_STATS } from '../dummy-data';

const INPATIENT_COUNT = 1245;
const OUTPATIENT_COUNT = 462;
const TOTAL_PATIENTS = INPATIENT_COUNT + OUTPATIENT_COUNT;

export function OccupancyChart() {
  const inpatientPct = useMemo(
    () => Math.round((INPATIENT_COUNT / TOTAL_PATIENTS) * 1000) / 10,
    []
  );
  const outpatientPct = useMemo(() => Math.round((1 - INPATIENT_COUNT / TOTAL_PATIENTS) * 1000) / 10, []);

  const maxPatients = useMemo(
    () => Math.max(...DEPARTMENT_STATS.map((d) => d.patients)),
    []
  );

  const deptAriaLabel = useMemo(
    () =>
      '부서별 환자수: ' +
      DEPARTMENT_STATS.map((d) => `${d.name} ${d.patients}명`).join(', '),
    []
  );

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      {/* 입원·외래 비율 */}
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">입원·외래 비율</h3>
        <figure
          aria-label={`입원 ${INPATIENT_COUNT}명(${inpatientPct}%), 외래 ${OUTPATIENT_COUNT}명(${outpatientPct}%)`}
        >
          <div className="flex items-center gap-6">
            {/* 비율 바 */}
            <div
              className="flex h-32 flex-1 items-end gap-3"
              role="img"
              aria-label={`입원 ${inpatientPct}%, 외래 ${outpatientPct}%`}
            >
              <div className="relative flex flex-1 flex-col items-center" style={{ height: '100%', justifyContent: 'flex-end' }}>
                <span className="absolute -top-5 text-[10px] font-semibold text-[var(--foreground)]" aria-hidden="true">
                  {inpatientPct}%
                </span>
                <div
                  className="w-full rounded-t-[var(--radius-md)] bg-[var(--accent)]"
                  style={{ height: `${inpatientPct}%` }}
                />
              </div>
              <div className="relative flex flex-1 flex-col items-center" style={{ height: '100%', justifyContent: 'flex-end' }}>
                <span className="absolute -top-5 text-[10px] font-semibold text-[var(--foreground)]" aria-hidden="true">
                  {outpatientPct}%
                </span>
                <div
                  className="w-full rounded-t-[var(--radius-md)]"
                  style={{ height: `${outpatientPct}%`, backgroundColor: '#93c5fd' }}
                />
              </div>
            </div>
            {/* 범례 */}
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-sm bg-[var(--accent)]"
                  aria-hidden="true"
                />
                <span>입원 {INPATIENT_COUNT.toLocaleString()}명</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: '#93c5fd' }}
                  aria-hidden="true"
                />
                <span>외래 {OUTPATIENT_COUNT.toLocaleString()}명</span>
              </div>
            </div>
          </div>
          <figcaption className="mt-5 text-[11px] text-[var(--toss-gray-4)]">
            당월 입원·외래 현황 (총 {TOTAL_PATIENTS.toLocaleString()}명)
          </figcaption>
        </figure>
      </div>

      {/* 부서별 환자수 */}
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">부서별 환자수</h3>
        <figure aria-label={deptAriaLabel}>
          <div
            className="flex items-end gap-2"
            style={{ height: '128px' }}
            role="img"
            aria-label={deptAriaLabel}
          >
            {DEPARTMENT_STATS.map((d) => {
              const heightPct = (d.patients / maxPatients) * 100;
              return (
                <div
                  key={d.id}
                  className="relative flex flex-1 flex-col items-center"
                  style={{ height: '100%', justifyContent: 'flex-end' }}
                >
                  <span
                    className="absolute -top-5 text-[10px] font-semibold text-[var(--foreground)]"
                    aria-hidden="true"
                  >
                    {d.patients}
                  </span>
                  <div
                    className="w-full rounded-t-[var(--radius-md)] bg-[var(--accent)]"
                    style={{ height: `${heightPct}%`, minHeight: '4px' }}
                  />
                  <span className="mt-1 text-[10px] text-[var(--toss-gray-4)]" aria-hidden="true">
                    {d.name}
                  </span>
                </div>
              );
            })}
          </div>
          <figcaption className="mt-8 text-[11px] text-[var(--toss-gray-4)]">
            부서별 월 환자수 (명)
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
