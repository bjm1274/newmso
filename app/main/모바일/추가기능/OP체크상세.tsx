'use client';

/**
 * OP체크 상세 — 시술 1건 카드(환자·체크리스트·소모품) + sticky 액션.
 * 체크리스트는 op_patient_checks.prep_items(JSON)에서.
 * 카드 클릭 시 진입(보드의 onOpenDetail).
 * 핸드오프 m-screens-addon-details §AD2 (SOpCheckDetail) 이식.
 * JM: ~230줄.
 * JM3: 체크 토글 실패 시 롤백.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ErpUser, StaffMember } from '@/types';
import { db, d1 } from '@/lib/db-client';
import { isActiveStaff } from '@/lib/active-staff';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/logger';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import { getKoreanTodayString } from '@/lib/seoul-time';
import {
  BOARD_POST_OPTIONAL_COLUMNS,
  BOARD_POST_REQUIRED_SELECT_COLUMNS,
  buildSelectColumns } from '@/app/main/기능부품/게시판공통';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';
import OP메시지시트 from './OP메시지시트';
import { pickText, setOpCardState, type OpCheckCard, type OpCheckCardState } from './data-hooks';

type ReadyNotificationInsert = {
  user_id: string;
  type: 'op_check';
  title: string;
  body: string;
  metadata: {
    schedule_id: string;
    room: string;
    patient: string;
    next_state: OpCheckCardState;
    sender_id: string;
    sender_name: string;
  };
  read_at: null;
  created_at: string;
};

type CheckItem = { id: string; label: string; checked: boolean };

const STEP_LABELS: OpCheckCardState[] = ['준비중', '준비완료', '수술중', '완료'];

export default function OP체크상세({
  user,
  card,
  onBack }: {
  user: ErpUser;
  card: OpCheckCard;
  onBack: () => void;
}) {
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [supplies, setSupplies] = useState<{ id: string; name: string; qty: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localState, setLocalState] = useState<OpCheckCardState>(card.state);
  const [readying, setReadying] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const curStep = STEP_LABELS.indexOf(localState);

  useEffect(() => {
    setLocalState(card.state);
  }, [card.state]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const queries = [
        db
          .from('op_patient_checks')
          .select(
            'id, schedule_post_id, status, prep_items, consumable_items, patient_name, surgery_name, notes',
          )
          .eq('schedule_post_id', card.scheduleId)
          .maybeSingle(),
        db
          .from('board_posts')
          .select(
            buildSelectColumns(
              BOARD_POST_REQUIRED_SELECT_COLUMNS,
              BOARD_POST_OPTIONAL_COLUMNS,
            ),
          )
          .eq('id', card.scheduleId)
          .maybeSingle(),
      ] as const;
      const [{ data: check }, { data: post }] = await Promise.all(queries);

      // 정본 컬럼은 prep_items (과거 코드의 checklist 는 미존재 컬럼)
      const rawChecklist = Array.isArray((check as Record<string, unknown> | null)?.prep_items)
        ? ((check as Record<string, unknown>).prep_items as unknown[])
        : [];
      const nextChecklist: CheckItem[] = rawChecklist.length > 0
        ? rawChecklist.map((it, idx) => {
            const r = it as Record<string, unknown>;
            return {
              id: pickText(r, 'id') || `c-${idx}`,
              label: pickText(r, 'label', 'name') || `체크 ${idx + 1}`,
              checked: Boolean(r.checked) };
          })
        : [
            { id: '1', label: '환자 신원 확인', checked: false },
            { id: '2', label: '시술 동의서 확인', checked: false },
            { id: '3', label: '금속 제거 / 의류 환의', checked: false },
            { id: '4', label: 'IV 라인 확보', checked: false },
            { id: '5', label: '마취 설정 확인', checked: false },
            { id: '6', label: '기구 멸균 상태 확인', checked: false },
          ];
      setChecklist(nextChecklist);

      const rawSupplies = Array.isArray((post as Record<string, unknown> | null)?.supplies)
        ? ((post as Record<string, unknown>).supplies as unknown[])
        : [];
      setSupplies(
        rawSupplies.map((it, idx) => {
          const r = it as Record<string, unknown>;
          return {
            id: pickText(r, 'id') || `s-${idx}`,
            name: pickText(r, 'name', 'label') || `소모품 ${idx + 1}`,
            qty: Number(r.qty ?? r.quantity ?? 1) || 1 };
        }),
      );
    } catch (err) {
      logger.warn('[mobile-addon] op detail load', err);
    } finally {
      setLoading(false);
    }
  }, [card.scheduleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistChecklist = useCallback(
    async (next: CheckItem[]): Promise<{ queued: boolean }> => {
      // 정본 스키마: prep_items(JSON)·updated_by·updated_at. 과거 코드의
      // checklist·last_updated_* 는 미존재 컬럼이라 저장이 무음 실패했다.
      // prep_items 항목은 데스크톱과 호환되도록 name 키도 함께 저장한다.
      const prepItems = next.map((c) => ({
        id: c.id,
        name: c.label,
        label: c.label,
        checked: c.checked }));
      const { queued, error } = await enqueueD1Mutation({
        kind: 'upsert',
        table: 'op_patient_checks',
        payload: {
          schedule_post_id: card.scheduleId,
          schedule_date: getKoreanTodayString(),
          prep_items: prepItems as unknown as Record<string, unknown>[],
          updated_by: user.id,
          updated_by_name: user.name ?? null,
          updated_at: new Date().toISOString() } });
      if (error) {
        const err = new Error(error);
        logger.warn('[mobile-addon] checklist save', err);
        throw err;
      }
      return { queued };
    },
    [card.scheduleId, user.id],
  );

  const toggleCheck = async (id: string) => {
    if (saving) return;
    const prev = checklist;
    const next = checklist.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c));
    setChecklist(next);
    setSaving(true);
    try {
      const { queued } = await persistChecklist(next);
      if (queued) {
        toast('오프라인 — 동기화 대기 중', 'warning');
      }
    } catch {
      setChecklist(prev);
      toast('체크리스트 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const checkedCount = checklist.filter((c) => c.checked).length;

  const markReady = useCallback(async () => {
    if (readying) return;
    if (localState === '준비완료' || localState === '수술중' || localState === '완료') {
      toast('이미 준비 완료 이상 상태입니다.', 'warning');
      return;
    }
    const prev = localState;
    const next: OpCheckCardState = '준비완료';
    setReadying(true);
    setLocalState(next); // 낙관적 업데이트
    try {
      // 1) 상태 전환
      await setOpCardState({ ...card, state: prev }, next, {
        id: user.id,
        name: user.name,
        company: typeof user.company === 'string' ? user.company : null });

      // 2) 같은 부서 담당자에게 notifications 알림 (JM5: 회사·부서 일치만)
      try {
        const company = typeof user.company === 'string' ? user.company : '';
        const dept = typeof user.department === 'string' ? user.department : '';
        let q = db
          .from('staff_members')
          .select('id, name, company, department, status')
          .limit(200);
        if (company) q = q.eq('company', company);
        if (dept) q = q.eq('department', dept);
        const { data: staffData } = await q;
        const targets = ((staffData ?? []) as StaffMember[])
          .filter(isActiveStaff)
          .filter((s) => s.id !== user.id);
        if (targets.length > 0) {
          const now = new Date().toISOString();
          const rows: ReadyNotificationInsert[] = targets.map((t) => ({
            user_id: t.id,
            type: 'op_check',
            title: `[수술방 ${card.room}] 준비 완료`,
            body: `${card.patient} · ${card.procedure} 준비가 완료되었습니다.`,
            metadata: {
              schedule_id: card.scheduleId,
              room: card.room,
              patient: card.patient,
              next_state: next,
              sender_id: user.id,
              sender_name: user.name ?? '' },
            read_at: null,
            created_at: now }));
          const { error: notiErr } = await d1.from('notifications').insert(rows);
          if (notiErr) {
            // 알림은 보조 — 실패해도 상태 전환은 유지
            logger.warn('[mobile-addon] op ready notify', notiErr);
          }
        }
      } catch (notiErr) {
        logger.warn('[mobile-addon] op ready notify load', notiErr);
      }

      toast('준비 완료로 변경했습니다.', 'success');
    } catch (err) {
      logger.warn('[mobile-addon] op ready toggle', err);
      setLocalState(prev); // 롤백
      toast('상태 변경에 실패했습니다.', 'error');
    } finally {
      setReadying(false);
    }
  }, [card, localState, readying, user.id, user.name, user.company, user.department]);

  return (
    <div className="m-screen">
      <MobileHeader
        title="OP 상세"
        sub={`${card.room} · ${card.patient} · ${card.procedure}`}
        back={onBack}
      />

      <div className="m-scroll">
        {/* 진행 단계 */}
        <div style={{ padding: '14px 16px 0' }}>
          <div className="m-card" style={{ padding: '14px 14px' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {STEP_LABELS.map((s, i) => (
                <Step key={s} label={s} active={i <= curStep} current={i === curStep} last={i === STEP_LABELS.length - 1} index={i} />
              ))}
            </div>
          </div>
        </div>

        {/* 환자 카드 */}
        <div style={{ padding: '14px 16px 0' }}>
          <div className="m-card" style={{ padding: '14px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { l: '환자', v: card.patient },
                { l: '시술명', v: card.procedure },
                { l: '주치의', v: card.doctor },
                { l: '시작 예정', v: card.startTime },
                { l: '방', v: card.room },
                { l: '상태', v: localState },
              ].map((r) => (
                <div key={r.l}>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{r.l}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 체크리스트 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">
              수술 전 준비 ({checkedCount}/{checklist.length})
            </div>
          </div>
          <div className="m-card flush" style={{ margin: '0 16px' }}>
            {loading && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                불러오는 중…
              </div>
            )}
            {checklist.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void toggleCheck(p.id)}
                aria-pressed={p.checked}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr',
                  gap: 10,
                  padding: '13px 16px',
                  borderBottom: '1px solid var(--m-border)',
                  alignItems: 'center',
                  textAlign: 'left',
                  width: '100%',
                  background: 'transparent' }}
                disabled={saving}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: p.checked ? 'none' : '1.5px solid var(--z-300)',
                    background: p.checked ? 'var(--m-success)' : 'transparent',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center' }}
                  aria-hidden="true"
                >
                  {p.checked && <MIcon name="check" size={14} />}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: p.checked ? 'var(--z-500)' : 'var(--z-900)',
                    textDecoration: p.checked ? 'line-through' : 'none' }}
                >
                  {p.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 소모품 */}
        {supplies.length > 0 && (
          <div className="m-section">
            <div className="m-section-h">
              <div className="lbl">예상 소모품 {supplies.length}종</div>
            </div>
            <div className="m-card flush" style={{ margin: '0 16px' }}>
              {supplies.map((s) => (
                <div key={s.id} className="m-list-row">
                  <div className="ico-tile tone-accent">
                    <MIcon name="box" size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="lbl">{s.name}</div>
                    <div className="sub">출고 예약</div>
                  </div>
                  <span className="m-tnum" style={{ fontSize: 14, fontWeight: 800 }}>
                    ×{s.qty}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>

      <div className="m-sticky-foot">
        <MBtn block icon="chat" onClick={() => setMsgOpen(true)} disabled={readying} ariaLabel="OP 메시지 보내기">
          메시지
        </MBtn>
        <MBtn
          block
          variant="primary"
          icon="check"
          disabled={saving || readying || localState === '준비완료' || localState === '수술중' || localState === '완료'}
          onClick={() => void markReady()}
          ariaLabel="OP 준비 완료 처리"
        >
          {readying ? '처리 중…' : '준비 완료'}
        </MBtn>
      </div>

      <OP메시지시트
        open={msgOpen}
        card={{ ...card, state: localState }}
        user={user}
        onClose={() => setMsgOpen(false)}
      />
    </div>
  );
}

function Step({
  label,
  active,
  current,
  last,
  index }: {
  label: string;
  active: boolean;
  current: boolean;
  last: boolean;
  index: number;
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 5,
          flex: 1 }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: active ? 'var(--m-accent)' : 'var(--z-200)',
            color: active ? '#fff' : 'var(--z-500)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 800 }}
        >
          {active && !current ? '✓' : index + 1}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: current ? 'var(--m-accent)' : 'var(--z-500)' }}
        >
          {label}
        </span>
      </div>
      {!last && (
        <div
          aria-hidden="true"
          style={{
            flex: 0.4,
            height: 2,
            background: active ? 'var(--m-accent)' : 'var(--z-200)',
            marginBottom: 14 }}
        />
      )}
    </>
  );
}
