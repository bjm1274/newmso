'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const DOCUMENT_PDF_BUCKET_CANDIDATES = ['document-pdfs', 'board-attachments'];

function isMissingBucketError(error: any, bucketName: string) {
  if (!error) return false;
  const message = String(error?.message || error?.details || '').toLowerCase();
  return (
    message.includes('bucket') &&
    (message.includes('not found') || message.includes(bucketName.toLowerCase()))
  );
}

async function uploadDocumentPdf(filePath: string, blob: Blob) {
  let lastError: any = null;

  for (const bucket of DOCUMENT_PDF_BUCKET_CANDIDATES) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, { contentType: 'application/pdf', upsert: true });

    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      return data.publicUrl as string;
    }

    lastError = error;
    if (!isMissingBucketError(error, bucket)) {
      throw error;
    }
  }

  throw lastError || new Error('No available storage bucket for document PDFs.');
}

const CATEGORIES = [
  { id: '규정', label: '규정' },
  { id: '양식', label: '양식' },
  { id: '근로계약서', label: '근로계약서' },
  { id: '기타', label: '기타' }
];

// ESLint 규칙에 맞게 컴포넌트 이름을 영문 대문자로 시작하게 변경합니다.
// default export 이므로 외부에서의 import 이름(문서보관함)은 그대로 유지됩니다.
export default function DocumentRepository({
  user,
  selectedCo,
  linkedTarget,
}: {
  user: any;
  selectedCo: string;
  linkedTarget?: { id?: string; name?: string };
}) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ title: '', category: '규정', content: '' });
  const [saving, setSaving] = useState(false);
  const [staffFilterName, setStaffFilterName] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('전체');

  const fetchDocs = async () => {
    setLoading(true);
    const companyFilter = selectedCo === '전체' ? undefined : selectedCo;
    let q = supabase.from('document_repository').select('*').order('updated_at', { ascending: false });
    if (companyFilter) q = q.eq('company_name', companyFilter);
    const { data } = await q;
    setDocs(data || []);
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
    const matchStaff = staffFilterName
      ? (`${d.title || ''} ${d.content || ''}`).includes(staffFilterName)
      : true;
    const matchCategory =
      categoryFilter === '전체' ? true : (d.category || '규정') === categoryFilter;
    return matchStaff && matchCategory;
  });

  const handleSave = async () => {
    if (!form.title.trim()) return alert('제목을 입력하세요.');
    setSaving(true);
    try {
      // 모든 문서는 PDF로도 보관: 내용 기반으로 PDF 생성 후 Storage 업로드
      const generatePdf = async () => {
        try {
          const jsPDFModule: any = await import('jspdf');
          const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default;
          const doc = new jsPDF('p', 'mm', 'a4');

          const title = form.title.trim() || '문서';
          const content = form.content || '';

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.text(title, 20, 20);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          const lines = doc.splitTextToSize(content, 170);
          doc.text(lines, 20, 32);

          const blob = doc.output('blob') as Blob;
          const safeCompany =
            selectedCo && selectedCo !== '전체'
              ? selectedCo.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'company'
              : 'all';
          const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'document';
          const filePath = `${safeCompany}/${safeTitle}_${Date.now()}.pdf`;
          const uploadedUrl = await uploadDocumentPdf(filePath, blob);
          if (uploadedUrl) return uploadedUrl;

          const { error: upErr } = await supabase.storage
            .from('document-pdfs')
            .upload(filePath, blob, { contentType: 'application/pdf', upsert: true });
          if (upErr) {
            console.warn('document pdf upload error', upErr);
            alert(`PDF 생성 또는 업로드 중 오류가 발생했습니다.\n\n${upErr.message || ''}\n\nSupabase Storage에 document-pdfs 버킷이 있고, anon 역할에 INSERT/SELECT 권한이 있는지 확인해주세요.`);
            return null;
          }
          const { data: urlData } = supabase.storage.from('document-pdfs').getPublicUrl(filePath);
          return urlData.publicUrl as string;
        } catch (e) {
          console.warn('document pdf generate/upload failed', e);
          return null;
        }
      };

      const pdfUrl = await generatePdf();

      const isContract = selected?.category === '근로계약서';
      if (isContract) return alert('근로계약서 카테고리의 문서는 법적 효력 유지를 위해 수정이 불가능합니다.');

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
          file_url: pdfUrl || selected.file_url || null,
          version: newVersion,
          updated_at: new Date().toISOString(),
          company_name: selectedCo === '전체' ? '전체' : selectedCo
        }).eq('id', selected.id);
      } else {
        await supabase.from('document_repository').insert({
          title: form.title,
          category: form.category,
          content: form.content,
          file_url: pdfUrl || null,
          version: 1,
          company_name: selectedCo === '전체' ? '전체' : selectedCo,
          created_by: user?.id
        });
      }
      fetchDocs();
      setSelected(null);
      setForm({ title: '', category: '규정', content: '' });
      alert('저장되었습니다.');
    } catch (e) { alert('저장 중 오류가 발생했습니다.'); } finally { setSaving(false); }
  };

  const handleEdit = (d: any) => {
    setSelected(d);
    setForm({ title: d.title, category: d.category || '규정', content: d.content || '' });
  };

  const handleDelete = async (doc: any) => {
    if (!doc?.id) return;
    if (!window.confirm('해당 문서를 완전히 삭제하시겠습니까?\n삭제 후에는 되돌릴 수 없습니다.')) return;
    try {
      const { error } = await supabase.from('document_repository').delete().eq('id', doc.id);
      if (error) throw error;
      if (selected?.id === doc.id) {
        setSelected(null);
        setForm({ title: '', category: '규정', content: '' });
      }
      await fetchDocs();
      alert('문서가 삭제되었습니다.');
    } catch (e) {
      alert('문서 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleNew = () => {
    setSelected(null);
    setForm({ title: '', category: '규정', content: '' });
  };

  const handleOpenPdf = async () => {
    if (!selected) return;
    // 이미 PDF URL이 있으면 바로 새 창으로 열기
    if (selected.file_url) {
      window.open(selected.file_url as string, '_blank');
      return;
    }
    // 없으면 선택된 문서 내용을 기반으로 즉시 PDF 생성 후 저장·열기
    try {
      const jsPDFModule: any = await import('jspdf');
      const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default;
      const doc = new jsPDF('p', 'mm', 'a4');

      const title = selected.title || '문서';
      const content = selected.content || '';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(title, 20, 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(content, 170);
      doc.text(lines, 20, 32);

      const blob = doc.output('blob') as Blob;
      const safeCompany =
        String(selected.company_name && selected.company_name !== '전체'
          ? selected.company_name
          : selectedCo).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'company';
      const safeTitle = String(title).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'document';
      const filePath = `${safeCompany}/${safeTitle}_${Date.now()}.pdf`;
      const uploadedUrl = await uploadDocumentPdf(filePath, blob);
      if (uploadedUrl) {
        const url = uploadedUrl;

        await supabase
          .from('document_repository')
          .update({ file_url: url, updated_at: new Date().toISOString() })
          .eq('id', selected.id);

        setSelected({ ...selected, file_url: url });
        window.open(url, '_blank');
        return;
      }

      const { error: upErr } = await supabase.storage
        .from('document-pdfs')
        .upload(filePath, blob, { contentType: 'application/pdf', upsert: true });
      if (upErr) {
        console.warn('document pdf upload error', upErr);
        alert(`PDF 생성 또는 업로드 중 오류가 발생했습니다.\n\n${upErr.message || ''}\n\nSupabase Storage에 document-pdfs 버킷이 있고, anon 역할에 INSERT/SELECT 권한이 있는지 확인해주세요.`);
        return;
      }
      const { data: urlData } = supabase.storage.from('document-pdfs').getPublicUrl(filePath);
      const url = urlData.publicUrl as string;

      await supabase
        .from('document_repository')
        .update({ file_url: url, updated_at: new Date().toISOString() })
        .eq('id', selected.id);

      setSelected({ ...selected, file_url: url });
      window.open(url, '_blank');
    } catch (e) {
      console.warn('handleOpenPdf error', e);
      alert('PDF를 여는 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex flex-col h-full app-page p-4 md:p-5">
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-[var(--foreground)]">문서 보관함</h2>
        <div className="flex items-center gap-2 flex-wrap">
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
          <input
            type="text"
            value={staffFilterName || ''}
            onChange={(e) => setStaffFilterName(e.target.value || null)}
            placeholder="직원 이름으로 검색"
            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--foreground)] min-w-[140px]"
          />
          <button
            onClick={handleNew}
            className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:bg-[var(--accent)]"
          >
            + 새 문서
          </button>
        </div>
      </div>

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
                          key={d.id}
                          className={`flex items-center border-b border-[var(--muted)] hover:bg-[var(--muted)] ${selected?.id === d.id ? 'bg-[var(--toss-blue-light)]' : ''
                            }`}
                        >
                          <button
                            onClick={() => handleEdit(d)}
                            className="flex-1 text-left pl-6 pr-4 py-3"
                          >
                            <p className="font-semibold text-[var(--foreground)] truncate text-sm">
                              {d.title}
                            </p>
                            <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">
                              v{d.version} ·{' '}
                              {new Date(d.updated_at).toLocaleDateString('ko-KR')}
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
              {selected ? (selected.category === '근로계약서' ? '문서 열람 (수정 불가)' : '문서 수정 (버전 관리)') : '새 문서 등록'}
            </h3>
            {selected && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenPdf}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--toss-blue-light)]"
                >
                  PDF 열기/인쇄
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-[var(--radius-md)] border border-red-100 text-red-600 hover:bg-red-50"
                >
                  선택 문서 삭제
                </button>
              </div>
            )}
          </div>
          {selected?.category === '근로계약서' ? (
            /* 계약서 전용 뷰어 (A4 스타일) */
            <div className="bg-[var(--tab-bg)] p-4 md:p-5 rounded-[var(--radius-md)] min-h-[600px] flex justify-center overflow-y-auto max-h-[700px] custom-scrollbar">
              <div className="w-full max-w-[650px] bg-[var(--card)] shadow-sm p-5 md:p-14 font-serif text-[12px] leading-relaxed relative border border-[var(--border)]">
                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                  <span className="text-[80px] font-black rotate-[-45deg]">ORIGINAL</span>
                </div>

                <div className="relative z-10">
                  <h1 className="text-xl font-black text-center mb-10 tracking-widest underline underline-offset-8">근 로 계 약 서</h1>

                  <div className="whitespace-pre-wrap text-[var(--foreground)] leading-[1.8]">
                    {(() => {
                      let text = form.content;
                      // ASCII 표 제거
                      text = text.replace(/┌[─┬┐\s\S]*?┘/g, '');
                      return text;
                    })()}
                  </div>

                  <div className="mt-14 pt-8 border-t border-dotted border-[var(--border)] text-center">
                    <p className="font-bold text-[14px]">{new Date(selected.updated_at as string).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

                    <div className="mt-10 flex justify-between items-start text-left">
                      <div className="w-1/2 space-y-2">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">[사용자]</p>
                        <p className="font-bold">{(selected.company_name as string) || selectedCo}</p>
                        <div className="relative inline-block">
                          <p className="font-bold">대표이사 (인)</p>
                          <div className="absolute -top-3 -right-6 w-10 h-10 border-2 border-red-500/30 rounded-full flex items-center justify-center rotate-12">
                            <span className="text-[10px] text-red-500/40 font-bold">인</span>
                          </div>
                        </div>
                      </div>
                      <div className="w-1/2 text-right space-y-2">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">[근로자]</p>
                        <p className="font-bold">{(selected.title as string).split(' ')[0]}</p>
                        <p className="font-bold">(서명)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 일반 문서 편집 폼 */
            <div className="space-y-4">
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
            </div>
          )}

          {selected?.category === '근로계약서' && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
              <span className="text-lg">🔒</span>
              <p className="text-[11px] font-bold text-amber-800 leading-relaxed pt-0.5">이 문서는 체결된 근로계약서 원본으로 법적 효력 유지를 위해 수정을 방지하고 있습니다. 내용 변경이 필요한 경우 신규 계약을 진행해 주시기 바랍니다.</p>
            </div>
          )}
          <div className="flex gap-2">
            {selected?.category !== '근로계약서' && (
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-md)] hover:bg-[var(--accent)] disabled:opacity-50">저장</button>
            )}
            {selected && <button onClick={() => { setSelected(null); setForm({ title: '', category: '규정', content: '' }); }} className="px-4 py-2 bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold rounded-[var(--radius-md)]">취소</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
