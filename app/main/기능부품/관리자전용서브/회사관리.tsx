'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Company, CompanyType } from '@/lib/company';
import TeamManager from './팀관리';
import ContractManager from './계약관리도구';
import CorporateCardTransactions from '../인사관리서브/법인카드사용내역';
import ShiftManagement from '../인사관리서브/근무형태관리';
import AttendanceDeductionRules from './근태차감규칙설정';

type Props = {
  staffs?: any[];
  onRefresh?: () => void;
};

export default function CompanyManager({ staffs = [], onRefresh }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'HOSPITAL' as CompanyType,
    ceo_name: '',
    business_no: '',
    address: '',
    phone: '',
    memo: '',
  });
  const [msoId, setMsoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'company' | 'team' | 'shift' | 'attendanceRules' | 'card' | 'contract'>('company');

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
          { name: '수연의원', type: 'HOSPITAL', is_active: true },
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
        .update({
          name: form.name.trim(),
          type: form.type,
          is_active: true,
          ceo_name: form.ceo_name || null,
          business_no: form.business_no || null,
          address: form.address || null,
          phone: form.phone || null,
          memo: form.memo || null,
        })
        .eq('id', editing.id);
      if (error) {
        console.error('companies update failed:', error);
        toast('회사 정보 저장에 실패했습니다: ' + error.message, 'error');
        return;
      }
      setEditing(null);
      setForm({
        name: '',
        type: 'HOSPITAL',
        ceo_name: '',
        business_no: '',
        address: '',
        phone: '',
        memo: '',
      });
      fetchCompanies();
    } else {
      const { error } = await supabase.from('companies').insert({
        name: form.name.trim(),
        type: form.type,
        mso_id: form.type !== 'MSO' ? msoId : null,
        is_active: true,
        ceo_name: form.ceo_name || null,
        business_no: form.business_no || null,
        address: form.address || null,
        phone: form.phone || null,
        memo: form.memo || null,
      });
      if (error) {
        console.error('companies insert failed:', error);
        toast('회사 추가에 실패했습니다: ' + error.message, 'error');
        return;
      }
      setForm({
        name: '',
        type: 'HOSPITAL',
        ceo_name: '',
        business_no: '',
        address: '',
        phone: '',
        memo: '',
      });
      fetchCompanies();
    }
  };

  const handleEdit = (c: Company) => {
    setEditing(c);
    setForm({
      name: c.name,
      type: c.type as CompanyType,
      ceo_name: c.ceo_name || '',
      business_no: c.business_no || '',
      address: c.address || '',
      phone: c.phone || '',
      memo: c.memo || '',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300" data-testid="company-manager-view">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">회사 관리</h2>
        </div>
        <div className="flex gap-0.5 p-1 app-tab-bar flex-wrap">
          <button
            data-testid="company-manager-tab-company"
            className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === 'company' ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:bg-[var(--card)]/60'}`}
            onClick={() => setActiveTab('company')}
          >
            회사 기본정보
          </button>
          <button
            data-testid="company-manager-tab-team"
            className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === 'team' ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:bg-[var(--card)]/60'}`}
            onClick={() => setActiveTab('team')}
          >
            팀
          </button>
          <button
            className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === 'shift' ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:bg-[var(--card)]/60'}`}
            onClick={() => setActiveTab('shift')}
          >
            근무형태
          </button>
          <button
            className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === 'attendanceRules' ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:bg-[var(--card)]/60'}`}
            onClick={() => setActiveTab('attendanceRules')}
          >
            근태 규칙
          </button>
          <button
            className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === 'card' ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:bg-[var(--card)]/60'}`}
            onClick={() => setActiveTab('card')}
          >
            법인카드
          </button>
          <button
            className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === 'contract' ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:bg-[var(--card)]/60'}`}
            onClick={() => setActiveTab('contract')}
          >
            계약 설정
          </button>
        </div>
      </div>

      {activeTab === 'company' && (
        <div className="space-y-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
            <div className="p-3 border-b border-[var(--border)]">
              <h3 className="text-base font-bold text-[var(--foreground)]">회사(병원) 목록</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--muted)] border-b border-[var(--border)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold text-[var(--toss-gray-4)]">회사명</th>
                    <th className="px-4 py-2 text-left font-bold text-[var(--toss-gray-4)]">유형</th>
                    <th className="px-4 py-2 text-left font-bold text-[var(--toss-gray-4)]">상태</th>
                    <th className="px-4 py-2 text-right font-bold text-[var(--toss-gray-4)]">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.id} className="border-b border-[var(--border)] hover:bg-[var(--muted)]/50">
                      <td className="px-4 py-2 font-bold text-[var(--foreground)]">{c.name}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-[var(--radius-md)] text-xs font-bold ${c.type === 'MSO' ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
                            }`}
                        >
                          {c.type === 'MSO' ? '경영지원(MSO)' : c.type === 'HOSPITAL' ? '병원' : '클리닉'}
                        </span>
                      </td>
                      <td className="px-4 py-2">{c.is_active ? '활성' : '비활성'}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          data-testid={`company-manager-edit-${c.id}`}
                          onClick={() => handleEdit(c)}
                          className="px-3 py-1.5 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[var(--toss-blue-light)]"
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

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm p-4">
            <h3 className="text-base font-bold text-[var(--foreground)] mb-3">{editing ? '회사 수정' : '회사 추가'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">회사명</label>
                <input
                  data-testid="company-manager-name-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
                  placeholder="예: OO정형외과"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">유형</label>
                <select
                  data-testid="company-manager-type-select"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CompanyType }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-lg)] focus:ring-2 focus:ring-[var(--accent)]/20"
                >
                  <option value="MSO">경영지원(MSO)</option>
                  <option value="HOSPITAL">병원</option>
                  <option value="CLINIC">클리닉</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">대표자명</label>
                <input
                  value={form.ceo_name}
                  onChange={(e) => setForm((f) => ({ ...f, ceo_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm"
                  placeholder="예: 박철홍"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">사업자등록번호</label>
                <input
                  value={form.business_no}
                  onChange={(e) => setForm((f) => ({ ...f, business_no: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm"
                  placeholder="예: 123-45-67890"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">주소</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm"
                  placeholder="예: 전라남도 목포시 ..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">대표 전화번호</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm"
                  placeholder="예: 061-000-0000"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--toss-gray-3)] mb-1.5">기타 메모</label>
                <textarea
                  value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm min-h-[72px]"
                  placeholder="특이사항, 청구/정산 담당자 등"
                />
              </div>
            </div>
            <div className="flex gap-2.5 mt-4">
              <button
                data-testid="company-manager-save-button"
                onClick={handleSave}
                className="px-5 py-1.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-bold text-sm hover:bg-[var(--accent)]"
              >
                {editing ? '저장' : '추가'}
              </button>
              {editing && (
                <button
                  onClick={() => {
                    setEditing(null);
                    setForm({
                      name: '',
                      type: 'HOSPITAL',
                      ceo_name: '',
                      business_no: '',
                      address: '',
                      phone: '',
                      memo: '',
                    });
                  }}
                  className="px-5 py-1.5 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] font-bold text-sm hover:bg-[var(--border)]"
                >
                  취소
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team' && <TeamManager onRefresh={onRefresh} />}

      {activeTab === 'shift' && <ShiftManagement selectedCo="전체" />}

      {activeTab === 'attendanceRules' && <AttendanceDeductionRules />}

      {activeTab === 'card' && <CorporateCardTransactions staffs={staffs} />}

      {activeTab === 'contract' && <ContractManager />}
    </div>
  );
}

