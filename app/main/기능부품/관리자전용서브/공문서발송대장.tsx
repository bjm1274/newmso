'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

interface OfficialDoc {
  id?: number;
  sent_date: string;
  doc_number: string;
  title: string;
  recipient: string;
  manager: string;
  is_received: boolean;
  note: string;
  company: string;
}

export default function OfficialDocumentLog({ staffs, selectedCo, user }: Props) {
  const [docs, setDocs] = useState<OfficialDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingDoc, setEditingDoc] = useState<OfficialDoc | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterReceived, setFilterReceived] = useState<'전체' | '확인' | '미확인'>('전체');
  const [form, setForm] = useState<Partial<OfficialDoc>>({
    sent_date: new Date().toISOString().slice(0, 10),
    doc_number: '',
    title: '',
    recipient: '',
    manager: user?.name || '',
    is_received: false,
    note: '',
    company: selectedCo !== '전체' ? selectedCo : '',
  });

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('official_doc_log')
        .select('*')
        .order('sent_date', { ascending: false });
      if (error) throw error;
      setDocs(data || []);
    } catch (e: any) {
      console.warn('공문서발송대장 조회 실패:', e.message);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs, selectedCo]);

  const openAdd = () => {
    setEditingDoc(null);
    setForm({
      sent_date: new Date().toISOString().slice(0, 10),
      doc_number: '',
      title: '',
      recipient: '',
      manager: user?.name || '',
      is_received: false,
      note: '',
      company: selectedCo !== '전체' ? selectedCo : '',
    });
    setShowForm(true);
    setMessage(null);
  };

  const openEdit = (doc: OfficialDoc) => {
    setEditingDoc(doc);
    setForm({ ...doc });
    setShowForm(true);
    setMessage(null);
  };

  const handleSave = async () => {
    if (!form.title || !form.sent_date || !form.recipient) {
      setMessage({ type: 'error', text: '발송일, 수신처, 제목은 필수입니다.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        sent_date: form.sent_date,
        doc_number: form.doc_number || '',
        title: form.title,
        recipient: form.recipient,
        manager: form.manager || '',
        is_received: form.is_received ?? false,
        note: form.note || '',
        company: form.company || '',
      };
      if (editingDoc?.id) {
        const { error } = await supabase.from('official_doc_log').update(payload).eq('id', editingDoc.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('official_doc_log').insert([payload]);
        if (error) throw error;
      }
      setMessage({ type: 'success', text: editingDoc ? '수정되었습니다.' : '등록되었습니다.' });
      setShowForm(false);
      setEditingDoc(null);
      fetchDocs();
    } catch (e: any) {
      setMessage({ type: 'error', text: `저장 실패: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('official_doc_log').delete().eq('id', id);
      if (error) throw error;
      fetchDocs();
    } catch (e: any) {
      setMessage({ type: 'error', text: `삭제 실패: ${e.message}` });
    }
  };

  const handleToggleReceived = async (doc: OfficialDoc) => {
    try {
      const { error } = await supabase
        .from('official_doc_log')
        .update({ is_received: !doc.is_received })
        .eq('id', doc.id!);
      if (error) throw error;
      fetchDocs();
    } catch (e: any) {
      setMessage({ type: 'error', text: `수신 확인 처리 실패: ${e.message}` });
    }
  };

  const displayDocs = docs.filter((d) => {
    const kw = searchKeyword.toLowerCase();
    const matchKw = !kw || d.title?.toLowerCase().includes(kw) || d.recipient?.toLowerCase().includes(kw) || d.doc_number?.toLowerCase().includes(kw) || d.manager?.toLowerCase().includes(kw);
    const matchFilter = filterReceived === '전체' || (filterReceived === '확인' && d.is_received) || (filterReceived === '미확인' && !d.is_received);
    return matchKw && matchFilter;
  });

  const receivedCount = docs.filter((d) => d.is_received).length;
  const unreceivedCount = docs.length - receivedCount;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">공문서 발송 대장</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">공문 발송 내역을 등록하고 수신 확인 여부를 관리합니다.</p>
        </div>
        <button
          onClick={openAdd}
          className="px-5 py-2.5 bg-[var(--toss-blue)] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity"
        >
          + 공문 등록
        </button>
      </div>

      {/* 메시지 */}
      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl p-4">
          <p className="text-xs font-bold text-[var(--toss-gray-3)]">총 발송 건수</p>
          <p className="text-2xl font-extrabold text-[var(--foreground)] mt-1">{docs.length}<span className="text-sm ml-1">건</span></p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-emerald-500">수신 확인</p>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">{receivedCount}<span className="text-sm ml-1">건</span></p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-orange-500">수신 미확인</p>
          <p className="text-2xl font-extrabold text-orange-600 mt-1">{unreceivedCount}<span className="text-sm ml-1">건</span></p>
        </div>
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <div className="bg-blue-50 border border-[var(--toss-blue)]/30 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[var(--toss-blue)]">{editingDoc ? '공문 수정' : '공문 등록'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">발송일 *</label>
              <input
                type="date"
                value={form.sent_date ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, sent_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[var(--toss-border)] rounded-xl bg-white outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">문서번호</label>
              <input
                type="text"
                value={form.doc_number ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, doc_number: e.target.value }))}
                placeholder="예: 행정-2026-001"
                className="w-full px-3 py-2 text-sm border border-[var(--toss-border)] rounded-xl bg-white outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">수신처 *</label>
              <input
                type="text"
                value={form.recipient ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, recipient: e.target.value }))}
                placeholder="예: 보건복지부"
                className="w-full px-3 py-2 text-sm border border-[var(--toss-border)] rounded-xl bg-white outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">제목 *</label>
              <input
                type="text"
                value={form.title ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="공문서 제목 입력"
                className="w-full px-3 py-2 text-sm border border-[var(--toss-border)] rounded-xl bg-white outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">담당자</label>
              <input
                type="text"
                value={form.manager ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, manager: e.target.value }))}
                placeholder="담당자명"
                className="w-full px-3 py-2 text-sm border border-[var(--toss-border)] rounded-xl bg-white outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">비고</label>
              <input
                type="text"
                value={form.note ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="추가 메모"
                className="w-full px-3 py-2 text-sm border border-[var(--toss-border)] rounded-xl bg-white outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_received ?? false}
                  onChange={(e) => setForm((p) => ({ ...p, is_received: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-xs font-bold text-[var(--toss-gray-4)]">수신 확인됨</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-[var(--toss-blue)] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingDoc(null); }} className="px-5 py-2.5 bg-[var(--toss-gray-1)] text-[var(--foreground)] text-xs font-bold rounded-xl hover:bg-[var(--toss-gray-2)] transition-colors">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 검색 및 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          placeholder="제목, 수신처, 문서번호, 담당자 검색..."
          className="px-4 py-2 text-sm border border-[var(--toss-border)] rounded-xl bg-[var(--toss-card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 w-72"
        />
        <div className="flex gap-1">
          {(['전체', '확인', '미확인'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterReceived(f)}
              className={`px-3 py-2 text-xs font-bold rounded-xl transition-all ${filterReceived === f ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
            >
              {f}
            </button>
          ))}
        </div>
        {(searchKeyword || filterReceived !== '전체') && (
          <button onClick={() => { setSearchKeyword(''); setFilterReceived('전체'); }} className="text-xs text-[var(--toss-gray-3)] hover:text-[var(--foreground)]">
            필터 초기화
          </button>
        )}
        <span className="text-xs text-[var(--toss-gray-3)]">{displayDocs.length}건 표시</span>
      </div>

      {/* 발송 대장 테이블 */}
      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-[var(--toss-gray-3)]">불러오는 중...</div>
        ) : displayDocs.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--toss-gray-3)]">공문 발송 기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--toss-gray-1)]">
                <tr>
                  {['발송일', '문서번호', '제목', '수신처', '담당자', '수신확인', '비고', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--toss-border)]">
                {displayDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[var(--toss-gray-1)]/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-[var(--foreground)] whitespace-nowrap">{doc.sent_date}</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)] whitespace-nowrap">{doc.doc_number || '-'}</td>
                    <td className="px-4 py-3 font-bold text-[var(--foreground)] max-w-xs truncate">{doc.title}</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)] whitespace-nowrap">{doc.recipient}</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)] whitespace-nowrap">{doc.manager || '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleReceived(doc)}
                        className={`px-2 py-1 text-[10px] font-extrabold rounded-lg transition-all ${doc.is_received ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                      >
                        {doc.is_received ? '✓ 확인' : '미확인'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[var(--toss-gray-3)] max-w-[120px] truncate">{doc.note || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(doc)} className="px-2 py-1 text-[10px] font-bold bg-blue-50 text-[var(--toss-blue)] rounded-lg hover:bg-blue-100 transition-colors">수정</button>
                        <button onClick={() => handleDelete(doc.id!)} className="px-2 py-1 text-[10px] font-bold bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
