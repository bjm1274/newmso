'use client';
import { useState, useMemo } from 'react';

const HOSPITAL_STRUCTURE = [
  { name: '진료부', teams: ['진료부', '진료팀'] },
  { name: '간호부', teams: ['병동팀', '수술팀', '외래팀', '검사팀'] },
  { name: '행정부', teams: ['행정팀', '총무팀', '원무팀', '관리팀', '영양팀'] },
];

const MSO_STRUCTURE = [
  { name: '경영지원본부', teams: ['경영지원팀', '재무팀', '인사팀'] },
  { name: '전략기획본부', teams: ['전략기획팀', '마케팅팀'] },
];

export default function OrgChart({ user, staffs = [], depts, selectedCo, setSelectedCo, onRefresh }: any) {
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const companies = useMemo(() => {
    const all = Array.from(new Set((staffs || []).map((s: any) => s.company).filter(Boolean))) as string[];
    return ['전체', ...all];
  }, [staffs]);

  const coStaffs = useMemo(() => {
    let result: any[] = staffs || [];
    if (selectedCo && selectedCo !== '전체') {
      result = result.filter((s: any) => s.company === selectedCo);
      if (selectedCo === 'SY INC.') {
        result = result.filter((s: any) => s.position !== '병원장' && s.position !== '원장');
      }
    }
    return result;
  }, [staffs, selectedCo]);

  const orgData = useMemo(() => {
    if (!selectedCo || selectedCo === '전체') return null;
    const isMso = selectedCo === 'SY INC.';
    const structure = isMso ? MSO_STRUCTURE : HOSPITAL_STRUCTURE;
    const director = isMso
      ? coStaffs.find((s: any) => s.position === '본부장')
      : coStaffs.find((s: any) => s.position === '병원장' || s.position === '원장');
    const departments = structure.map(dept => ({
      name: dept.name,
      teams: dept.teams.map(team => ({
        name: team,
        members: coStaffs.filter((s: any) => s.department === team && s.id !== director?.id),
      })).filter(t => t.members.length > 0),
    })).filter(d => d.teams.length > 0);
    return { director, departments };
  }, [coStaffs, selectedCo]);

  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    return (staffs || []).filter((s: any) =>
      s.name?.includes(searchTerm) || s.position?.includes(searchTerm) || s.department?.includes(searchTerm)
    );
  }, [staffs, searchTerm]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#F7F8FA]">

      {/* ── 상단 헤더 ── */}
      <div className="shrink-0 px-6 pt-5 pb-4 bg-white border-b border-gray-100">
        {/* 회사 탭 */}
        {companies.length > 1 && setSelectedCo && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
            {companies.map((co: string) => (
              <button
                key={co}
                onClick={() => setSelectedCo(co === '전체' ? null : co)}
                className={`px-5 py-2 text-[11px] font-bold rounded-full whitespace-nowrap transition-all shrink-0 shadow-sm ${
                  (selectedCo === co) || (!selectedCo && co === '전체')
                    ? 'bg-slate-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800'
                }`}
              >
                {co}
              </button>
            ))}
          </div>
        )}
        {/* 검색 */}
        <div className="relative">
          <input
            type="text"
            placeholder="직원명, 직급, 부서로 검색..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[13px] outline-none focus:ring-2 focus:ring-slate-200 transition"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          )}
        </div>
      </div>

      {/* ── 본문 ── */}
      <div className="flex-1 overflow-auto p-6 md:p-10">

        {/* 검색 결과 */}
        {searchTerm ? (
          <div className="max-w-xl mx-auto space-y-2">
            <p className="text-xs font-bold text-gray-400 mb-3">검색 결과 {searchResults.length}명</p>
            {searchResults.map((s: any) => (
              <div
                key={s.id}
                onClick={() => setSelectedStaff(s)}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm cursor-pointer hover:border-slate-300 transition"
              >
                <Avatar name={s.name} size="sm" />
                <div>
                  <p className="font-bold text-sm text-gray-900">{s.name}</p>
                  <p className="text-[11px] text-gray-400">{s.company} · {s.department} · {s.position}</p>
                </div>
              </div>
            ))}
          </div>

        /* 선택된 회사 조직도 트리 */
        ) : orgData ? (
          <div className="flex flex-col items-center overflow-x-auto">

            {/* 대표/원장 */}
            {orgData.director && (
              <div className="flex flex-col items-center">
                <div
                  onClick={() => setSelectedStaff(orgData.director)}
                  className="cursor-pointer"
                >
                  <div className="px-8 py-3 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-col items-center gap-0.5 hover:bg-slate-700 transition-all">
                    <span className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">{orgData.director.position}</span>
                    <span className="text-base font-black">{orgData.director.name}</span>
                  </div>
                </div>
                <VLine />
              </div>
            )}

            {/* 부서 레이어 */}
            {orgData.departments.length > 0 && (
              <div className="relative flex gap-6 md:gap-10 items-start">
                {/* 상단 가로 연결선 */}
                <HBar count={orgData.departments.length} />

                {orgData.departments.map((dept: any, i: number) => (
                  <div key={i} className="flex flex-col items-center">
                    <VLine />

                    {/* 부서 박스 */}
                    <div className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-[13px] shadow-md whitespace-nowrap tracking-tight">
                      {dept.name}
                    </div>

                    {dept.teams.length > 0 && <VLine />}

                    {/* 팀 목록 */}
                    <div className="flex flex-col gap-3 items-center">
                      {dept.teams.map((team: any, j: number) => (
                        <div key={j} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden w-44">
                          {/* 팀 이름 헤더 */}
                          <div className="bg-indigo-50 border-b border-indigo-100 px-3 py-1.5 text-center">
                            <span className="text-[11px] font-black text-indigo-600 tracking-tight">{team.name}</span>
                          </div>
                          {/* 팀원 목록 */}
                          <div className="px-3 py-2 flex flex-col gap-1.5">
                            {team.members.map((m: any) => (
                              <div
                                key={m.id}
                                onClick={() => setSelectedStaff(m)}
                                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded-lg px-1 py-0.5 transition"
                              >
                                <Avatar name={m.name} size="xs" />
                                <div className="min-w-0">
                                  <p className="text-[12px] font-bold text-gray-800 truncate">{m.name}</p>
                                  <p className="text-[10px] text-gray-400 truncate">{m.position}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        /* 전체 뷰 — 회사별 카드 그리드 */
        ) : (
          <div className="max-w-6xl mx-auto space-y-10">
            {companies.filter(c => c !== '전체').map((co: string) => {
              const members = (staffs || []).filter((s: any) => s.company === co);
              if (!members.length) return null;
              return (
                <div key={co}>
                  <h3 className="text-sm font-black text-gray-700 border-l-4 border-slate-900 pl-3 mb-4">{co}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {members.map((m: any) => (
                      <div
                        key={m.id}
                        onClick={() => setSelectedStaff(m)}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
                      >
                        <Avatar name={m.name} size="md" />
                        <p className="mt-2 text-sm font-bold text-gray-900">{m.name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{m.position}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 직원 상세 모달 ── */}
      {selectedStaff && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setSelectedStaff(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-3xl p-7 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 mb-5">
              <Avatar name={selectedStaff.name} size="lg" />
              <div>
                <p className="text-xl font-black text-gray-900">{selectedStaff.name}</p>
                <p className="text-sm text-indigo-600 font-semibold">{selectedStaff.position}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3 text-sm">
              <Row label="소속" value={selectedStaff.company} />
              <Row label="부서" value={selectedStaff.department || '-'} />
              {selectedStaff.phone && <Row label="연락처" value={selectedStaff.phone} />}
              {selectedStaff.email && <Row label="이메일" value={selectedStaff.email} />}
            </div>
            <button
              onClick={() => setSelectedStaff(null)}
              className="w-full mt-5 py-3.5 bg-slate-900 text-white rounded-2xl font-bold text-sm"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 보조 컴포넌트 ── */

function Avatar({ name, size }: { name: string; size: 'xs' | 'sm' | 'md' | 'lg' }) {
  const sizeMap = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-9 h-9 text-sm',
    md: 'w-11 h-11 text-base',
    lg: 'w-14 h-14 text-xl',
  };
  const colors = ['bg-violet-500', 'bg-indigo-500', 'bg-teal-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-500'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return (
    <div className={`${sizeMap[size]} ${color} rounded-full flex items-center justify-center text-white font-black shrink-0`}>
      {name?.[0] || '?'}
    </div>
  );
}

function VLine() {
  return <div className="w-px h-8 bg-gray-200" />;
}

function HBar({ count }: { count: number }) {
  if (count <= 1) return null;
  const pct = `${50 / count}%`;
  return (
    <div
      className="absolute top-0 h-px bg-gray-200"
      style={{ left: pct, right: pct }}
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400 font-medium">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );
}
