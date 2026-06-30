'use client';

/**
 * 회사 관리 — 문서 보관 탭
 * 회사별 문서 조회, 추가 및 삭제
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_DOCS } from './fallback-data';
import type { DocRow } from './types';

interface DBDocRow extends DocRow {
  id: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function loadCompanyDocs(companyName: string): Promise<DBDocRow[]> {
  try {
    const { data, error } = await db
      .from('document_repository')
      .select('id,title,category,content,created_at,company_name')
      .limit(100);

    if (error || !Array.isArray(data) || data.length === 0) {
      // Return filtered fallback docs if no DB records exist
      return FALLBACK_DOCS.map((d, idx) => ({
        id: `fallback-${idx}`,
        ...d }));
    }

    // Filter documents by company_name in client-side or use DB query.
    // D1 proxy allows standard filters. Let's filter here for safety.
    const filtered = data.filter(isRecord).filter(r => {
      if (companyName === '전체') return true;
      return String(r.company_name) === companyName || String(r.company_name) === '전체';
    });

    return filtered.map((r): DBDocRow => {
      let size = '120KB';
      let access: DocRow['access'] = '전사';

      try {
        if (typeof r.content === 'string' && r.content.startsWith('{')) {
          const parsed = JSON.parse(r.content) as Record<string, unknown>;
          if (typeof parsed.size === 'string') size = parsed.size;
          if (typeof parsed.access === 'string') {
            const acc = parsed.access;
            if (acc === '관리자' || acc === '경영진' || acc === '전사') {
              access = acc;
            }
          }
        }
      } catch {
        // Fallback parsing failed
      }

      // Format created_at to YYYY.MM.DD
      let dateStr = '-';
      if (typeof r.created_at === 'string') {
        const d = new Date(r.created_at);
        if (!isNaN(d.getTime())) {
          dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
        }
      }

      return {
        id: String(r.id),
        name: typeof r.title === 'string' ? r.title : '-',
        category: typeof r.category === 'string' ? r.category : '-',
        date: dateStr,
        size,
        access };
    });
  } catch {
    return FALLBACK_DOCS.map((d, idx) => ({
      id: `fallback-${idx}`,
      ...d }));
  }
}

export default function CompanyDocsTab() {
  const [companiesList, setCompaniesList] = useState<string[]>(['전체', '박철홍정형외과', '수연의원', 'MSO 본사', '지점 A']);
  const [selectedCompany, setSelectedCompany] = useState<string>('박철홍정형외과');

  const [rows, setRows] = useState<DBDocRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState('법인');
  const [docAccess, setDocAccess] = useState<'전사' | '관리자' | '경영진'>('전사');
  const [docSize, setDocSize] = useState('150KB');
  const [docContent, setDocContent] = useState('');
  const [uploading, setUploading] = useState(false);

  // Load company branches list
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const { data, error } = await db
          .from('companies')
          .select('name')
          .limit(50);
        if (!error && Array.isArray(data) && data.length > 0) {
          const names = Array.from(new Set(['전체', ...data.filter(isRecord).map(d => String(d.name))]));
          setCompaniesList(names);
          // Set active branch to first non-'전체' branch if possible
          const primaryBranch = data[0].name;
          if (primaryBranch) {
            setSelectedCompany(String(primaryBranch));
          }
        }
      } catch (err) {
        console.warn('Failed to load company branches list:', err);
      }
    };
    void fetchCompanies();
  }, []);

  // Load documents when company changes
  const fetchDocs = async () => {
    setLoading(true);
    const d = await loadCompanyDocs(selectedCompany);
    setRows(d);
    setLoading(false);
  };

  useEffect(() => {
    void fetchDocs();
  }, [selectedCompany]);

  const handleUpload = async () => {
    if (!docName.trim()) return alert('문서명을 입력해주세요.');
    setUploading(true);
    try {
      const newId = crypto.randomUUID();
      const contentJson = JSON.stringify({
        textContent: docContent,
        size: docSize || '100KB',
        access: docAccess });

      const { error } = await db
        .from('document_repository')
        .insert({
          id: newId,
          title: docName,
          category: docCategory,
          company_name: selectedCompany === '전체' ? '전체' : selectedCompany,
          content: contentJson,
          file_url: '#',
          version: 1,
          created_by: '관리자' });

      if (error) throw error;

      setShowUploadModal(false);
      setDocName('');
      setDocContent('');
      setDocSize('150KB');
      void fetchDocs();
    } catch (e) {
      console.error('[CompanyDocsTab] upload failed:', e);
      alert('문서 등록에 실패했습니다. (서버/권한 오류)');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('fallback-')) {
      // Just filter local fallback list for safety
      setRows(prev => prev.filter(r => r.id !== id));
      return;
    }

    if (!confirm('정말 이 문서를 삭제하시겠습니까?')) return;

    try {
      const { error } = await db
        .from('document_repository')
        .delete()
        .eq('id', id);

      if (error) throw error;
      void fetchDocs();
    } catch (e) {
      console.error('[CompanyDocsTab] delete failed:', e);
      alert('문서 삭제에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── 상단 회사 선택기 ─── */}
      <section className="app-card p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" aria-labelledby="target-company-docs-title">
        <div>
          <h3 id="target-company-docs-title" className="text-[13px] font-bold text-[var(--foreground)]">보관함 회사·지점 선택</h3>
          <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">회사별 보관 문서들을 개별 조회하고 관리할 수 있습니다.</p>
        </div>
        <div>
          <label htmlFor="docs-company-select" className="sr-only">문서 회사 선택</label>
          <select
            id="docs-company-select"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 min-w-[180px]"
          >
            {companiesList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </section>

      {/* ─── 문서 보관함 목록 카드 ─── */}
      <Card
        title={`${selectedCompany} — 문서 보관함 (${loading ? '…' : rows.length})`}
        action={<SmBtn primary onClick={() => setShowUploadModal(true)} ariaLabel="문서 업로드">+ 문서 업로드</SmBtn>}
      >
        {loading ? (
          <div className="py-8 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px]">
              <caption className="sr-only">회사 문서 보관함 목록</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10.5px] text-[var(--toss-gray-4)]">
                  <th scope="col" className="px-2.5 py-2 font-semibold">문서명</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">분류</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">업로드</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">크기</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">접근 권한</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold text-center w-[60px]">액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[12px] text-[var(--toss-gray-4)]">
                      보관된 문서가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const tone =
                      r.access === '관리자' ? 'danger' : r.access === '경영진' ? 'warn' : 'muted';
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-[var(--border)]/60 hover:bg-[var(--muted)]"
                      >
                        <td className="px-2.5 py-2.5 font-bold text-[var(--foreground)] align-middle">{r.name}</td>
                        <td className="px-2.5 py-2.5 text-[var(--toss-gray-4)] align-middle">{r.category}</td>
                        <td className="px-2.5 py-2.5 tabular-nums text-[var(--toss-gray-4)] align-middle">{r.date}</td>
                        <td className="px-2.5 py-2.5 tabular-nums text-[var(--toss-gray-4)] align-middle">{r.size}</td>
                        <td className="px-2.5 py-2.5 align-middle">
                          <Chip tone={tone}>{r.access}</Chip>
                        </td>
                        <td className="px-2.5 py-2 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => handleDelete(r.id)}
                            className="p-1 text-[var(--toss-gray-4)] hover:text-[var(--danger)] transition-colors"
                            title="문서 삭제"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── 문서 업로드 모달 ─── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="app-card w-full max-w-md p-4 space-y-4 shadow-xl border border-[var(--border)] bg-[var(--card)] animate-in fade-in zoom-in-95 duration-150">
            <header className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="text-[13px] font-bold text-[var(--foreground)]">📂 새 문서 업로드 등록</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)] text-sm font-bold"
              >
                ✕
              </button>
            </header>

            <div className="space-y-3">
              <div>
                <label htmlFor="new-doc-name" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                  문서명
                </label>
                <input
                  id="new-doc-name"
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  placeholder="예: 2026년 근로소득원천징수 영수증"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-doc-cat" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    분류 카테고리
                  </label>
                  <select
                    id="new-doc-cat"
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  >
                    <option value="법인">법인 문서</option>
                    <option value="규정">규정 문서</option>
                    <option value="재무">재무 문서</option>
                    <option value="인사">인사 문서</option>
                    <option value="기타">기타 문서</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="new-doc-access" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    접근 제한 수준
                  </label>
                  <select
                    id="new-doc-access"
                    value={docAccess}
                    onChange={(e) => setDocAccess(e.target.value as '전사' | '관리자' | '경영진')}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  >
                    <option value="전사">전사 공개 (전체)</option>
                    <option value="경영진">경영진 전용</option>
                    <option value="관리자">최고 관리자 전용</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-doc-size" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    가상 파일 크기
                  </label>
                  <input
                    id="new-doc-size"
                    type="text"
                    value={docSize}
                    onChange={(e) => setDocSize(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                    placeholder="예: 248KB, 1.2MB"
                  />
                </div>
                <div>
                  <label htmlFor="new-doc-company" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    업로드 대상 회사
                  </label>
                  <input
                    id="new-doc-company"
                    type="text"
                    value={selectedCompany}
                    disabled
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] text-[var(--toss-gray-4)] focus:outline-none cursor-not-allowed font-semibold"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="new-doc-desc" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                  문서 비고 및 설명
                </label>
                <textarea
                  id="new-doc-desc"
                  rows={3}
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none resize-none"
                  placeholder="보관 문서에 대한 간단한 설명을 기록하세요."
                />
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
              <SmBtn onClick={() => setShowUploadModal(false)} ariaLabel="취소">취소</SmBtn>
              <SmBtn primary onClick={handleUpload} ariaLabel="문서 등록">
                {uploading ? '등록 중…' : '문서 등록하기'}
              </SmBtn>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

