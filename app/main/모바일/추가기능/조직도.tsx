'use client';
 

/**
 * 조직도 — 부서 트리 + 카드 + 검색.
 * staff_members → useOrgDepartments. 회사 격리.
 * 핸드오프 m-screens-addon-modules §1 (SAddonOrg) 이식.
 * JM: ~200줄. 단일 책임.
 * JM5: company 필터로 본인 회사만.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import { pickTone, useOrgDepartments } from './data-hooks';

type View = 'tree' | 'card' | 'org';

export default function 조직도({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = '전체';
  const { groups, loading } = useOrgDepartments(company);
  const [view, setView] = useState<View>('tree');
  const [search, setSearch] = useState('');

  const total = useMemo(() => groups.reduce((s, g) => s + g.members.length, 0), [groups]);
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        members: g.members.filter((m) => m.name.includes(q) || g.department.includes(q)) }))
      .filter((g) => g.members.length > 0);
  }, [groups, search]);

  return (
    <div
      className="m-screen"
      style={{
        background: 'linear-gradient(145deg, #f3ecfc 0%, #f6f0fd 30%, #ecf5fc 70%, #ecfaf4 100%)',
        display: 'flex',
        flexDirection: 'column' }}
    >
      <MobileHeader
        title="조직도"
        sub={`${groups.length}개 부서 · ${total}명`}
        back={onBack}
        actions={
          <button type="button" aria-label="검색">
            <MIcon name="search" size={20} />
          </button>
        }
      />

      <div
        className="macos-glass"
        style={{
          padding: '12px 16px 10px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          background: 'rgba(255, 255, 255, 0.4)' }}
      >
        <div className="m-seg macos-glass macos-squircle-sm" style={{ background: 'rgba(0, 0, 0, 0.04)', border: 'none', padding: '2px' }}>
          <button
            type="button"
            className={view === 'tree' ? 'on macos-glass macos-squircle-sm' : 'macos-squircle-sm'}
            onClick={() => setView('tree')}
            style={{
              transition: 'all 0.2s',
              border: 'none',
              background: view === 'tree' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
              boxShadow: view === 'tree' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              color: view === 'tree' ? 'var(--z-900)' : 'var(--z-600)',
              fontWeight: 800 }}
          >
            부서
          </button>
          <button
            type="button"
            className={view === 'card' ? 'on macos-glass macos-squircle-sm' : 'macos-squircle-sm'}
            onClick={() => setView('card')}
            style={{
              transition: 'all 0.2s',
              border: 'none',
              background: view === 'card' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
              boxShadow: view === 'card' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              color: view === 'card' ? 'var(--z-900)' : 'var(--z-600)',
              fontWeight: 800 }}
          >
            카드
          </button>
          <button
            type="button"
            className={view === 'org' ? 'on macos-glass macos-squircle-sm' : 'macos-squircle-sm'}
            onClick={() => setView('org')}
            style={{
              transition: 'all 0.2s',
              border: 'none',
              background: view === 'org' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
              boxShadow: view === 'org' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              color: view === 'org' ? 'var(--z-900)' : 'var(--z-600)',
              fontWeight: 800 }}
          >
            조직도
          </button>
        </div>
        <div style={{ padding: '8px 0 2px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
            <MIcon name="search" size={14} color="var(--z-600)" />
          </span>
          <input
            type="search"
            placeholder="이름·부서 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="조직도 검색"
            style={{
              width: '100%',
              padding: '8px 12px 8px 32px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.55)',
              backdropFilter: 'blur(8px)',
              fontSize: 13,
              border: '1px solid rgba(0, 0, 0, 0.08)',
              outline: 'none',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}
          />
        </div>
      </div>

      <div className="m-scroll" style={{ background: 'transparent' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : view === 'tree' ? (
          <div style={{ padding: '14px 16px 0' }}>
            <div
              className="macos-glass macos-squircle"
              style={{
                overflow: 'hidden',
                padding: '4px 0',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)' }}
            >
              {filtered.map((g, idx) => {
                const lead = g.members[0]?.name ?? '-';
                const isLast = idx === filtered.length - 1;
                return (
                  <div
                    key={g.department}
                    className="m-list-row"
                    style={{
                      background: 'transparent',
                      borderBottom: isLast ? 'none' : '1px solid rgba(0, 0, 0, 0.04)' }}
                  >
                    <MAvatar tone={pickTone(g.department)}>{g.department.charAt(0)}</MAvatar>
                    <div style={{ minWidth: 0 }}>
                      <div className="lbl" style={{ color: 'var(--z-800)', fontWeight: 800 }}>
                        {g.department}{' '}
                        <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                          · {lead}
                        </span>
                      </div>
                      <div className="sub" style={{ color: 'var(--z-500)' }}>{g.members.length}명</div>
                    </div>
                    <MChip tone="accent">{g.members.length}명</MChip>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  검색 결과 없음
                </div>
              )}
            </div>
            <div style={{ height: 24 }} />
          </div>
        ) : view === 'card' ? (
          <div style={{ padding: '14px 16px 0' }}>
            {filtered.map((g) => (
              <div key={g.department}>
                <div style={{ padding: '10px 4px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: 'var(--z-700)',
                      letterSpacing: '-0.01em' }}
                  >
                    {g.department}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                    {g.members.length}명
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2,1fr)',
                    gap: 8,
                    marginBottom: 14 }}
                >
                  {g.members.map((m) => (
                    <div
                      key={m.id}
                      className="macos-glass macos-squircle-sm"
                      style={{
                        padding: '12px 14px',
                        border: '1px solid rgba(0, 0, 0, 0.06)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                        background: 'rgba(255, 255, 255, 0.65)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MAvatar tone={pickTone(m.id)} size="sm">{m.name.charAt(0)}</MAvatar>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background:
                              m.status === '근무중'
                                ? 'var(--m-success)'
                                : m.status === '휴가'
                                ? 'var(--m-warning)'
                                : 'var(--z-400)' }}
                        />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8, color: 'var(--z-800)' }}>{m.name}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--z-500)',
                          fontWeight: 600,
                          marginTop: 1 }}
                      >
                        {m.position || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ height: 24 }} />
          </div>
        ) : (
          <div style={{ padding: '16px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div
                className="macos-squircle"
                style={{
                  padding: '10px 18px',
                  background: 'linear-gradient(135deg, #007AFF, #0A55E1)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 800,
                  boxShadow: '0 4px 12px rgba(10, 85, 225, 0.25)' }}
              >
                {company === '전체' ? 'MSO 전체' : company ?? '본사'}
              </div>
              <div aria-hidden="true" style={{ width: 1.5, height: 16, background: 'rgba(0,0,0,0.12)' }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {filtered.map((g) => (
                  <div
                    key={g.department}
                    className="macos-glass macos-squircle-sm"
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.65)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: 'center' }}
                  >
                    <div style={{ color: 'var(--z-800)', fontWeight: 800 }}>{g.department}</div>
                    <div style={{ fontSize: 9, color: 'var(--z-500)', fontWeight: 600, marginTop: 1 }}>
                      {g.members.length}명
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div
              role="note"
              className="macos-glass macos-squircle-sm"
              style={{
                marginTop: 24,
                padding: '12px 14px',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
                fontSize: 12,
                fontWeight: 600,
                color: '#007AFF',
                display: 'flex',
                alignItems: 'center',
                gap: 8 }}
            >
              <MIcon name="info" size={16} color="#007AFF" />
              풀 조직도(드래그·재구성)는 데스크톱에서 확인하세요.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
