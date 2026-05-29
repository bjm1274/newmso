'use client';

/**
 * SHrDocs — 모바일 인사관리: 계약·문서
 *
 * 핸드오프 §6 (m-screens-hr.jsx :598~696) 1:1 이식.
 *   - 4 chip-bar (내 문서 / 증명서 / 계약 / 서류제출)
 *   - 내 문서: document_repository (본인 staff_id)
 *   - 증명서: 발급 가능한 종류 + 발급 이력
 *   - 계약: employment_contracts (본인)
 *   - 서류제출: document_submissions (본인 요청 항목)
 *
 * JM5: 본인 staff_id만 조회. 권한이 없는 대상은 비노출.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import { toast } from '@/lib/toast';
import { useMyContractDocs, daysUntil, type MyDocRow } from './data-hooks';

export type SHrDocsTab = 'mine' | 'cert' | 'ctr' | 'submit';

export type SHrDocsProps = {
  staffId: string | null;
  onBack: () => void;
};

export default function 계약문서({ staffId, onBack }: SHrDocsProps) {
  const [tab, setTab] = useState<SHrDocsTab>('mine');

  return (
    <div className="m-screen">
      <MobileHeader title="계약·문서" sub="내 문서함" back={onBack} />

      <div className="m-chip-bar" role="tablist" aria-label="계약·문서 탭">
        {(
          [
            { id: 'mine', label: '내 문서' },
            { id: 'cert', label: '증명서' },
            { id: 'ctr', label: '계약' },
            { id: 'submit', label: '서류제출' },
          ] as ReadonlyArray<{ id: SHrDocsTab; label: string }>
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={tab === opt.id ? 'on' : ''}
            onClick={() => setTab(opt.id)}
            role="tab"
            aria-selected={tab === opt.id}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="m-scroll">
        {tab === 'mine' && <MineTab staffId={staffId} />}
        {tab === 'cert' && <CertTab />}
        {tab === 'ctr' && <ContractTab staffId={staffId} />}
        {tab === 'submit' && <SubmitTab staffId={staffId} />}
      </div>
    </div>
  );
}

// ─── 내 문서 ───────────────────────────────────────────────────
function MineTab({ staffId }: { staffId: string | null }) {
  const { docs, loading } = useMyContractDocs(staffId);
  if (loading) return <Loading />;
  if (docs.length === 0) {
    return <EmptyState text="보관된 문서가 없습니다." />;
  }
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card flush">
        {docs.map((d) => (
          <button
            key={d.id}
            type="button"
            className="m-list-row"
            onClick={() => handleOpenDoc(d)}
            style={{ textAlign: 'left', width: '100%' }}
            aria-label={`${d.title} 열기`}
          >
            <div className="ico-tile tone-accent">
              <MIcon name="fileText" size={18} />
            </div>
            <div>
              <div className="lbl">{d.title}</div>
              <div className="sub">{describeDoc(d)}</div>
            </div>
            <MIcon name="download" size={18} color="var(--z-500)" />
          </button>
        ))}
      </div>
    </div>
  );
}

function describeDoc(d: MyDocRow): string {
  const kb = d.file_size ? Math.round(d.file_size / 1024) : 0;
  const type = (d.doc_type ?? '문서').toUpperCase();
  if (kb > 0) return `${type} · ${kb}KB`;
  return type;
}

function handleOpenDoc(d: MyDocRow) {
  if (!d.file_url) {
    toast('이 문서는 PC에서만 열 수 있습니다.', 'warning');
    return;
  }
  try {
    window.open(d.file_url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    console.error('[mobile-hr] open doc failed', err);
    toast('문서 열기에 실패했습니다.', 'error');
  }
}

// ─── 증명서 ────────────────────────────────────────────────────
type IssuableCert = { id: string; title: string; desc: string; icon: string };

const ISSUABLE_CERTS: ReadonlyArray<IssuableCert> = [
  { id: 'employment', title: '재직증명서', desc: '본인용·국문', icon: 'fileText' },
  { id: 'career', title: '경력증명서', desc: '입사일 ~ 현재', icon: 'fileText' },
  {
    id: 'tax',
    title: '근로소득원천징수영수증',
    desc: '연말정산용',
    icon: 'won',
  },
  { id: 'insurance', title: '4대보험 가입증명서', desc: '국문', icon: 'shield' },
];

function CertTab() {
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-section-h" style={{ padding: '0 0 8px' }}>
        <div className="lbl">발급 가능한 증명서</div>
      </div>
      <div className="m-card flush">
        {ISSUABLE_CERTS.map((c) => (
          <div key={c.id} className="m-list-row">
            <div className="ico-tile">
              <MIcon name={c.icon} size={18} />
            </div>
            <div>
              <div className="lbl">{c.title}</div>
              <div className="sub">{c.desc}</div>
            </div>
            <MBtn onClick={() => toast(`${c.title} 발급은 PC에서 진행해주세요.`, 'info')}>
              발급
            </MBtn>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 계약 ──────────────────────────────────────────────────────
type ContractRow = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  contract_type: string | null;
  status: string | null;
};

function ContractTab({ staffId }: { staffId: string | null }) {
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!staffId) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('employment_contracts')
          .select('id, title, start_date, end_date, contract_type, status')
          .eq('staff_id', staffId)
          .order('start_date', { ascending: false })
          .limit(20);
        if (error) throw error;
        if (cancelled) return;
        setRows(
          ((data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ''),
            title:
              typeof r.title === 'string' && r.title.length > 0 ? r.title : '계약서',
            start_date: typeof r.start_date === 'string' ? r.start_date : null,
            end_date: typeof r.end_date === 'string' ? r.end_date : null,
            contract_type: typeof r.contract_type === 'string' ? r.contract_type : null,
            status: typeof r.status === 'string' ? r.status : null,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] contracts load failed', err);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (loading) return <Loading />;
  if (rows.length === 0) {
    return <EmptyState text="등록된 계약이 없습니다." />;
  }

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card flush">
        {rows.map((r) => {
          const isCurrent = (r.status ?? '').includes('적용') || r.status === 'active';
          return (
            <div key={r.id} className="m-list-row">
              <div className={'ico-tile ' + (isCurrent ? 'tone-accent' : '')}>
                <MIcon name="fileText" size={18} />
              </div>
              <div>
                <div className="lbl">{r.title}</div>
                <div className="sub">
                  {r.start_date ?? '-'}
                  {r.end_date ? ` ~ ${r.end_date}` : ' ~'}
                </div>
              </div>
              {isCurrent && <MChip tone="accent">현재</MChip>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 서류제출 ──────────────────────────────────────────────────
type SubmissionRow = {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  submitted_at: string | null;
};

function SubmitTab({ staffId }: { staffId: string | null }) {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!staffId) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('document_repository')
          .select('id, title, category, created_at')
          .eq('created_by', staffId)
          .order('created_at', { ascending: false })
          .limit(30);
        if (error) throw error;
        if (cancelled) return;
        setRows(
          ((data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ''),
            title:
              typeof r.title === 'string' && r.title.length > 0 ? r.title : String(r.category ?? '서류'),
            status: '완료',
            due_date: null,
            submitted_at: typeof r.created_at === 'string' ? r.created_at : null,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-hr] submissions load failed', err);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (loading) return <Loading />;
  if (rows.length === 0) {
    return <EmptyState text="현재 제출 요청 받은 서류가 없습니다." />;
  }

  const pending = rows.filter((r) => !r.submitted_at);

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {pending.length > 0 && (
        <div
          className="m-card"
          style={{
            padding: '14px 16px',
            background: 'var(--m-warning-soft)',
            borderColor: 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MIcon name="alertTri" size={18} color="var(--m-warning)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--m-warning)' }}>
                제출 필요 서류 {pending.length}건
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--z-600)',
                  fontWeight: 600,
                  marginTop: 1,
                }}
              >
                {pending
                  .slice(0, 3)
                  .map((r) => r.title)
                  .join(' · ')}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="m-card flush" style={{ marginTop: 12 }}>
        {rows.map((r) => {
          const submitted = Boolean(r.submitted_at);
          const left = daysUntil(r.due_date);
          const tone: '' | 'success' | 'warning' | 'danger' = submitted
            ? 'success'
            : left !== null && left < 0
              ? 'danger'
              : 'warning';
          const sub = submitted
            ? `${formatDateShort(r.submitted_at)} 제출`
            : left !== null
              ? left < 0
                ? `${-left}일 지남`
                : `D-${left}`
              : '제출 기한 미정';
          return (
            <div key={r.id} className="m-list-row">
              <div className={'ico-tile tone-' + (tone || '')}>
                <MIcon name="fileText" size={18} />
              </div>
              <div>
                <div className="lbl">{r.title}</div>
                <div className="sub">{sub}</div>
              </div>
              {submitted ? (
                <MChip tone="success">완료</MChip>
              ) : (
                <MBtn
                  variant="primary"
                  onClick={() =>
                    toast(`${r.title} 제출은 마이페이지에서 진행해주세요.`, 'info')
                  }
                >
                  제출
                </MBtn>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 공용 ──────────────────────────────────────────────────────
function Loading() {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
      불러오는 중...
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
      {text}
    </div>
  );
}

function formatDateShort(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
