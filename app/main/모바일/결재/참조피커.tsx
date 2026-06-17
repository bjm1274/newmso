'use client';

/**
 * SApprovalCcPicker — 참조(CC) 지정 바텀시트.
 *
 *   - 검색 input (이름·부서·직급 client filter)
 *   - 부서별 그룹핑 목록 (회사 내 활성 직원 전체 — 부서장 제한 없음)
 *   - 멤버 클릭 → 참조자 토글(추가/제거), 다중 선택
 *   - 선택된 참조자 chip 목록 + X 제거
 *   - "전체 해제" / "적용" 버튼
 *
 * 결재선피커(SApprovalApproverPicker)의 UI/UX를 미러링.
 * 참조는 PC와 동일하게 meta_data.cc_users = [{id,name}] 로 저장된다(상위 폼에서 매핑).
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch는 첫 open 시 1회 lazy),
 * JM3(try/catch + 빈 결과 폴백), JM4(any 금지, CcPick 타입),
 * JM5(본인은 자동 제외, RLS 의존), JM6(input label 연결, button aria-label)
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import MSheet from '../공통/MSheet';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';

/** 참조자 선택 항목 — PC cc_users shape({id,name})과 호환 */
export type CcPick = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  company: string | null;
};

export function toCcPick(s: StaffMember): CcPick {
  return {
    id: String(s.id || ''),
    name: String(s.name || ''),
    position: s.position ?? null,
    department: s.department ?? null,
    company: s.company ?? null,
  };
}

export type SApprovalCcPickerProps = {
  open: boolean;
  onClose: () => void;
  selfId: string | null;
  company: string | null;
  current: CcPick[];
  onApply: (next: CcPick[]) => void;
};

export default function SApprovalCcPicker({
  open,
  onClose,
  selfId,
  company,
  current,
  onApply,
}: SApprovalCcPickerProps) {
  const [picked, setPicked] = useState<CcPick[]>(current);
  const [query, setQuery] = useState('');
  const [staffRows, setStaffRows] = useState<StaffMember[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef(false);

  // 열릴 때마다 현재 참조자 동기화
  useEffect(() => {
    if (open) {
      setPicked(current);
      setQuery('');
    }
  }, [open, current]);

  // 첫 open 시 staff 1회 fetch — lazy (결재선피커와 동일 컬럼)
  useEffect(() => {
    if (!open) return;
    if (staffRows !== null) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('staff_members')
          .select(
            'id, name, company, department, position, status, hire_date, resign_date, email, phone, role, permissions'
          );
        if (error) throw error;
        const rows = ((data ?? []) as StaffMember[]).filter((s) => isActiveStaff(s));
        setStaffRows(rows);
      } catch (err) {
        console.error('[mobile-approval-cc-picker] staff fetch failed', err);
        setStaffRows([]);
      } finally {
        setLoading(false);
        inflightRef.current = false;
      }
    })();
  }, [open, staffRows]);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);

  // 검색 + 본인 제외 + 본인 회사(또는 SY INC.) 직원
  const filtered: StaffMember[] = useMemo(() => {
    const list = staffRows ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((s) => {
      const id = String(s.id || '');
      if (selfId && id === selfId) return false; // 본인 제외
      if (company && s.company !== company && s.company !== 'SY INC.') return false; // 회사 필터
      if (!q) return true;
      const hay = [s.name, s.department, s.position, s.company]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [staffRows, query, selfId, company]);

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

  const toggleMember = useCallback((s: StaffMember) => {
    const id = String(s.id || '');
    setPicked((prev) =>
      prev.some((p) => p.id === id) ? prev.filter((p) => p.id !== id) : [...prev, toCcPick(s)]
    );
  }, []);

  const removeAt = useCallback((idx: number) => {
    setPicked((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearAll = useCallback(() => {
    setPicked([]);
  }, []);

  const apply = useCallback(() => {
    onApply(picked);
    onClose();
  }, [picked, onApply, onClose]);

  return (
    <MSheet open={open} onClose={onClose} title="참조자 지정">
      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 선택된 참조자 */}
        <section>
          <SectionLabel>선택된 참조자 ({picked.length})</SectionLabel>
          {picked.length === 0 ? (
            <div
              style={{
                padding: '12px 14px',
                fontSize: 12,
                color: 'var(--z-500)',
                background: 'var(--m-bg)',
                borderRadius: 'var(--m-radius-md)',
                fontWeight: 700,
              }}
            >
              참조는 선택 사항입니다. 아래에서 참조자를 추가할 수 있어요.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {picked.map((c, i) => (
                <li
                  key={c.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 8px 6px 10px',
                    border: '1px solid var(--m-border)',
                    borderRadius: 999,
                    background: 'var(--m-card)',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{c.name}</span>
                  {(c.department || c.position) && (
                    <span style={{ fontSize: 11, color: 'var(--z-500)' }}>
                      {[c.department, c.position].filter(Boolean).join(' / ')}
                    </span>
                  )}
                  <IconBtn ariaLabel={`${c.name} 참조 제거`} tone="danger" onClick={() => removeAt(i)}>
                    <MIcon name="x" size={13} />
                  </IconBtn>
                </li>
              ))}
            </ul>
          )}
          {picked.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                type="button"
                onClick={clearAll}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-accent)', padding: 6 }}
                aria-label="참조자 전체 해제"
              >
                전체 해제
              </button>
            </div>
          )}
        </section>

        {/* 검색 + 후보 */}
        <section>
          <SectionLabel>참조자 추가</SectionLabel>
          <label htmlFor="m-cc-pick-q" style={{ position: 'absolute', left: -10000 }}>
            참조자 검색
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
              id="m-cc-pick-q"
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
            {loading && <div style={emptyStyle}>직원 목록을 불러오는 중…</div>}
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
                {members.map((s) => {
                  const id = String(s.id || '');
                  const isPicked = pickedIds.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleMember(s)}
                      style={memberRowStyle}
                      aria-pressed={isPicked}
                      aria-label={isPicked ? `${s.name} 참조에서 제거` : `${s.name} 참조에 추가`}
                    >
                      <MAvatar tone={isPicked ? 'violet' : 'blue'} size="sm">
                        {(s.name || '?').charAt(0)}
                      </MAvatar>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--z-500)' }}>
                          {[s.department, s.position].filter(Boolean).join(' / ') || ' '}
                        </div>
                      </div>
                      <MIcon
                        name={isPicked ? 'check' : 'plus'}
                        size={14}
                        color={isPicked ? 'var(--m-success)' : 'var(--m-accent)'}
                      />
                    </button>
                  );
                })}
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
        <button type="button" onClick={onClose} style={actionStyle('ghost')} aria-label="참조자 지정 취소">
          취소
        </button>
        <button type="button" onClick={apply} style={actionStyle('primary')} aria-label="참조자 적용">
          적용 ({picked.length})
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
        width: 22,
        height: 22,
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
