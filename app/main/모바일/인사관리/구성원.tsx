'use client';

/**
 * SHrMember — 모바일 인사관리: 구성원
 *
 * 3 segment (명단 / 인사발령 / 교육·자격)
 *  - 명단: 부서 그룹핑 + 멤버 카드 행 (아바타·이름·부서·직급·상태)
 *  - 인사발령: 최근 카드 리스트 (staff_appointments) — 없으면 안내
 *  - 교육·자격: licenses 만료 임박 등을 카드로 (간이 뷰)
 *
 * 데이터: useStaffList (staff_members), 인사발령은 staff_appointments,
 *   교육은 licenses 재사용.
 *
 * JM5: 본인 회사 직원만 노출 (props.company 필터). 다른 회사 PII 차단.
 * JM6: segment 버튼 aria-current, 회원 카드 클릭 가능.
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import {
  pickAvatarTone,
  useStaffList,
  daysUntil,
  expiryTone,
  type LicenseRow } from './data-hooks';
import 발령탭 from './발령탭';
import 징계탭 from './징계탭';
import 교육자격탭 from './교육자격탭';
import 사고보고서탭 from './사고보고서탭';
import type { ErpUser } from '@/types';

export type SHrMemberTab = 'list' | 'transfer' | 'disciplinary' | 'edu' | 'accident';

export type SHrMemberProps = {
  company?: string;
  user: ErpUser;
  onBack: () => void;
  onOpenForm: () => void;
  onEditStaff?: (id: string) => void;
};

export default function 구성원({ company, user, onBack, onOpenForm, onEditStaff }: SHrMemberProps) {
  const [tab, setTab] = useState<SHrMemberTab>('list');
  const [search, setSearch] = useState('');
  const { staffs, loading } = useStaffList({ company, includeResigned: true });

  // 부서 그룹핑
  const grouped = useMemo(() => {
    const norm = search.trim();
    const filtered = norm
      ? staffs.filter((s) => (s.name ?? '').includes(norm) || (s.department ?? '').includes(norm))
      : staffs;
    const groups = new Map<string, typeof staffs>();
    for (const s of filtered) {
      const dept = (s.department ?? '미지정').trim() || '미지정';
      const prev = groups.get(dept) ?? [];
      prev.push(s);
      groups.set(dept, prev);
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [staffs, search]);

  return (
    <div className="m-screen">
      <MobileHeader
        title="구성원"
        sub={`총 ${staffs.length}명${company && company !== '전체' ? ` · ${company}` : ''}`}
        back={onBack}
        actions={
          <button type="button" onClick={onOpenForm} aria-label="구성원 등록">
            <MIcon name="plus" size={20} />
          </button>
        }
      />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)' }}
      >
        <div className="m-seg" role="tablist" aria-label="구성원 탭">
          <button
            type="button"
            className={tab === 'list' ? 'on' : ''}
            onClick={() => setTab('list')}
            role="tab"
            aria-selected={tab === 'list'}
          >
            명단 {staffs.length}
          </button>
          <button
            type="button"
            className={tab === 'transfer' ? 'on' : ''}
            onClick={() => setTab('transfer')}
            role="tab"
            aria-selected={tab === 'transfer'}
          >
            인사발령
          </button>
          <button
            type="button"
            className={tab === 'disciplinary' ? 'on' : ''}
            onClick={() => setTab('disciplinary')}
            role="tab"
            aria-selected={tab === 'disciplinary'}
          >
            징계
          </button>
          <button
            type="button"
            className={tab === 'edu' ? 'on' : ''}
            onClick={() => setTab('edu')}
            role="tab"
            aria-selected={tab === 'edu'}
          >
            교육·자격
          </button>
          <button
            type="button"
            className={tab === 'accident' ? 'on' : ''}
            onClick={() => setTab('accident')}
            role="tab"
            aria-selected={tab === 'accident'}
          >
            사고보고서
          </button>
        </div>
      </div>

      <div className="m-scroll">
        {tab === 'list' && (
          <ListTab
            grouped={grouped}
            search={search}
            onSearch={setSearch}
            loading={loading}
            onRowClick={onEditStaff}
          />
        )}
        {tab === 'transfer' && <발령탭 staffs={staffs} company={company} user={user} />}
        {tab === 'disciplinary' && <징계탭 staffs={staffs} company={company} user={user} />}
        {tab === 'edu' && <교육자격탭 staffs={staffs} company={company} user={user} />}
        {tab === 'accident' && <사고보고서탭 staffs={staffs} company={company} user={user} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 명단 탭
// ─────────────────────────────────────────────────────────────

type ListGroup = [string, ReturnType<typeof useStaffList>['staffs']];

function ListTab({
  grouped,
  search,
  onSearch,
  loading,
  onRowClick }: {
  grouped: ListGroup[];
  search: string;
  onSearch: (v: string) => void;
  loading: boolean;
  onRowClick?: (id: string) => void;
}) {
  return (
    <div>
      {/* 검색 */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)' }}
      >
        <label
          htmlFor="hr-member-search"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--m-bg)',
            borderRadius: 10,
            padding: '8px 12px' }}
        >
          <MIcon name="search" size={16} color="var(--z-500)" />
          <input
            id="hr-member-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="이름·부서로 검색"
            style={{ flex: 1, fontSize: 14, fontFamily: 'inherit' }}
            aria-label="구성원 검색"
          />
        </label>
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          불러오는 중...
        </div>
      )}

      {!loading && grouped.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          표시할 구성원이 없습니다.
        </div>
      )}

      {grouped.map(([dept, members]) => (
        <div key={dept}>
          <div
            style={{
              padding: '14px 16px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: 6 }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--z-500)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase' }}
            >
              {dept}
            </span>
            <span style={{ fontSize: 11, color: 'var(--z-400)', fontWeight: 700 }}>
              {members.length}명
            </span>
          </div>
          <div className="m-card flush macos-glass macos-squircle" style={{ margin: '0 16px' }}>
            {members.map((m) => {
              const status = (m.status ?? '근무중').trim() || '근무중';
              const tone =
                status === '근무중' ? 'success' : status === '휴가' ? 'accent' : '';
              return (
                <button
                  key={String(m.id)}
                  type="button"
                  className="m-list-row"
                  onClick={() => onRowClick?.(String(m.id))}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  <MAvatar tone={pickAvatarTone(m.name)}>
                    {(m.name ?? '?').charAt(0)}
                  </MAvatar>
                  <div style={{ flex: 1 }}>
                    <div className="lbl">{m.name}</div>
                    <div className="sub">
                      {(m.department ?? '미지정')} · {m.position ?? m.role ?? '직원'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MChip tone={tone}>{status}</MChip>
                    <MIcon name="chevR" size={18} color="var(--z-400)" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ height: 24 }} />
    </div>
  );
}


