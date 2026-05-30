'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { extractApprovalDocNumberFromDocument, mapApprovalToDocumentRepositoryEntry } from '@/lib/approval-document-archive';
import ArchivedDocumentView from './ArchivedDocumentView';
import IssuedCertificateSection from './IssuedCertificateSection';
import LaborContractViewer from './LaborContractViewer';
import { openDocumentPrintView } from './document-print-utils';

type DocumentCenterView = '기안 문서' | '발급 증명서';

const CATEGORIES = [
  { id: '규정', label: '규정' },
  { id: '양식', label: '양식' },
  { id: '근로계약서', label: '근로계약서' },
  { id: '기타', label: '기타' }
];

function hasApprovalArchiveSignature(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false;
  const docNumber = String(
    (doc as Record<string, unknown>).doc_number
      || ((doc as Record<string, unknown>).meta_data as Record<string, unknown> | null | undefined)?.doc_number
      || ''
  );
  // 결재 문서번호 패턴들: APRV-..., SYIN-ATD-..., SYIN-LEV-... 등 회사-종류-YYYYMMDD-순번
  if (/^APRV-/i.test(docNumber)) return true;
  if (/^[A-Z][A-Z0-9]+-[A-Z]+-\d{8}-\d+$/i.test(docNumber)) return true;

  const content = String(doc.content || '');
  if (/^문서번호:\s*APRV-/im.test(content)) return true;
  if (/^문서번호:\s*[A-Z][A-Z0-9]+-[A-Z]+-\d{8}-\d+/im.test(content)) return true;
  // 가장 신뢰성 높은 시그니처: 결재 보관 헤더에 항상 들어가는 두 라벨이 모두 존재
  if (/^기안자:/im.test(content) && /^기안일시:/im.test(content)) return true;
  return false;
}

// ESLint 규칙에 맞게 컴포넌트 이름을 영문 대문자로 시작하게 변경합니다.
// default export 이므로 외부에서의 import 이름(문서보관함)은 그대로 유지됩니다.
type UserRecord = Record<string, unknown> | null | undefined;

export default function DocumentRepository({
  user,
  selectedCo,
  linkedTarget,
  canManageDocuments = false,
  title = '문서 보관함',
}: {
  user: UserRecord;
  selectedCo: string;
  linkedTarget?: { id?: string; name?: string };
  canManageDocuments?: boolean;
  title?: string;
}) {
  const { dialog, openConfirm } = useActionDialog();
  const [activeView, setActiveView] = useState<DocumentCenterView>('기안 문서');
  const [docs, setDocs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ title: '', category: '규정', content: '' });
  const [saving, setSaving] = useState(false);
  const [staffFilterName, setStaffFilterName] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('전체');

  const fetchDocs = async () => {
    setLoading(true);
    const repositoryQuery = supabase.from('document_repository').select('*').order('updated_at', { ascending: false });
    const approvalsQuery = supabase.from('approvals').select('*').order('created_at', { ascending: false });
    const [{ data: repositoryDocs }, { data: approvalDocs }] = await Promise.all([repositoryQuery, approvalsQuery]);
    const existingDocNumbers = new Set(
      (repositoryDocs || [])
        .map((doc) => extractApprovalDocNumberFromDocument(doc as Record<string, unknown>))
        .filter(Boolean)
    );
    const approvalArchiveDocs = (approvalDocs || [])
      .map((approval) => mapApprovalToDocumentRepositoryEntry(approval as Record<string, unknown>))
      .filter((approvalDoc) => {
        const approvalDocNumber = extractApprovalDocNumberFromDocument(approvalDoc);
        if (approvalDocNumber && existingDocNumbers.has(approvalDocNumber)) return false;
        return !(repositoryDocs || []).some((doc) =>
          String(doc.title || '').trim() === String(approvalDoc.title || '').trim() &&
          String(doc.created_by || '').trim() === String(approvalDoc.created_by || '').trim() &&
          String(doc.company_name || '').trim() === String(approvalDoc.company_name || '').trim()
        );
      });
    const mergedDocs = [...approvalArchiveDocs, ...(repositoryDocs || [])].sort((a, b) =>
      String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))
    );
    setDocs(mergedDocs);
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, [selectedCo]);

  useEffect(() => {
    if (linkedTarget?.name) {
      setStaffFilterName(linkedTarget.name);
    }
  }, [linkedTarget?.name]);

  const visibleDocs = docs.filter((d) => {
    const docCompany = String(d.company_name || '전체').trim() || '전체';
    const scopeCompany = String(selectedCo || '전체').trim() || '전체';
    const matchCompany = scopeCompany === '전체' || docCompany === scopeCompany || docCompany === '전체';
    const matchStaff = staffFilterName
      ? (`${d.title || ''} ${d.content || ''}`).includes(staffFilterName)
      : true;
    const matchCategory =
      categoryFilter === '전체' ? true : (d.category || '규정') === categoryFilter;
    return matchCompany && matchStaff && matchCategory;
  });

  const isReadOnlySelected = Boolean(
    selected?.source_type === 'approval'
    || selected?.read_only
    || hasApprovalArchiveSignature(selected)
  );

  const handleSave = async () => {
    if (!canManageDocuments) {
      return toast('문서 생성/수정은 관리자 전용입니다.', 'warning');
    }
    if (isReadOnlySelected) {
      return toast('전자결재 문서는 문서보관함에서 읽기 전용으로만 확인할 수 있습니다.', 'warning');
    }
    if (!form.title.trim()) return toast('제목을 입력하세요.', 'warning');
    setSaving(true);
    try {
      const isContract = selected?.category === '근로계약서';
      if (isContract) return toast('근로계약서 카테고리의 문서는 법적 효력 유지를 위해 수정이 불가능합니다.', 'success');
      const companyName = selectedCo && selectedCo !== '전체' ? selectedCo : (user?.company || '전체');

      if (selected) {
        const newVersion = (Number(selected.version) || 1) + 1;
        await supabase.from('document_versions').insert({
          document_id: selected.id,
          version: selected.version,
          content: selected.content,
          file_url: selected.file_url,
          created_by: user?.id
        });
        await supabase.from('document_repository').update({
          title: form.title,
          category: form.category,
          content: form.content,
          file_url: selected.file_url || null,
          version: newVersion,
          updated_at: new Date().toISOString(),
          company_name: companyName
        }).eq('id', selected.id);
      } else {
        await supabase.from('document_repository').insert({
          title: form.title,
          category: form.category,
          content: form.content,
          file_url: null,
          version: 1,
          company_name: companyName,
          created_by: user?.id
        });
      }
      fetchDocs();
      setSelected(null);
      setForm({ title: '', category: '규정', content: '' });
      toast('저장되었습니다.', 'success');
    } catch (e) { toast('저장 중 오류가 발생했습니다.', 'error'); } finally { setSaving(false); }
  };

  const handleEdit = async (d: Record<string, unknown>) => {
    setSelected(d);
    // 계약서 등 암호화된 content 는 표시 직전 복호화(평문 레코드는 그대로 통과)
    const { decryptContract } = await import('@/lib/contract-crypto');
    const decrypted = await decryptContract(String(d.content || ''));
    setForm({ title: String(d.title || ''), category: String(d.category || '규정'), content: decrypted });
  };

  const handleDelete = async (doc: Record<string, unknown>) => {
    if (!doc?.id) return;
    if (!canManageDocuments) {
      toast('문서 삭제는 관리자 전용입니다.', 'warning');
      return;
    }
    if (doc?.source_type === 'approval' || doc?.read_only) {
      toast('전자결재 문서는 문서보관함에서 삭제할 수 없습니다.', 'warning');
      return;
    }
    const confirmed = await openConfirm({
      title: '문서 완전 삭제',
      description: '해당 문서를 완전히 삭제합니다.\n삭제 후에는 되돌릴 수 없습니다.',
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('document_repository').delete().eq('id', doc.id);
      if (error) throw error;
      if (selected?.id === doc.id) {
        setSelected(null);
        setForm({ title: '', category: '규정', content: '' });
      }
      await fetchDocs();
      toast('문서가 삭제되었습니다.', 'success');
    } catch (e) {
      toast('문서 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleNew = () => {
    setSelected(null);
    setForm({ title: '', category: '규정', content: '' });
  };

  const handleOpenPdf = async () => {
    if (!selected) return;
    if (selected.content) {
      // 인쇄 직전 복호화(평문 레코드는 그대로 통과)
      const { decryptContract } = await import('@/lib/contract-crypto');
      const decryptedContent = await decryptContract(String(selected.content || ''));
      openDocumentPrintView({ ...selected, content: decryptedContent }, selectedCo);
      return;
    }

    if (selected.file_url) {
      window.open(selected.file_url as string, '_blank');
      return;
    }
    toast('열 수 있는 문서 내용이나 파일이 없습니다.', 'warning');
  };

  const VIEW_TABS: { id: DocumentCenterView; label: string }[] = [
    { id: '기안 문서', label: '기안 문서' },
    { id: '발급 증명서', label: '발급 증명서' },
  ];

  return (
    <div className="flex flex-col h-full app-page p-4 md:p-5">
      {dialog}
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[var(--foreground)]">{title}</h2>
          {/* 기안 문서 / 발급 증명서 탭 */}
          <div className="flex gap-1 bg-[var(--tab-bg)] rounded-[var(--radius-md)] p-1">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] transition-colors ${
                  activeView === tab.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeView === '기안 문서' && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--toss-gray-4)]"
            >
              <option value="전체">전체 폴더</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={staffFilterName || ''}
            onChange={(e) => setStaffFilterName(e.target.value || null)}
            placeholder="직원 이름으로 검색"
            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--foreground)] min-w-[140px]"
          />
          {activeView === '기안 문서' && (
            <button
              onClick={handleNew}
              disabled={!canManageDocuments}
              className={`px-4 py-2 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] ${
                canManageDocuments ? 'hover:bg-[var(--accent)]' : 'hidden'
              }`}
            >
              + 새 문서
            </button>
          )}
        </div>
      </div>

      {/* ── 발급 증명서 탭 ── */}
      {activeView === '발급 증명서' && (
        <IssuedCertificateSection
          selectedCo={selectedCo}
          staffFilterName={staffFilterName}
          user={user}
        />
      )}

      {/* ── 기안 문서 탭 ── */}
      {activeView === '기안 문서' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-2">
            <span className="font-semibold text-[var(--foreground)]">문서 목록 (폴더별)</span>
            {staffFilterName && (
              <button
                type="button"
                onClick={() => setStaffFilterName(null)}
                className="px-2 py-1 rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)] whitespace-nowrap"
              >
                직원: {staffFilterName} ✕
              </button>
            )}
          </div>
          {loading ? (
            <div className="p-5 text-center text-[var(--toss-gray-3)]">로딩 중...</div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              {CATEGORIES.map((cat) => {
                const folderDocs = visibleDocs.filter((d) => (d.category || '규정') === cat.id);
                return (
                  <div key={cat.id} className="border-b border-[var(--muted)]">
                    <div className="px-4 py-2.5 bg-[var(--page-bg)] font-bold text-[var(--toss-gray-4)] text-xs flex items-center gap-2">
                      <span className="text-base">
                        {cat.id === '규정' ? '📁' : cat.id === '양식' ? '📄' : cat.id === '근로계약서' ? '📋' : '📂'}
                      </span>
                      {cat.label} ({folderDocs.length})
                    </div>
                    {folderDocs.length === 0 ? (
                      <p className="px-4 py-2 text-[11px] text-[var(--toss-gray-3)]">문서 없음</p>
                    ) : (
                      folderDocs.map((d) => (
                        <div
                          key={String(d.id ?? '')}
                          className={`flex items-center border-b border-[var(--muted)] hover:bg-[var(--muted)] ${selected?.id === d.id ? 'bg-[var(--toss-blue-light)]' : ''
                            }`}
                        >
                          <button
                            onClick={() => handleEdit(d)}
                            className="flex-1 text-left pl-6 pr-4 py-3"
                          >
                            <p className="font-semibold text-[var(--foreground)] truncate text-sm">
                              {String(d.title ?? '')}
                            </p>
                            <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">
                              v{String(d.version ?? '')} ·{' '}
                              {new Date(String(d.updated_at ?? '')).toLocaleDateString('ko-KR')}
                            </p>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
              {visibleDocs.length === 0 && (
                <div className="p-5 text-center text-[var(--toss-gray-3)] text-sm">
                  {staffFilterName
                    ? '해당 직원과 관련된 문서를 찾을 수 없습니다. 제목이나 내용에 직원 이름을 포함해 보관하면 자동으로 모아집니다.'
                    : '등록된 문서가 없습니다.'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-lg font-bold text-[var(--foreground)]">
              {selected
                ? (isReadOnlySelected && selected.category !== '근로계약서')
                  ? '보관 문서 열람'
                  : selected.category === '근로계약서'
                    ? '문서 열람 (수정 불가)'
                    : '문서 수정 (버전 관리)'
                : '새 문서 등록'}
            </h3>
            {selected && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenPdf}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                >
                  문서 열기/인쇄
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  disabled={!canManageDocuments}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-[var(--radius-md)] border border-red-100 text-red-600 ${
                    canManageDocuments ? 'hover:bg-red-500/10' : 'hidden'
                  }`}
                >
                  선택 문서 삭제
                </button>
              </div>
            )}
          </div>
          {isReadOnlySelected && selected && selected.category !== '근로계약서' ? (
            /* 전자결재 자동 보관 문서 — 시각적 결재 문서 뷰 */
            <ArchivedDocumentView doc={selected} companyName={selectedCo} />
          ) : selected?.category === '근로계약서' ? (
            /* 계약서 전용 뷰어 (A4 스타일) */
            <LaborContractViewer doc={selected} content={form.content} selectedCo={selectedCo} />
          ) : (
            /* 일반 문서 편집 폼 */
            <fieldset className="space-y-4" disabled={isReadOnlySelected || !canManageDocuments}>
              <div>
                <label className="block text-sm font-semibold text-[var(--toss-gray-4)] mb-2">제목</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--foreground)]" placeholder="문서 제목" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--toss-gray-4)] mb-2">분류</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--foreground)]">
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--toss-gray-4)] mb-2">내용</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={12} className="w-full px-4 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--foreground)] font-mono text-sm" placeholder="규정, 양식, 계약서 본문 등을 입력하세요." />
              </div>
              {selected && selected.category !== '근로계약서' && <p className="text-xs text-[var(--toss-gray-3)]">* 수정 시 이전 버전이 자동으로 버전 이력에 저장됩니다.</p>}
            </fieldset>
          )}

          {selected?.category === '근로계약서' && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
              <span className="text-lg">🔒</span>
              <p className="text-[11px] font-bold text-amber-800 leading-relaxed pt-0.5">이 문서는 체결된 근로계약서 원본으로 법적 효력 유지를 위해 수정을 방지하고 있습니다. 내용 변경이 필요한 경우 신규 계약을 진행해 주시기 바랍니다.</p>
            </div>
          )}
          {isReadOnlySelected && (
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
              <p className="text-[11px] font-bold text-blue-700 leading-relaxed">
                전자결재에서 자동 보관된 문서입니다. 문서보관함에서는 읽기 전용으로만 확인할 수 있습니다.
              </p>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            {!isReadOnlySelected && selected?.category !== '근로계약서' && (
              <button onClick={handleSave} disabled={saving || !canManageDocuments} className="px-4 py-2 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-md)] hover:bg-[var(--accent)] disabled:opacity-50">저장</button>
            )}
            {selected && (
              <button
                type="button"
                onClick={() => { setSelected(null); setForm({ title: '', category: '규정', content: '' }); }}
                className="px-4 py-2 bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold rounded-[var(--radius-md)]"
              >
                {isReadOnlySelected ? '닫기' : '취소'}
              </button>
            )}
          </div>
        </div>
      </div>
      )} {/* end 기안 문서 탭 */}
    </div>
  );
}
