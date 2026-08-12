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
 * 공용 kit: ./staff-picker/* (타입·lazy fetch·filter/group·atoms)
 * 공개 API(ApproverPick, toApproverPick, default export) 유지.
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch는 첫 open 시 1회 lazy),
 * JM3(try/catch + 빈 결과 폴백), JM4(any 금지, ApproverPick 타입),
 * JM5(본인은 자동 제외, RLS 의존), JM6(input label 연결, button aria-label)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import { isDepartmentHeadOrAbove } from '@/lib/active-staff';
import MSheet from '../공통/MSheet';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import {
  toStaffPick,
  type ApproverPick,
} from './staff-picker/types';
import { useLazyActiveStaff } from './staff-picker/useLazyActiveStaff';
import { filterStaffByQuery, groupStaffByDepartment } from './staff-picker/group-filter';
import {
  SectionLabel,
  IconBtn,
  memberRowStyle,
  emptyStyle,
  actionStyle,
} from './staff-picker/ui-atoms';
import { PickerCandidateList, PickerFooter, PickerSearchField } from './staff-picker/ui-blocks';

export type { ApproverPick } from './staff-picker/types';

/** 기존 import 호환 — StaffPick 매핑 alias */
export function toApproverPick(s: StaffMember): ApproverPick {
  return toStaffPick(s);
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
  company: _company, // 공개 props 유지(참조 피커와 시그니처 정렬); 결재선 필터에는 미사용
  current,
  defaultLine,
  onApply,
}: SApprovalApproverPickerProps) {
  const [line, setLine] = useState<ApproverPick[]>(current);
  const [query, setQuery] = useState('');
  const { staffRows, loading } = useLazyActiveStaff(open, 'mobile-approval-picker');

  // 열릴 때마다 현재 결재선 동기화
  useEffect(() => {
    if (open) {
      setLine(current);
      setQuery('');
    }
  }, [open, current]);

  const selectedIds = useMemo(() => new Set(line.map((p) => p.id)), [line]);

  // 검색 + 본인·기선택 제외 + 부서장 이상
  const filtered: StaffMember[] = useMemo(
    () =>
      filterStaffByQuery(staffRows ?? [], {
        query,
        selfId,
        excludeIds: selectedIds,
        extra: (s) => isDepartmentHeadOrAbove(s),
      }),
    [staffRows, query, selfId, selectedIds]
  );

  const groups = useMemo(() => groupStaffByDepartment(filtered, _company), [filtered, _company]);

  const addMember = useCallback((s: StaffMember) => {
    setLine((prev) => [...prev, toStaffPick(s)]);
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
              className="macos-glass macos-squircle-sm"
              style={{
                padding: '12px 14px',
                fontSize: 12,
                color: 'var(--z-600)',
                background: 'rgba(255, 159, 10, 0.08)',
                border: '1px solid rgba(255, 159, 10, 0.2)',
                fontWeight: 800,
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
                    className="macos-glass macos-squircle-sm"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      padding: '8px 10px',
                    }}
                  >
                    <MAvatar tone="violet" size="sm">
                      {(a.name || '?').charAt(0)}
                    </MAvatar>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 800 }}>
                        {stepLabel}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>{a.name}</div>
                      {(a.department || a.position) && (
                        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              className="transition-all active:scale-95"
              onClick={resetToDefault}
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: 'var(--m-accent)',
                padding: 6,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
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
          <PickerSearchField
            id="m-approver-pick-q"
            label="결재자 검색"
            value={query}
            onChange={setQuery}
          />

          <PickerCandidateList
            loading={loading}
            loaded={staffRows !== null}
            query={query}
            groups={groups}
            renderMember={(s) => (
              <button
                key={String(s.id)}
                type="button"
                className="transition-all duration-150 active:bg-black/[0.04]"
                onClick={() => addMember(s)}
                style={memberRowStyle}
                aria-label={`${s.name} 결재선에 추가`}
              >
                <MAvatar tone="blue" size="sm">
                  {(s.name || '?').charAt(0)}
                </MAvatar>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left', marginLeft: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
                    {[s.department, s.position].filter(Boolean).join(' / ') || ' '}
                  </div>
                </div>
                <MIcon name="plus" size={14} color="var(--m-accent)" />
              </button>
            )}
          />
        </section>
      </div>

      <PickerFooter
        onCancel={onClose}
        cancelAriaLabel="결재선 변경 취소"
        onApply={apply}
        applyAriaLabel="결재선 적용"
        applyLabel="적용"
        applyDisabled={line.length === 0}
      />
    </MSheet>
  );
}
