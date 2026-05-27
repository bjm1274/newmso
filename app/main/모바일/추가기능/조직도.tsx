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
  const company = typeof user.company === 'string' ? user.company : undefined;
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
        members: g.members.filter((m) => m.name.includes(q) || g.department.includes(q)),
      }))
      .filter((g) => g.members.length > 0);
  }, [groups, search]);

  return (
    <div className="m-screen">
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
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg">
          <button type="button" className={view === 'tree' ? 'on' : ''} onClick={() => setView('tree')}>부서</button>
          <button type="button" className={view === 'card' ? 'on' : ''} onClick={() => setView('card')}>카드</button>
          <button type="button" className={view === 'org' ? 'on' : ''} onClick={() => setView('org')}>조직도</button>
        </div>
        <div style={{ padding: '8px 0 10px' }}>
          <input
            type="search"
            placeholder="이름·부서 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="조직도 검색"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--m-radius-md)',
              background: 'var(--m-bg)',
              fontSize: 13,
              border: '1px solid var(--m-border)',
            }}
          />
        </div>
      </div>

      <div className="m-scroll">
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : view === 'tree' ? (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card flush">
              {filtered.map((g) => {
                const lead = g.members[0]?.name ?? '-';
                return (
                  <div key={g.department} className="m-list-row">
                    <MAvatar tone={pickTone(g.department)}>{g.department.charAt(0)}</MAvatar>
                    <div style={{ minWidth: 0 }}>
                      <div className="lbl">
                        {g.department}{' '}
                        <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                          · {lead}
                        </span>
                      </div>
                      <div className="sub">{g.members.length}명</div>
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
                <div style={{ padding: '6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'var(--z-500)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {g.department}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--z-400)', fontWeight: 700 }}>
                    {g.members.length}명
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2,1fr)',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  {g.members.map((m) => (
                    <div key={m.id} className="m-card" style={{ padding: '12px 12px' }}>
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
                                : 'var(--z-400)',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8 }}>{m.name}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--z-500)',
                          fontWeight: 600,
                          marginTop: 1,
                        }}
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
                style={{
                  padding: '8px 14px',
                  background: 'var(--m-accent)',
                  color: '#fff',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {company ?? '본사'}
              </div>
              <div aria-hidden="true" style={{ width: 1, height: 14, background: 'var(--z-300)' }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {filtered.map((g) => (
                  <div
                    key={g.department}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--m-card)',
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    {g.department}
                    <br />
                    <span style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 600 }}>
                      {g.members.length}명
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div
              role="note"
              style={{
                marginTop: 24,
                padding: '12px 14px',
                background: 'var(--m-accent-soft)',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--m-accent)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <MIcon name="info" size={16} />
              풀 조직도(드래그·재구성)는 데스크톱에서 확인하세요.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
