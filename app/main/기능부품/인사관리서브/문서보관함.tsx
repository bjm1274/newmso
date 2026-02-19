'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const CATEGORIES = [{ id: '규정', label: '규정' }, { id: '양식', label: '양식' }, { id: '계약서', label: '계약서' }, { id: '기타', label: '기타' }];

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
  const [selected, setSelected] = useState<any>(null);
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

          const { error: upErr } = await supabase.storage
            .from('document-pdfs')
            .upload(filePath, blob, { contentType: 'application/pdf', upsert: true });
          if (upErr) {
            console.warn('document pdf upload error', upErr);
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

      if (selected) {
        const newVersion = (selected.version || 1) + 1;
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

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] p-4 md:p-8">
      <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-[#191F28]">문서 보관함</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-[10px] border border-[#E5E8EB] text-[11px] font-bold text-[#4E5968]"
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
            className="px-3 py-1.5 rounded-[10px] border border-[#E5E8EB] text-[11px] font-bold text-[#191F28] min-w-[140px]"
          />
          <button
            onClick={handleNew}
            className="px-4 py-2 bg-[#3182F6] text-white text-sm font-semibold rounded-[12px] hover:bg-[#1B64DA]"
          >
            + 새 문서
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-[16px] border border-[#E5E8EB] overflow-hidden">
          <div className="p-4 border-b border-[#E5E8EB] flex items-center justify-between gap-2">
            <span className="font-semibold text-[#191F28]">문서 목록 (폴더별)</span>
            {staffFilterName && (
              <button
                type="button"
                onClick={() => setStaffFilterName(null)}
                className="px-2 py-1 rounded-full bg-[#E8F3FF] text-[10px] font-bold text-[#3182F6] hover:bg-[#d0e7ff] whitespace-nowrap"
              >
                직원: {staffFilterName} ✕
              </button>
            )}
          </div>
          {loading ? (
            <div className="p-8 text-center text-[#8B95A1]">로딩 중...</div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              {CATEGORIES.map((cat) => {
                const folderDocs = visibleDocs.filter((d) => (d.category || '규정') === cat.id);
                return (
                  <div key={cat.id} className="border-b border-[#F2F4F6]">
                    <div className="px-4 py-2.5 bg-[#F8FAFC] font-bold text-[#4E5968] text-xs flex items-center gap-2">
                      <span className="text-base">{cat.id === '규정' ? '📁' : cat.id === '양식' ? '📄' : cat.id === '계약서' ? '📋' : '📂'}</span>
                      {cat.label} ({folderDocs.length})
                    </div>
                    {folderDocs.length === 0 ? (
                      <p className="px-4 py-2 text-[10px] text-[#8B95A1]">문서 없음</p>
                    ) : (
                      folderDocs.map((d) => (
                        <div
                          key={d.id}
                          className={`flex items-center border-b border-[#F2F4F6] hover:bg-[#F2F4F6] ${
                            selected?.id === d.id ? 'bg-[#E8F3FF]' : ''
                          }`}
                        >
                          <button
                            onClick={() => handleEdit(d)}
                            className="flex-1 text-left pl-6 pr-4 py-3"
                          >
                            <p className="font-semibold text-[#191F28] truncate text-sm">
                              {d.title}
                            </p>
                            <p className="text-[10px] text-[#8B95A1] mt-0.5">
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
                <div className="p-8 text-center text-[#8B95A1] text-sm">
                  {staffFilterName
                    ? '해당 직원과 관련된 문서를 찾을 수 없습니다. 제목이나 내용에 직원 이름을 포함해 보관하면 자동으로 모아집니다.'
                    : '등록된 문서가 없습니다.'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-[16px] border border-[#E5E8EB] p-6">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-lg font-bold text-[#191F28]">
              {selected ? '문서 수정 (버전 관리)' : '새 문서 등록'}
            </h3>
            {selected && (
              <div className="flex items-center gap-2">
                {selected.file_url && (
                  <button
                    type="button"
                    onClick={() => {
                      window.open(selected.file_url, '_blank');
                    }}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-[10px] border border-[#E5E8EB] text-[#3182F6] hover:bg-[#E8F3FF]"
                  >
                    PDF 열기/인쇄
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-[10px] border border-red-100 text-red-600 hover:bg-red-50"
                >
                  선택 문서 삭제
                </button>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#4E5968] mb-2">제목</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2 rounded-[12px] border border-[#E5E8EB] text-[#191F28]" placeholder="문서 제목" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#4E5968] mb-2">분류</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-2 rounded-[12px] border border-[#E5E8EB] text-[#191F28]">
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#4E5968] mb-2">내용</label>
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={12} className="w-full px-4 py-2 rounded-[12px] border border-[#E5E8EB] text-[#191F28] font-mono text-sm" placeholder="규정, 양식, 계약서 본문 등을 입력하세요." />
            </div>
            {selected && <p className="text-xs text-[#8B95A1]">* 수정 시 이전 버전이 자동으로 버전 이력에 저장됩니다.</p>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-[#3182F6] text-white font-semibold rounded-[12px] hover:bg-[#1B64DA] disabled:opacity-50">저장</button>
              {selected && <button onClick={() => { setSelected(null); setForm({ title: '', category: '규정', content: '' }); }} className="px-6 py-2 bg-[#F2F4F6] text-[#4E5968] font-semibold rounded-[12px]">취소</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
