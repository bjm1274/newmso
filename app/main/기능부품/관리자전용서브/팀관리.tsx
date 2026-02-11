'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const DIVISIONS = ['진료부', '간호부', '총무부'];
const COMPANIES = ['박철홍정형외과', '수연의원', 'SY INC.'];

export default function TeamManager({ onRefresh }: { onRefresh?: () => void }) {
  const [teams, setTeams] = useState<any[]>([]);
  const [company, setCompany] = useState('박철홍정형외과');
  const [adding, setAdding] = useState(false);
  const [newTeam, setNewTeam] = useState({ division: '진료부', team_name: '' });

  const fetchTeams = useCallback(async () => {
    const { data } = await supabase
      .from('org_teams')
      .select('*')
      .eq('company_name', company)
      .order('division')
      .order('sort_order');
    setTeams(data || []);
  }, [company]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleAdd = async () => {
    if (!newTeam.team_name.trim()) return alert('팀명을 입력하세요.');
    const { error } = await supabase.from('org_teams').insert({
      company_name: company,
      division: newTeam.division,
      team_name: newTeam.team_name.trim(),
      sort_order: teams.filter((t: any) => t.division === newTeam.division).length + 1,
    });
    if (!error) {
      setNewTeam({ division: '진료부', team_name: '' });
      setAdding(false);
      fetchTeams();
      onRefresh?.();
    } else {
      alert('이미 존재하는 팀명이거나 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('해당 팀을 삭제하시겠습니까?')) return;
    await supabase.from('org_teams').delete().eq('id', id);
    fetchTeams();
    onRefresh?.();
  };

  const byDivision = DIVISIONS.map((d) => ({
    name: d,
    teams: teams.filter((t: any) => t.division === d),
  }));

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 animate-in fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-xl font-black text-gray-800 tracking-tighter">팀 관리</h3>
          <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">병원장 → 진료부/간호부/총무부 → 팀</p>
        </div>
        <div className="flex gap-2">
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="p-2 border rounded-xl text-sm font-bold">
            {COMPANIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={() => setAdding(true)} className="px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl">+ 팀 추가</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {byDivision.map((div) => (
          <div key={div.name} className="border border-gray-100 rounded-2xl p-6">
            <h4 className="text-sm font-black text-gray-800 mb-4 border-b-2 border-gray-900 pb-2">{div.name}</h4>
            <div className="space-y-2">
              {div.teams.map((t) => (
                <div key={t.id} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-xl">
                  <span className="text-sm font-bold">{t.team_name}</span>
                  <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700 text-xs font-black">삭제</button>
                </div>
              ))}
              {div.teams.length === 0 && <p className="text-xs text-gray-400">팀 없음</p>}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setAdding(false)}>
          <div className="bg-white p-8 rounded-2xl max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-black">팀 추가</h4>
            <select value={newTeam.division} onChange={(e) => setNewTeam({ ...newTeam, division: e.target.value })} className="w-full p-3 border rounded-xl">
              {DIVISIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input type="text" value={newTeam.team_name} onChange={(e) => setNewTeam({ ...newTeam, team_name: e.target.value })} placeholder="팀명" className="w-full p-3 border rounded-xl" />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 py-3 bg-blue-600 text-white font-black rounded-xl">추가</button>
              <button onClick={() => setAdding(false)} className="flex-1 py-3 bg-gray-200 font-black rounded-xl">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
