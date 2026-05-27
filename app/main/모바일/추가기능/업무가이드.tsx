'use client';

/**
 * 업무가이드 — SOP 문서 read-only.
 * useTaskGuides (board_posts board_type='업무가이드').
 * 핸드오프 m-screens-addon-details §AD8 (SGuide) 이식.
 * JM: ~150줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import { useTaskGuides } from './data-hooks';

const CATEGORIES = [
  { id: 'all', label: '전체' },
  { id: 'emergency', label: '응급', kw: ['응급', 'CPR', 'emergency'] },
  { id: 'op', label: '수술', kw: ['수술', '관절경', '시술'] },
  { id: 'reception', label: '접수', kw: ['접수', '신환', '재진'] },
  { id: 'nursing', label: '간호', kw: ['간호', '당직', '인계'] },
  { id: 'admin', label: '행정', kw: ['행정', '결의', '결재'] },
] as const;

type CatId = (typeof CATEGORIES)[number]['id'];

function tone(catId: CatId): '' | 'danger' | 'success' | 'accent' | 'warning' {
  if (catId === 'emergency') return 'danger';
  if (catId === 'op') return 'success';
  if (catId === 'reception') return 'accent';
  if (catId === 'nursing') return 'warning';
  return '';
}

function detectCategory(title: string, body: string): CatId {
  const t = `${title} ${body}`.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.id === 'all') continue;
    if ('kw' in c && c.kw.some((k) => t.includes(k.toLowerCase()))) return c.id;
  }
  return 'all';
}

export default function 업무가이드({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const company = typeof user.company === 'string' ? user.company : undefined;
  const { rows, loading } = useTaskGuides({ company });
  const [cat, setCat] = useState<CatId>('all');

  const annotated = useMemo(
    () => rows.map((r) => ({ ...r, category: detectCategory(r.title, r.body) })),
    [rows],
  );

  const filtered = useMemo(
    () => (cat === 'all' ? annotated : annotated.filter((r) => r.category === cat)),
    [annotated, cat],
  );

  const counts = useMemo(() => {
    const map = new Map<CatId, number>();
    for (const r of annotated) map.set(r.category, (map.get(r.category) ?? 0) + 1);
    map.set('all', annotated.length);
    return map;
  }, [annotated]);

  return (
    <div className="m-screen">
      <MobileHeader
        title="업무가이드"
        sub={`${company ?? ''} · ${rows.length}개 문서`}
        back={onBack}
        actions={
          <button type="button" aria-label="검색">
            <MIcon name="search" size={20} />
          </button>
        }
      />

      <div className="m-chip-bar">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
            {c.label}<span className="cnt">{counts.get(c.id) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="m-scroll">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
            불러오는 중…
          </div>
        )}

        {!loading && filtered.length > 0 && cat === 'all' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-section-h">
              <div className="lbl">자주 찾는</div>
            </div>
            <div
              className="m-card"
              style={{
                padding: '14px 14px',
                background: 'linear-gradient(135deg, var(--m-accent), #1D4ED8)',
                borderColor: 'transparent',
                color: '#fff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MIcon name="alertTri" size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.4 }}>
                    {filtered[0].title}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 2 }}>
                    {filtered[0].department} · {filtered[0].created_at.slice(0, 10)}
                  </div>
                </div>
                <MIcon name="chevR" size={20} />
              </div>
            </div>
          </div>
        )}

        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">
              {cat === 'all' ? '전체 문서' : CATEGORIES.find((c) => c.id === cat)?.label} {filtered.length}
            </div>
          </div>
          <div className="m-card flush" style={{ margin: '0 16px' }}>
            {filtered.length === 0 && !loading && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                해당 카테고리의 문서가 없습니다.
              </div>
            )}
            {filtered.map((g) => (
              <div key={g.id} className="m-list-row">
                <div className={'ico-tile' + (tone(g.category) ? ' tone-' + tone(g.category) : '')}>
                  <MIcon name={g.category === 'emergency' ? 'alertTri' : 'fileText'} size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {g.title}
                    {g.category === 'emergency' && <MChip tone="danger">HOT</MChip>}
                  </div>
                  <div className="sub">
                    {g.department} · {g.created_at.slice(0, 10)}
                  </div>
                </div>
                <MIcon name="chevR" size={18} color="var(--z-400)" />
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
