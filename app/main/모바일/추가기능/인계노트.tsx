'use client';

/**
 * 인계노트 — 일/주/전체 뷰.
 * useHandoverNotes (30s 폴링). 회사 격리.
 * 🔴 모바일 단독 사용 가능 — 카드 + 부서별 그룹.
 * 핸드오프 m-screens-addon-modules §4 (SAddonHandoff) 이식.
 * JM: ~180줄.
 */

import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';
import MChip from '../공통/MChip';
import MListRow from '../공통/MListRow';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';
import { useHandoverNotes, todayISO } from './data-hooks';

type View = 'day' | 'week' | 'all';
type Shift = 'Day' | 'Evening' | 'Night';

type HandoverFormState = {
  title: string;
  body: string;
  shift: Shift;
  priority: 'Normal' | 'High';
};

const HANDOVER_INITIAL: HandoverFormState = {
  title: '',
  body: '',
  shift: 'Day',
  priority: 'Normal',
};

function dateKey(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export default function 인계노트({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { rows, loading, refresh } = useHandoverNotes({ company, pollMs: 30000 });
  const [view, setView] = useState<View>('day');
  const [showForm, setShowForm] = useState(false);

  if (showForm) {
    return (
      <HandoverNoteForm
        user={user}
        company={company}
        onClose={() => { setShowForm(false); void refresh(); }}
      />
    );
  }

  const today = todayISO();
  const todayRows = useMemo(() => rows.filter((r) => dateKey(r.created_at) === today), [rows, today]);

  const weekly = useMemo(() => {
    const map = new Map<string, number>();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const r of rows) {
      const ts = Date.parse(r.created_at);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      const key = dateKey(r.created_at);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7);
  }, [rows]);

  const generalToday = todayRows.filter((r) => r.scope === 'general');
  const patientToday = todayRows.filter((r) => r.scope === 'patient');

  return (
    <div className="m-screen">
      <MobileHeader
        title="인계노트"
        sub={`${today} · 오늘 ${todayRows.length}건`}
        back={onBack}
        actions={
          <>
            <button type="button" onClick={() => void refresh()} aria-label="새로고침">
              <MIcon name="refresh" size={20} />
            </button>
            <button type="button" onClick={() => setShowForm(true)} aria-label="인계노트 작성">
              <MIcon name="plus" size={20} />
            </button>
          </>
        }
      />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg">
          <button type="button" className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>오늘</button>
          <button type="button" className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>이번 주</button>
          <button type="button" className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>전체</button>
        </div>
      </div>

      <div className="m-scroll">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}
        {view === 'day' && !loading && (
          <>
            <div className="m-section">
              <div className="m-section-h">
                <div className="lbl">공통 인계 {generalToday.length}건</div>
              </div>
              {generalToday.length === 0 && (
                <div
                  style={{
                    margin: '4px 16px',
                    padding: '16px',
                    textAlign: 'center',
                    color: 'var(--z-500)',
                    fontSize: 12,
                    background: 'var(--m-card)',
                    borderRadius: 'var(--m-radius-lg)',
                    border: '1px solid var(--m-border)',
                  }}
                >
                  오늘 공통 인계가 없습니다.
                </div>
              )}
              {generalToday.map((n) => (
                <div
                  key={n.id}
                  className="m-card"
                  style={{ margin: '8px 16px', padding: '14px 16px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MChip tone={n.priority === 'High' ? 'danger' : 'accent'}>{n.shift}</MChip>
                    {n.priority === 'High' && <MChip tone="danger">긴급</MChip>}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                      {n.created_at.slice(11, 16)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.012em' }}>
                    {n.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--z-500)',
                      fontWeight: 600,
                      marginTop: 6,
                    }}
                  >
                    {n.author} {n.is_completed ? '· 확인 완료' : ''}
                  </div>
                </div>
              ))}
            </div>

            {patientToday.length > 0 && (
              <div className="m-section">
                <div className="m-section-h">
                  <div className="lbl">환자별 인계 {patientToday.length}건</div>
                </div>
                <div className="m-card flush" style={{ margin: '0 16px' }}>
                  {patientToday.map((n) => (
                    <MListRow
                      key={n.id}
                      icon="users"
                      label={`${n.patient_name ?? '환자 미지정'} · ${n.room_number ?? '-'}`}
                      sub={`${n.author} · ${n.shift}`}
                      val={n.is_completed ? '확인' : '대기'}
                    />
                  ))}
                </div>
              </div>
            )}
            <div style={{ height: 24 }} />
          </>
        )}

        {view === 'week' && !loading && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card flush">
              {weekly.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  최근 7일 인계가 없습니다.
                </div>
              )}
              {weekly.map(([day, count]) => (
                <MListRow
                  key={day}
                  icon="calendar"
                  label={day}
                  sub={`${count}건 인계`}
                  val={count}
                />
              ))}
            </div>
          </div>
        )}

        {view === 'all' && !loading && (
          <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((n) => (
              <div key={n.id} className="m-card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <MChip tone={n.scope === 'patient' ? 'accent' : ''}>{n.scope === 'patient' ? '환자별' : '공통'}</MChip>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                    {n.created_at.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{n.title}</div>
                {n.body && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--z-700)',
                      marginTop: 6,
                      lineHeight: 1.55,
                    }}
                  >
                    {n.body}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="m-sticky-foot">
        <MBtn block variant="primary" icon="edit" onClick={() => setShowForm(true)}>
          인계노트 작성
        </MBtn>
      </div>
    </div>
  );
}

// ─── 인계노트 작성 폼 ─────────────────────────────────────────
function HandoverNoteForm({
  user,
  company,
  onClose,
}: {
  user: ErpUser;
  company: string | undefined;
  onClose: () => void;
}) {
  const [v, setV] = useState<HandoverFormState>(HANDOVER_INITIAL);
  const [saving, setSaving] = useState(false);
  const fid = useFieldIdPrefix('handover');

  const set = <K extends keyof HandoverFormState>(k: K, val: HandoverFormState[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const handleSave = async () => {
    if (saving) return;
    const title = v.title.trim();
    if (!title) { toast('제목을 입력해 주세요.', 'error'); return; }

    setSaving(true);
    try {
      const authorName =
        typeof (user as Record<string, unknown>).name === 'string'
          ? (user as Record<string, unknown>).name as string
          : '';
      const payload: Record<string, unknown> = {
        content: v.body.trim() ? `${title}\n${v.body.trim()}` : title,
        author_name: authorName,
        author_id: user.id,
        shift: v.shift,
        priority: v.priority,
        note_scope: 'general',
        company: company ?? null,
        is_completed: false,
        created_at: new Date().toISOString(),
      };

      const { queued, error } = await enqueueSupabaseMutation({
        kind: 'insert',
        table: 'handover_notes',
        payload,
        retryable: true,
      });

      if (error) { toast(`저장 실패: ${error}`, 'error'); return; }
      if (queued) { toast('오프라인 — 인계노트 대기 중', 'info'); onClose(); return; }
      toast('인계노트가 등록되었습니다.', 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        title="인계노트 작성"
        onCancel={onClose}
        onSave={() => { void handleSave(); }}
        saveDisabled={!v.title.trim() || saving}
        saveLabel={saving ? '저장 중…' : '저장'}
      />
      <div className="m-scroll">
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="근무조">
            <MSegRow
              ariaLabel="근무조"
              value={v.shift}
              onPick={(s) => set('shift', s as Shift)}
              options={[
                { id: 'Day', label: 'Day' },
                { id: 'Evening', label: 'Eve' },
                { id: 'Night', label: 'Night' },
              ]}
            />
          </MField>
          <MField label="우선순위">
            <MSegRow
              ariaLabel="우선순위"
              value={v.priority}
              onPick={(p) => set('priority', p as HandoverFormState['priority'])}
              options={[
                { id: 'Normal', label: '일반' },
                { id: 'High', label: '긴급' },
              ]}
            />
          </MField>
          <MField label="제목" required htmlFor={fid('title')}>
            <MInput
              id={fid('title')}
              value={v.title}
              onChange={(val) => set('title', val)}
              placeholder="인계 내용 요약"
              autoFocus
            />
          </MField>
          <MField label="상세 내용" htmlFor={fid('body')}>
            <MInput
              id={fid('body')}
              value={v.body}
              onChange={(val) => set('body', val)}
              placeholder="추가 설명 (선택)"
            />
          </MField>
        </div>
      </div>
    </div>
  );
}
