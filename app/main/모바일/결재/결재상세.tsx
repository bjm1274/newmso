'use client';

/**
 * SApprovalDetail — 결재 상세 (양식/결재선/코멘트 3 segment + sticky 푸터)
 *   - 헤더: 제목 + 부제 (양식명)
 *   - segment 3개: 양식 / 결재선 / 코멘트
 *   - sticky 푸터: 본인이 현재 결재자일 때만 [반려][승인] 노출, 아니면 [닫기]
 *   - 액션은 /api/approvals/transition 호출 → 낙관적 업데이트 후 실패 시 롤백
 *
 * JM(파일당 500줄), JM2(staff lookup 캐시), JM3(try/catch + 롤백 + toast),
 * JM4(any 금지, Tab/ActionState 유니온), JM5(본인이 현재 결재자인지 클라이언트 확인 + 서버 검증)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { normalizeApprovalAttachments } from '@/lib/approval-report-utils';
import MobileHeader from '../셸/MobileHeader';
import { AttachmentsSection } from './첨부카드';
import MIcon from '../공통/MIcon';
import MChip, { type MChipTone } from '../공통/MChip';
import MAvatar, { type MAvatarTone } from '../공통/MAvatar';
import MCard from '../공통/MCard';
import MBtn from '../공통/MBtn';
import MSheet from '../공통/MSheet';
import {
  fetchApprovalById,
  postTransition,
  postRecall,
  resolveCurrentApproverId,
  resolveLineIds,
  resolveCcUserIds,
  type ApprovalRow } from './data-hooks';
import { buildApprovalPrintHtml } from '../../기능부품/전자결재서브/approval-print-utils';

type DetailTab = 'form' | 'line' | 'comment';

type CommentEntry = {
  id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  action?: string | null;
  note?: string | null;
  at?: string | null;
};

const AVATAR_TONES: MAvatarTone[] = ['blue', 'pink', 'violet', 'orange', 'cyan', 'green'];

function pickAvatarTone(seed: string | null | undefined): MAvatarTone {
  const s = String(seed || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

// MIcon span 래핑 경고 해결을 위해 helper
function IconLabel({ name, size = 15, color }: { name: string; size?: number; color?: string }) {
  return <span style={{ display: 'inline-flex' }}><MIcon name={name} size={size} color={color} /></span>;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

function shortTs(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function readHistory(row: ApprovalRow | null): CommentEntry[] {
  if (!row) return [];
  const meta = (row.meta_data ?? {}) as Record<string, unknown>;
  const history = meta.history;
  if (!Array.isArray(history)) return [];
  return history
    .map((h, idx) => {
      if (h == null || typeof h !== 'object') return null;
      const obj = h as Record<string, unknown>;
      const note = obj.note;
      const action = obj.action;
      return {
        id: `${idx}`,
        actor_id: obj.actor_id != null ? String(obj.actor_id) : null,
        actor_name: obj.actor_name != null ? String(obj.actor_name) : null,
        action: action != null ? String(action) : null,
        note: typeof note === 'string' ? note : null,
        at: obj.at != null ? String(obj.at) : null } as CommentEntry;
    })
    .filter((entry): entry is CommentEntry => entry !== null);
}

function statusChipTone(status?: string | null): MChipTone {
  if (status === '승인') return 'success';
  if (status === '반려') return 'danger';
  if (status === '회수') return '';
  return 'warning';
}

export type SApprovalDetailProps = {
  staffId: string | null;
  staffName: string | null;
  initialRow: ApprovalRow | null;
  approvalId: string;
  onBack: () => void;
  onChanged: () => void;
};

export default function SApprovalDetail({
  staffId,
  staffName,
  initialRow,
  approvalId,
  onBack,
  onChanged }: SApprovalDetailProps) {
  const [tab, setTab] = useState<DetailTab>('form');
  const [row, setRow] = useState<ApprovalRow | null>(initialRow);
  const [busy, setBusy] = useState<'none' | 'approve' | 'reject' | 'recall'>('none');
  const [reason, setReason] = useState('');
  const [sheetAction, setSheetAction] = useState<'approve' | 'reject' | 'recall' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tabbar = document.querySelector('.mobile-bottom-tabbar') || document.querySelector('.m-bottom-tab');
    const shell = document.querySelector('.main-content-mobile-shell');

    tabbar?.classList.add('hidden');
    shell?.classList.remove('pb-[88px]');
    shell?.classList.add('pb-0');
    if (shell instanceof HTMLElement) {
      shell.style.setProperty('--m-sticky-foot-pb', '0px');
    }

    return () => {
      tabbar?.classList.remove('hidden');
      shell?.classList.remove('pb-0');
      shell?.classList.add('pb-[88px]');
      if (shell instanceof HTMLElement) {
        shell.style.removeProperty('--m-sticky-foot-pb');
      }
    };
  }, []);

  // 최초 마운트 시 상세 fetch (라인/comment 최신화)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fresh = await fetchApprovalById(approvalId);
      if (!cancelled && fresh) setRow(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [approvalId]);

  // 결재선 + cc id 통합 후 staff_members 1회 조회
  const lookupIds = useMemo(() => {
    if (!row) return [] as string[];
    const ids = new Set<string>();
    for (const id of resolveLineIds(row)) ids.add(id);
    for (const id of resolveCcUserIds(row)) ids.add(id);
    if (row.sender_id) ids.add(String(row.sender_id));
    return Array.from(ids).filter(Boolean);
  }, [row]);

  const [staffMap, setStaffMap] = useState<Record<string, StaffMember>>({});
  useEffect(() => {
    if (lookupIds.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await db
          .from('staff_members')
          .select('id, name, position, department, company')
          .in('id', lookupIds);
        if (error || !data || cancelled) return;
        const map: Record<string, StaffMember> = {};
        for (const s of data as StaffMember[]) {
          map[String(s.id)] = s;
        }
        setStaffMap(map);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lookupIds]);

  const lineIds = useMemo(() => (row ? resolveLineIds(row) : []), [row]);
  const currentApproverId = useMemo(() => (row ? resolveCurrentApproverId(row) : null), [row]);
  const canApprove = Boolean(
    row && String(row.status) === '대기' && staffId && currentApproverId === staffId
  );
  // 회수 가능: 기안자 본인 + 대기 상태 + 결재 승인 전
  const canRecall = Boolean(
    row && String(row.status) === '대기' && staffId && String(row.sender_id || '') === staffId && !canApprove
  );
  const status = String(row?.status || '');
  const comments = useMemo(() => readHistory(row), [row]);

  const handleAction = useCallback(
    async (action: 'approve' | 'reject') => {
      if (!row) return;
      if (action === 'reject' && !reason.trim()) {
        toast('반려 사유를 입력해 주세요.', 'warning');
        return;
      }
      setBusy(action);
      // 낙관적 업데이트
      const prevRow = row;
      const optimisticStatus = action === 'approve' ? '대기' : '반려';
      setRow({ ...row, status: optimisticStatus });
      try {
        const payload = await postTransition({
          action,
          approvalIds: [String(row.id)],
          reason: reason.trim() || null });
        const result = payload.results?.[0];
        if (!result?.ok) {
          throw new Error(result?.error || '결재 처리 실패');
        }
        if (action === 'approve') {
          toast(result.finalApproval ? '최종 승인되었습니다.' : '승인되어 다음 결재자에게 전달되었습니다.', 'success');
        } else {
          toast('반려 처리했습니다.', 'success');
        }
        setSheetAction(null);
        setReason('');
        // 최신 row 재조회
        const fresh = await fetchApprovalById(approvalId);
        if (fresh) setRow(fresh);
        onChanged();
      } catch (err) {
        // 롤백
        setRow(prevRow);
        toast(`처리 실패: ${err instanceof Error ? err.message : '오류'}`, 'error');
      } finally {
        setBusy('none');
      }
    },
    [row, reason, approvalId, onChanged]
  );

  const handleRecall = useCallback(
    async (note: string) => {
      if (!row) return;
      setBusy('recall');
      const prevRow = row;
      // 낙관적 업데이트
      setRow({ ...row, status: '회수' });
      try {
        const result = await postRecall({ approvalId: String(row.id), note: note.trim() || null });
        if (!result.ok) throw new Error(result.error);
        toast('기안을 회수했습니다. 기안함에서 확인할 수 있습니다.', 'success');
        setSheetAction(null);
        setReason('');
        const fresh = await fetchApprovalById(approvalId);
        if (fresh) setRow(fresh);
        onChanged();
        onBack();
      } catch (err) {
        setRow(prevRow);
        toast(`회수 실패: ${err instanceof Error ? err.message : '오류'}`, 'error');
      } finally {
        setBusy('none');
      }
    },
    [row, approvalId, onChanged, onBack]
  );

  if (!row) {
    return (
      <div className="m-screen" style={{ background: 'transparent' }}>
        <MobileHeader title="결재 상세" back={onBack} />
        <div className="m-scroll" style={{ background: 'transparent' }}>
          <div style={{ textAlign: 'center', padding: '40px 16px', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
            결재 문서를 불러오는 중…
          </div>
        </div>
      </div>
    );
  }

  const formName = String(row.type || '결재 문서');
  const title = String(row.title || formName);

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MobileHeader
        title="결재 상세"
        sub={title}
        back={onBack}
        actions={
          <button
            type="button"
            className="macos-glass macos-squircle-sm transition-all active:scale-95 duration-100"
            aria-label="더보기"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              border: 'none',
              cursor: 'pointer' }}
          >
            <MIcon name="moreV" size={15} color="var(--z-600)" />
          </button>
        }
      />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'transparent',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}
      >
        {/* 아크릴 세그먼트 탭바 */}
        <div
          role="tablist"
          className="macos-glass macos-squircle"
          aria-label="결재 상세 탭"
          style={{
            display: 'flex',
            padding: 3,
            gap: 2 }}
        >
          {([
            { id: 'form', label: '양식' },
            { id: 'line', label: '결재선' },
            { id: 'comment', label: `코멘트 ${comments.length || ''}` },
          ] as const).map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className="transition-all duration-150 active:scale-[0.98]"
                onClick={() => setTab(t.id)}
                role="tab"
                aria-selected={on}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '7px 0',
                  fontSize: 12,
                  fontWeight: 900,
                  borderRadius: 16,
                  border: 'none',
                  background: on ? '#fff' : 'transparent',
                  color: on ? 'var(--z-900)' : 'var(--z-600)',
                  boxShadow: on ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
                  cursor: 'pointer' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        {tab === 'form' && (
          <FormTab row={row} title={title} formName={formName} staffMap={staffMap} />
        )}
        {tab === 'line' && (
          <LineTab row={row} lineIds={lineIds} currentApproverId={currentApproverId} staffMap={staffMap} staffId={staffId} />
        )}
        {tab === 'comment' && (
          <CommentTab comments={comments} staffMap={staffMap} />
        )}
      </div>

      {/* 푸터 영역 햅틱 아크릴 바 */}
      <div
        className="m-sticky-foot macos-glass"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.4)',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.03)',
          padding: '12px 16px 14px' }}
      >
        {canApprove ? (
          <>
            <MBtn block variant="danger" disabled={busy !== 'none'} onClick={() => setSheetAction('reject')}>
              반려
            </MBtn>
            <MBtn block variant="primary" disabled={busy !== 'none'} onClick={() => setSheetAction('approve')}>
              승인
            </MBtn>
          </>
        ) : canRecall ? (
          <>
            <MBtn block onClick={onBack}>
              닫기
            </MBtn>
            <MBtn
              block
              variant="warning"
              disabled={busy !== 'none'}
              ariaLabel="기안 회수"
              onClick={() => setSheetAction('recall')}
            >
              회수
            </MBtn>
          </>
        ) : (
          <>
            <MBtn block onClick={onBack}>
              닫기
            </MBtn>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>
              <MChip tone={statusChipTone(status)}>{status || '상태 없음'}</MChip>
            </div>
          </>
        )}
      </div>

      <MSheet
        open={sheetAction !== null}
        onClose={() => {
          if (busy === 'none') {
            setSheetAction(null);
            setReason('');
          }
        }}
        title={
          sheetAction === 'approve' ? '결재 승인' :
          sheetAction === 'recall' ? '기안 회수' :
          '결재 반려'
        }
      >
        <div
          role="dialog"
          aria-label={
            sheetAction === 'approve' ? '결재 승인 확인' :
            sheetAction === 'recall' ? '기안 회수 확인' :
            '결재 반려 확인'
          }
          style={{ padding: '4px 20px 20px' }}
        >
          <div style={{ fontSize: 12, color: 'var(--z-600)', fontWeight: 800, lineHeight: 1.6, marginBottom: 12 }}>
            {sheetAction === 'approve'
              ? '승인 시 다음 결재자에게 자동 전달됩니다. 코멘트는 선택입니다.'
              : sheetAction === 'recall'
              ? '회수된 문서는 기안함에서 확인할 수 있습니다. 결재자/참조자에게는 더 이상 표시되지 않습니다.'
              : '반려 사유를 입력해 주세요. 기안자에게 전달됩니다.'}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              sheetAction === 'approve' ? '승인 코멘트 (선택)' :
              sheetAction === 'recall' ? '회수 사유 (선택)' :
              '반려 사유'
            }
            rows={4}
            disabled={busy !== 'none'}
            aria-label={
              sheetAction === 'approve' ? '승인 코멘트' :
              sheetAction === 'recall' ? '회수 사유 입력' :
              '반려 사유 입력'
            }
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'rgba(0, 0, 0, 0.02)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.55,
              resize: 'none',
              minHeight: 96 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <MBtn
              block
              disabled={busy !== 'none'}
              onClick={() => {
                setSheetAction(null);
                setReason('');
              }}
            >
              취소
            </MBtn>
            {sheetAction === 'recall' ? (
              <MBtn
                block
                variant="warning"
                disabled={busy !== 'none'}
                ariaLabel="회수 확인"
                onClick={() => handleRecall(reason)}
              >
                {busy === 'none' ? '회수하기' : '처리 중…'}
              </MBtn>
            ) : (
              <MBtn
                block
                variant={sheetAction === 'approve' ? 'primary' : 'danger'}
                disabled={busy !== 'none' || (sheetAction === 'reject' && !reason.trim())}
                onClick={() => {
                  if (sheetAction === 'approve' || sheetAction === 'reject') {
                    void handleAction(sheetAction);
                  }
                }}
              >
                {busy === 'none' ? (sheetAction === 'approve' ? '승인하기' : '반려하기') : '처리 중…'}
              </MBtn>
            )}
          </div>
        </div>
      </MSheet>
    </div>
  );
}

// ─────────────────────────────────────────────
// 하위 — 양식 탭
// ─────────────────────────────────────────────

const resolveApprovalTemplateMeta = (item: Record<string, unknown>) => {
  const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
  const rawType = String(item?.type || '').trim();
  const rawSlug = String(metaData?.form_slug || '').trim();
  const rawName = String(metaData?.form_name || '').trim();
  return {
    slug: rawSlug || rawType || 'generic',
    name: rawName || rawType || '결재 문서' };
};

const resolveApprovalTemplateDesign = (item: Record<string, unknown>) => {
  const template = resolveApprovalTemplateMeta(item);
  const companyName = String(item?.sender_company || '').trim();
  return {
    primaryColor: '#155eef',
    companyLabel: companyName || '오피스 온',
    sealLabel: `${companyName || '오피스 온'} 직인`,
    title: template.name || '결재 문서',
    subtitle: `${template.name || '결재'} 승인 문서`,
    templateName: template.name || '결재 문서',
    templateSlug: template.slug || 'generic' };
};

function FormTab({
  row,
  title,
  formName,
  staffMap }: {
  row: ApprovalRow;
  title: string;
  formName: string;
  staffMap: Record<string, StaffMember>;
}) {
  const docNumber = String(row.doc_number || '').trim();
  const detailPreviewHtml = useMemo(() => {
    return buildApprovalPrintHtml({
      item: row as any,
      approvalDirectoryStaffs: Object.values(staffMap),
      resolveApprovalTemplateDesign,
      resolveApprovalTemplateMeta });
  }, [row, staffMap]);

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="mx-auto mb-4 w-full overflow-hidden rounded-[var(--radius-lg)] border border-slate-200 bg-white shadow-[0_28px_80px_-42px_rgba(15,23,42,0.65)]">
        <iframe
          title={`${title}${docNumber ? ` (${docNumber})` : ''} 미리보기`}
          srcDoc={detailPreviewHtml}
          sandbox=""
          className="block w-full border-0 bg-white"
          style={{ height: 'calc(100dvh - 210px)', minHeight: '480px' }}
        />
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

// ─────────────────────────────────────────────
// 하위 — 결재선 탭
// ─────────────────────────────────────────────

function LineTab({
  row,
  lineIds,
  currentApproverId,
  staffMap,
  staffId }: {
  row: ApprovalRow;
  lineIds: string[];
  currentApproverId: string | null;
  staffMap: Record<string, StaffMember>;
  staffId: string | null;
}) {
  type Step = {
    id: string;
    who: string;
    dept: string;
    step: string;
    state: string;
    tone: MChipTone;
    ts: string;
  };

  const steps: Step[] = [];
  if (row.sender_id) {
    const s = staffMap[String(row.sender_id)];
    steps.push({
      id: `sender-${row.sender_id}`,
      who: s?.name || String(row.sender_name || '기안자'),
      dept: [s?.department, s?.position].filter(Boolean).join(' / ') || String(row.sender_department || '').trim(),
      step: '기안',
      state: '완료',
      tone: 'accent',
      ts: shortTs(row.created_at) });
  }

  const curIdx = lineIds.findIndex((id) => id === currentApproverId);
  for (let i = 0; i < lineIds.length; i++) {
    const id = lineIds[i];
    const s = staffMap[id];
    const isCurrent = currentApproverId === id;
    const isMe = staffId === id;
    const isDone = String(row.status) === '승인' || (curIdx >= 0 && i < curIdx);
    const isRejected = String(row.status) === '반려' && isCurrent;
    let state = '대기';
    let tone: MChipTone = '';
    if (isRejected) {
      state = '반려';
      tone = 'danger';
    } else if (isDone) {
      state = '완료';
      tone = 'success';
    } else if (isCurrent) {
      state = isMe ? '대기 (나)' : '대기';
      tone = isMe ? 'warning' : 'accent';
    }
    steps.push({
      id: `approver-${id}-${i}`,
      who: s?.name || `결재자 ${i + 1}`,
      dept: [s?.department, s?.position].filter(Boolean).join(' / '),
      step: i === lineIds.length - 1 ? '최종 결재' : i === 0 ? '1차 검토' : `${i + 1}차 검토`,
      state,
      tone,
      ts: '-' });
  }

  return (
    <div style={{ padding: '14px 16px 0' }}>
      {steps.length === 0 ? (
        <MCard className="macos-glass macos-squircle" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-600)' }}>
            결재선이 지정되지 않았습니다
          </div>
        </MCard>
      ) : (
        <MCard
          className="macos-glass macos-squircle"
          style={{
            overflow: 'hidden',
            padding: 0 }}
        >
          <ol style={{ listStyle: 'none' }} aria-label="결재 진행 순서">
            {steps.map((l, i) => (
              <li
                key={l.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr auto',
                  gap: 12,
                  padding: '14px 16px',
                  borderBottom: i < steps.length - 1 ? '1px solid rgba(0, 0, 0, 0.04)' : 'none',
                  position: 'relative' }}
              >
                <div style={{ position: 'relative' }}>
                  <MAvatar tone={pickAvatarTone(l.id)} size="sm">
                    {l.who.charAt(0) || '?'}
                  </MAvatar>
                  {i < steps.length - 1 && (
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: 32,
                        bottom: -14,
                        width: 1,
                        background: 'rgba(0, 0, 0, 0.08)',
                        transform: 'translateX(-50%)' }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>{l.step}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, marginTop: 1, color: 'var(--z-900)' }}>{l.who}</div>
                  {l.dept && (
                    <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1, fontWeight: 600 }}>{l.dept}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <MChip tone={l.tone}>{l.state}</MChip>
                  <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700, marginTop: 4 }}>
                    {l.ts}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </MCard>
      )}
      <div style={{ height: 16 }} />
    </div>
  );
}

// ─────────────────────────────────────────────
// 하위 — 코멘트 탭
// ─────────────────────────────────────────────

function CommentTab({
  comments,
  staffMap }: {
  comments: CommentEntry[];
  staffMap: Record<string, StaffMember>;
}) {
  const filtered = comments.filter((c) => c.note || c.action);
  return (
    <div style={{ padding: '14px 16px 0' }}>
      {filtered.length === 0 ? (
        <MCard className="macos-glass macos-squircle" style={{ padding: '24px 16px', textAlign: 'center' }}>
          <IconLabel name="chat" size={24} color="var(--z-400)" />
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: 'var(--z-600)' }}>
            코멘트가 없습니다
          </div>
        </MCard>
      ) : (
        filtered.map((c) => {
          const name = c.actor_name || (c.actor_id ? staffMap[c.actor_id]?.name : '') || '시스템';
          const tone = pickAvatarTone(c.actor_id || name);
          return (
            <div
              key={c.id}
              className="macos-glass macos-squircle"
              style={{
                display: 'flex',
                gap: 10,
                marginBottom: 12,
                padding: '12px 14px' }}
            >
              <MAvatar tone={tone} size="sm">
                {(name || '?').charAt(0)}
              </MAvatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <b style={{ fontSize: 12, fontWeight: 900, color: 'var(--z-900)' }}>{name}</b>
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>
                    {formatDateTime(c.at)}
                  </span>
                  {c.action && c.action !== 'commented' && (
                    <MChip tone={c.action === 'approved' ? 'success' : c.action === 'rejected' ? 'danger' : ''}>
                      {c.action === 'approved' ? '승인' : c.action === 'rejected' ? '반려' : c.action}
                    </MChip>
                  )}
                </div>
                {c.note && (
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--z-800)',
                      marginTop: 6,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontWeight: 600 }}
                  >
                    {c.note}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
      <div style={{ height: 16 }} />
    </div>
  );
}
