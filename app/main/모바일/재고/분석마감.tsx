'use client';

/**
 * SStockAnalyze — 모바일 재고관리: 분석·마감
 *
 * 핸드오프: m-screens-stock.jsx §SStockAnalyze
 *
 * 6 segment (모두 실데이터 — PC 동일 테이블/쿼리 미러):
 *  - abc: ABC 분류 바 + A 등급 핵심 품목 (useAnalyzeData)
 *  - forecast: 다음 30일 수요 예측 top 10 — 현재고/예측/부족/발주일/신뢰도 (useAnalyzeData)
 *  - count: 실사 진행률 + 위치별 진행 (useAnalyzeData)
 *  - close: 5단계 월마감 진행 + 최근 마감 이력 (useClosingData → inventory_closing_snapshots)
 *  - usage: 부서별·기간별 사용액 (useUsageStats → inventory_logs)
 *  - rma: AS·반품 실내역 (useReturnsData → inventory_logs change_type='반품')
 *
 * 데이터: useAnalyzeData() — inventory + inventory_logs
 *        useClosingData()/useUsageStats()/useReturnsData() — inventory_closing_snapshots + inventory_logs
 *
 * JM: ~380줄
 * JM2: 한 번 로드
 * JM4: tab union
 * JM6: 칩바 button + aria-current
 */

import { useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MChip from '../공통/MChip';
import MListRow from '../공통/MListRow';
import {
  useAnalyzeData,
  toMTone,
  type AnalyzeWorkcenterData } from './data-hooks';
// 월마감/소모품통계/AS·반품 패널은 분석마감패널.tsx 로 분리(파일 길이 ≤500줄 유지).
import { Empty, ClosePane, UsagePane, RmaPane } from './분석마감패널';

export type AnalyzeTab = 'abc' | 'forecast' | 'count' | 'close' | 'usage' | 'rma';

export type 분석마감Props = {
  company?: string;
  onBack: () => void;
};

const TABS: ReadonlyArray<{ id: AnalyzeTab; label: string }> = [
  { id: 'abc', label: 'ABC 분석' },
  { id: 'forecast', label: '수요예측' },
  { id: 'count', label: '실사' },
  { id: 'close', label: '월마감' },
  { id: 'usage', label: '소모품 통계' },
  { id: 'rma', label: 'AS·반품' },
];

export default function 분석마감({ company, onBack }: 분석마감Props) {
  const [tab, setTab] = useState<AnalyzeTab>('abc');
  const data = useAnalyzeData();

  const now = new Date();
  const ym = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="m-screen">
      <MobileHeader title="재고 분석·마감" sub={`${company ?? ''} · ${ym}`.trim()} back={onBack} />

      <div className="m-chip-bar" role="tablist" aria-label="분석 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="m-scroll">
        {data.loading && <Empty msg="불러오는 중…" />}
        {!data.loading && data.error && <Empty msg={`로드 실패: ${data.error}`} tone="danger" />}

        {!data.loading && !data.error && tab === 'abc' && <AbcPane data={data} />}
        {!data.loading && !data.error && tab === 'forecast' && <ForecastPane data={data} />}
        {!data.loading && !data.error && tab === 'count' && <CountPane data={data} />}
        {!data.loading && !data.error && tab === 'close' && <ClosePane />}
        {!data.loading && !data.error && tab === 'usage' && <UsagePane data={data} />}
        {!data.loading && !data.error && tab === 'rma' && <RmaPane />}
      </div>
    </div>
  );
}

// ─── ABC 탭 ───────────────────────────────────────────────────
function AbcPane({ data }: { data: AnalyzeWorkcenterData }) {
  const total = data.abcA + data.abcB + data.abcC;
  if (total === 0) return <Empty msg="분석할 데이터가 없습니다." />;
  const aPct = Math.round((data.abcA / total) * 100);
  const bPct = Math.round((data.abcB / total) * 100);
  const cPct = 100 - aPct - bPct;

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card" style={{ padding: '14px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
          품목 분포 (총 {total}종)
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 12,
            height: 14,
            borderRadius: 7,
            overflow: 'hidden' }}
        >
          <div style={{ flex: aPct, background: 'var(--m-accent)', height: '100%' }} />
          <div style={{ flex: bPct, background: '#A78BFA', height: '100%' }} />
          <div style={{ flex: cPct || 1, background: 'var(--z-300)', height: '100%' }} />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 8,
            fontSize: 11,
            fontWeight: 700 }}
        >
          <span style={{ color: 'var(--m-accent)' }}>A · {aPct}%</span>
          <span style={{ color: '#7C3AED' }}>B · {bPct}%</span>
          <span style={{ color: 'var(--z-500)' }}>C · {cPct}%</span>
        </div>
      </div>

      <div className="m-section-h">
        <div className="lbl">등급별 정책</div>
      </div>
      <div className="m-card flush">
        {data.grades.map((g) => (
          <div
            key={g.grade}
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--m-border)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background:
                    g.grade === 'A'
                      ? 'var(--m-accent-soft)'
                      : g.grade === 'B'
                        ? '#E5DEFC'
                        : 'var(--z-100)',
                  color:
                    g.grade === 'A'
                      ? 'var(--m-accent)'
                      : g.grade === 'B'
                        ? '#7C3AED'
                        : 'var(--z-600)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 12 }}
              >
                {g.grade}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{g.head}</div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
                  {g.desc}
                </div>
              </div>
            </div>
            {g.examples && g.examples.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4 }}
              >
                {g.examples.map((ex) => (
                  <MChip key={ex} tone="">
                    {ex}
                  </MChip>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 수요예측 탭 ──────────────────────────────────────────────
function ForecastPane({ data }: { data: AnalyzeWorkcenterData }) {
  // PC ForecastRow 그대로(use-analyze-data buildForecast): name/stock/pred/gap/when/conf/tone.
  // 모바일은 현재고·30일 예측·예상 부족·발주 권장일·신뢰도를 모두 노출(데스크톱 전용 메시지 제거).
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card" style={{ padding: '14px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>다음 30일 수요 예측 (top {data.forecast.length})</div>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
          최근 30일 사용량 기반 · 부족 예상 {data.forecastMissCount}건
        </div>
        {data.forecast.length === 0 ? (
          <Empty msg="예측 가능한 사용 이력이 없습니다." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {data.forecast.map((r, i) => {
              const ratio = r.pred > 0 ? Math.min((r.pred / 600) * 100, 100) : 0;
              const gapColor = r.gap < 0 ? 'var(--m-danger)' : 'var(--m-success)';
              return (
                <div key={`${r.name}-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 0 }}>{r.name}</span>
                    <MChip tone={toMTone(r.tone)}>{r.conf}</MChip>
                    <span
                      className="m-tnum"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: gapColor,
                        width: 52,
                        textAlign: 'right' }}
                    >
                      {r.gap > 0 ? '+' : ''}
                      {r.gap}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      height: 5,
                      background: 'var(--z-100)',
                      borderRadius: 999,
                      overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        width: `${ratio}%`,
                        height: '100%',
                        background: 'var(--m-accent)' }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 4,
                      fontSize: 10.5,
                      color: 'var(--z-500)',
                      fontWeight: 600 }}
                  >
                    <span>
                      현재고 <b className="m-tnum">{r.stock}</b> · 30일 예측{' '}
                      <b className="m-tnum">{r.pred}</b>
                    </span>
                    <span style={{ color: r.when === '즉시' ? 'var(--m-danger)' : 'var(--m-accent)' }}>
                      발주 {r.when}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 실사 탭 ──────────────────────────────────────────────────
function CountPane({ data }: { data: AnalyzeWorkcenterData }) {
  const total = data.inspects.reduce((s, x) => s + x.total, 0);
  const done = data.inspects.reduce((s, x) => s + x.done, 0);
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card" style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
          전체 실사 진행률
        </div>
        <div
          className="m-tnum"
          style={{
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: 'var(--m-accent)',
            marginTop: 4 }}
        >
          {done}
          <span style={{ fontSize: 14, color: 'var(--z-500)', marginLeft: 4 }}>/ {total}</span>
        </div>
        <div
          style={{
            marginTop: 10,
            height: 8,
            background: 'var(--z-100)',
            borderRadius: 999,
            overflow: 'hidden' }}
        >
          <div
            style={{
              width: `${data.inspectProgressPct}%`,
              height: '100%',
              background: 'var(--m-accent)' }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 11,
            color: 'var(--z-500)',
            fontWeight: 700 }}
        >
          <span>{data.inspectProgressPct}% 완료</span>
        </div>
      </div>

      <div className="m-section-h" style={{ padding: '18px 0 8px' }}>
        <div className="lbl">위치별 진행</div>
      </div>
      {data.inspects.length === 0 ? (
        <Empty msg="진행 중인 실사가 없습니다." />
      ) : (
        <div className="m-card flush">
          {data.inspects.map((r, i) => (
            <MListRow
              key={`${r.loc}-${i}`}
              icon="mapPin"
              iconTone={toMTone(r.tone)}
              label={r.loc}
              sub={`장부 ${r.total} · 실사 ${r.done}`}
              val={`${Math.round((r.done / Math.max(r.total, 1)) * 100)}%`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
