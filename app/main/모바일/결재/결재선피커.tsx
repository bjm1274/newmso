'use client';

/**
 * SApprovalApproverPicker — 결재선 수동 변경 바텀시트.
 *
 *   - 검색 input (이름·부서·직급 client filter)
 *   - 부서별 그룹핑 목록
 *   - 멤버 클릭 → 결재선 끝에 추가
 *   - 추가된 결재자: ↑↓ 순서 변경, X 제거
 *   - "기본값으로" / "적용" 버튼
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch는 첫 open 시 1회 lazy),
 * JM3(try/catch + 빈 결과 폴백), JM4(any 금지, ApproverPick 타입),
 * JM5(본인은 자동 제외, RLS 의존), JM6(input label 연결, button aria-label)
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import MSheet from '../공통/MSheet';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';

export type ApproverPick = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  company: string | null;
};

export function toApproverPick(s: StaffMember): ApproverPick {
  return {
    id: String(s.id || ''),
    name: String(s.name || ''),
    position: s.position ?? null,
    department: s.department ?? null,
    company: s.company ?? null,
  };
}

export type SApprovalApproverPickerProps = {
  open: boolean;
  onClose: () => void;
  selfId: string | null;
  company: string | null;
  current: ApproverPick[];
  defaultLine: ApproverPick[];
  onApply: (next: ApproverPick[]) => void;
};

export default function SApprovalApproverPicker({
  open,
  onClose,
  selfId,
  company,
  current,
  defaultLine,
  onApply,
}: SApprovalApproverPickerProps) {
  const [line, setLine] = useState<ApproverPick[]>(current);
  const [query, setQuery] = useState('');
  const [staffRows, setStaffRows] = useState<StaffMember[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef(false);

  // 열릴 때마다 현재 결재선 동기화
  useEffect(() => {
    if (open) {
      setLine(current);
      setQuery('');
    }
  }, [open, current]);

  // 첫 open 시 staff 1회 fetch — lazy
  useEffect(() => {
    if (!open) return;
    if (staffRows !== null) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    (async () => {
      try {
        let q = supabase
          .from('staff_members')
          .select(
            'id, name, company, department, position, status, hire_date, resign_date, email, phone'
          );
        if (company) q = q.eq('company', company);
        const { data, error } = await q;
        if (error) throw error;
        const rows = ((data ?? []) as StaffMember[]).filter((s) => isActiveStaff(s));
        setStaffRows(rows);
      } catch (err) {
        console.error('[mobile-approval-picker] staff fetch failed', err);
        setStaffRows([]);
      } finally {
        setLoading(false);
        inflightRef.current = false;
      }
    })();
  }, [open, staffRows, company]);

  const selectedIds = useMemo(() => new Set(line.map((p) => p.id)), [line]);

  // 검색 + 본인·기선택 제외
  const filtered: StaffMember[] = useMemo(() => {
    const list = staffRows ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((s) => {
      const id = String(s.id || '');
      if (selfId && id === selfId) return false; // 본인 제외
      if (selectedIds.has(id)) return false; // 이미 결재선
      if (!q) return true;
      const hay = [s.name, s.department, s.position, s.company]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [staffRows, query, selfId, selectedIds]);

  // 부서별 그룹핑
  const groups = useMemo(() => {
    const map = new Map<string, StaffMember[]>();
    for (const s of filtered) {
      const key = String(s.department || '미지정').trim() || '미지정';
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [filtered]);

  const addMember = useCallback((s: StaffMember) => {
    setLine((prev) => [...prev, toApproverPick(s)]);
  }, []);

  const removeAt = useCallback((idx: number) => {
    setLine((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const moveUp = useCallback((idx: number) => {
    setLine((prev) => {
      if (idx <= 0 || idx >= prev.length) return prev;
      const next = prev.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((idx: number) => {
    setLine((prev) => {
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = prev.slice();
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setLine(defaultLine);
  }, [defaultLine]);

  const apply = useCallback(() => {
    onApply(line);
    onClose();
  }, [line, onApply, onClose]);

  return (
    <MSheet open={open} onClose={onClose} title="결재선 변경">
      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 현재 결재선 */}
        <section>
          <SectionLabel>현재 결재선 ({line.length})</SectionLabel>
          {line.length === 0 ? (
            <div
              style={{
                padding: '12px 14px',
                fontSize: 12,
                color: 'var(--z-500)',
                background: 'var(--m-warning-soft)',
                borderRadius: 'var(--m-radius-md)',
                fontWeight: 700,
              }}
            >
              결재자를 한 명 이상 추가해 주세요.
            </div>
          ) : (
            <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {line.map((a, i) => {
                const stepLabel =
                  i === line.length - 1 && line.length > 1
                    ? '최종'
                    : line.length === 1
                      ? '결재'
                      : `${i + 1}차`;
                return (
                  <li
                    key={a.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      padding: '8px 10px',
                      border: '1px solid var(--m-border)',
                      borderRadius: 'var(--m-radius-md)',
                      background: 'var(--m-card)',
                    }}
                  >
                    <MAvatar tone="violet" size="sm">
                      {(a.name || '?').charAt(0)}
                    </MAvatar>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700 }}>
                        {stepLabel}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{a.name}</div>
                      {(a.department || a.position) && (
                        <div style={{ fontSize: 11, color: 'var(--z-500)' }}>
                          {[a.department, a.position].filter(Boolean).join(' / ')}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <IconBtn
                        ariaLabel={`${a.name} 위로 이동`}
                        disabled={i === 0}
                        onClick={() => moveUp(i)}
                      >
                        <MIcon name="chevU" size={14} />
                      </IconBtn>
                      <IconBtn
                        ariaLabel={`${a.name} 아래로 이동`}
                        disabled={i === line.length - 1}
                        onClick={() => moveDown(i)}
                      >
                        <MIcon name="chevD" size={14} />
                      </IconBtn>
                      <IconBtn
                        ariaLabel={`${a.name} 제거`}
                        tone="danger"
                        onClick={() => removeAt(i)}
                      >
                        <MIcon name="x" size={14} />
                      </IconBtn>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              type="button"
              onClick={resetToDefault}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--m-accent)',
                padding: 6,
              }}
              aria-label="결재선을 기본값으로 되돌리기"
            >
              기본값으로
            </button>
          </div>
        </section>

        {/* 검색 + 후보 */}
        <section>
          <SectionLabel>결재자 추가</SectionLabel>
          <label htmlFor="m-approver-pick-q" style={{ position: 'absolute', left: -10000 }}>
            결재자 검색
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              border: '1px solid var(--m-border)',
              borderRadius: 'var(--m-radius-md)',
              background: 'var(--m-card)',
            }}
          >
            <MIcon name="search" size={14} color="var(--z-500)" />
            <input
              id="m-approver-pick-q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·부서·직급"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--z-900)',
              }}
            />
          </div>

          <div style={{ marginTop: 8, maxHeight: '40vh', overflowY: 'auto' }}>
            {loading && (
              <div style={emptyStyle}>직원 목록을 불러오는 중…</div>
            )}
            {!loading && staffRows !== null && groups.length === 0 && (
              <div style={emptyStyle}>
                {query ? `'${query}' 에 대한 결과가 없습니다` : '추가할 수 있는 직원이 없습니다'}
              </div>
            )}
            {groups.map(([dept, members]) => (
              <div key={dept} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: 'var(--z-500)',
                    padding: '6px 4px 4px',
                    letterSpacing: '0.04em',
                  }}
                >
                  {dept}
                </div>
                {members.map((s) => (
                  <button
                    key={String(s.id)}
                    type="button"
                    onClick={() => addMember(s)}
                    style={memberRowStyle}
                    aria-label={`${s.name} 결재선에 추가`}
                  >
                    <MAvatar tone="blue" size="sm">
                      {(s.name || '?').charAt(0)}
                    </MAvatar>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--z-500)' }}>
                        {[s.department, s.position].filter(Boolean).join(' / ') || ' '}
                      </div>
                    </div>
                    <MIcon name="plus" size={14} color="var(--m-accent)" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* sticky apply */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          gap: 8,
          padding: '10px 16px 14px',
          background: 'var(--m-card)',
          borderTop: '1px solid var(--m-border)',
        }}
      >
        <button type="button" onClick={onClose} style={actionStyle('ghost')} aria-label="결재선 변경 취소">
          취소
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={line.length === 0}
          style={{
            ...actionStyle('primary'),
            opacity: line.length === 0 ? 0.5 : 1,
            cursor: line.length === 0 ? 'not-allowed' : 'pointer',
          }}
          aria-label="결재선 적용"
        >
          적용
        </button>
      </div>
    </MSheet>
  );
}

// ─────────────────────────────────────────────
// 하위 helpers
// ─────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: 'var(--z-500)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        margin: '4px 0 6px',
      }}
    >
      {children}
    </div>
  );
}

type IconBtnProps = {
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'danger';
};

function IconBtn({ ariaLabel, onClick, children, disabled, tone = 'default' }: IconBtnProps) {
  const color =
    tone === 'danger' ? 'var(--m-danger)' : disabled ? 'var(--z-400)' : 'var(--z-700)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: 26,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        background: 'transparent',
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

const memberRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr auto',
  gap: 10,
  width: '100%',
  alignItems: 'center',
  padding: '8px 8px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--m-border)',
  cursor: 'pointer',
};

const emptyStyle: CSSProperties = {
  textAlign: 'center',
  padding: '20px 0',
  fontSize: 12,
  color: 'var(--z-500)',
  fontWeight: 600,
};

function actionStyle(kind: 'primary' | 'ghost'): CSSProperties {
  const base: CSSProperties = {
    flex: 1,
    height: 48,
    borderRadius: 'var(--m-radius-lg)',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    border: '1px solid var(--m-border)',
  };
  if (kind === 'primary') {
    return { ...base, background: 'var(--m-accent)', color: '#fff', border: '1px solid var(--m-accent)' };
  }
  return { ...base, background: 'transparent', color: 'var(--z-700)' };
}
