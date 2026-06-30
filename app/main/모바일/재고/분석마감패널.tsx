'use client';

/**
 * 모바일 재고 분석·마감 — 월마감/소모품통계/AS·반품 패널.
 *
 * 본 파일은 분석마감.tsx 의 길이(≤500줄)를 유지하기 위해 분리한 표시 컴포넌트 모음이다.
 * 데이터는 모두 실데이터(PC 동일 테이블/쿼리 미러):
 *  - ClosePane: useClosingData → inventory_closing_snapshots
 *  - UsagePane: useUsageStats → inventory_logs (부서별·기간별 사용액)
 *  - RmaPane:   useReturnsData → inventory_logs (change_type/type='반품')
 *
 * Empty 빈 상태 카드도 여기서 export 하여 분석마감.tsx 와 공유한다.
 */

import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MKpi from '../공통/MKpi';
import MBtn from '../공통/MBtn';
import MListRow from '../공통/MListRow';
import { toast } from '@/lib/toast';
import { toMTone, type AnalyzeWorkcenterData } from './data-hooks';
import { useClosingData } from '../../기능부품/재고관리워크센터/use-closing-data';
import {
  useUsageStats,
  useReturnsData,
  formatWon,
  type UsageStatsData,
  type ReturnsData } from './use-analyze-extra';

// ─── 빈 메시지 ────────────────────────────────────────────────
export function Empty({ msg, tone = 'muted' }: { msg: string; tone?: 'muted' | 'danger' }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: 'center',
        color: tone === 'danger' ? 'var(--m-danger)' : 'var(--z-500)',
        fontSize: 13 }}
    >
      {msg}
    </div>
  );
}

// ─── 마감 탭 (inventory_closing_snapshots 실데이터 — PC useClosingData 미러) ──
const CLOSE_STATE_TONE: Record<'done' | 'on' | 'pending', 'success' | 'warning' | ''> = {
  done: 'success',
  on: 'warning',
  pending: '' };

export function ClosePane() {
  const { history, steps, currentMonthClosed, loading, error } = useClosingData();
  const doneCount = steps.filter((s) => s.state === 'done').length;

  if (loading) return <Empty msg="마감 데이터를 불러오는 중…" />;
  if (error) return <Empty msg={`로드 실패: ${error}`} tone="danger" />;

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div
        className="m-card"
        style={{
          padding: '16px 18px',
          background: 'var(--m-accent-soft)',
          borderColor: 'transparent' }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--m-accent)',
            fontWeight: 800,
            letterSpacing: '0.04em' }}
        >
          이번 달 마감 진행
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: 'var(--m-accent)' }}>
          {currentMonthClosed ? '마감 완료' : `${doneCount} / ${steps.length} 단계`}
        </div>
        <div style={{ fontSize: 11, color: 'var(--m-accent)', fontWeight: 600, marginTop: 2 }}>
          실사 → 입출고 확정 → 차이 조정 → 평가 → 보고서
        </div>
      </div>

      <div className="m-card flush" style={{ marginTop: 12 }}>
        {steps.map((s) => {
          const tone = CLOSE_STATE_TONE[s.state];
          return (
            <div key={s.n} className="m-list-row" style={{ gridTemplateColumns: '40px 1fr auto' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background:
                    s.state === 'done'
                      ? 'var(--m-success)'
                      : s.state === 'on'
                        ? 'var(--m-warning)'
                        : 'var(--z-200)',
                  color: s.state === 'pending' ? 'var(--z-500)' : '#fff',
                  fontWeight: 800,
                  fontSize: 13 }}
              >
                {s.state === 'done' ? '✓' : s.n}
              </div>
              <div className="lbl">{s.title}</div>
              <MChip tone={tone}>{s.desc}</MChip>
            </div>
          );
        })}
      </div>

      <div className="m-section-h" style={{ padding: '18px 0 8px' }}>
        <div className="lbl">최근 마감 결과</div>
      </div>
      {history.length === 0 ? (
        <Empty msg="마감 이력이 없습니다. 월마감을 완료하면 표시됩니다." />
      ) : (
        <div className="m-card flush">
          {history.map((r) => (
            <MListRow
              key={r.month}
              icon="check"
              iconTone={toMTone(r.tone)}
              label={r.month}
              sub={`재고 평가액 ${r.amt} · ${r.done}`}
              badge={r.diff}
              badgeTone={toMTone(r.tone)}
            />
          ))}
        </div>
      )}

      <div style={{ padding: '12px 0 0' }}>
        <MBtn
          block
          variant="primary"
          icon="check"
          ariaLabel="대표 승인 요청"
          onClick={() => toast('대표 승인 요청은 전자결재 모듈에서 상신됩니다.', 'info')}
        >
          대표 승인 요청
        </MBtn>
      </div>
    </div>
  );
}

// ─── 소모품 통계 탭 (inventory_logs 부서별·기간별 사용액 실집계) ───
export function UsagePane({ data }: { data: AnalyzeWorkcenterData }) {
  const usage: UsageStatsData = useUsageStats();

  if (usage.loading) return <Empty msg="사용 통계를 불러오는 중…" />;
  if (usage.error) return <Empty msg={`로드 실패: ${usage.error}`} tone="danger" />;

  const deltaTotal = usage.totalAmount - usage.prevTotalAmount;
  const maxAmt = usage.rows.reduce((m, r) => Math.max(m, r.amount), 0) || 1;

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <MKpi
          label="최근 30일 사용액"
          value={formatWon(usage.totalAmount)}
          sub={`${usage.logCount}건 출고`}
          tone="accent"
        />
        <MKpi
          label="직전 30일 대비"
          value={`${deltaTotal >= 0 ? '+' : ''}${formatWon(deltaTotal).replace('₩', '')}`}
          unit="원"
          sub={`직전 ${formatWon(usage.prevTotalAmount)}`}
          tone={deltaTotal > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="m-section-h">
        <div className="lbl">부서별 사용액 (최근 30일)</div>
      </div>
      {usage.rows.length === 0 ? (
        <Empty msg="최근 30일 출고 이력이 없습니다." />
      ) : (
        <div className="m-card" style={{ padding: '14px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {usage.rows.map((r) => {
              const ratio = Math.round((r.amount / maxAmt) * 100);
              const deltaColor = r.delta > 0 ? 'var(--m-warning)' : 'var(--m-success)';
              return (
                <div key={r.dept}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 0 }}>
                      {r.dept}
                    </span>
                    <span className="m-tnum" style={{ fontSize: 12, fontWeight: 800 }}>
                      {formatWon(r.amount)}
                    </span>
                    <span
                      className="m-tnum"
                      style={{ fontSize: 10.5, fontWeight: 700, color: deltaColor, width: 60, textAlign: 'right' }}
                    >
                      {r.delta >= 0 ? '+' : ''}
                      {formatWon(r.delta).replace('₩', '')}
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
                    <div style={{ width: `${ratio}%`, height: '100%', background: 'var(--m-accent)' }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--z-500)', fontWeight: 600, marginTop: 3 }}>
                    출고 {r.count}건
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
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

// ─── AS·반품 탭 (inventory_logs 반품 로그 실데이터) ────────────
export function RmaPane() {
  const rma: ReturnsData = useReturnsData();

  if (rma.loading) return <Empty msg="AS·반품 데이터를 불러오는 중…" />;
  if (rma.error) return <Empty msg={`로드 실패: ${rma.error}`} tone="danger" />;

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MKpi
          icon="upload"
          label="반품 (30일)"
          value={rma.count30.toLocaleString('ko-KR')}
          unit="건"
          sub={`수량 ${rma.qty30.toLocaleString('ko-KR')}`}
          tone="warning"
        />
        <MKpi
          icon="receipt"
          label="반품 이력"
          value={rma.rows.length.toLocaleString('ko-KR')}
          unit="건"
          sub="최근 기록"
          tone="accent"
        />
      </div>

      <div className="m-section-h" style={{ padding: '18px 0 8px' }}>
        <div className="lbl">반품 내역</div>
      </div>
      {rma.rows.length === 0 ? (
        <Empty msg="반품 기록이 없습니다." />
      ) : (
        <div className="m-card flush">
          {rma.rows.map((r, i) => (
            <MListRow
              key={`${r.date}-${i}`}
              icon="upload"
              iconTone="warning"
              label={r.item}
              sub={`${r.date} · ${r.dept} · ${r.who}`}
              val={r.qty > 0 ? r.qty : undefined}
              valUnit={r.qty > 0 ? 'EA' : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
