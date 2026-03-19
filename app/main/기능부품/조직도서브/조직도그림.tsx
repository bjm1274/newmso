'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';

// 조직도 내부 데이터 타입
interface OrgTeam {
  teamName: string;
  members: StaffMember[];
}

interface OrgDepartment {
  deptName: string;
  heads: StaffMember[];
  teams: OrgTeam[];
}

interface OrgPyramidData {
  type: 'pyramid';
  companyName?: string;
  director: StaffMember | undefined;
  departments: OrgDepartment[];
  label: string;
}

interface OrgListData {
  type: 'list';
  companyName?: string;
  members: StaffMember[];
}

type OrgViewData = OrgPyramidData | OrgListData;

type CanvasLayout = Record<string, { x: number; y: number }>;

interface CompanyInfo {
  id: string;
  name: string;
  memo?: string | null;
  [key: string]: unknown;
}

interface OrgChartProps {
  user: StaffMember | null;
  staffs?: StaffMember[];
  selectedCo: string;
  setSelectedCo: (co: string) => void;
}

/** 간호과장 이상 직급만 조직도에서 개인 연락처(phone) 조회 가능 (기능 비활성화됨 - 내선번호만 표시) */
// const CAN_SEE_PERSONAL_CONTACT_POSITIONS = ['병원장', '원장', '이사', '진료부장', '간호과장', '간호부장', '실장', '총무부장', '본부장', '팀장', '부장'];

export default function OrgChart({ user, staffs = [], selectedCo, setSelectedCo }: OrgChartProps) {
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  /** 팀 선택 필터: '' = 선택 안함(전체), 팀명 = 해당 팀만 표시 */
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('');

  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedStaff, setDraggedStaff] = useState<StaffMember | null>(null);

  const isAdmin = user?.role === 'admin' || user?.permissions?.mso === true;

  const companies = ['전체', '박철홍정형외과', '수연의원', 'SY INC.'];

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewMode, setViewMode] = useState<'pyramid' | 'list' | 'canvas'>('pyramid');
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayout>({});
  const [activeCompanyInfo, setActiveCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [draggedDept, setDraggedDept] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setStartY(e.pageY - scrollRef.current.offsetTop);
    setScrollLeft(scrollRef.current.scrollLeft);
    setScrollTop(scrollRef.current.scrollTop);
  };

  const onMouseLeave = () => setIsDragging(false);
  const onMouseUp = () => setIsDragging(false);
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const y = e.pageY - scrollRef.current.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft - walkX;
    scrollRef.current.scrollTop = scrollTop - walkY;
  };

  const defaultHospitalStructure = [
    { name: '진료부', teams: ['진료팀'] },
    { name: '간호부', teams: ['병동팀', '수술팀', '외래팀', '외래간호팀', '검사팀'] },
    { name: '총무부', teams: ['원무팀', '총무팀', '행정팀', '관리팀', '영양팀'] },
  ];
  const defaultMsoStructure = [
    { name: '운영본부', teams: ['경영지원팀', '재무팀', '인사팀'] },
    { name: '전략기획본부', teams: ['전략기획팀', '마케팅팀'] },
  ];
  /** 각 부(division)에 해당하는 부서장 직책 — 조직도에서 부 옆에 표시 */
  const DIVISION_HEAD_POSITIONS: Record<string, string[]> = {
    진료부: ['진료부장'],
    간호부: ['간호과장', '간호부장', '실장'],
    총무부: ['총무부장'],
  };
  const [hospitalStructure, setHospitalStructure] = useState(defaultHospitalStructure);
  const [msoStructure, setMsoStructure] = useState(defaultMsoStructure);

  useEffect(() => {
    setSelectedTeamFilter('');
  }, [selectedCo]);

  useEffect(() => {
    const co = selectedCo || '';
    if (co !== '박철홍정형외과' && co !== '수연의원' && co !== 'SY INC.') return;
    (async () => {
      const { data } = await supabase.from('org_teams').select('division, team_name, sort_order').eq('company_name', co).order('division').order('sort_order');

      // 회사 메모(레이아웃 정보) 가져오기
      const { data: coData } = await supabase.from('companies').select('*').eq('name', co).maybeSingle();
      if (coData) {
        setActiveCompanyInfo(coData);
        if (coData.memo) {
          try {
            const memoObj = typeof coData.memo === 'string' ? JSON.parse(coData.memo) : coData.memo;
            if (memoObj.canvas_layout) {
              setCanvasLayout(memoObj.canvas_layout);
            }
          } catch (e) {
            console.error('Memo parse error:', e);
          }
        }
      }

      if (data) {
        if (co === 'SY INC.') {
          const msoDivs = [
            { name: '운영본부', dbDiv: '총무부' },
            { name: '전략기획본부', dbDiv: '진료부' }
          ];
          const built = msoDivs.map(div => ({
            name: div.name,
            teams: (data as { division: string; team_name: string; sort_order: number }[]).filter((r) => r.division === div.dbDiv).map((r) => r.team_name)
          })).filter(d => d.teams.length > 0);
          setMsoStructure(built.length > 0 ? built : defaultMsoStructure);
        } else {
          const divs = ['진료부', '간호부', '총무부'];
          const built = divs.map(d => ({
            name: d,
            teams: (data as { division: string; team_name: string; sort_order: number }[]).filter((r) => r.division === d).map((r) => r.team_name)
          })).filter(d => d.teams.length > 0);
          if (built.length > 0) setHospitalStructure(built);
        }
      }
    })();
  }, [selectedCo]);
  /** MSO 본부 옆에 표시할 부서장급 직책 */
  const MSO_DIVISION_HEAD_POSITIONS: Record<string, string[]> = {
    운영본부: ['팀장', '실장', '부장'],
    전략기획본부: ['팀장', '실장', '부장'],
  };

  const viewData = useMemo((): OrgViewData | OrgViewData[] | null => {
    if (!staffs || staffs.length === 0) return null;

    const filtered = staffs.filter((s) =>
      (s.name?.includes(searchQuery) || s.department?.includes(searchQuery))
    );

    const currentCo = selectedCo || '전체';

    if (currentCo === '전체') {
      return companies.filter(c => c !== '전체').map(co => {
        const coStaffs = filtered.filter((s) => s.company === co);
        if (coStaffs.length === 0) return null;
        if (co === 'SY INC.') {
          const director = coStaffs.find((s) => s.position === '본부장' || Number(s.employee_no) === 100);
          const departments: OrgDepartment[] = msoStructure.map(dept => {
            const headPositions = MSO_DIVISION_HEAD_POSITIONS[dept.name] || [];
            const heads = coStaffs.filter((s) => headPositions.includes(s.position || '') && s.id !== director?.id);
            return {
              deptName: dept.name,
              heads,
              teams: dept.teams.map(team => ({
                teamName: team,
                members: coStaffs.filter((s) => s.department === team && s.id !== director?.id)
              })).filter(t => t.members.length > 0)
            };
          }).filter(d => d.teams.length > 0);
          return { type: 'pyramid' as const, companyName: co, director, departments, label: 'MSO 대표' };
        }
        if (co === '박철홍정형외과' || co === '수연의원') {
          const director = coStaffs.find((s) => s.position === '병원장' || s.position === '원장' || Number(s.employee_no) === 1 || Number(s.employee_no) === 2);
          const structure = defaultHospitalStructure;
          const departments: OrgDepartment[] = structure.map((dept) => {
            const headPositions = DIVISION_HEAD_POSITIONS[dept.name] || [];
            const heads = coStaffs.filter((s) => headPositions.includes(s.position || '') && s.id !== director?.id);
            return {
              deptName: dept.name,
              heads,
              teams: dept.teams.map((team: string) => ({
                teamName: team,
                members: coStaffs.filter((s) => s.department === team && s.id !== director?.id)
              })).filter((t) => t.members.length > 0)
            };
          }).filter((d) => d.teams.length > 0);
          return { type: 'pyramid' as const, companyName: co, director, departments, label: '병원 대표' };
        }
        return { type: 'list' as const, companyName: co, members: coStaffs };
      }).filter(Boolean) as OrgViewData[];
    }

    const coStaffs = filtered.filter((s) => s.company === currentCo);

    if (currentCo === 'SY INC.') {
      const director = coStaffs.find((s) => s.position === '본부장' || Number(s.employee_no) === 100);
      let departments: OrgDepartment[] = msoStructure.map(dept => {
        const headPositions = MSO_DIVISION_HEAD_POSITIONS[dept.name] || [];
        const heads = coStaffs.filter((s) => headPositions.includes(s.position || '') && s.id !== director?.id);
        return {
          deptName: dept.name,
          heads,
          teams: dept.teams.map(team => ({
            teamName: team,
            members: coStaffs.filter((s) => s.department === team && s.id !== director?.id)
          })).filter(t => t.members.length > 0)
        };
      }).filter(d => d.teams.length > 0);

      if (selectedTeamFilter) {
        departments = departments
          .map(dept => {
            const hasTeam = dept.teams.some((t) => t.teamName === selectedTeamFilter);
            if (!hasTeam) return null;
            return { ...dept, teams: dept.teams.filter((t) => t.teamName === selectedTeamFilter) };
          })
          .filter(Boolean) as OrgDepartment[];
      }

      return { type: 'pyramid' as const, director, departments, label: 'MSO 대표' };
    }

    if (currentCo === '박철홍정형외과' || currentCo === '수연의원') {
      const director = coStaffs.find((s) => s.position === '병원장' || s.position === '원장' || Number(s.employee_no) === 1 || Number(s.employee_no) === 2);
      let departments: OrgDepartment[] = hospitalStructure.map(dept => {
        const headPositions = DIVISION_HEAD_POSITIONS[dept.name] || [];
        const heads = coStaffs.filter((s) => headPositions.includes(s.position || '') && s.id !== director?.id);
        return {
          deptName: dept.name,
          heads,
          teams: dept.teams.map(team => ({
            teamName: team,
            members: coStaffs.filter((s) => s.department === team && s.id !== director?.id)
          })).filter(t => t.members.length > 0)
        };
      }).filter(d => d.teams.length > 0);

      if (selectedTeamFilter) {
        departments = departments
          .map(dept => {
            const hasTeam = dept.teams.some((t) => t.teamName === selectedTeamFilter);
            if (!hasTeam) return null;
            return {
              ...dept,
              teams: dept.teams.filter((t) => t.teamName === selectedTeamFilter)
            };
          })
          .filter(Boolean) as OrgDepartment[];
      }

      return { type: 'pyramid' as const, director, departments, label: '병원 대표' };
    }

    return { type: 'list' as const, members: coStaffs };
  }, [staffs, selectedCo, searchQuery, hospitalStructure, selectedTeamFilter]);

  const allTeamOptions = useMemo(() => {
    if (selectedCo === '박철홍정형외과' || selectedCo === '수연의원') return hospitalStructure.flatMap(d => d.teams);
    if (selectedCo === 'SY INC.') return msoStructure.flatMap(d => d.teams);
    return [];
  }, [selectedCo, hospitalStructure]);

  const saveLayout = async (newLayout: CanvasLayout) => {
    if (!selectedCo || !activeCompanyInfo) return;
    setIsSavingLayout(true);
    try {
      const currentMemo = typeof activeCompanyInfo.memo === 'string'
        ? JSON.parse(activeCompanyInfo.memo || '{}')
        : (activeCompanyInfo.memo || {});
      const updatedMemo = { ...currentMemo, canvas_layout: newLayout };

      const { error } = await supabase
        .from('companies')
        .update({ memo: JSON.stringify(updatedMemo) })
        .eq('id', activeCompanyInfo.id);

      if (!error) {
        setCanvasLayout(newLayout);
        setActiveCompanyInfo({ ...activeCompanyInfo, memo: JSON.stringify(updatedMemo) });
      }
    } catch (e) {
      console.error('Save layout error:', e);
    } finally {
      setIsSavingLayout(false);
    }
  };

  const handleDeptDragStart = (e: React.DragEvent, deptName: string) => {
    if (!isEditMode) return;
    setDraggedDept(deptName);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    // Transparent drag image
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    if (!isEditMode || !draggedDept) return;
    e.preventDefault();
    const canvasRect = scrollRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const x = e.clientX - canvasRect.left + (scrollRef.current?.scrollLeft || 0) - dragOffset.x;
    const y = e.clientY - canvasRect.top + (scrollRef.current?.scrollTop || 0) - dragOffset.y;

    setCanvasLayout((prev) => ({
      ...prev,
      [draggedDept]: { x, y }
    }));
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    if (!isEditMode || !draggedDept) return;
    e.preventDefault();
    saveLayout(canvasLayout);
    setDraggedDept(null);
  };

  const handleMoveStaff = async (staff: StaffMember, direction: 'up' | 'down') => {
    const siblings = staffs
      .filter((s) => s.company === staff.company && s.department === staff.department)
      .sort((a, b) => (Number(a.employee_no) || 0) - (Number(b.employee_no) || 0));

    const currentIndex = siblings.findIndex((s) => s.id === staff.id);
    if (currentIndex === -1) return;

    let targetIndex = -1;
    if (direction === 'up' && currentIndex > 0) targetIndex = currentIndex - 1;
    else if (direction === 'down' && currentIndex < siblings.length - 1) targetIndex = currentIndex + 1;

    if (targetIndex !== -1) {
      const targetStaff = siblings[targetIndex];
      const tempNo1 = staff.employee_no;
      const tempNo2 = targetStaff.employee_no;

      const { error } = await supabase.from('staff_members').update({ employee_no: tempNo2 }).eq('id', staff.id);
      if (error) return alert('정렬 실패: ' + error.message);
      await supabase.from('staff_members').update({ employee_no: tempNo1 }).eq('id', targetStaff.id);

      window.location.reload();
    }
  };

  return (
    <div className="flex flex-row h-full app-page font-sans overflow-hidden">
      {/* 좌측 세로 탭 - 회사 선택, 관리자 메뉴와 동일 스타일 */}
      <aside className="flex flex-col gap-1.5 p-3 md:p-4 bg-[var(--card)] border-r border-[var(--border)] shrink-0 w-[72px] md:w-44 overflow-y-auto">
        {companies.map(co => (
          <button
            key={co}
            onClick={() => setSelectedCo(co)}
            className={`w-full px-3 py-2.5 text-[11px] md:text-[11px] font-semibold rounded-[var(--radius-md)] transition-all text-left ${selectedCo === co ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
          >
            {co}
          </button>
        ))}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 필터 및 검색 */}
        <div className="p-4 md:p-4 bg-[var(--card)] border-b border-[var(--border)] flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center shrink-0 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {(selectedCo === '박철홍정형외과' || selectedCo === '수연의원' || selectedCo === 'SY INC.') && allTeamOptions.length > 0 && (
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-[11px] font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
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
                className="w-full px-5 py-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/30 text-[var(--foreground)]"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--toss-gray-3)]">🔍</span>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 p-1 bg-[var(--muted)] rounded-xl border border-[var(--border)] mr-2">
                  <button
                    onClick={() => setViewMode('pyramid')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${viewMode !== 'canvas' ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
                  >
                    기본
                  </button>
                  <button
                    onClick={() => setViewMode('canvas')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${viewMode === 'canvas' ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
                  >
                    캔버스
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (selectedCo === '전체') {
                      alert('특정 병원이나 회사를 선택해야 수정이 가능합니다.');
                      return;
                    }
                    setIsEditMode(!isEditMode);
                  }}
                  className={`px-4 py-2 text-xs font-bold rounded-[var(--radius-lg)] transition-all shrink-0 ${isEditMode ? 'bg-[var(--toss-danger)] text-white shadow-md' : 'bg-[var(--input-bg)] text-[var(--foreground)] border border-[var(--border)]'}`}
                >
                  {isEditMode ? '수정 완료' : '조직도 수정하기'}
                </button>
              </div>
            )}
          </div>
        </div>

        <main
          ref={scrollRef}
          onMouseDown={onMouseDown}
          onMouseLeave={onMouseLeave}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
          onDragOver={viewMode === 'canvas' ? handleCanvasDragOver : undefined}
          onDrop={viewMode === 'canvas' ? handleCanvasDrop : undefined}
          className={`flex-1 overflow-auto custom-scrollbar relative bg-[var(--page-bg)] ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
        >
          <div className={`min-h-full flex flex-col items-center ${viewMode === 'canvas' ? 'p-0 w-[4000px] h-[3000px]' : 'w-full p-4 md:p-16'}`}>
            {viewMode === 'canvas' && viewData && !Array.isArray(viewData) ? (
              /* 🎨 캔버스 모드 - 자유 배치 (부서 단위) */
              <div className="relative w-full h-full bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px]">
                {(viewData as OrgPyramidData).director && (
                  <div
                    className="absolute z-30"
                    style={{
                      left: canvasLayout['대표']?.x || 1800,
                      top: canvasLayout['대표']?.y || 80
                    }}
                  >
                    <div
                      draggable={isEditMode}
                      onDragStart={(e) => handleDeptDragStart(e, '대표')}
                      className={`transition-all ${isEditMode ? 'cursor-move ring-2 ring-blue-400 ring-offset-4 rounded-xl shadow-sm' : ''}`}
                    >
                      <StaffCardRow staff={(viewData as OrgPyramidData).director!} onClick={() => setSelectedMember((viewData as OrgPyramidData).director!)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                    </div>
                  </div>
                )}

                {(viewData as OrgPyramidData).departments?.map((dept, dIdx) => {
                  const pos = canvasLayout[dept.deptName] || { x: 400 + dIdx * 600, y: 400 };
                  return (
                    <div
                      key={dIdx}
                      className="absolute z-20 bg-[var(--card)]/70 backdrop-blur-md border border-[var(--border)] rounded-2xl p-5 shadow-sm min-w-[300px]"
                      style={{ left: pos.x, top: pos.y }}
                    >
                      <div className="flex flex-col items-center gap-5">
                        <div
                          draggable={isEditMode}
                          onDragStart={(e) => handleDeptDragStart(e, dept.deptName)}
                          className={`bg-[#1E293B] text-white px-12 py-4 rounded-[var(--radius-xl)] text-[14px] font-bold shadow-sm whitespace-nowrap mb-4 ${isEditMode ? 'cursor-move hover:scale-105 active:scale-95 transition-transform' : ''}`}
                        >
                          {dept.deptName}
                        </div>

                        {dept.heads?.length > 0 && (
                          <div className="flex gap-4 flex-wrap justify-center">
                            {dept.heads.map((h) => (
                              <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                            ))}
                          </div>
                        )}

                        <div className="flex gap-5 items-start">
                          {dept.teams?.map((team, tIdx) => (
                            <div key={tIdx} className="flex flex-col gap-4 bg-[var(--card)]/90 p-5 rounded-2xl border border-dashed border-[var(--border)] min-w-[220px] shadow-sm">
                              <p className="text-[12px] font-extrabold text-[var(--toss-gray-3)] text-center tracking-widest uppercase">[{team.teamName}]</p>
                              <div className="flex flex-col gap-4">
                                {team.members.map((m) => (
                                  <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {(!viewData || (Array.isArray(viewData) && viewData.length === 0)) ? (
              <div className="flex flex-col items-center opacity-30 mt-20">
                <span className="text-6xl mb-4">🏢</span>
                <p className="font-semibold text-sm text-[var(--toss-gray-3)]">등록된 구성원이 없습니다.</p>
              </div>
            ) : Array.isArray(viewData) ? (
              /* 전체: 회사별 피라미드 또는 목록 */
              <div className="flex flex-col items-center w-full space-y-16 md:space-y-20">
                {(viewData as OrgViewData[]).map((group, gIdx) => (
                  <div key={gIdx} className="w-full flex flex-col items-center">
                    {group.companyName && (
                      <h2 className="text-base md:text-lg font-semibold text-[var(--foreground)] border-b-2 border-[var(--accent)] pb-2 mb-5 md:mb-10 uppercase tracking-tight">
                        {group.companyName}
                      </h2>
                    )}
                    {group.type === 'pyramid' ? (
                      <>
                        <div className="hidden md:flex flex-col items-center min-w-max w-full">
                          {(group as OrgPyramidData).director && (
                            <div className="relative mb-24">
                              <StaffCardRow staff={(group as OrgPyramidData).director!} onClick={() => setSelectedMember((group as OrgPyramidData).director!)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                              <div className="absolute left-1/2 -bottom-24 w-0.5 h-24 bg-[var(--toss-blue-light)] -translate-x-1/2"></div>
                            </div>
                          )}
                          <div className="flex gap-20 relative pt-12 border-t-2 border-[var(--toss-blue-light)] items-start w-full justify-start">
                            {(group as OrgPyramidData).departments?.map((dept, dIdx) => (
                              <div key={dIdx} className={`flex flex-col min-w-0 ${dept.deptName === '진료부' ? 'flex-grow-0 min-w-[11rem] max-w-[12rem] items-start' : dept.deptName === '총무부' ? 'flex-grow-0 min-w-0 items-center ml-auto' : 'flex-1 items-center'}`}>
                                <div className={`flex flex-row items-end gap-2 w-full mb-12 relative z-10 min-h-[88px] ${dept.deptName === '간호부' ? 'justify-start' : 'justify-center'}`}>
                                  <div className="relative shrink-0 self-center">
                                    <div className="bg-[#1E293B] text-white px-5 py-3 rounded-[var(--radius-md)] text-[11px] font-semibold shadow-sm whitespace-nowrap">{dept.deptName}</div>
                                    <div className="absolute left-1/2 -bottom-12 w-0.5 h-12 bg-[var(--border)] -translate-x-1/2"></div>
                                  </div>
                                  {dept.heads?.length > 0 && (
                                    <div className={`flex gap-1.5 justify-center items-end ${dept.deptName === '간호부' ? 'flex-nowrap shrink-0' : 'flex-wrap'}`}>
                                      {dept.heads.map((h) => (
                                        <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className={`flex flex-row gap-4 items-start justify-start w-full pb-2 ${dept.deptName === '총무부' ? 'flex-wrap' : 'overflow-x-auto no-scrollbar'}`}>
                                  {dept.teams?.map((team, tIdx) => (
                                    <div
                                      key={tIdx}
                                      className={`flex flex-col gap-4 bg-[var(--card)]/40 p-5 rounded-2xl border border-dashed border-[var(--border)] shrink-0 transition-colors ${isEditMode ? 'hover:border-[var(--border)] min-h-[100px]' : ''}`}
                                      onDragOver={isEditMode ? (e) => e.preventDefault() : undefined}
                                      onDrop={isEditMode ? async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!draggedStaff || draggedStaff.department === team.teamName) return;
                                        if (confirm(`${draggedStaff.name}님을 [${team.teamName}] (으)로 이동하시겠습니까?`)) {
                                          await supabase.from('staff_members').update({ department: team.teamName }).eq('id', draggedStaff.id);
                                          alert('이동되었습니다.');
                                          window.location.reload();
                                        }
                                      } : undefined}
                                    >
                                      <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] text-center mb-1">[{team.teamName}]</p>
                                      <div className="flex flex-col gap-3">
                                        {team.members.map((m) => (
                                          <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="md:hidden w-full space-y-5">
                          {(group as OrgPyramidData).director && <StaffCardRow staff={(group as OrgPyramidData).director!} onClick={() => setSelectedMember((group as OrgPyramidData).director!)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />}
                          {(group as OrgPyramidData).departments?.map((dept, dIdx) => (
                            <div key={dIdx} className="space-y-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <h3 className="text-xs font-semibold text-[var(--foreground)] border-l-4 border-[var(--accent)] pl-3 py-1 shrink-0">{dept.deptName}</h3>
                                {dept.heads?.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {dept.heads.map((h) => (
                                      <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-row gap-4 overflow-x-auto pb-2 no-scrollbar">
                                {dept.teams?.map((t, tIdx) => (
                                  <div key={tIdx} className="flex flex-col gap-3 shrink-0 min-w-[140px]">
                                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] text-center">[{t.teamName}]</p>
                                    {t.members.map((m) => (
                                      <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 w-full max-w-7xl">
                        {(group as OrgListData).members?.map((m) => (
                          <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
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
                      <StaffCardRow staff={(viewData as any).director} onClick={() => setSelectedMember((viewData as any).director)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                      <div className="absolute left-1/2 -bottom-24 w-0.5 h-24 bg-[var(--toss-blue-light)] -translate-x-1/2"></div>
                    </div>
                  )}

                  <div className="flex gap-20 relative pt-12 border-t-2 border-[var(--toss-blue-light)] items-start w-full">
                    {(viewData as OrgPyramidData).departments.map((dept, dIdx) => (
                      <div key={dIdx} className={`flex flex-col min-w-0 ${dept.deptName === '진료부' ? 'flex-grow-0 min-w-[11rem] max-w-[12rem] items-start' : dept.deptName === '총무부' ? 'flex-grow-0 min-w-0 items-center ml-auto' : 'flex-1 items-center'}`}>
                        <div className={`flex flex-row items-end gap-2 w-full mb-12 relative z-10 min-h-[88px] ${dept.deptName === '간호부' ? 'justify-start' : 'justify-center'}`}>
                          <div className="relative shrink-0 self-center">
                            <div className="bg-[#1E293B] text-white px-5 py-3 rounded-[var(--radius-md)] text-[11px] font-semibold shadow-sm whitespace-nowrap">
                              {dept.deptName}
                            </div>
                            <div className="absolute left-1/2 -bottom-12 w-0.5 h-12 bg-[var(--border)] -translate-x-1/2"></div>
                          </div>
                          {dept.heads?.length > 0 && (
                            <div className={`flex gap-1.5 justify-center items-end ${dept.deptName === '간호부' ? 'flex-nowrap shrink-0' : 'flex-wrap'}`}>
                              {dept.heads.map((h) => (
                                <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                              ))}
                            </div>
                          )}
                        </div>

                        <div className={`flex flex-row gap-4 items-start justify-start w-full pb-2 ${dept.deptName === '총무부' ? 'flex-wrap' : 'overflow-x-auto no-scrollbar'}`}>
                          {dept.teams.map((team, tIdx) => (
                            <div
                              key={tIdx}
                              className={`flex flex-col gap-4 bg-[var(--card)]/40 p-5 rounded-2xl border border-dashed border-[var(--border)] shrink-0 transition-colors ${isEditMode ? 'hover:border-[var(--border)] min-h-[100px]' : ''}`}
                              onDragOver={isEditMode ? (e) => e.preventDefault() : undefined}
                              onDrop={isEditMode ? async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!draggedStaff || draggedStaff.department === team.teamName) return;
                                if (confirm(`${draggedStaff.name}님을 [${team.teamName}] (으)로 이동하시겠습니까?`)) {
                                  await supabase.from('staff_members').update({ department: team.teamName }).eq('id', draggedStaff.id);
                                  alert('이동되었습니다.');
                                  window.location.reload();
                                }
                              } : undefined}
                            >
                              <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] text-center mb-1">[{team.teamName}]</p>
                              <div className="flex flex-col gap-3">
                                {team.members.map((m) => (
                                  <StaffCardRow key={m.id} staff={m} onClick={() => setSelectedMember(m)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
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
                <div className="md:hidden w-full space-y-5">
                  {(viewData as OrgPyramidData).director && (
                    <div className="flex flex-col items-center">
                      <StaffCardRow staff={(viewData as OrgPyramidData).director!} onClick={() => setSelectedMember((viewData as OrgPyramidData).director!)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                    </div>
                  )}
                  {(viewData as OrgPyramidData).departments.map((dept, dIdx) => (
                    <div key={dIdx} className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xs font-semibold text-[var(--foreground)] border-l-4 border-[var(--accent)] pl-3 py-1 shrink-0">{dept.deptName}</h3>
                        {dept.heads?.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {dept.heads.map((h) => (
                              <StaffCardRow key={h.id} staff={h} onClick={() => setSelectedMember(h)} onMoveStaff={handleMoveStaff} isEditMode={isEditMode} setDraggedStaff={setDraggedStaff} draggedStaff={draggedStaff} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-row gap-4 overflow-x-auto pb-2 no-scrollbar">
                        {dept.teams.map((t, tIdx) => (
                          <div
                            key={tIdx}
                            className={`flex flex-col gap-3 shrink-0 min-w-[140px] rounded-2xl transition-all ${isEditMode ? 'border-2 border-dashed border-transparent hover:border-[var(--border)] p-2 min-h-[100px]' : ''}`}
                            onDragOver={isEditMode ? (e) => e.preventDefault() : undefined}
                            onDrop={isEditMode ? async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!draggedStaff || draggedStaff.department === t.teamName) return;
                              if (confirm(`${draggedStaff.name}님을 [${t.teamName}] (으)로 이동하시겠습니까?`)) {
                                await supabase.from('staff_members').update({ department: t.teamName }).eq('id', draggedStaff.id);
                                alert('이동되었습니다.');
                                window.location.reload();
                              }
                            } : undefined}
                          >
                            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] text-center">[{t.teamName}]</p>
                            {t.members.map((m) => (
                              <StaffCardRow
                                key={m.id}
                                staff={m}
                                onMoveStaff={handleMoveStaff}
                                isEditMode={isEditMode}
                                setDraggedStaff={setDraggedStaff}
                                draggedStaff={draggedStaff}
                              />
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
                {(Array.isArray(viewData) ? viewData as OrgViewData[] : [{ type: 'list' as const, members: (viewData as OrgListData).members }]).map((group, idx) => (
                  <div key={idx} className="mb-12 md:mb-16 last:mb-0">
                    {(group as OrgListData).companyName && (
                      <h3 className="text-sm font-semibold text-[var(--foreground)] border-l-4 border-[var(--foreground)] pl-4 mb-4 md:mb-5 uppercase tracking-tight">
                        {(group as OrgListData).companyName}
                      </h3>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                      {(group as OrgListData).members?.map((m) => (
                        <StaffCardRow
                          key={m.id}
                          staff={m}
                          onClick={!isEditMode ? () => setSelectedMember(m) : undefined}
                          onMoveStaff={handleMoveStaff}
                          isEditMode={isEditMode}
                          setDraggedStaff={setDraggedStaff}
                          draggedStaff={draggedStaff}
                        />
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
            <div className="bg-[var(--card)] w-full max-w-sm rounded-t-[2.5rem] md:rounded-2xl p-5 md:p-5 shadow-sm animate-in slide-in-from-bottom md:zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 md:w-28 md:h-28 bg-[var(--muted)] rounded-[var(--radius-lg)] md:rounded-2xl mb-4 flex items-center justify-center text-5xl border-4 border-[var(--card)] shadow-sm overflow-hidden">
                  {(selectedMember.photo_url || selectedMember.avatar_url) ? (
                    <img
                      src={(selectedMember.photo_url || selectedMember.avatar_url) ?? undefined}
                      alt={selectedMember.name ?? '구성원 사진'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    "👤"
                  )}
                </div>
                <h4 className="text-xl md:text-2xl font-semibold text-[var(--foreground)] tracking-tight">{selectedMember.name}</h4>
                <p className="text-[var(--accent)] text-sm font-bold mt-2">{selectedMember.company} · {selectedMember.position}</p>

                <div className="w-full mt-5 p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] md:rounded-[var(--radius-lg)] border border-[var(--border)] space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[var(--toss-gray-3)]">소속 부서</span>
                    <span className="font-semibold text-[var(--foreground)]">{selectedMember.department || '-'}</span>
                  </div>
                  {(selectedMember.extension || selectedMember.permissions?.extension) && (
                    <div className="flex justify-between items-center text-xs border-t border-[var(--border)] pt-4">
                      <span className="font-semibold text-[var(--toss-gray-3)]">내선번호</span>
                      <span className="font-semibold text-[var(--foreground)]">{selectedMember.extension || selectedMember.permissions?.extension}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => setSelectedMember(null)} className="w-full py-4 md:py-5 bg-[#1E293B] text-white rounded-[var(--radius-md)] font-semibold text-xs mt-5 shadow-sm transition-all active:scale-95">닫기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StaffCardRowProps {
  staff: StaffMember;
  onClick?: () => void;
  isEditMode: boolean;
  setDraggedStaff: (staff: StaffMember | null) => void;
  draggedStaff: StaffMember | null;
  onMoveStaff?: (staff: StaffMember, direction: 'up' | 'down') => void;
}

/** 직원 카드: 사진 좌측, 이름·직책 우측 가로 배치 */
function StaffCardRow({ staff, onClick, isEditMode, setDraggedStaff, draggedStaff, onMoveStaff }: StaffCardRowProps) {
  const isAdmin = staff.role === 'admin' || staff.permissions?.mso === true;
  const photoUrl = staff.photo_url || staff.avatar_url;

  return (
    <div
      onClick={onClick}
      draggable={isEditMode}
      onDragStart={isEditMode ? (e) => {
        setDraggedStaff(staff);
      } : undefined}
      onDragOver={isEditMode ? (e) => e.preventDefault() : undefined}
      onDrop={isEditMode ? async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedStaff || draggedStaff.id === staff.id) return;
        if (confirm(`${draggedStaff.name}님과 ${staff.name}님의 순서를 바꾸시겠습니까?`)) {
          // Swap logic using employee_no (acting as sort index)
          const tempNo1 = staff.employee_no;
          const tempNo2 = draggedStaff.employee_no;
          await supabase.from('staff_members').update({ employee_no: tempNo2 }).eq('id', staff.id);
          await supabase.from('staff_members').update({ employee_no: tempNo1 }).eq('id', draggedStaff.id);
          alert('변경되었습니다.');
          window.location.reload();
        }
      } : undefined}
      className={`
        relative flex flex-row items-center gap-3.5 p-2.5 pr-4 bg-[var(--card)] border rounded-[var(--radius-lg)] transition-all group min-w-0
        border-[var(--border)] shadow-sm hover:shadow-sm hover:border-[var(--accent)] hover:-translate-y-0.5
        ${isAdmin ? 'border-l-4 border-l-[var(--toss-danger)]' : ''}
        ${isEditMode ? 'cursor-grab active:cursor-grabbing hover:bg-[var(--tab-bg)]' : 'cursor-pointer'}
      `}
    >
      <div className={`w-[42px] h-[42px] shrink-0 rounded-[var(--radius-md)] flex items-center justify-center text-base overflow-hidden ${isAdmin ? 'bg-red-50 text-red-400' : 'bg-[var(--muted)] text-[var(--toss-gray-3)] group-hover:bg-[var(--toss-blue-light)] group-hover:text-[var(--accent)]'}`}>
        {photoUrl ? (
          <img src={photoUrl} alt={staff.name ?? ''} className="w-full h-full object-cover rounded-[var(--radius-md)]" />
        ) : (
          <span className="text-sm">印</span>
        )}
      </div>
      <div className="flex flex-col justify-center min-w-0 text-left pointer-events-none">
        <p className="font-semibold text-[var(--foreground)] text-sm truncate">{staff.name}</p>
        <p className="text-xs font-bold text-[var(--toss-gray-3)] truncate">{staff.position || '-'}</p>
      </div>
      {isEditMode && (
        <div className="flex flex-col gap-1 ml-auto pointer-events-auto">
          <button
            title="위로 이동"
            onClick={(e) => { e.stopPropagation(); onMoveStaff?.(staff, 'up'); }}
            className="w-6 h-6 flex items-center justify-center bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-md hover:bg-[var(--accent)] hover:text-white transition-colors text-[10px]"
          >
            ▲
          </button>
          <button
            title="아래로 이동"
            onClick={(e) => { e.stopPropagation(); onMoveStaff?.(staff, 'down'); }}
            className="w-6 h-6 flex items-center justify-center bg-[var(--tab-bg)] dark:bg-zinc-800 rounded-md hover:bg-[var(--accent)] hover:text-white transition-colors text-[10px]"
          >
            ▼
          </button>
        </div>
      )}
      {isAdmin && !isEditMode && <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[var(--toss-danger)] rounded-full"></span>}
    </div>
  );
}
