'use client';
import { useState, useMemo } from 'react';

export default function OrgChart({ staffs = [], selectedCo, setSelectedCo }: any) {
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const companies = ['전체', 'SY INC.', '박철홍정형외과', '수연의원'];

  const hospitalStructure = [
    { name: '진료부', teams: ['진료부', '진료팀'] },
    { name: '간호부', teams: ['병동팀', '수술팀', '외래팀', '검사팀'] },
    { name: '행정부', teams: ['행정팀', '총무팀', '원무팀', '관리팀', '영양팀'] },
  ];

  const msoStructure = [
    { name: '경영지원본부', teams: ['경영지원팀', '재무팀', '인사팀'] },
    { name: '전략기획본부', teams: ['전략기획팀', '마케팅팀'] },
  ];

  const viewData = useMemo(() => {
    if (!staffs || staffs.length === 0) return null;

    const filtered = staffs.filter((s: any) => 
      (s.name?.includes(searchQuery) || s.department?.includes(searchQuery))
    );

    const currentCo = selectedCo || '전체';
    
    if (currentCo === '전체') {
      return companies.filter(c => c !== '전체').map(co => ({
        companyName: co, 
        members: filtered.filter((s: any) => s.company === co)
      })).filter(g => g.members.length > 0);
    }

    const coStaffs = filtered.filter((s: any) => s.company === currentCo);
    
    if (currentCo === 'SY INC.') {
      const director = coStaffs.find((s: any) => s.position === '본부장' || s.employee_no === 100);
      const departments = msoStructure.map(dept => ({
        deptName: dept.name,
        teams: dept.teams.map(team => ({
          teamName: team,
          members: coStaffs.filter((s: any) => s.department === team && s.id !== director?.id)
        })).filter(t => t.members.length > 0)
      })).filter(d => d.teams.length > 0);

      return { type: 'pyramid', director, departments, label: 'MSO 대표' };
    }

    if (currentCo === '박철홍정형외과' || currentCo === '수연의원') {
      const director = coStaffs.find((s: any) => s.position === '병원장' || s.position === '원장' || s.employee_no === 1 || s.employee_no === 2);
      const departments = hospitalStructure.map(dept => ({
        deptName: dept.name,
        teams: dept.teams.map(team => ({
          teamName: team,
          members: coStaffs.filter((s: any) => s.department === team && s.id !== director?.id)
        })).filter(t => t.members.length > 0)
      })).filter(d => d.teams.length > 0);

      return { type: 'pyramid', director, departments, label: '병원 대표' };
    }

    return { type: 'list', members: coStaffs };
  }, [staffs, selectedCo, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] font-sans overflow-hidden">
      {/* 상단 필터 및 검색 - 모바일 대응 */}
      <div className="p-4 md:p-6 bg-white border-b border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center shrink-0 z-20 shadow-sm">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto no-scrollbar">
          {companies.map(co => (
            <button key={co} onClick={() => setSelectedCo(co)}
              className={`px-4 md:px-6 py-2 text-[10px] md:text-[11px] font-black transition-all rounded-lg whitespace-nowrap ${selectedCo === co ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>
              {co}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-72">
          <input 
            type="text" 
            placeholder="성함 또는 부서 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-5 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-800"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300">🔍</span>
        </div>
      </div>

      <main className="flex-1 overflow-auto custom-scrollbar relative bg-[#F9FAFB]">
        <div className="min-h-full w-full flex flex-col items-center p-6 md:p-16">
          
          {(!viewData || (Array.isArray(viewData) && viewData.length === 0)) ? (
            <div className="flex flex-col items-center opacity-30 mt-20">
              <span className="text-6xl mb-4">🏢</span>
              <p className="font-black text-sm text-gray-400">등록된 구성원이 없습니다.</p>
            </div>
          ) : (typeof viewData === 'object' && !Array.isArray(viewData) && (viewData as any).type === 'pyramid') ? (
            /* 피라미드 뷰 - 모바일에서는 리스트로 자동 전환되거나 가로 스크롤 제공 */
            <div className="flex flex-col items-center w-full">
              {/* PC 피라미드 뷰 (md 이상) */}
              <div className="hidden md:flex flex-col items-center min-w-max">
                {(viewData as any).director && (
                  <div className="relative mb-24">
                    <StaffCard staff={(viewData as any).director} isDirector label={(viewData as any).label} onClick={() => setSelectedMember((viewData as any).director)} />
                    <div className="absolute left-1/2 -bottom-24 w-0.5 h-24 bg-blue-200 -translate-x-1/2"></div>
                  </div>
                )}

                <div className="flex gap-20 relative pt-12 border-t-2 border-blue-100">
                  {(viewData as any).departments.map((dept: any, dIdx: number) => (
                    <div key={dIdx} className="flex flex-col items-center relative">
                      <div className="bg-[#1E293B] text-white px-8 py-3 rounded-2xl text-[11px] font-black mb-12 shadow-xl relative z-10">
                        {dept.deptName}
                        <div className="absolute left-1/2 -bottom-12 w-0.5 h-12 bg-gray-200 -translate-x-1/2"></div>
                      </div>

                      <div className="flex gap-6 items-start">
                        {dept.teams.map((team: any, tIdx: number) => (
                          <div key={tIdx} className="flex flex-col gap-4 bg-white/40 p-5 rounded-[2.5rem] border border-dashed border-gray-200">
                            <p className="text-[10px] font-black text-gray-300 text-center mb-1">[{team.teamName}]</p>
                            <div className="flex flex-col gap-3">
                              {team.members.map((m: any) => (
                                <StaffCard key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
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
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4">{(viewData as any).label}</p>
                    <StaffCard staff={(viewData as any).director} isDirector label={(viewData as any).label} onClick={() => setSelectedMember((viewData as any).director)} />
                  </div>
                )}
                {(viewData as any).departments.map((dept: any, dIdx: number) => (
                  <div key={dIdx} className="space-y-4">
                    <h3 className="text-xs font-black text-gray-800 border-l-4 border-blue-600 pl-3 py-1">{dept.deptName}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {dept.teams.flatMap((t: any) => t.members).map((m: any) => (
                        <StaffCard key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
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
                    <h3 className="text-sm font-black text-gray-800 border-l-4 border-gray-900 pl-4 mb-6 md:mb-8 uppercase tracking-tighter">
                      {group.companyName}
                    </h3>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
                    {group.members?.map((m: any) => (
                      <StaffCard key={m.id} staff={m} onClick={() => setSelectedMember(m)} />
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-200" onClick={() => setSelectedMember(null)}>
          <div className="bg-white w-full max-w-sm rounded-t-[2.5rem] md:rounded-[3rem] p-8 md:p-10 shadow-2xl animate-in slide-in-from-bottom md:zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 md:w-28 md:h-28 bg-gray-50 rounded-[2rem] md:rounded-[2.5rem] mb-6 flex items-center justify-center text-5xl border-4 border-white shadow-lg overflow-hidden">
                {selectedMember.photo_url ? <img src={selectedMember.photo_url} className="w-full h-full object-cover" /> : "👤"}
              </div>
              <h4 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">{selectedMember.name}</h4>
              <p className="text-blue-600 text-sm font-bold mt-2">{selectedMember.company} · {selectedMember.position}</p>
              
              <div className="w-full mt-8 p-6 bg-gray-50 rounded-[1.5rem] md:rounded-[2rem] border border-gray-100 space-y-4">
                <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-gray-400">소속 부서</span>
                    <span className="font-black text-gray-800">{selectedMember.department || '-'}</span>
                </div>
                {selectedMember.phone && (
                  <div className="flex justify-between items-center text-xs border-t border-gray-100 pt-4">
                      <span className="font-black text-gray-400">내선 연락처</span>
                      <span className="font-black text-gray-800">{selectedMember.phone}</span>
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedMember(null)} className="w-full py-4 md:py-5 bg-[#1E293B] text-white rounded-2xl font-black text-xs mt-8 shadow-xl transition-all active:scale-95">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffCard({ staff, isDirector = false, label = '대표', onClick }: any) {
  const isAdmin = staff.role === 'admin' || staff.permissions?.mso === true;
  
  return (
    <div 
      onClick={onClick} 
      className={`
        relative flex flex-col items-center p-4 md:p-5 bg-white transition-all cursor-pointer rounded-[1.5rem] md:rounded-[1.8rem] group w-full
        ${isDirector ? 'border-4 border-blue-600 shadow-xl md:scale-110' : 'border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-200 hover:-translate-y-1'}
        ${isAdmin && !isDirector ? 'border-l-4 border-l-red-500' : ''}
      `}
    >
      <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center text-lg md:text-xl mb-3 transition-colors ${isAdmin ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-400'}`}>
        {staff.photo_url ? <img src={staff.photo_url} className="w-full h-full object-cover rounded-xl md:rounded-2xl" /> : "印"}
      </div>
      <div className="text-center w-full">
        <p className="font-black text-gray-900 text-xs md:text-sm mb-1 truncate">{staff.name}</p>
        <p className="text-[9px] md:text-[10px] text-gray-400 font-bold truncate">{staff.position}</p>
        {isDirector && (
          <span className="inline-block mt-2 md:mt-3 px-3 md:px-4 py-1 md:py-1.5 bg-blue-600 text-white text-[8px] md:text-[9px] font-black rounded-full uppercase tracking-widest">
            {label}
          </span>
        )}
      </div>
      {isAdmin && !isDirector && (
        <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
      )}
    </div>
  );
}
