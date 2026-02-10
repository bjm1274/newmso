'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Company, CompanyType } from '@/lib/company';

export default function CompanyManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState({ name: '', type: 'HOSPITAL' as CompanyType });
  const [msoId, setMsoId] = useState<string | null>(null);

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('type', { ascending: false })
      .order('name');
    if (!error) setCompanies(data || []);
    const mso = (data || []).find((c: Company) => c.type === 'MSO');
    if (mso) setMsoId(mso.id);
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editing) {
      const { error } = await supabase
        .from('companies')
        .update({ name: form.name.trim(), type: form.type, is_active: true })
        .eq('id', editing.id);
      if (!error) {
        setEditing(null);
        setForm({ name: '', type: 'HOSPITAL' });
        fetchCompanies();
      }
    } else {
      const { error } = await supabase.from('companies').insert({
        name: form.name.trim(),
        type: form.type,
        mso_id: form.type !== 'MSO' ? msoId : null,
        is_active: true,
      });
      if (!error) {
        setForm({ name: '', type: 'HOSPITAL' });
        fetchCompanies();
      }
    }
  };

  const handleEdit = (c: Company) => {
    setEditing(c);
    setForm({ name: c.name, type: c.type as CompanyType });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-black text-gray-800">회사(병원) 목록</h2>
          <p className="text-xs text-gray-500 mt-1">MSO가 관리하는 회사·병원을 등록·수정합니다. 인사·연차·급여는 각 회사별로 분리됩니다.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left font-black text-gray-600">회사명</th>
                <th className="px-6 py-4 text-left font-black text-gray-600">유형</th>
                <th className="px-6 py-4 text-left font-black text-gray-600">상태</th>
                <th className="px-6 py-4 text-right font-black text-gray-600">관리</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-bold text-gray-800">{c.name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                      c.type === 'MSO' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {c.type === 'MSO' ? '경영지원(MSO)' : c.type === 'HOSPITAL' ? '병원' : '클리닉'}
                    </span>
                  </td>
                  <td className="px-6 py-4">{c.is_active ? '활성' : '비활성'}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleEdit(c)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100"
                    >
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-black text-gray-800 mb-4">{editing ? '회사 수정' : '회사 추가'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">회사명</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              placeholder="예: OO정형외과"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">유형</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CompanyType }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100"
            >
              <option value="MSO">경영지원(MSO)</option>
              <option value="HOSPITAL">병원</option>
              <option value="CLINIC">클리닉</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700"
          >
            {editing ? '저장' : '추가'}
          </button>
          {editing && (
            <button
              onClick={() => { setEditing(null); setForm({ name: '', type: 'HOSPITAL' }); }}
              className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200"
            >
              취소
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
