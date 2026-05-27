'use client';
// touch v2: force Turbopack chunk invalidation (2026-05-27 build cache stale)

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
import { supabase } from '@/lib/supabase';
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
  resolveCurrentApproverId,
  resolveLineIds,
  resolveCcUserIds,
  type ApprovalRow,
} from './data-hooks';

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
        at: obj.at != null ? String(obj.at) : null,
      } as CommentEntry;
    })
    .filter((entry): entry is CommentEntry => entry !== null);
}

function readFormFields(row: ApprovalRow): Array<{ label: string; value: string; big?: boolean }> {
  const meta = (row.meta_data ?? {}) as Record<string, unknown>;
  const fields = meta.fields ?? meta.form_fields ?? meta.summary;
  const rows: Array<{ label: string; value: string; big?: boolean }> = [];

  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (f && typeof f === 'object') {
        const obj = f as Record<string, unknown>;
        const label = String(obj.label ?? obj.name ?? '').trim();
        const value = obj.value ?? obj.text;
        if (label && value != null) {
          rows.push({ label, value: String(value), big: false });
        }
      }
    }
  } else if (fields && typeof fields === 'object') {
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      if (value == null || typeof value === 'object') continue;
      rows.push({ label: key, value: String(value), big: false });
    }
  }

  // 금액 강조
  const amount = meta.total_amount ?? meta.amount;
  if (amount != null) {
    const num = typeof amount === 'number' ? amount : Number(String(amount).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(num) && num !== 0) {
      rows.push({ label: '금액', value: `₩ ${num.toLocaleString('ko-KR')}`, big: true });
    }
  }
  return rows;
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
  onChanged,
}: SApprovalDetailProps) {
  const [tab, setTab] = useState<DetailTab>('form');
  const [row, setRow] = useState<ApprovalRow | null>(initialRow);
  const [busy, setBusy] = useState<'none' | 'approve' | 'reject'>('none');
  const [reason, setReason] = useState('');
  const [sheetAction, setSheetAction] = useState<'approve' | 'reject' | null>(null);

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
        const { data, error } = await supabase
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
          reason: reason.trim() || null,
        });
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

  if (!row) {
    return (
      <div className="m-screen">
        <MobileHeader title="결재 상세" back={onBack} />
        <div className="m-scroll">
          <div style={{ textAlign: 'center', padding: '40px 16px', fontSize: 13, color: 'var(--z-500)' }}>
            결재 문서를 불러오는 중…
          </div>
        </div>
      </div>
    );
  }

  const formName = String(row.type || '결재 문서');
  const title = String(row.title || formName);

  return (
    <div className="m-screen">
      <MobileHeader
        title="결재 상세"
        sub={title}
        back={onBack}
        actions={
          <button type="button" aria-label="더보기">
            <MIcon name="moreV" size={20} />
          </button>
        }
      />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg" role="tablist" aria-label="결재 상세 탭">
          <button
            type="button"
            className={tab === 'form' ? 'on' : ''}
            onClick={() => setTab('form')}
            role="tab"
            aria-selected={tab === 'form'}
          >
            양식
          </button>
          <button
            type="button"
            className={tab === 'line' ? 'on' : ''}
            onClick={() => setTab('line')}
            role="tab"
            aria-selected={tab === 'line'}
          >
            결재선
          </button>
          <button
            type="button"
            className={tab === 'comment' ? 'on' : ''}
            onClick={() => setTab('comment')}
            role="tab"
            aria-selected={tab === 'comment'}
          >
            코멘트 {comments.length || ''}
          </button>
        </div>
      </div>

      <div className="m-scroll">
        {tab === 'form' && (
          <FormTab row={row} title={title} formName={formName} />
        )}
        {tab === 'line' && (
          <LineTab row={row} lineIds={lineIds} currentApproverId={currentApproverId} staffMap={staffMap} staffId={staffId} />
        )}
        {tab === 'comment' && (
          <CommentTab comments={comments} staffMap={staffMap} />
        )}
      </div>

      <div className="m-sticky-foot">
        {canApprove ? (
          <>
            <MBtn block variant="danger" disabled={busy !== 'none'} onClick={() => setSheetAction('reject')}>
              반려
            </MBtn>
            <MBtn block variant="primary" disabled={busy !== 'none'} onClick={() => setSheetAction('approve')}>
              승인
            </MBtn>
          </>
        ) : (
          <>
            <MBtn block onClick={onBack}>
              닫기
            </MBtn>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
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
        title={sheetAction === 'approve' ? '결재 승인' : '결재 반려'}
      >
        <div style={{ padding: '4px 20px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--z-600)', fontWeight: 600, lineHeight: 1.6, marginBottom: 12 }}>
            {sheetAction === 'approve'
              ? '승인 시 다음 결재자에게 자동 전달됩니다. 코멘트는 선택입니다.'
              : '반려 사유를 입력해 주세요. 기안자에게 전달됩니다.'}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={sheetAction === 'approve' ? '승인 코멘트 (선택)' : '반려 사유'}
            rows={4}
            disabled={busy !== 'none'}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--m-bg)',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.55,
              resize: 'none',
              minHeight: 96,
            }}
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
            <MBtn
              block
              variant={sheetAction === 'approve' ? 'primary' : 'danger'}
              disabled={busy !== 'none' || (sheetAction === 'reject' && !reason.trim())}
              onClick={() => sheetAction && handleAction(sheetAction)}
            >
              {busy === 'none' ? (sheetAction === 'approve' ? '승인하기' : '반려하기') : '처리 중…'}
            </MBtn>
          </div>
        </div>
      </MSheet>
    </div>
  );
}

// ─────────────────────────────────────────────
// 하위 — 양식 탭
// ─────────────────────────────────────────────

function FormTab({ row, title, formName }: { row: ApprovalRow; title: string; formName: string }) {
  const fields = readFormFields(row);
  const content = String(row.content || '').trim();
  const docNumber = String(row.doc_number || '').trim();
  const attachments = useMemo(
    () => normalizeApprovalAttachments((row.meta_data as Record<string, unknown> | null)?.attachments),
    [row.meta_data]
  );

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <MCard style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <MChip tone="accent">{formName}</MChip>
          <MChip>일반</MChip>
          <div style={{ flex: 1 }} />
          {docNumber && (
            <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
              문서번호 {docNumber}
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.022em', lineHeight: 1.35 }}>
          {title}
        </h1>

        {fields.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {fields.map((f, i) => (
              <div
                key={`${f.label}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '88px 1fr',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: i < fields.length - 1 ? '1px solid var(--m-border)' : 'none',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{f.label}</div>
                <div
                  className={f.big ? 'm-tnum' : ''}
                  style={{
                    fontSize: f.big ? 16 : 13,
                    fontWeight: f.big ? 800 : 600,
                    color: 'var(--z-900)',
                    letterSpacing: f.big ? '-0.02em' : 0,
                    wordBreak: 'break-word',
                  }}
                >
                  {f.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {content && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'var(--m-bg)',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--z-800)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {content}
          </div>
        )}

        {fields.length === 0 && !content && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--z-500)', fontWeight: 600 }}>
            본문이 비어 있습니다. PC에서 전체 양식을 확인해 주세요.
          </div>
        )}
      </MCard>
      {attachments.length > 0 && <AttachmentsSection attachments={attachments} />}
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
  staffId,
}: {
  row: ApprovalRow;
  lineIds: string[];
  currentApproverId: string | null;
  staffMap: Record<string, StaffMember>;
  staffId: string | null;
}) {
  // 기안자 + 결재선을 timeline 으로 합성
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
      ts: shortTs(row.created_at),
    });
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
      ts: '-',
    });
  }

  return (
    <div style={{ padding: '14px 16px 0' }}>
      {steps.length === 0 ? (
        <MCard style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-600)' }}>
            결재선이 지정되지 않았습니다
          </div>
        </MCard>
      ) : (
        <MCard flush>
          <ol style={{ listStyle: 'none' }} aria-label="결재 진행 순서">
            {steps.map((l, i) => (
              <li
                key={l.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr auto',
                  gap: 12,
                  padding: '14px 16px',
                  borderBottom: i < steps.length - 1 ? '1px solid var(--m-border)' : 'none',
                  position: 'relative',
                }}
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
                        background: 'var(--m-border)',
                        transform: 'translateX(-50%)',
                      }}
                    />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{l.step}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 1 }}>{l.who}</div>
                  {l.dept && (
                    <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>{l.dept}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <MChip tone={l.tone}>{l.state}</MChip>
                  <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 600, marginTop: 4 }}>
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
  staffMap,
}: {
  comments: CommentEntry[];
  staffMap: Record<string, StaffMember>;
}) {
  const filtered = comments.filter((c) => c.note || c.action);
  return (
    <div style={{ padding: '14px 16px 0' }}>
      {filtered.length === 0 ? (
        <MCard style={{ padding: '24px 16px', textAlign: 'center' }}>
          <MIcon name="chat" size={24} color="var(--z-400)" />
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--z-600)' }}>
            코멘트가 없습니다
          </div>
        </MCard>
      ) : (
        filtered.map((c) => {
          const name = c.actor_name || (c.actor_id ? staffMap[c.actor_id]?.name : '') || '시스템';
          const tone = pickAvatarTone(c.actor_id || name);
          return (
            <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <MAvatar tone={tone} size="sm">
                {(name || '?').charAt(0)}
              </MAvatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <b style={{ fontSize: 12, fontWeight: 800 }}>{name}</b>
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
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
                      marginTop: 3,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
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
