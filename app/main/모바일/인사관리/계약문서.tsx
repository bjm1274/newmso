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

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import { toast } from '@/lib/toast';
import { useMyContractDocs, daysUntil, type MyDocRow } from './data-hooks';
import { issueAndPrintMyCert } from '../내정보/cert-issue';
import { uploadMyDocument } from '../내정보/doc-submit';
import {
  DOC_ALLOWED_FORMATS_LABEL,
  DOC_MAX_FILE_SIZE_LABEL,
  MOBILE_SUBMISSION_TYPES,
} from '@/lib/document-submission-shared';

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
        {tab === 'cert' && <CertTab staffId={staffId} />}
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
// id 는 certificate_types id 와 일치(certificate_issuances.cert_type 로 저장).
type IssuableCert = { id: string; title: string; desc: string; icon: string };

const ISSUABLE_CERTS: ReadonlyArray<IssuableCert> = [
  { id: '재직증명서', title: '재직증명서', desc: '본인용·국문', icon: 'fileText' },
  { id: '경력증명서', title: '경력증명서', desc: '입사일 ~ 현재', icon: 'fileText' },
  { id: '원천징수영수증', title: '원천징수영수증', desc: '연말정산용', icon: 'won' },
  { id: '근무확인서', title: '근무확인서', desc: '근무 기간·부서 확인', icon: 'shield' },
];

function CertTab({ staffId }: { staffId: string | null }) {
  const [issuingId, setIssuingId] = useState<string | null>(null);

  const handleIssue = async (c: IssuableCert) => {
    if (issuingId) return;
    setIssuingId(c.id);
    try {
      await issueAndPrintMyCert(staffId, c.id);
    } finally {
      setIssuingId(null);
    }
  };

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-section-h" style={{ padding: '0 0 8px' }}>
        <div className="lbl">발급 가능한 증명서</div>
      </div>
      <div className="m-card flush">
        {ISSUABLE_CERTS.map((c) => {
          const busy = issuingId === c.id;
          return (
            <div key={c.id} className="m-list-row">
              <div className="ico-tile">
                <MIcon name={c.icon} size={18} />
              </div>
              <div>
                <div className="lbl">{c.title}</div>
                <div className="sub">{c.desc}</div>
              </div>
              <MBtn
                disabled={Boolean(issuingId)}
                onClick={() => void handleIssue(c)}
                ariaLabel={`${c.title} 발급`}
              >
                {busy ? '발급 중…' : '발급'}
              </MBtn>
            </div>
          );
        })}
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
        // 정본 employment_contracts 에는 title/end_date 컬럼이 없다.
        const { data, error } = await supabase
          .from('employment_contracts')
          .select('id, start_date, contract_type, status')
          .eq('staff_id', staffId)
          .order('start_date', { ascending: false })
          .limit(20);
        if (error) throw error;
        if (cancelled) return;
        setRows(
          ((data ?? []) as Record<string, unknown>[]).map((r) => {
            const contractType =
              typeof r.contract_type === 'string' ? r.contract_type : null;
            return {
              id: String(r.id ?? ''),
              title: contractType && contractType.length > 0 ? contractType : '계약서',
              start_date: typeof r.start_date === 'string' ? r.start_date : null,
              end_date: null,
              contract_type: contractType,
              status: typeof r.status === 'string' ? r.status : null,
            };
          }),
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
          const isPending = r.status === '서명대기';
          return (
            <div
              key={r.id}
              className="m-list-row cursor-pointer"
              onClick={() => {
                if (isPending) {
                  window.dispatchEvent(new CustomEvent('erp-mobile-trigger-signature'));
                } else if (r.status === '서명완료') {
                  toast('이미 서명이 완료된 계약서입니다. 문서보관함에서 확인하실 수 있습니다.', 'info');
                }
              }}
              style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
            >
              <div className={'ico-tile ' + (isCurrent ? 'tone-accent' : isPending ? 'tone-warning' : '')}>
                <MIcon name="fileText" size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="lbl">{r.title}</div>
                <div className="sub">
                  {r.start_date ?? '-'}
                  {r.end_date ? ` ~ ${r.end_date}` : ' ~'}
                </div>
              </div>
              {isCurrent && <MChip tone="accent">현재</MChip>}
              {isPending && <MChip tone="warning">서명대기</MChip>}
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

// 서류 종류는 공통 모듈(모바일 6종)에서 공유한다.
const SUBMIT_CATEGORIES = MOBILE_SUBMISSION_TYPES;

function SubmitTab({ staffId }: { staffId: string | null }) {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [category, setCategory] = useState<string>(SUBMIT_CATEGORIES[0]);
  const [uploading, setUploading] = useState(false);
  const [staffMeta, setStaffMeta] = useState<{ name: string | null; company: string | null }>({
    name: null,
    company: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 업로드 제목/회사명 구성을 위한 본인 메타 1건 (JM5: staffId 고정).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!staffId) return;
      try {
        const { data } = await supabase
          .from('staff_members')
          .select('name, company')
          .eq('id', staffId)
          .maybeSingle();
        if (cancelled || !data) return;
        const r = data as { name?: unknown; company?: unknown };
        setStaffMeta({
          name: typeof r.name === 'string' ? r.name : null,
          company: typeof r.company === 'string' ? r.company : null,
        });
      } catch {
        // silent — 제목은 '직원'으로 폴백
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

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
  }, [staffId, reloadToken]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일 재선택 허용을 위해 input 값 초기화
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadMyDocument({
        staffId,
        staffName: staffMeta.name,
        company: staffMeta.company,
        file,
        category,
      });
      if (result.ok) setReloadToken((t) => t + 1);
    } finally {
      setUploading(false);
    }
  };

  const uploadCard = (
    <div className="m-card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>서류 업로드</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          aria-label="서류 종류 선택"
          value={category}
          onChange={(ev) => setCategory(ev.target.value)}
          disabled={uploading}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '10px 12px',
            borderRadius: 'var(--m-radius-md)',
            border: '1px solid var(--m-border)',
            background: 'var(--m-card)',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--z-800)',
          }}
        >
          {SUBMIT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <MBtn
          variant="primary"
          icon="upload"
          disabled={uploading || !staffId}
          onClick={() => fileInputRef.current?.click()}
          ariaLabel="파일 선택 후 업로드"
        >
          {uploading ? '업로드 중…' : '파일 첨부'}
        </MBtn>
      </div>
      <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 8 }}>
        {DOC_ALLOWED_FORMATS_LABEL} · 최대 {DOC_MAX_FILE_SIZE_LABEL}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        style={{ display: 'none' }}
        onChange={(e) => void handleFileChange(e)}
      />
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: '14px 16px 24px' }}>
        {uploadCard}
        <Loading />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: '14px 16px 24px' }}>
        {uploadCard}
        <EmptyState text="제출한 서류가 없습니다. 위에서 파일을 첨부해 제출하세요." />
      </div>
    );
  }

  const pending = rows.filter((r) => !r.submitted_at);

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {uploadCard}
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
              {/* document_repository 업로드 행은 항상 제출 완료 상태로 노출한다. */}
              <MChip tone={submitted ? 'success' : tone}>완료</MChip>
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
