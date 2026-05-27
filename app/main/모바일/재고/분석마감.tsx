'use client';

/**
 * SStockAnalyze — 모바일 재고관리: 분석·마감
 *
 * 핸드오프: m-screens-stock.jsx §SStockAnalyze
 *
 * 6 segment:
 *  - abc: ABC 분류 바 + A 등급 핵심 품목
 *  - forecast: 6월 수요 예측 top 10 + DesktopHint
 *  - count: 실사 진행률 + 위치별 진행 (PC inspect)
 *  - close: 5단계 월마감 진행 (mock — PC와 동기화는 별도 테이블 필요)
 *  - usage: 소모품 사용액 (간이 — PC ABC top 활용)
 *  - rma: AS·반품 KPI + 안내 (실제 데이터는 PC)
 *
 * 데이터: useAnalyzeData() — inventory + inventory_logs
 *
 * JM: ~380줄
 * JM2: 한 번 로드
 * JM4: tab union
 * JM6: 칩바 button + aria-current
 */

import { useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MListRow from '../공통/MListRow';
import {
  useAnalyzeData,
  toMTone,
  type AnalyzeWorkcenterData,
} from './data-hooks';

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

// ─── 빈 메시지 ────────────────────────────────────────────────
function Empty({ msg, tone = 'muted' }: { msg: string; tone?: 'muted' | 'danger' }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: 'center',
        color: tone === 'danger' ? 'var(--m-danger)' : 'var(--z-500)',
        fontSize: 13,
      }}
    >
      {msg}
    </div>
  );
}

// ─── 데스크톱 안내 카드 ──────────────────────────────────────
function DesktopHint({
  children,
  tone = 'accent',
}: {
  children: React.ReactNode;
  tone?: 'accent' | 'warning';
}) {
  const fg = tone === 'accent' ? 'var(--m-accent)' : 'var(--m-warning)';
  const bg = tone === 'accent' ? 'var(--m-accent-soft)' : 'var(--m-warning-soft)';
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--m-radius-md)',
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <MIcon name="info" size={14} />
      {children}
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
            overflow: 'hidden',
          }}
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
            fontWeight: 700,
          }}
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
              borderBottom: '1px solid var(--m-border)',
            }}
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
                  fontSize: 12,
                }}
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
                  gap: 4,
                }}
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
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <DesktopHint>상세 예측 모델 조정은 데스크톱에서</DesktopHint>
      <div className="m-card" style={{ marginTop: 12, padding: '14px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>다음 달 수요 예측 (top {data.forecast.length})</div>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
          최근 30일 사용량 기반
        </div>
        {data.forecast.length === 0 ? (
          <Empty msg="예측 가능한 사용 이력이 없습니다." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {data.forecast.map((r, i) => {
              const ratio = r.pred > 0 ? Math.min((r.pred / 600) * 100, 100) : 0;
              const gapColor =
                r.gap < 0 ? 'var(--m-danger)' : r.gap < r.pred ? 'var(--m-warning)' : 'var(--m-success)';
              return (
                <div key={`${r.name}-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{r.name}</span>
                    <span className="m-tnum" style={{ fontSize: 13, fontWeight: 800 }}>
                      {r.pred}
                    </span>
                    <span
                      className="m-tnum"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: gapColor,
                        width: 48,
                        textAlign: 'right',
                      }}
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
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${ratio}%`,
                        height: '100%',
                        background: 'var(--m-accent)',
                      }}
                    />
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
            marginTop: 4,
          }}
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
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${data.inspectProgressPct}%`,
              height: '100%',
              background: 'var(--m-accent)',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 11,
            color: 'var(--z-500)',
            fontWeight: 700,
          }}
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

// ─── 마감 탭 (정적 단계 표시) ─────────────────────────────────
function ClosePane() {
  const steps: ReadonlyArray<{ t: string; s: '완료' | '진행중' | '대기'; tone: 'success' | 'warning' | '' }> = [
    { t: '재고 실사', s: '완료', tone: 'success' },
    { t: '단가 확정', s: '완료', tone: 'success' },
    { t: '사용액 정산', s: '진행중', tone: 'warning' },
    { t: '부서 배분', s: '대기', tone: '' },
    { t: '대표 승인', s: '대기', tone: '' },
  ];
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div
        className="m-card"
        style={{
          padding: '16px 18px',
          background: 'var(--m-accent-soft)',
          borderColor: 'transparent',
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--m-accent)',
            fontWeight: 800,
            letterSpacing: '0.04em',
          }}
        >
          이번 달 마감 진행
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: 'var(--m-accent)' }}>
          2 / 5 단계 완료
        </div>
      </div>

      <div className="m-card flush" style={{ marginTop: 12 }}>
        {steps.map((s, i) => (
          <div
            key={s.t}
            className="m-list-row"
            style={{ gridTemplateColumns: '40px 1fr auto' }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background:
                  s.tone === 'success'
                    ? 'var(--m-success)'
                    : s.tone === 'warning'
                      ? 'var(--m-warning)'
                      : 'var(--z-200)',
                color: s.tone ? '#fff' : 'var(--z-500)',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              {s.tone === 'success' ? '✓' : i + 1}
            </div>
            <div className="lbl">{s.t}</div>
            <MChip tone={s.tone === 'success' ? 'success' : s.tone === 'warning' ? 'warning' : ''}>
              {s.s}
            </MChip>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 0 0' }}>
        <MBtn block variant="primary" icon="check" ariaLabel="대표 승인 요청">
          대표 승인 요청
        </MBtn>
      </div>

      <div style={{ marginTop: 12 }}>
        <DesktopHint>상세 정산·승인 흐름은 결재 모듈에서 진행하세요</DesktopHint>
      </div>
    </div>
  );
}

// ─── 소모품 통계 탭 (ABC top 활용) ────────────────────────────
function UsagePane({ data }: { data: AnalyzeWorkcenterData }) {
  // A등급의 examples를 부서별 사용 대용 카드로 사용 — 실제 부서 사용 통계는 PC에서.
  if (data.grades.length === 0) return <Empty msg="통계할 데이터가 없습니다." />;
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card" style={{ padding: '14px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>핵심 소모품 (A 등급)</div>
        <div
          className="m-tnum"
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: 'var(--z-900)',
            marginTop: 4,
          }}
        >
          {data.abcA}
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--z-500)',
              marginLeft: 6,
            }}
          >
            종 · 매출 기여 70%
          </span>
        </div>
      </div>

      <DesktopHint>부서별·기간별 사용 통계는 데스크톱에서 분석하세요</DesktopHint>

      <div style={{ marginTop: 12 }}>
        <div className="m-section-h">
          <div className="lbl">예측 미스 (재고 부족 예상)</div>
        </div>
        {data.forecastMissCount === 0 ? (
          <Empty msg="현재 재고 부족 예상 품목이 없습니다." />
        ) : (
          <div className="m-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MIcon name="alertTri" size={18} color="var(--m-warning)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>
                  {data.forecastMissCount}개 품목 부족 예상
                </div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 1 }}>
                  수요예측 탭에서 확인하세요
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AS·반품 탭 ──────────────────────────────────────────────
function RmaPane() {
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <DesktopHint tone="warning">
        AS·반품 진행 등록·갱신은 데스크톱에서 진행하세요
      </DesktopHint>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginTop: 12,
        }}
      >
        <KpiSimple label="AS 진행" hint="모바일 조회 전용" tone="warning" />
        <KpiSimple label="반품 진행" hint="모바일 조회 전용" tone="accent" />
      </div>
    </div>
  );
}

function KpiSimple({
  label,
  hint,
  tone,
}: {
  label: string;
  hint: string;
  tone: 'accent' | 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'accent'
      ? 'var(--m-accent)'
      : tone === 'success'
        ? 'var(--m-success)'
        : tone === 'warning'
          ? 'var(--m-warning)'
          : 'var(--m-danger)';
  return (
    <div className="m-card" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{label}</div>
      <div
        className="m-tnum"
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.025em',
          marginTop: 4,
          color,
        }}
      >
        —
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--z-500)',
          fontWeight: 600,
          marginTop: 2,
        }}
      >
        {hint}
      </div>
    </div>
  );
}
