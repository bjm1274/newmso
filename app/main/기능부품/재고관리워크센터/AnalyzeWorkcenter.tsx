// 재고관리 워크센터 — 4. 분석·마감 (analyze)
//
// 6장 통합: ABC 분석 · 재고 수요예측 · 재고 실사 · 월마감 · 소모품 통계 · AS·반품
// 구조: 4 KPI 행 + 4 탭(ABC / 수요예측 / 실사 / 월마감) + 우측 노트
// 월마감 5단계 워크플로는 다크 배너 (결정 #38)
//
// 데이터 소스 (실데이터):
//  - inventory + inventory_logs: ABC 분류 (사용량 × 단가 기준)
//  - inventory_logs (30일): 수요 예측 (사용 평균 × 30)
//  - inventory: 위치별 실사 진행률 (실사 세션 별도 테이블 미사용 시 단순 그룹)
//  - inventory_closing_snapshots (선택): 월마감 진행 단계

'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  KpiRow,
  StockChip,
  StockDarkBanner,
  StockTabs,
  WorkcenterNotes,
  type KpiItem,
  type TabItem,
} from './stock-workcenter-common';

// ─────────────────────────────────────────────────
// 레거시 재고실사 (dynamic import)
// ─────────────────────────────────────────────────

const LegacyInventoryCount = dynamic(
  () => import('../재고관리서브/재고실사'),
  {
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
      </div>
    ),
    ssr: false,
  },
);

function InventoryCountOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="재고 실사"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 className="text-base font-bold">재고 실사</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4">
          <LegacyInventoryCount user={{}} inventory={[]} fetchInventory={() => {}} />
        </div>
      </div>
    </div>
  );
}
import type {
  AbcGrade,
  AnalyzeTab,
  CloseHistoryRow,
  CloseStep,
  ForecastRow,
  InspectRow,
} from './stock-types';
import { useAnalyzeData, useEmptyMessage } from './stock-workcenter-data';

// 월마감 단계는 일정 기반 placeholder — closing_snapshots에서 동적 단계화는 후속 작업
const CLOSE_STEPS: CloseStep[] = [
  { n: 1, title: '재고 실사', desc: '진행 중', state: 'on' },
  { n: 2, title: '입출고 확정', desc: '대기', state: 'pending' },
  { n: 3, title: '차이 조정', desc: '대기', state: 'pending' },
  { n: 4, title: '재고 평가', desc: '대기', state: 'pending' },
  { n: 5, title: '마감 보고서', desc: '대기', state: 'pending' },
];

const CLOSE_HISTORY: CloseHistoryRow[] = [
  // 실제 closing_snapshots fetch 전 placeholder. 단, dummy 수치는 제거.
  { month: '최근 마감', amt: '-', diff: '-', tone: 'muted', done: '-' },
];

// ─────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────

const TABS: TabItem<AnalyzeTab>[] = [
  { id: 'abc', label: 'ABC 분석' },
  { id: 'pred', label: '수요 예측' },
  { id: 'ins', label: '재고 실사' },
  { id: 'clo', label: '월마감' },
];

export default function AnalyzeWorkcenter() {
  const [tab, setTab] = useState<AnalyzeTab>('abc');
  const [showInspect, setShowInspect] = useState(false);
  const data = useAnalyzeData();

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: 'A등급 (상위 70%)',
        value: data.abcA.toLocaleString(),
        unit: '종',
        sub: data.loading ? '불러오는 중…' : '중점 관리 대상',
      },
      {
        label: 'B등급 (20%)',
        value: data.abcB.toLocaleString(),
        unit: '종',
        sub: '정기 점검',
      },
      {
        label: 'C등급 (10%)',
        value: data.abcC.toLocaleString(),
        unit: '종',
        sub: '최소 관리',
      },
      {
        label: '예측 부족 품목',
        value: data.forecastMissCount.toLocaleString(),
        unit: '건',
        sub: '30일 내 부족 예상',
        tone: 'warn',
      },
    ],
    [data.abcA, data.abcB, data.abcC, data.forecastMissCount, data.loading],
  );

  return (
    <div className="flex flex-col gap-4">
      {showInspect && <InventoryCountOverlay onClose={() => setShowInspect(false)} />}
      <StockTabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="분석·마감 탭" />
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section role="tabpanel">
          {tab === 'abc' && (
            <AbcPanel grades={data.grades} loading={data.loading} error={data.error} />
          )}
          {tab === 'pred' && (
            <ForecastPanel rows={data.forecast} loading={data.loading} error={data.error} />
          )}
          {tab === 'ins' && (
            <InspectPanel
              rows={data.inspects}
              pct={data.inspectProgressPct}
              loading={data.loading}
              error={data.error}
              onStartInspect={() => setShowInspect(true)}
            />
          )}
          {tab === 'clo' && <ClosePanel />}
        </section>

        <WorkcenterNotes
          kicker="§ 분석·마감"
          title="6장 통합 — ABC·수요예측·실사·월마감 한 메뉴"
          points={[
            'ABC 분석: 매출 기여도 기준 A/B/C 등급 progress bar + 칩 예시.',
            '수요 예측: 다음 30일, 신뢰도 칩으로 발주 권장일 시각화.',
            '재고 실사: 위치별 진행률 multi-color bar + 표.',
            '월마감 5단계 워크플로는 다크 배너 — 결정 #38 워크플로형 도구.',
          ]}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// ABC 분석 패널
// ─────────────────────────────────────────────────

const GRADE_COLOR: Record<AbcGrade['grade'], string> = {
  A: 'var(--accent)',
  B: 'var(--success)',
  C: 'var(--toss-gray-4)',
};

function AbcPanel({
  grades,
  loading,
  error,
}: {
  grades: AbcGrade[];
  loading: boolean;
  error: string | null;
}) {
  const emptyMessage = useEmptyMessage(loading, error, grades.length);
  if (emptyMessage) {
    return (
      <p className="app-card px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
        {emptyMessage}
      </p>
    );
  }
  const period = `${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR')} ~ ${new Date().toLocaleDateString('ko-KR')}`;
  return (
    <section className="app-card flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold">ABC 분석 — 매출 기여도 기준</h3>
        <span className="text-[11px] text-[var(--toss-gray-4)]">{period}</span>
      </header>
      <div className="flex flex-col gap-3">
        {grades.map((g) => (
          <article
            key={g.grade}
            className="rounded-[var(--radius-md)] border border-[var(--border)] p-3"
          >
            <header className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[14px] font-extrabold text-white"
                  style={{ background: GRADE_COLOR[g.grade] }}
                >
                  {g.grade}
                </span>
                <b className="text-[13px]">{g.head}</b>
              </div>
            </header>
            <div
              className="my-2 h-2 rounded-full"
              style={{ background: 'var(--muted)' }}
              role="progressbar"
              aria-valuenow={g.contributionPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${g.grade}등급 매출 기여도`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${g.contributionPct}%`, background: GRADE_COLOR[g.grade] }}
              />
            </div>
            <p className="text-[11.5px] text-[var(--toss-gray-4)]">{g.desc}</p>
            {g.examples && g.examples.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.examples.map((e) => (
                  <StockChip key={e} tone="accent">
                    {e}
                  </StockChip>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────
// 수요 예측 패널
// ─────────────────────────────────────────────────

function ForecastPanel({
  rows,
  loading,
  error,
}: {
  rows: ForecastRow[];
  loading: boolean;
  error: string | null;
}) {
  const emptyMessage = useEmptyMessage(loading, error, rows.length);
  return (
    <section className="app-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-[13px] font-bold">수요 예측 — 다음 30일</h3>
        <button
          type="button"
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold hover:bg-[var(--muted)]"
          disabled
          title="준비 중"
        >
          예측 리포트
        </button>
      </header>
      {emptyMessage ? (
        <p className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table compact w-full text-[12px]">
            <thead>
              <tr>
                <th scope="col" className="text-left">품목</th>
                <th scope="col" className="text-right">현재고</th>
                <th scope="col" className="text-right">30일 예측</th>
                <th scope="col" className="text-right">예상 부족</th>
                <th scope="col" className="text-left">발주 권장일</th>
                <th scope="col" className="text-left">신뢰도</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td className="font-bold">{r.name}</td>
                  <td className="text-right tabular-nums">{r.stock}</td>
                  <td className="text-right font-extrabold tabular-nums">{r.pred}</td>
                  <td
                    className="text-right font-extrabold tabular-nums"
                    style={{ color: r.gap < 0 ? 'var(--danger)' : 'var(--success)' }}
                  >
                    {r.gap < 0 ? r.gap : '+' + r.gap}
                  </td>
                  <td
                    className="tabular-nums font-bold"
                    style={{ color: r.when === '즉시' ? 'var(--danger)' : 'var(--accent)' }}
                  >
                    {r.when}
                  </td>
                  <td>
                    <StockChip tone={r.tone}>{r.conf}</StockChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────
// 재고 실사 패널 (78% multi-color bar + 위치별 표)
// ─────────────────────────────────────────────────

function InspectPanel({
  rows,
  pct,
  loading,
  error,
  onStartInspect,
}: {
  rows: InspectRow[];
  pct: number;
  loading: boolean;
  error: string | null;
  onStartInspect: () => void;
}) {
  const emptyMessage = useEmptyMessage(loading, error, rows.length);
  const totalCount = rows.reduce((s, r) => s + r.total, 0);
  const doneCount = rows.reduce((s, r) => s + r.done, 0);

  // reference §1340 — 3 segment(완료·진행·미실시) 분류
  // 완료: ratio>=1 위치의 done 합
  // 진행 중: 0<ratio<1 위치의 done 합 (진행 중 위치에서 처리한 부분)
  // 미실시: 진행 중 위치의 남은(total-done) + ratio==0 위치의 total
  let completedCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;
  for (const r of rows) {
    const ratio = r.total > 0 ? r.done / r.total : 0;
    if (ratio >= 1) {
      completedCount += r.done;
    } else if (ratio > 0) {
      inProgressCount += r.done;
      pendingCount += Math.max(0, r.total - r.done);
    } else {
      pendingCount += r.total;
    }
  }
  // 안전 가드: 합이 totalCount와 일치
  const sum = completedCount + inProgressCount + pendingCount;
  if (sum !== totalCount) {
    // 차이를 미실시로 보정
    pendingCount += totalCount - sum;
  }

  return (
    <section className="app-card flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold">재고 실사 — 위치별 진행률</h3>
        <div className="flex items-center gap-2">
          <StockChip tone="accent">진행률 {pct}%</StockChip>
          <button
            type="button"
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--accent-hover)]"
            onClick={onStartInspect}
          >
            실사 시작
          </button>
        </div>
      </header>
      <div
        className="flex h-6 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`실사 진행률 — 완료 ${completedCount}, 진행 ${inProgressCount}, 미실시 ${pendingCount}`}
      >
        {completedCount > 0 && (
          <div
            className="flex items-center justify-center text-[10px] font-bold text-white"
            style={{ flex: Math.max(1, completedCount), background: 'var(--success)' }}
            title={`완료 ${completedCount}`}
          >
            완료 {completedCount}
          </div>
        )}
        {inProgressCount > 0 && (
          <div
            className="flex items-center justify-center text-[10px] font-bold text-white"
            style={{ flex: Math.max(1, inProgressCount), background: 'var(--warning)' }}
            title={`진행 중 ${inProgressCount}`}
          >
            진행 {inProgressCount}
          </div>
        )}
        {pendingCount > 0 && (
          <div
            className="flex items-center justify-center text-[10px] font-bold text-[var(--toss-gray-5)]"
            style={{ flex: Math.max(1, pendingCount), background: 'var(--muted)' }}
            title={`미실시 ${pendingCount}`}
          >
            미실시 {pendingCount}
          </div>
        )}
      </div>
      {emptyMessage ? (
        <p className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table compact w-full text-[12px]">
            <thead>
              <tr>
                <th scope="col" className="text-left">위치</th>
                <th scope="col" className="text-right">대상</th>
                <th scope="col" className="text-right">완료</th>
                <th scope="col" className="text-right">차이 발견</th>
                <th scope="col" className="text-left">담당자</th>
                <th scope="col" className="text-left">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ratio = r.total > 0 ? r.done / r.total : 0;
                const stateLabel = ratio >= 1 ? '완료' : ratio > 0.7 ? '진행' : '지연';
                return (
                  <tr key={r.loc}>
                    <td className="font-bold">{r.loc}</td>
                    <td className="text-right tabular-nums">{r.total}</td>
                    <td className="text-right font-extrabold tabular-nums">{r.done}</td>
                    <td
                      className="text-right font-extrabold tabular-nums"
                      style={{ color: r.diff > 0 ? 'var(--warning)' : 'var(--toss-gray-4)' }}
                    >
                      {r.diff}
                    </td>
                    <td className="text-[var(--toss-gray-4)]">{r.who}</td>
                    <td>
                      <StockChip tone={r.tone}>{stateLabel}</StockChip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────
// 월마감 패널 (5단계 다크 워크플로 + 최근 마감)
// ─────────────────────────────────────────────────

function ClosePanel() {
  const monthLabel = `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월`;
  return (
    <div className="flex flex-col gap-3">
      <StockDarkBanner
        kicker="MONTHLY CLOSING"
        title={`${monthLabel} 마감 진행`}
        desc="실사 → 입출고 확정 → 차이 조정 → 평가 → 보고서"
      >
        <span className="rounded-[var(--radius-sm)] bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white">
          진행 중
        </span>
      </StockDarkBanner>

      <section
        className="rounded-[var(--radius-lg)] p-4"
        style={{ background: 'var(--zinc-900)', color: '#fff' }}
        aria-label="월마감 5단계"
      >
        <ol className="flex flex-col gap-2">
          {CLOSE_STEPS.map((s) => (
            <li
              key={s.n}
              className={'flex items-center gap-3 ' + (s.state === 'pending' ? 'opacity-60' : '')}
            >
              <span
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold"
                style={{
                  background:
                    s.state === 'done'
                      ? 'var(--success)'
                      : s.state === 'on'
                        ? 'var(--accent)'
                        : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                }}
              >
                {s.state === 'done' ? <Check size={12} aria-hidden /> : s.n}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-bold">{s.title}</span>
                <span className="text-[11px] text-white/70">{s.desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="app-card flex flex-col gap-2 p-3">
        <h3 className="text-[12px] font-bold">최근 마감 결과</h3>
        <p className="px-2 py-3 text-center text-[11px] text-[var(--toss-gray-4)]">
          inventory_closing_snapshots 연동은 후속 작업입니다. 현재는 진행 단계만 표시합니다.
        </p>
        <ul className="flex flex-col gap-1.5">
          {CLOSE_HISTORY.map((r) => (
            <li
              key={r.month}
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2"
            >
              <StockChip tone={r.tone}>{r.diff}</StockChip>
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-bold">{r.month}</span>
                <span className="ml-2 text-[11px] text-[var(--toss-gray-4)]">
                  · 재고 평가액 {r.amt}
                </span>
              </div>
              <span className="text-[11px] tabular-nums text-[var(--toss-gray-4)]">
                완료 {r.done}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
