'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const HOSPITAL_DIVISIONS = ['진료부', '간호부', '총무부'];
const MSO_DIVISIONS = ['운영본부', '전략기획본부'];

export default function TeamManager({ onRefresh }: { onRefresh?: () => void }) {
  const [teams, setTeams] = useState<any[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [company, setCompany] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTeam, setNewTeam] = useState({ division: '진료부', team_name: '' });

  const currentDivisions =
    company === 'SY INC.' ? MSO_DIVISIONS : HOSPITAL_DIVISIONS;

  const fetchTeams = useCallback(async () => {
    if (!company) return;
    const { data } = await supabase
      .from('org_teams')
      .select('*')
      .eq('company_name', company)
      .order('division')
      .order('sort_order');
    setTeams(data || []);
  }, [company]);

  useEffect(() => {
    // 회사 목록 DB에서 동적 조회
    supabase
      .from('staff_members')
      .select('company')
      .then(({ data }) => {
        const names = Array.from(new Set((data || []).map((r: any) => r.company).filter(Boolean))).sort() as string[];
        setCompanies(names);
        if (names.length > 0 && !company) setCompany(names[0]);
      });
  }, [company]);

  useEffect(() => {
    // 회사 변경 시 Division 기본값도 회사 유형에 맞게 변경
    setNewTeam((prev) => ({
      division: company === 'SY INC.' ? MSO_DIVISIONS[0] : HOSPITAL_DIVISIONS[0],
      team_name: prev.team_name,
    }));
    fetchTeams();
  }, [company, fetchTeams]);

  const handleAdd = async () => {
    if (!newTeam.team_name.trim()) return toast('팀명을 입력하세요.', 'warning');
    const { error } = await supabase.from('org_teams').insert({
      company_name: company,
      division: company === 'SY INC.' ? (newTeam.division === '운영본부' ? '총무부' : '진료부') : newTeam.division,
      team_name: newTeam.team_name.trim(),
      sort_order: teams.filter((t: any) => {
        const d = newTeam.division;
        if (company === 'SY INC.') return d === '운영본부' ? t.division === '총무부' : t.division === '진료부';
        return t.division === d;
      }).length + 1,
    });
    if (!error) {
      setNewTeam({ division: currentDivisions[0], team_name: '' });
      setAdding(false);
      fetchTeams();
      onRefresh?.();
    } else {
      toast('이미 존재하는 팀명이거나 오류가 발생했습니다.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('해당 팀을 삭제하시겠습니까?')) return;
    await supabase.from('org_teams').delete().eq('id', id);
    fetchTeams();
    onRefresh?.();
  };

  const byDivision = currentDivisions.map((d) => ({
    name: d,
    teams: teams.filter((t: any) => {
      if (company === 'SY INC.') return d === '운영본부' ? t.division === '총무부' : t.division === '진료부';
      return t.division === d;
    }),
  }));

  return (
    <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm p-4 animate-in fade-in" data-testid="team-manager-view">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--foreground)] tracking-tight">팀 관리</h3>
        </div>
        <div className="flex gap-2">
          <select data-testid="team-manager-company-select" value={company} onChange={(e) => setCompany(e.target.value)} className="p-2 border rounded-[var(--radius-lg)] text-sm font-bold">
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button data-testid="team-manager-open-add" onClick={() => setAdding(true)} className="px-4 py-1.5 bg-[var(--accent)] text-white text-xs font-semibold rounded-[var(--radius-md)]">+ 팀 추가</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {byDivision.map((div) => (
          <div key={div.name} className="border border-[var(--border)] rounded-[var(--radius-md)] p-4">
            <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3 border-b-2 border-[var(--foreground)] pb-2">{div.name}</h4>
            <div className="space-y-2">
              {div.teams.map((t) => (
                <div key={t.id} className="flex justify-between items-center py-2 px-3 bg-[var(--muted)] rounded-[var(--radius-lg)]">
                  <span className="text-sm font-bold">{t.team_name}</span>
                  <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">삭제</button>
                </div>
              ))}
              {div.teams.length === 0 && <p className="text-xs text-[var(--toss-gray-3)]">팀 없음</p>}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]" onClick={() => setAdding(false)}>
          <div data-testid="team-manager-add-modal" className="bg-[var(--card)] p-4 rounded-[var(--radius-md)] max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">팀 추가</h4>
            <select data-testid="team-manager-division-select" value={newTeam.division} onChange={(e) => setNewTeam({ ...newTeam, division: e.target.value })} className="w-full p-2 border rounded-[var(--radius-md)]">
              {currentDivisions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input data-testid="team-manager-name-input" type="text" value={newTeam.team_name} onChange={(e) => setNewTeam({ ...newTeam, team_name: e.target.value })} placeholder="팀명" className="w-full p-2 border rounded-[var(--radius-md)]" />
            <div className="flex gap-2">
              <button data-testid="team-manager-save-button" onClick={handleAdd} className="flex-1 py-2 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-md)]">추가</button>
              <button onClick={() => setAdding(false)} className="flex-1 py-2 bg-[var(--toss-gray-2)] font-semibold rounded-[var(--radius-md)]">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
