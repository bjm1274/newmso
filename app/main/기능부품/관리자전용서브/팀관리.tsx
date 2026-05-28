'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  createOrgTeam,
  deleteOrgTeam,
  fetchCompanyOptions,
  fetchOrgTeams,
  updateOrgTeam,
  type OrgTeam,
} from '@/lib/data/org';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';

const HOSPITAL_DIVISIONS = ['진료부', '간호부', '총무부'];
const MSO_DIVISIONS = ['운영본부', '전략기획본부'];

type TeamManagerProps = {
  onRefresh?: () => void;
  selectedCompany?: string;
  hideCompanySelect?: boolean;
  embedded?: boolean;
  disabled?: boolean;
};

export default function TeamManager(props: TeamManagerProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DesktopOnlyNotice feature="팀 관리" />;
  }
  return <TeamManagerDesktop {...props} />;
}

function TeamManagerDesktop({
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
  const [activeShifts, setActiveShifts] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);
  const [editingTeam, setEditingTeam] = useState<OrgTeam | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDivision, setEditingDivision] = useState('');
  const [editingSelectedShifts, setEditingSelectedShifts] = useState<string[]>([]);
  const effectiveCompany = selectedCompany ?? company;

  useEffect(() => {
    if (!effectiveCompany || disabled) {
      setActiveShifts([]);
      setSelectedShifts([]);
      return;
    }
    const fetchActiveShifts = async () => {
      const { data } = await supabase
        .from('work_shifts')
        .select('id, name')
        .eq('is_active', true)
        .eq('is_shift', true)
        .eq('company_name', effectiveCompany);
      setActiveShifts(data || []);
      setSelectedShifts([]);
    };
    void fetchActiveShifts();
  }, [effectiveCompany, disabled]);

  const shiftNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const sh of activeShifts) {
      map.set(sh.id, sh.name);
    }
    return map;
  }, [activeShifts]);

  const getShiftsLabels = (appShiftsStr: string | null | undefined) => {
    if (!appShiftsStr) return '모든 근무형태';
    try {
      const ids = JSON.parse(appShiftsStr) as string[];
      if (!Array.isArray(ids) || ids.length === 0) return '모든 근무형태';
      const names = ids.map(id => shiftNameMap.get(id) || id).filter(Boolean);
      return names.join(', ');
    } catch {
      return appShiftsStr || '모든 근무형태';
    }
  };

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
      applicable_shifts: selectedShifts.length > 0 ? JSON.stringify(selectedShifts) : null,
    });
    if (!error) {
      setNewTeam({ division: currentDivisions[0], team_name: '' });
      setSelectedShifts([]);
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

  const startEdit = (team: OrgTeam) => {
    setEditingTeam(team);
    setEditingName(team.team_name);
    let uiDivision = team.division;
    if (effectiveCompany === 'SY INC.') {
      uiDivision = team.division === '총무부' ? '운영본부' : '전략기획본부';
    }
    setEditingDivision(uiDivision);
    
    let initialShifts: string[] = [];
    if (team.applicable_shifts) {
      try {
        initialShifts = JSON.parse(team.applicable_shifts) as string[];
      } catch {
        // ignore
      }
    }
    setEditingSelectedShifts(initialShifts);
  };

  const handleSaveEdit = async () => {
    if (!editingTeam) return;
    if (!editingName.trim()) return toast('팀명을 입력하세요.', 'warning');
    
    const resolvedDivision =
      effectiveCompany === 'SY INC.'
        ? editingDivision === '운영본부'
          ? '총무부'
          : '진료부'
        : editingDivision;
        
    const { error } = await updateOrgTeam({
      id: editingTeam.id,
      company_name: effectiveCompany,
      division: resolvedDivision,
      team_name: editingName.trim(),
      applicable_shifts: editingSelectedShifts.length > 0 ? JSON.stringify(editingSelectedShifts) : null,
    });
    
    if (!error) {
      setEditingTeam(null);
      fetchTeams();
      onRefresh?.();
      toast('팀 정보가 성공적으로 수정되었습니다.', 'success');
    } else {
      toast('팀 수정 중 오류가 발생했습니다.', 'error');
    }
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
                <div key={t.id} className="flex flex-col gap-1 py-2 px-3 bg-[var(--muted)] rounded-[var(--radius-lg)]">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold">{t.team_name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(t)} className="text-[var(--accent)] hover:opacity-80 text-xs font-semibold">수정</button>
                      <button onClick={() => handleDelete(t.id)} className="text-danger hover:opacity-80 text-xs font-semibold">삭제</button>
                    </div>
                  </div>
                  <div className="text-[10px] font-semibold text-[var(--toss-gray-4)] truncate" title={getShiftsLabels(t.applicable_shifts)}>
                    적용 근무: {getShiftsLabels(t.applicable_shifts)}
                  </div>
                </div>
              ))}
              {div.teams.length === 0 && <p className="text-xs text-[var(--toss-gray-3)]">팀 없음</p>}
            </div>
          </div>
        ))}
      </div>

      {adding && !disabled && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4" onClick={() => setAdding(false)}>
          <div data-testid="team-manager-add-modal" className="bg-[var(--card)] p-4 rounded-[var(--radius-md)] max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="팀 추가">
            <h4 className="font-semibold text-sm">팀 추가</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="team-manager-division-select" className="text-[10px] font-bold text-[var(--toss-gray-3)]">
                    본부 <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <select id="team-manager-division-select" aria-required="true" data-testid="team-manager-division-select" value={newTeam.division} onChange={(e) => setNewTeam({ ...newTeam, division: e.target.value })} className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-semibold bg-[var(--card)] text-foreground outline-none">
                    {currentDivisions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="team-manager-name-input" className="text-[10px] font-bold text-[var(--toss-gray-3)]">
                    팀명 <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <input id="team-manager-name-input" aria-required="true" data-testid="team-manager-name-input" type="text" value={newTeam.team_name} onChange={(e) => setNewTeam({ ...newTeam, team_name: e.target.value })} placeholder="팀명" className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-semibold bg-[var(--card)] text-foreground outline-none" />
                </div>
              </div>
              
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[var(--toss-gray-3)]">적용 근무 형태 (미선택 시 모두 적용)</label>
                <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-2 max-h-[120px] overflow-y-auto space-y-1 bg-[var(--page-bg)]">
                  {activeShifts.length === 0 ? (
                    <p className="text-[10px] text-[var(--toss-gray-3)] text-center py-2">등록된 근무형태가 없습니다.</p>
                  ) : (
                    activeShifts.map((sh) => {
                      const isChecked = selectedShifts.includes(sh.id);
                      return (
                        <label key={sh.id} className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-[var(--foreground)]">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedShifts(prev =>
                                isChecked ? prev.filter(id => id !== sh.id) : [...prev, sh.id]
                              );
                            }}
                          />
                          {sh.name}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[var(--border)]">
              <button type="button" data-testid="team-manager-save-button" onClick={handleAdd} className="flex-1 py-2 bg-[var(--accent)] text-white text-xs font-semibold rounded-[var(--radius-md)]">추가</button>
              <button type="button" onClick={() => setAdding(false)} className="flex-1 py-2 bg-[var(--toss-gray-2)] text-xs font-semibold rounded-[var(--radius-md)]">취소</button>
            </div>
          </div>
        </div>
      )}

      {editingTeam && !disabled && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4" onClick={() => setEditingTeam(null)}>
          <div data-testid="team-manager-edit-modal" className="bg-[var(--card)] p-4 rounded-[var(--radius-md)] max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="팀 수정">
            <h4 className="font-semibold text-sm">팀 수정</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="team-manager-edit-division-select" className="text-[10px] font-bold text-[var(--toss-gray-3)]">
                    본부 <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <select id="team-manager-edit-division-select" aria-required="true" data-testid="team-manager-edit-division-select" value={editingDivision} onChange={(e) => setEditingDivision(e.target.value)} className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-semibold bg-[var(--card)] text-foreground outline-none">
                    {currentDivisions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="team-manager-edit-name-input" className="text-[10px] font-bold text-[var(--toss-gray-3)]">
                    팀명 <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <input id="team-manager-edit-name-input" aria-required="true" data-testid="team-manager-edit-name-input" type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} placeholder="팀명" className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs font-semibold bg-[var(--card)] text-foreground outline-none" />
                </div>
              </div>
              
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[var(--toss-gray-3)]">적용 근무 형태 (미선택 시 모두 적용)</label>
                <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-2 max-h-[120px] overflow-y-auto space-y-1 bg-[var(--page-bg)]">
                  {activeShifts.length === 0 ? (
                    <p className="text-[10px] text-[var(--toss-gray-3)] text-center py-2">등록된 근무형태가 없습니다.</p>
                  ) : (
                    activeShifts.map((sh) => {
                      const isChecked = editingSelectedShifts.includes(sh.id);
                      return (
                        <label key={sh.id} className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-[var(--foreground)]">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setEditingSelectedShifts(prev =>
                                isChecked ? prev.filter(id => id !== sh.id) : [...prev, sh.id]
                              );
                            }}
                          />
                          {sh.name}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[var(--border)]">
              <button type="button" data-testid="team-manager-save-edit-button" onClick={handleSaveEdit} className="flex-1 py-2 bg-[var(--accent)] text-white text-xs font-semibold rounded-[var(--radius-md)]">저장</button>
              <button type="button" onClick={() => setEditingTeam(null)} className="flex-1 py-2 bg-[var(--toss-gray-2)] text-xs font-semibold rounded-[var(--radius-md)]">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
