'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export default function OrgChart({ user, staffs, depts, selectedCo, setSelectedCo, onRefresh }: any) {
  const [expandedDepts, setExpandedDepts] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredStaffs, setFilteredStaffs] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);

  useEffect(() => {
    // 검색 필터링
    if (searchTerm) {
      const filtered = staffs.filter((staff: any) =>
        staff.name?.includes(searchTerm) || 
        staff.position?.includes(searchTerm) ||
        staff.department?.includes(searchTerm)
      );
      setFilteredStaffs(filtered);
    } else {
      setFilteredStaffs([]);
    }
  }, [searchTerm, staffs]);

  const normalizedDepts = useMemo(() => {
    const fallbackDepts = Array.from(
      new Set(
        (Array.isArray(staffs) ? staffs : [])
          .map((staff: any) => String(staff.department || '').trim())
          .filter(Boolean)
      )
    ).map((name) => ({ id: name, name }));

    const source = Array.isArray(depts) && depts.length > 0 ? depts : fallbackDepts;
    return source
      .map((dept: any) => {
        if (typeof dept === 'string') {
          const name = dept.trim();
          return name ? { id: name, name } : null;
        }
        const name = String(dept?.name || dept?.id || '').trim();
        const id = String(dept?.id || name).trim();
        return name ? { id, name } : null;
      })
      .filter(Boolean);
  }, [depts, staffs]);

  const toggleDept = (deptId: string) => {
    setExpandedDepts(prev =>
      prev.includes(deptId)
        ? prev.filter(d => d !== deptId)
        : [...prev, deptId]
    );
  };

  const getDeptStaffs = (dept: { id: string; name: string }) => {
    return staffs.filter((staff: any) => {
      const staffDeptId = String(staff.department_id || '').trim();
      const staffDeptName = String(staff.department || '').trim();
      if (staffDeptId && dept.id) {
        return staffDeptId === dept.id;
      }
      return staffDeptName === dept.name;
    });
  };

  const getPositionColor = (position: string) => {
    const colors: any = {
      '원장': 'bg-red-100 text-red-700',
      '부원장': 'bg-orange-100 text-orange-700',
      '팀장': 'bg-[var(--toss-blue-light)] text-blue-700',
      '과장': 'bg-green-100 text-green-700',
      '대리': 'bg-purple-100 text-purple-700',
      '사원': 'bg-[var(--muted)] text-[var(--foreground)]',
    };
    return colors[position] || 'bg-[var(--muted)] text-[var(--foreground)]';
  };

  return (
    <div className="flex flex-1 flex-col overflow-x-hidden bg-[var(--card)]">
      {/* 헤더 */}
      <div className="p-4 border-b border-[var(--border)]">
        <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">🏢 조직도</h2>
        
        {/* 검색 */}
        <div className="relative">
          <input
            type="text"
            placeholder="직원명, 직급, 부서로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-[var(--border)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--accent)]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {searchTerm ? (
          // 검색 결과
          <div className="p-4">
            <h3 className="font-semibold text-[var(--foreground)] mb-4">
              검색 결과: {filteredStaffs.length}명
            </h3>
            <div className="space-y-2">
              {filteredStaffs.map((staff: any) => (
                <div
                  key={staff.id}
                  onClick={() => setSelectedStaff(staff)}
                  className={`p-4 rounded-[var(--radius-md)] border-2 cursor-pointer transition-all ${
                    selectedStaff?.id === staff.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-[var(--border)] hover:border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                      {staff.name?.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[var(--foreground)]">{staff.name}</p>
                      <p className="text-xs text-[var(--toss-gray-3)]">
                        {staff.position} · {staff.department}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPositionColor(staff.position)}`}>
                      {staff.position}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // 조직도 구조
          <div className="p-4">
            {normalizedDepts.map((dept: any) => (
              <div key={dept.id} className="mb-4">
                {/* 부서 헤더 */}
                <div
                  onClick={() => toggleDept(dept.id)}
                  className="flex items-center gap-2 cursor-pointer mb-3 p-3 rounded-[var(--radius-md)] hover:bg-[var(--muted)] transition-all"
                >
                  <span className={`text-lg transition-transform ${expandedDepts.includes(dept.id) ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  <span className="font-semibold text-lg text-[var(--foreground)]">📋 {dept.name}</span>
                  <span className="text-xs font-bold text-[var(--toss-gray-3)] ml-auto">
                    ({getDeptStaffs(dept).length}명)
                  </span>
                </div>

                {/* 부서 직원 목록 */}
                {expandedDepts.includes(dept.id) && (
                  <div className="ml-6 space-y-2 border-l-2 border-[var(--border)] pl-4">
                    {getDeptStaffs(dept).map((staff: any) => (
                      <div
                        key={staff.id}
                        onClick={() => setSelectedStaff(staff)}
                        className={`p-3 rounded-[var(--radius-md)] border-2 cursor-pointer transition-all ${
                          selectedStaff?.id === staff.id
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-[var(--border)] hover:border-[var(--border)]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold text-xs">
                            {staff.name?.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[var(--foreground)] truncate">{staff.name}</p>
                            <p className="text-xs text-[var(--toss-gray-3)]">{staff.email}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${getPositionColor(staff.position)}`}>
                            {staff.position}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 상세 정보 패널 */}
      {selectedStaff && (
        <div className="border-t border-[var(--border)] bg-[var(--muted)] p-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-2xl">
              {selectedStaff.name?.charAt(0)}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-[var(--foreground)]">{selectedStaff.name}</h3>
              <p className="text-sm text-[var(--toss-gray-4)] mb-3">{selectedStaff.department} · {selectedStaff.position}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-bold text-[var(--foreground)]">📧 이메일</p>
                  <p className="text-[var(--toss-gray-4)]">{selectedStaff.email}</p>
                </div>
                <div>
                  <p className="font-bold text-[var(--foreground)]">📞 연락처</p>
                  <p className="text-[var(--toss-gray-4)]">{selectedStaff.phone || '등록 안 됨'}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedStaff(null)}
              className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-2xl"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
