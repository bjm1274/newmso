'use client';
import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/** 간호과장 이상 직급만 조직도에서 개인 연락처(phone) 조회 가능 */
const CAN_SEE_PERSONAL_CONTACT_POSITIONS = ['병원장', '원장', '이사', '진료부장', '간호과장', '간호부장', '실장', '총무부장', '본부장', '팀장', '부장'];

export default function OrgChart({ user, staffs = [], selectedCo, setSelectedCo }: any) {
  const canSeePersonalContact = !!(user?.position && CAN_SEE_PERSONAL_CONTACT_POSITIONS.includes(user.position)) || user?.role === 'admin' || user?.permissions?.mso === true;
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  /** 팀 선택 필터: '' = 선택 안함(전체), 팀명 = 해당 팀만 표시 */
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('');
  
  const companies = ['전체', '박철홍정형외과', '수연의원', 'SY INC.'];

  const defaultHospitalStructure = [
    { name: '진료부', teams: ['진료팀'] },
    { name: '간호부', teams: ['병동팀', '수술팀', '외래팀', '외래간호팀', '검사팀'] },
    { name: '총무부', teams: ['원무팀', '총무팀', '행정팀', '관리팀', '영양팀'] },
  ];
  /** 각 부(division)에 해당하는 부서장 직책 — 조직도에서 부 옆에 표시 */
  const DIVISION_HEAD_POSITIONS: Record<string, string[]> = {
    진료부: ['진료부장'],
    간호부: ['간호과장', '간호부장', '실장'],
    총무부: ['총무부장'],
  };
  const [hospitalStructure, setHospitalStructure] = useState(defaultHospitalStructure);

  useEffect(() => {
    setSelectedTeamFilter('');
  }, [selectedCo]);

  useEffect(() => {
    const co = selectedCo || '';
    if (co !== '박철홍정형외과' && co !== '수연의원') return;
    (async () => {
      const { data } = await supabase.from('org_teams').select('division, team_name, sort_order').eq('company_name', co).order('division').order('sort_order');
      if (data && data.length > 0) {
        const divs = ['진료부', '간호부', '총무부'];
        const built = divs.map(d => ({
          name: d,
          teams: (data as any[]).filter((r: any) => r.division === d).map((r: any) => r.team_name)
        })).filter(d => d.teams.length > 0);
        if (built.length > 0) setHospitalStructure(built);
      }
    })();
  }, [selectedCo]);

  const msoStructure = [
    { name: '경영지원본부', teams: ['경영지원팀', '재무팀', '인사팀'] },
    { name: '전략기획본부', teams: ['전략기획팀', '마케팅팀'] },
  ];
  /** MSO 본부 옆에 표시할 부서장급 직책 */
  const MSO_DIVISION_HEAD_POSITIONS: Record<string, string[]> = {
    경영지원본부: ['팀장', '실장', '부장'],
    전략기획본부: ['팀장', '실장', '부장'],
  };

  const viewData = useMemo(() => {
    if (!staffs || staffs.length === 0) return null;

    const filtered = staffs.filter((s: any) => 
      (s.name?.includes(searchQuery) || s.department?.includes(searchQuery))
    );

    const currentCo = selectedCo || '전체';
    
    if (currentCo === '전체') {
      return companies.filter(c => c !== '전체').map(co => {
        const coStaffs = filtered.filter((s: any) => s.company === co);
        if (coStaffs.length === 0) return null;
        if (co === 'SY INC.') {
          const director = coStaffs.find((s: any) => s.position === '본부장' || s.employee_no === 100);
          const departments = msoStructure.map(dept => {
            const headPositions = MSO_DIVISION_HEAD_POSITIONS[dept.name] || [];
            const heads = coStaffs.filter((s: any) => headPositions.includes(s.position) && s.id !== director?.id);
            return {
              deptName: dept.name,
              heads,
              teams: dept.teams.map(team => ({
                teamName: team,
                members: coStaffs.filter((s: any) => s.department === team && s.id !== director?.id)
              })).filter(t => t.members.length > 0)
            };
          }).filter(d => d.teams.length > 0);
          return { type: 'pyramid', companyName: co, director, departments, label: 'MSO 대표' };
        }
        if (co === '박철홍정형외과' || co === '수연의원') {
          const director = coStaffs.find((s: any) => s.position === '병원장' || s.position === '원장' || s.employee_no === 1 || s.employee_no === 2);
          const structure = co === '박철홍정형외과' ? defaultHospitalStructure : defaultHospitalStructure;
          const departments = structure.map((dept: any) => {
            const headPositions = DIVISION_HEAD_POSITIONS[dept.name] || [];
            const heads = coStaffs.filter((s: any) => headPositions.includes(s.position) && s.id !== director?.id);
            return {
              deptName: dept.name,
              heads,
              teams: dept.teams.map((team: string) => ({
                teamName: team,
                members: coStaffs.filter((s: any) => s.department === team && s.id !== director?.id)
              })).filter((t: any) => t.members.length > 0)
            };
          }).filter((d: any) => d.teams.length > 0);
          return { type: 'pyramid', companyName: co, director, departments, label: '병원 대표' };
        }
        return { type: 'list', companyName: co, members: coStaffs };
      }).filter(Boolean) as any[];
    }

    const coStaffs = filtered.filter((s: any) => s.company === currentCo);
    
    if (currentCo === 'SY INC.') {
      const director = coStaffs.find((s: any) => s.position === '본부장' || s.employee_no === 100);
      let departments = msoStructure.map(dept => {
        const headPositions = MSO_DIVISION_HEAD_POSITIONS[dept.name] || [];
        const heads = coStaffs.filter((s: any) => headPositions.includes(s.position) && s.id !== director?.id);
        return {
          deptName: dept.name,
          heads,
          teams: dept.teams.map(team => ({
            teamName: team,
            members: coStaffs.filter((s: any) => s.department === team && s.id !== director?.id)
          })).filter(t => t.members.length > 0)
        };
      }).filter(d => d.teams.length > 0);

      if (selectedTeamFilter) {
        departments = departments
          .map(dept => {
            const hasTeam = dept.teams.some((t: any) => t.teamName === selectedTeamFilter);
            if (!hasTeam) return null;
            return { ...dept, teams: dept.teams.filter((t: any) => t.teamName === selectedTeamFilter) };
          })
          .filter(Boolean) as any[];
      }

      return { type: 'pyramid', director, departments, label: 'MSO 대표' };
    }

    if (currentCo === '박철홍정형외과' || currentCo === '수연의원') {
      const director = coStaffs.find((s: any) => s.position === '병원장' || s.position === '원장' || s.employee_no === 1 || s.employee_no === 2);
      let departments = hospitalStructure.map(dept => {
        const headPositions = DIVISION_HEAD_POSITIONS[dept.name] || [];
        const heads = coStaffs.filter((s: any) => headPositions.includes(s.position) && s.id !== director?.id);
        return {
          deptName: dept.name,
          heads,
          teams: dept.teams.map(team => ({
            teamName: team,
            members: coStaffs.filter((s: any) => s.department === team && s.id !== director?.id)
          })).filter(t => t.members.length > 0)
        };
      }).filter(d => d.teams.length > 0);

      if (selectedTeamFilter) {
        departments = departments
          .map(dept => {
            const hasTeam = dept.teams.some((t: any) => t.teamName === selectedTeamFilter);
            if (!hasTeam) return null;
            return {
              ...dept,
              teams: dept.teams.filter((t: any) => t.teamName === selectedTeamFilter)
            };
          })
          .filter(Boolean) as any[];
      }

      return { type: 'pyramid', director, departments, label: '병원 대표' };
    }

    return { type: 'list', members: coStaffs };
  }, [staffs, selectedCo, searchQuery, hospitalStructure, selectedTeamFilter]);

  const allTeamOptions = useMemo(() => {
    if (selectedCo === '박철홍정형외과' || selectedCo === '수연의원') return hospitalStructure.flatMap(d => d.teams);
    if (selectedCo === 'SY INC.') return msoStructure.flatMap(d => d.teams);
    return [];
  }, [selectedCo, hospitalStructure]);

  return (
    <div className="flex flex-row h-full app-page font-sans overflow-hidden">
      {/* 좌측 세로 탭 - 회사 선택, 관리자 메뉴와 동일 스타일 */}
      <aside className="flex flex-col gap-1.5 p-3 md:p-4 bg-[var(--toss-card)] border-r border-[var(--toss-border)] shrink-0 w-[72px] md:w-44 overflow-y-auto">
        {companies.map(co => (
          <button
            key={co}
            onClick={() => setSelectedCo(co)}
            className={`w-full px-3 py-2.5 text-[11px] md:text-[11px] font-semibold rounded-[12px] transition-all text-left ${selectedCo === co ? 'bg-[var(--toss-blue)] text-white shadow-md' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]'}`}
          >
            {co}
          </button>
        ))}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 필터 및 검색 */}
        <div className="p-4 md:p-6 bg-[var(--toss-card)] border-b border-[var(--toss-border)] flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center shrink-0 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {(selectedCo === '박철홍정형외과' || selectedCo === '수연의원' || selectedCo === 'SY INC.') && allTeamOptions.length > 0 && (
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--toss-border)] rounded-[16px] text-[11px] font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              >
                <option value="">팀 선택 안함 (전체)</option>
                {allTeamOptions.map(team => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            )}
            <div className="relative flex-1 sm:flex-initial min-w-0 sm:min-w-[200px] md:min-w-[280px]">
              <input 
                type="text" 
                placeholder="성함 또는 부서 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-5 py-2.5 bg-[var(--input-bg)] border border-[var(--toss-border)] rounded-[16px] text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 text-[var(--foreground)]"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)]">🔍</span>
            </div>
          </div>
        </div>

      <main className="flex-1 overflow-auto custom-scrollbar relative bg-[var(--page-bg)]">
        <div className="min-h-full w-full flex flex-col items-center p-6 md:p-16">
          
          {(!viewData || (Array.isArray(viewData) && viewData.length === 0)) ? (
            <div className="flex flex-col items-center opacity-30 mt-20">
              <span className="text-6xl mb-4">🏢</span>
              <p className="font-semibold text-sm text-[var(--toss-gray-3)]">등록된 구성원이 없습니다.</p>
            </div>
          ) : Array.isArray(viewData) ? (
            /* 전체: 회사별 피라미드 또는 목록 */
            <div className="flex flex-col items-center w-full space-y-16 md:space-y-20">
              {viewData.map((group: any, gIdx: number) => (
                <div key={gIdx} className="w-full flex flex-col items-center">
                  {group.companyName && (
                    <h2 className="text-base md:text-lg font-semibold text-[var(--foreground)] border-b-2 border-[var(--toss-blue)] pb-2 mb-8 md:mb-10 uppercase tracking-tight">
                      {group.companyName}
                    </h2>
                  )}
                  {group.type === 'pyramid' ? (
                    <>
                      <div className="hidden md:flex flex-col items-center min-w-max w-full">
                        {group.director && (
                          <div className="relative mb-24">
                            <StaffCardRow staff={group.director} onClick={() => setSelectedMember(group.director)} />
                            <div className="absolute left-1/2 -bottom-24 w-0.5 h-24 bg-[var(--toss-blue-light)] -translate-x-1/2"></div>
                          </div>
                        )}
                        <div className="flex gap-20 relative pt-12 border-t-2 border-[var(--toss-blue-light)] items-start w-full justify-start">
                          {group.departments?.map((dept: any, dIdx: number) => (
                            <div key={dIdx} className={`flex flex-col min-w-0 ${dept.deptName === '진료부' ? 'flex-grow-0 min-w-[11rem] max-w-[12rem] items-start' : dept.deptName === '총무부' ? 'flex-grow-0 min-w-0 items-center ml-auto' : 'flex-1 items-center'}`}>
                              <div className={`flex flex-row items-end gap-2 w-full mb-12 relative z-10 min-h-[88px] ${dept.deptName === '간호부' ? 'justify-start' : 'justify-center'}`}>
                                <div className="relative shrink-0 self-center">
                                  <div className="bg-[#1E293B] text-white px-8 py-3 rounded-[12px] text-[11px] font-semibold shadow-xl whitespace-nowrap">{dept.deptName}</div>
                                  <div className="absolute left-1/2 -bottom-12 w-0.5 h-12 bg-[var(--toss-border)] -translate-x-1/2"></div>
                                </div>
                                {dept.heads?.length > 0 && (
                                  <div className={`flex gap-1.5 justify-center items-end ${dept.deptName === '간호부' ? 'flex-nowrap shrink-0' : 'flex-wrap'}`}>
                                    {dept.heads.map((h: any) => (
                                      <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} />
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className={`flex flex-row gap-6 items-start justify-start w-full pb-2 ${dept.deptName === '총무부' ? 'flex-wrap' : 'overflow-x-auto no-scrollbar'}`}>
                                {dept.teams?.map((team: any, tIdx: number) => (
                                  <div key={tIdx} className="flex flex-col gap-4 bg-white/40 p-5 rounded-[2.5rem] border border-dashed border-[var(--toss-border)] shrink-0">
                                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] text-center mb-1">[{team.teamName}]</p>
                                    <div className="flex flex-col gap-3">
                                      {team.members.map((m: any) => (
                                        <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="md:hidden w-full space-y-8">
                        {group.director && <StaffCardRow staff={group.director} onClick={() => setSelectedMember(group.director)} />}
                        {group.departments?.map((dept: any, dIdx: number) => (
                          <div key={dIdx} className="space-y-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-xs font-semibold text-[var(--foreground)] border-l-4 border-[var(--toss-blue)] pl-3 py-1 shrink-0">{dept.deptName}</h3>
                              {dept.heads?.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {dept.heads.map((h: any) => (
                                    <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} />
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-row gap-4 overflow-x-auto pb-2 no-scrollbar">
                              {dept.teams?.map((t: any, tIdx: number) => (
                                <div key={tIdx} className="flex flex-col gap-3 shrink-0 min-w-[140px]">
                                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] text-center">[{t.teamName}]</p>
                                  {t.members.map((m: any) => (
                                    <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6 w-full max-w-7xl">
                      {group.members?.map((m: any) => (
                        <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (typeof viewData === 'object' && (viewData as any).type === 'pyramid') ? (
            /* 피라미드 뷰 - 모바일에서는 리스트로 자동 전환되거나 가로 스크롤 제공 */
            <div className="flex flex-col items-center w-full">
              {/* PC 피라미드 뷰 (md 이상) */}
              <div className="hidden md:flex flex-col items-center min-w-max">
                {(viewData as any).director && (
                  <div className="relative mb-24">
                    <StaffCardRow staff={(viewData as any).director} onClick={() => setSelectedMember((viewData as any).director)} />
                    <div className="absolute left-1/2 -bottom-24 w-0.5 h-24 bg-[var(--toss-blue-light)] -translate-x-1/2"></div>
                  </div>
                )}

                <div className="flex gap-20 relative pt-12 border-t-2 border-[var(--toss-blue-light)] items-start w-full">
                  {(viewData as any).departments.map((dept: any, dIdx: number) => (
                    <div key={dIdx} className={`flex flex-col min-w-0 ${dept.deptName === '진료부' ? 'flex-grow-0 min-w-[11rem] max-w-[12rem] items-start' : dept.deptName === '총무부' ? 'flex-grow-0 min-w-0 items-center ml-auto' : 'flex-1 items-center'}`}>
                      <div className={`flex flex-row items-end gap-2 w-full mb-12 relative z-10 min-h-[88px] ${dept.deptName === '간호부' ? 'justify-start' : 'justify-center'}`}>
                        <div className="relative shrink-0 self-center">
                          <div className="bg-[#1E293B] text-white px-8 py-3 rounded-[12px] text-[11px] font-semibold shadow-xl whitespace-nowrap">
                            {dept.deptName}
                          </div>
                          <div className="absolute left-1/2 -bottom-12 w-0.5 h-12 bg-[var(--toss-border)] -translate-x-1/2"></div>
                        </div>
                        {dept.heads?.length > 0 && (
                          <div className={`flex gap-1.5 justify-center items-end ${dept.deptName === '간호부' ? 'flex-nowrap shrink-0' : 'flex-wrap'}`}>
                            {dept.heads.map((h: any) => (
                              <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className={`flex flex-row gap-6 items-start justify-start w-full pb-2 ${dept.deptName === '총무부' ? 'flex-wrap' : 'overflow-x-auto no-scrollbar'}`}>
                        {dept.teams.map((team: any, tIdx: number) => (
                          <div key={tIdx} className="flex flex-col gap-4 bg-white/40 p-5 rounded-[2.5rem] border border-dashed border-[var(--toss-border)] shrink-0">
                            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] text-center mb-1">[{team.teamName}]</p>
                            <div className="flex flex-col gap-3">
                              {team.members.map((m: any) => (
                                <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 모바일 리스트 뷰 (md 미만) */}
              <div className="md:hidden w-full space-y-8">
                {(viewData as any).director && (
                  <div className="flex flex-col items-center">
                    <StaffCardRow staff={(viewData as any).director} onClick={() => setSelectedMember((viewData as any).director)} />
                  </div>
                )}
                {(viewData as any).departments.map((dept: any, dIdx: number) => (
                  <div key={dIdx} className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xs font-semibold text-[var(--foreground)] border-l-4 border-[var(--toss-blue)] pl-3 py-1 shrink-0">{dept.deptName}</h3>
                      {dept.heads?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {dept.heads.map((h: any) => (
                            <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-row gap-4 overflow-x-auto pb-2 no-scrollbar">
                      {dept.teams.map((t: any, tIdx: number) => (
                        <div key={tIdx} className="flex flex-col gap-3 shrink-0 min-w-[140px]">
                          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] text-center">[{t.teamName}]</p>
                          {t.members.map((m: any) => (
                            <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* 전체 및 목록형 뷰 - 반응형 그리드 */
            <div className="w-full max-w-7xl">
              {(Array.isArray(viewData) ? viewData : [{ members: (viewData as any).members }]).map((group: any, idx: number) => (
                <div key={idx} className="mb-12 md:mb-16 last:mb-0">
                  {group.companyName && (
                    <h3 className="text-sm font-semibold text-[var(--foreground)] border-l-4 border-[var(--foreground)] pl-4 mb-6 md:mb-8 uppercase tracking-tighter">
                      {group.companyName}
                    </h3>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
                    {group.members?.map((m: any) => (
                      <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 상세 팝업 - 모바일 최적화 */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-200" onClick={() => setSelectedMember(null)}>
          <div className="bg-[var(--toss-card)] w-full max-w-sm rounded-t-[2.5rem] md:rounded-[3rem] p-8 md:p-10 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 md:w-28 md:h-28 bg-[var(--toss-gray-1)] rounded-[16px] md:rounded-[2.5rem] mb-6 flex items-center justify-center text-5xl border-4 border-[var(--toss-card)] shadow-lg overflow-hidden">
                {(selectedMember.photo_url || selectedMember.avatar_url) ? (
                  <img
                    src={selectedMember.photo_url || selectedMember.avatar_url}
                    alt={selectedMember.name ?? '구성원 사진'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  "👤"
                )}
              </div>
              <h4 className="text-xl md:text-2xl font-semibold text-[var(--foreground)] tracking-tight">{selectedMember.name}</h4>
              <p className="text-[var(--toss-blue)] text-sm font-bold mt-2">{selectedMember.company} · {selectedMember.position}</p>
              
              <div className="w-full mt-8 p-6 bg-[var(--toss-gray-1)] rounded-[16px] md:rounded-[16px] border border-[var(--toss-border)] space-y-4">
                <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[var(--toss-gray-3)]">소속 부서</span>
                    <span className="font-semibold text-[var(--foreground)]">{selectedMember.department || '-'}</span>
                </div>
                {(selectedMember.extension != null && selectedMember.extension !== '') && (
                  <div className="flex justify-between items-center text-xs border-t border-[var(--toss-border)] pt-4">
                    <span className="font-semibold text-[var(--toss-gray-3)]">내선번호</span>
                    <span className="font-semibold text-[var(--foreground)]">{selectedMember.extension}</span>
                  </div>
                )}
                {canSeePersonalContact && selectedMember.phone && (
                  <div className="flex justify-between items-center text-xs border-t border-[var(--toss-border)] pt-4">
                    <span className="font-semibold text-[var(--toss-gray-3)]">개인 연락처</span>
                    <span className="font-semibold text-[var(--foreground)]">{selectedMember.phone}</span>
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedMember(null)} className="w-full py-4 md:py-5 bg-[#1E293B] text-white rounded-[12px] font-semibold text-xs mt-8 shadow-xl transition-all active:scale-95">닫기</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/** 직원 카드: 사진 좌측, 이름·직책 우측 가로 배치 (약 70% 크기) */
function StaffCardRow({ staff, onClick }: any) {
  const isAdmin = staff.role === 'admin' || staff.permissions?.mso === true;
  const photoUrl = staff.photo_url || staff.avatar_url;

  return (
    <div
      onClick={onClick}
      className={`
        relative flex flex-row items-center gap-3.5 p-2.5 pr-4 bg-[var(--toss-card)] border rounded-[16px] cursor-pointer transition-all group min-w-0
        border-[var(--toss-border)] shadow-sm hover:shadow-lg hover:border-[var(--toss-blue)] hover:-translate-y-0.5
        ${isAdmin ? 'border-l-4 border-l-[var(--toss-danger)]' : ''}
      `}
    >
      <div className={`w-[42px] h-[42px] shrink-0 rounded-[12px] flex items-center justify-center text-base overflow-hidden ${isAdmin ? 'bg-red-50 text-red-400' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] group-hover:bg-[var(--toss-blue-light)] group-hover:text-[var(--toss-blue)]'}`}>
        {photoUrl ? (
          <img src={photoUrl} alt={staff.name ?? ''} className="w-full h-full object-cover rounded-[12px]" />
        ) : (
          <span className="text-sm">印</span>
        )}
      </div>
      <div className="flex flex-col justify-center min-w-0 text-left">
        <p className="font-semibold text-[var(--foreground)] text-sm truncate">{staff.name}</p>
        <p className="text-xs font-bold text-[var(--toss-gray-3)] truncate">{staff.position || '-'}</p>
      </div>
      {isAdmin && <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[var(--toss-danger)] rounded-full"></span>}
    </div>
  );
}
