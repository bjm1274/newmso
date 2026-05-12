'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { useState, useEffect, useCallback } from 'react';
import {
  createOrgTeam,
  deleteOrgTeam,
  fetchCompanyOptions,
  fetchOrgTeams,
  type OrgTeam,
} from '@/lib/data/org';

const HOSPITAL_DIVISIONS = ['진료부', '간호부', '총무부'];
const MSO_DIVISIONS = ['운영본부', '전략기획본부'];

type TeamManagerProps = {
  onRefresh?: () => void;
  selectedCompany?: string;
  hideCompanySelect?: boolean;
  embedded?: boolean;
  disabled?: boolean;
};

export default function TeamManager({
  onRefresh,
  selectedCompany,
  hideCompanySelect = false,
  embedded = false,
  disabled = false,
}: TeamManagerProps) {
  const { dialog, openConfirm } = useActionDialog();
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [company, setCompany] = useState(selectedCompany || '');
  const [adding, setAdding] = useState(false);
  const [newTeam, setNewTeam] = useState({ division: '진료부', team_name: '' });
  const effectiveCompany = selectedCompany ?? company;

  const currentDivisions =
    effectiveCompany === 'SY INC.' ? MSO_DIVISIONS : HOSPITAL_DIVISIONS;

  const fetchTeams = useCallback(async () => {
    if (!effectiveCompany || disabled) {
      setTeams([]);
      return;
    }
    const data = await fetchOrgTeams(effectiveCompany);
    setTeams(data);
  }, [disabled, effectiveCompany]);

  useEffect(() => {
    if (selectedCompany !== undefined) {
      setCompany(selectedCompany);
    }
  }, [selectedCompany]);

  useEffect(() => {
    let cancelled = false;
    fetchCompanyOptions()
      .then((names) => {
        if (cancelled) return;
        setCompanies(names);
        if (!selectedCompany && names.length > 0 && !company) setCompany(names[0]);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [company, selectedCompany]);

  useEffect(() => {
    // 회사 변경 시 Division 기본값도 회사 유형에 맞게 변경
    setNewTeam((prev) => ({
      division: effectiveCompany === 'SY INC.' ? MSO_DIVISIONS[0] : HOSPITAL_DIVISIONS[0],
      team_name: prev.team_name,
    }));
    fetchTeams();
  }, [effectiveCompany, fetchTeams]);

  const handleAdd = async () => {
    if (disabled || !effectiveCompany) return toast('회사명을 먼저 입력해 주세요.', 'warning');
    if (!newTeam.team_name.trim()) return toast('팀명을 입력하세요.', 'warning');
    const resolvedDivision =
      effectiveCompany === 'SY INC.'
        ? newTeam.division === '운영본부'
          ? '총무부'
          : '진료부'
        : newTeam.division;
    const siblings = teams.filter((t) => {
      if (effectiveCompany === 'SY INC.') {
        return newTeam.division === '운영본부' ? t.division === '총무부' : t.division === '진료부';
      }
      return t.division === newTeam.division;
    });
    const { error } = await createOrgTeam({
      company_name: effectiveCompany,
      division: resolvedDivision,
      team_name: newTeam.team_name.trim(),
      sort_order: siblings.length + 1,
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
    const target = teams.find((team) => team.id === id);
    const confirmed = await openConfirm({
      title: '팀 삭제',
      description: `${target?.team_name || '선택한 팀'}을 삭제합니다.\n조직도와 팀 기준정보에 영향을 줄 수 있습니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    await deleteOrgTeam(id, effectiveCompany);
    fetchTeams();
    onRefresh?.();
  };

  const byDivision = currentDivisions.map((d) => ({
    name: d,
    teams: teams.filter((t) => {
      if (effectiveCompany === 'SY INC.') return d === '운영본부' ? t.division === '총무부' : t.division === '진료부';
      return t.division === d;
    }),
  }));

  return (
    <div className={`${embedded ? '' : 'bg-[var(--card)]'} rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm p-4 animate-in fade-in`} data-testid="team-manager-view">
      {dialog}
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--foreground)] tracking-tight">팀 관리</h3>
        </div>
        <div className="flex gap-2">
          {!hideCompanySelect && (
            <select data-testid="team-manager-company-select" value={company} onChange={(e) => setCompany(e.target.value)} className="p-2 border rounded-[var(--radius-lg)] text-sm font-bold">
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <button
            data-testid="team-manager-open-add"
            onClick={() => setAdding(true)}
            disabled={disabled || !effectiveCompany}
            className="px-4 py-1.5 bg-[var(--accent)] text-white text-xs font-semibold rounded-[var(--radius-md)] disabled:opacity-50"
          >
            + 팀 추가
          </button>
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
                  <button onClick={() => handleDelete(t.id)} className="text-danger hover:opacity-80 text-xs font-semibold">삭제</button>
                </div>
              ))}
              {div.teams.length === 0 && <p className="text-xs text-[var(--toss-gray-3)]">팀 없음</p>}
            </div>
          </div>
        ))}
      </div>

      {adding && !disabled && (
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
