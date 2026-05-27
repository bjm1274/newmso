'use client';

/**
 * SDocs — 모바일 서류 제출 현황
 *   - 칩바: 전체 / 미제출 / 제출완료
 *   - 필수 서류 16종 + 각 항목 상태 카드
 *   - 우상단 + : 카메라/파일 선택 (다음 라운드)
 * 데이터: document_repository (PC와 동일 테이블)
 * JM(파일당 500줄), JM3(에러는 toast), JM6(button 시맨틱)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';

type DocFilter = 'all' | 'todo' | 'done';

type DocRow = {
  id: string;
  doc_type: string;
  status: string;
  file_url?: string | null;
  uploaded_at?: string | null;
  created_at?: string | null;
};

const REQUIRED_DOCS: { id: string; label: string }[] = [
  { id: '가족관계',     label: '가족관계증명서' },
  { id: '개인정보보호', label: '개인정보 보호교육' },
  { id: '면허자격',     label: '면허(자격)증 사본' },
  { id: '보건증',       label: '보건선결과(보건증)' },
  { id: '안전보건',     label: '산업안전 보건교육' },
  { id: '성희롱예방',   label: '성희롱 예방교육' },
  { id: '신분증',       label: '신분증 사본' },
  { id: '일반검진',     label: '일반 건강검진' },
  { id: '잠복결핵',     label: '잠복결핵 검진결과' },
  { id: '장애인인식',   label: '장애인 인식개선교육' },
  { id: '등본',         label: '주민등록등본' },
  { id: '초본',         label: '주민등록초본' },
  { id: '괴롭힘예방',   label: '직장내 괴롭힘 예방교육' },
  { id: '통장',         label: '통장사본' },
  { id: '퇴직연금',     label: '퇴직연금교육' },
  { id: '특수검진',     label: '특수 건강검진' },
];

export type SDocsProps = {
  staffId: string | null;
  onBack: () => void;
};

export default function SDocs({ staffId, onBack }: SDocsProps) {
  const [filter, setFilter] = useState<DocFilter>('all');
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDocs = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_repository')
        .select('id, doc_type, status, file_url, uploaded_at, created_at')
        .eq('created_by', staffId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocs((data as DocRow[]) ?? []);
    } catch (err) {
      toast(`서류 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { void fetchDocs(); }, [fetchDocs]);

  const docStatusByType = useMemo(() => {
    const m = new Map<string, DocRow>();
    for (const d of docs) {
      const existing = m.get(d.doc_type);
      if (!existing) m.set(d.doc_type, d);
    }
    return m;
  }, [docs]);

  const counts = useMemo(() => {
    const done = REQUIRED_DOCS.filter(r => {
      const row = docStatusByType.get(r.id);
      return row && (row.status === '제출완료' || row.status === '승인');
    }).length;
    return { done, total: REQUIRED_DOCS.length, todo: REQUIRED_DOCS.length - done };
  }, [docStatusByType]);

  const filtered = REQUIRED_DOCS.filter((r) => {
    const row = docStatusByType.get(r.id);
    const isDone = !!row && (row.status === '제출완료' || row.status === '승인');
    if (filter === 'todo') return !isDone;
    if (filter === 'done') return isDone;
    return true;
  });

  return (
    <div className="m-screen">
      <MobileHeader
        title="서류 제출"
        sub={`${counts.done} / ${counts.total} 제출 완료`}
        back={onBack}
      />
      <div className="m-chip-bar">
        <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          전체<span className="cnt">{counts.total}</span>
        </button>
        <button type="button" className={filter === 'todo' ? 'on' : ''} onClick={() => setFilter('todo')}>
          미제출<span className="cnt">{counts.todo}</span>
        </button>
        <button type="button" className={filter === 'done' ? 'on' : ''} onClick={() => setFilter('done')}>
          제출완료<span className="cnt">{counts.done}</span>
        </button>
      </div>

      {/* 진행률 카드 */}
      <div style={{ padding: '12px 16px 0' }}>
        <div className="m-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="m-tnum" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em' }}>
              {counts.done}
            </span>
            <span style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>
              / {counts.total}건 제출 완료
            </span>
          </div>
          <div style={{
            marginTop: 10, height: 8, borderRadius: 999, background: 'var(--z-100)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.round((counts.done / counts.total) * 100)}%`,
              background: 'linear-gradient(90deg, var(--m-accent), var(--m-accent-700))',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      </div>

      <div className="m-scroll">
        <div style={{ padding: '12px 16px' }}>
          {loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--z-500)' }}>
              불러오는 중…
            </div>
          )}
          <div className="m-card flush">
            {filtered.map((r) => {
              const row = docStatusByType.get(r.id);
              const isDone = !!row && (row.status === '제출완료' || row.status === '승인');
              const isPending = !!row && row.status !== '제출완료' && row.status !== '승인';
              return (
                <div key={r.id} className="m-list-row">
                  <div
                    className={'ico-tile ' + (isDone ? 'tone-success' : isPending ? 'tone-warning' : '')}
                    aria-hidden="true"
                  >
                    <MIcon name={isDone ? 'checkCircle' : 'fileText'} size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="lbl">{r.label}</div>
                    <div className="sub">
                      {isDone ? `제출 완료${row?.uploaded_at ? ` · ${new Date(row.uploaded_at).toLocaleDateString('ko-KR')}` : ''}` :
                       isPending ? `처리 중 · ${row?.status ?? ''}` :
                       '미제출'}
                    </div>
                  </div>
                  {isDone ? <MChip tone="success">완료</MChip> :
                   isPending ? <MChip tone="warning">대기</MChip> :
                   <MChip>필요</MChip>}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '14px 4px', fontSize: 11, color: 'var(--z-500)', fontWeight: 600, lineHeight: 1.6 }}>
            📎 첨부·업로드는 데스크톱에서 진행해주세요. 모바일에서는 제출 현황과 진행 단계만 확인합니다.
          </div>
        </div>
      </div>
    </div>
  );
}
