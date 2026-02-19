'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Company, CompanyType } from '@/lib/company';
import TeamManager from './팀관리';
import ContractManager from './계약관리도구';
import CorporateCardTransactions from '../인사관리서브/법인카드사용내역';

type Props = {
  staffs?: any[];
  onRefresh?: () => void;
};

export default function CompanyManager({ staffs = [], onRefresh }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState({ name: '', type: 'HOSPITAL' as CompanyType });
  const [msoId, setMsoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'company' | 'team' | 'card' | 'contract'>('company');

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('type', { ascending: false })
      .order('name');

    if (!error) {
      if (!data || data.length === 0) {
        // 초기 상태: 기본 회사 3개 자동 등록
        const seed = [
          { name: 'SY INC.', type: 'MSO', is_active: true },
          { name: '박철홍정형외과', type: 'HOSPITAL', is_active: true },
          { name: '수연의원', type: 'CLINIC', is_active: true },
        ];
        await supabase.from('companies').insert(seed);
        const { data: seeded } = await supabase
          .from('companies')
          .select('*')
          .order('type', { ascending: false })
          .order('name');
        setCompanies(seeded || []);
        const mso = (seeded || []).find((c: Company) => c.type === 'MSO');
        if (mso) setMsoId(mso.id);
      } else {
        setCompanies(data || []);
        const mso = (data || []).find((c: Company) => c.type === 'MSO');
        if (mso) setMsoId(mso.id);
      }
    }
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
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-[#191F28]">회사 관리</h2>
          <p className="text-xs text-gray-500 mt-1">MSO가 관리하는 회사·팀·법인카드·계약 설정을 한 곳에서 관리합니다.</p>
        </div>
        <div className="flex gap-1 bg-[#F2F4F6] p-1 border border-[#E5E8EB] rounded-[12px] text-[11px] font-bold">
          <button
            className={`px-3 py-1.5 rounded-[10px] ${activeTab === 'company' ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'}`}
            onClick={() => setActiveTab('company')}
          >
            회사 기본정보
          </button>
          <button
            className={`px-3 py-1.5 rounded-[10px] ${activeTab === 'team' ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'}`}
            onClick={() => setActiveTab('team')}
          >
            팀
          </button>
          <button
            className={`px-3 py-1.5 rounded-[10px] ${activeTab === 'card' ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'}`}
            onClick={() => setActiveTab('card')}
          >
            법인카드
          </button>
          <button
            className={`px-3 py-1.5 rounded-[10px] ${activeTab === 'contract' ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'}`}
            onClick={() => setActiveTab('contract')}
          >
            계약 설정
          </button>
        </div>
      </div>

      {activeTab === 'company' && (
        <div className="space-y-8">
          <div className="bg-white border border-[#E5E8EB] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-[#E5E8EB]">
              <h3 className="text-base font-bold text-[#191F28]">회사(병원) 목록</h3>
              <p className="text-xs text-gray-500 mt-1">
                MSO가 관리하는 회사·병원을 등록·수정합니다. 인사·연차·급여는 각 회사별로 분리됩니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F2F4F6] border-b border-[#E5E8EB]">
                  <tr>
                    <th className="px-6 py-4 text-left font-bold text-[#4E5968]">회사명</th>
                    <th className="px-6 py-4 text-left font-bold text-[#4E5968]">유형</th>
                    <th className="px-6 py-4 text-left font-bold text-[#4E5968]">상태</th>
                    <th className="px-6 py-4 text-right font-bold text-[#4E5968]">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.id} className="border-b border-[#E5E8EB] hover:bg-[#F2F4F6]/50">
                      <td className="px-6 py-4 font-bold text-[#191F28]">{c.name}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded-lg text-xs font-bold ${
                            c.type === 'MSO' ? 'bg-[#E8F3FF] text-[#1B64DA]' : 'bg-[#F2F4F6] text-[#4E5968]'
                          }`}
                        >
                          {c.type === 'MSO' ? '경영지원(MSO)' : c.type === 'HOSPITAL' ? '병원' : '클리닉'}
                        </span>
                      </td>
                      <td className="px-6 py-4">{c.is_active ? '활성' : '비활성'}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleEdit(c)}
                          className="px-3 py-1.5 bg-[#E8F3FF] text-[#3182F6] rounded-[12px] text-xs font-bold hover:bg-[#D6EBFF]"
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

          <div className="bg-white border border-[#E5E8EB] rounded-2xl shadow-sm p-6">
            <h3 className="text-base font-bold text-[#191F28] mb-4">{editing ? '회사 수정' : '회사 추가'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">회사명</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-[#E5E8EB] rounded-[12px] focus:ring-2 focus:ring-[#3182F6]/20 focus:border-[#3182F6]"
                  placeholder="예: OO정형외과"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">유형</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CompanyType }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3182F6]/20"
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
                className="px-6 py-3 bg-[#3182F6] text-white rounded-[12px] font-bold text-sm hover:bg-[#1B64DA]"
              >
                {editing ? '저장' : '추가'}
              </button>
              {editing && (
                <button
                  onClick={() => {
                    setEditing(null);
                    setForm({ name: '', type: 'HOSPITAL' });
                  }}
                  className="px-6 py-3 bg-[#F2F4F6] text-[#4E5968] rounded-[12px] font-bold text-sm hover:bg-[#E5E8EB]"
                >
                  취소
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team' && <TeamManager onRefresh={onRefresh} />}

      {activeTab === 'card' && <CorporateCardTransactions staffs={staffs} />}

      {activeTab === 'contract' && <ContractManager />}
    </div>
  );
}
