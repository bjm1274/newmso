'use client';

/**
 * 업무가이드 — SOP 문서 read-only.
 * useTaskGuides (board_posts board_type='업무가이드').
 * 핸드오프 m-screens-addon-details §AD8 (SGuide) 이식.
 * JM: ~180줄.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MSheet from '../공통/MSheet';
import { useTaskGuides, type SharePost } from './data-hooks';

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

function MobileTaskGuide({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  // Fetch guides from all companies
  const { rows, loading } = useTaskGuides({ company: undefined });
  const [cat, setCat] = useState<CatId>('all');
  const [selectedCo, setSelectedCo] = useState<string>(typeof user.company === 'string' ? user.company : '전체');
  const [selectedDept, setSelectedDept] = useState<string>('전체');
  const [selectedGuide, setSelectedGuide] = useState<SharePost | null>(null);

  // Dynamic companies filter options
  const companies = useMemo(() => {
    const cos = new Set<string>();
    cos.add('전체');
    cos.add('공통');
    rows.forEach((r) => {
      if (r.company && r.company !== '공통') cos.add(r.company);
    });
    return Array.from(cos);
  }, [rows]);

  // Dynamic departments filter options
  const departments = useMemo(() => {
    const depts = new Set<string>();
    depts.add('전체');
    rows.forEach((r) => {
      if (r.department) depts.add(r.department);
    });
    return Array.from(depts);
  }, [rows]);

  // Apply company & department filters
  const filteredByCoDept = useMemo(() => {
    return rows.filter((r) => {
      const matchesCo =
        selectedCo === '전체' ||
        r.company === selectedCo ||
        (selectedCo === '공통' && (!r.company || r.company === '공통'));
      const matchesDept = selectedDept === '전체' || r.department === selectedDept;
      return matchesCo && matchesDept;
    });
  }, [rows, selectedCo, selectedDept]);

  const annotated = useMemo(
    () => filteredByCoDept.map((r) => ({ ...r, category: detectCategory(r.title, r.body) })),
    [filteredByCoDept],
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
        sub={`${selectedCo} · ${filtered.length}개 문서`}
        back={onBack}
      />

      {/* 회사 & 부서 필터 셀렉터 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          padding: '10px 16px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="co-filter" style={{ fontSize: 10, fontWeight: 800, color: 'var(--z-500)' }}>회사</label>
          <select
            id="co-filter"
            value={selectedCo}
            onChange={(e) => setSelectedCo(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--m-border)',
              background: 'var(--m-bg)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--z-800)',
              outline: 'none',
              width: '100%',
            }}
          >
            {companies.map((co) => (
              <option key={co} value={co}>{co}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="dept-filter" style={{ fontSize: 10, fontWeight: 800, color: 'var(--z-500)' }}>부서</label>
          <select
            id="dept-filter"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--m-border)',
              background: 'var(--m-bg)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--z-800)',
              outline: 'none',
              width: '100%',
            }}
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
      </div>

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
            <button
              type="button"
              onClick={() => setSelectedGuide(filtered[0])}
              className="m-card"
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '14px 14px',
                background: 'linear-gradient(135deg, var(--m-accent), #1D4ED8)',
                borderColor: 'transparent',
                color: '#fff',
                cursor: 'pointer',
              }}
              aria-label={`${filtered[0].title} 상세 보기`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MIcon name="alertTri" size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.4 }}>
                    {filtered[0].title}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 2 }}>
                    {filtered[0].company ? `${filtered[0].company} · ` : ''}{filtered[0].department} · {filtered[0].created_at.slice(0, 10)}
                  </div>
                </div>
                <MIcon name="chevR" size={20} />
              </div>
            </button>
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
              <button
                key={g.id}
                type="button"
                className="m-list-row"
                onClick={() => setSelectedGuide(g)}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'transparent' }}
                aria-label={`${g.title} 상세 보기`}
              >
                <div className={'ico-tile' + (tone(g.category) ? ' tone-' + tone(g.category) : '')}>
                  <MIcon name={g.category === 'emergency' ? 'alertTri' : 'fileText'} size={18} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {g.title}
                    {g.category === 'emergency' && <MChip tone="danger">HOT</MChip>}
                  </div>
                  <div className="sub">
                    {g.company ? `${g.company} · ` : ''}{g.department} · {g.created_at.slice(0, 10)}
                  </div>
                </div>
                <MIcon name="chevR" size={18} color="var(--z-400)" />
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>

      {/* 상세 보기 바텀 시트 */}
      <MSheet
        open={!!selectedGuide}
        onClose={() => setSelectedGuide(null)}
        title={selectedGuide?.title || '업무가이드'}
      >
        {selectedGuide && (
          <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
              <MChip tone="accent">{selectedGuide.company || '공통'}</MChip>
              <span>{selectedGuide.department}</span>
              <span>·</span>
              <span>{selectedGuide.author}</span>
              <span>·</span>
              <span>{selectedGuide.created_at.slice(0, 10)}</span>
            </div>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                color: 'var(--z-800)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                marginTop: 12,
                background: 'var(--m-bg)',
                padding: '14px 16px',
                borderRadius: 'var(--m-radius-md)',
                border: '1px solid var(--m-border)',
              }}
            >
              {selectedGuide.body}
            </div>
          </div>
        )}
      </MSheet>
    </div>
  );
}

export default MobileTaskGuide;
