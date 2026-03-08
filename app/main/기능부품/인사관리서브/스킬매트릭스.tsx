'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const SKILL_CATEGORIES = ['임상/진료', 'IT/시스템', '행정/관리', '의사소통', '리더십', '외국어'];
const LEVELS = [0, 1, 2, 3, 4, 5];
const LEVEL_LABELS = ['없음', '입문', '초급', '중급', '고급', '전문가'];
const LEVEL_COLORS = ['bg-gray-100 text-gray-400', 'bg-blue-50 text-blue-400', 'bg-blue-100 text-blue-500', 'bg-green-100 text-green-600', 'bg-orange-100 text-orange-600', 'bg-purple-100 text-purple-600'];

export default function SkillMatrix({ staffs = [], selectedCo, user }: { staffs: any[]; selectedCo: string; user: any }) {
  const [matrix, setMatrix] = useState<Record<string, Record<string, number>>>({});
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [filterDept, setFilterDept] = useState('전체');
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);

  const allSkills = [...SKILL_CATEGORIES, ...customSkills];
  const depts = ['전체', ...Array.from(new Set(staffs.map((s: any) => s.department).filter(Boolean)))];
  const filteredStaffs = staffs.filter((s: any) => filterDept === '전체' || s.department === filterDept);

  const fetchMatrix = useCallback(async () => {
    const { data } = await supabase.from('staff_skills').select('*');
    const m: Record<string, Record<string, number>> = {};
    (data || []).forEach((row: any) => {
      if (!m[row.staff_id]) m[row.staff_id] = {};
      m[row.staff_id][row.skill_name] = row.level;
    });
    setMatrix(m);
    const skills = Array.from(new Set((data || []).map((r: any) => r.skill_name).filter((s: string) => !SKILL_CATEGORIES.includes(s))));
    setCustomSkills(skills as string[]);
  }, []);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  const setLevel = (staffId: string, skill: string, level: number) => {
    setMatrix(prev => ({ ...prev, [staffId]: { ...(prev[staffId] || {}), [skill]: level } }));
  };

  const saveMatrix = async () => {
    setSaving(true);
    try {
      const rows: any[] = [];
      filteredStaffs.forEach((s: any) => {
        allSkills.forEach(skill => {
          const level = matrix[s.id]?.[skill] ?? 0;
          if (level > 0) rows.push({ staff_id: s.id, skill_name: skill, level });
        });
      });
      await supabase.from('staff_skills').delete().in('staff_id', filteredStaffs.map((s: any) => s.id));
      if (rows.length > 0) await supabase.from('staff_skills').insert(rows);
      setEditMode(false);
      alert('스킬 매트릭스가 저장되었습니다.');
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  const addSkill = () => {
    const s = newSkill.trim();
    if (!s || allSkills.includes(s)) return;
    setCustomSkills(prev => [...prev, s]);
    setNewSkill('');
  };

  const staffDetail = selectedStaff ? staffs.find((s: any) => String(s.id) === selectedStaff) : null;
  const staffSkills = selectedStaff ? (matrix[selectedStaff] || {}) : {};

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">직원 스킬 매트릭스</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">직원별 역량·기술 수준을 6단계로 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditMode(v => !v)} className={`px-4 py-2 rounded-[10px] text-xs font-bold ${editMode ? 'bg-orange-500 text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>
            {editMode ? '편집 중' : '편집'}
          </button>
          {editMode && <button onClick={saveMatrix} disabled={saving} className="px-4 py-2 rounded-[10px] text-xs font-bold bg-[var(--toss-blue)] text-white disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>}
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        {depts.map(d => (
          <button key={d} onClick={() => setFilterDept(d)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filterDept === d ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>{d}</button>
        ))}
      </div>

      {/* 스킬 추가 */}
      {editMode && (
        <div className="flex gap-2">
          <input value={newSkill} onChange={e => setNewSkill(e.target.value)} placeholder="새 스킬 추가..." onKeyDown={e => e.key === 'Enter' && addSkill()}
            className="flex-1 max-w-xs px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
          <button onClick={addSkill} className="px-3 py-2 bg-[var(--toss-blue)] text-white rounded-[10px] text-xs font-bold">추가</button>
        </div>
      )}

      {/* 매트릭스 테이블 */}
      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: `${200 + allSkills.length * 90}px` }}>
            <thead>
              <tr className="bg-[var(--toss-gray-1)]/60 border-b border-[var(--toss-border)]">
                <th className="px-4 py-3 text-[10px] font-semibold text-[var(--toss-gray-3)] sticky left-0 bg-[var(--toss-gray-1)]/80 w-36">직원</th>
                {allSkills.map(skill => (
                  <th key={skill} className="px-2 py-3 text-[10px] font-semibold text-[var(--toss-gray-3)] text-center whitespace-nowrap">{skill}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--toss-border)]">
              {filteredStaffs.map((s: any) => (
                <tr key={s.id} className="hover:bg-[var(--toss-blue-light)]/20 transition-colors">
                  <td className="px-4 py-2.5 sticky left-0 bg-[var(--toss-card)] border-r border-[var(--toss-border)]">
                    <button onClick={() => setSelectedStaff(prev => prev === String(s.id) ? null : String(s.id))} className="text-left">
                      <p className="text-xs font-bold text-[var(--foreground)]">{s.name}</p>
                      <p className="text-[9px] text-[var(--toss-gray-3)]">{s.department}</p>
                    </button>
                  </td>
                  {allSkills.map(skill => {
                    const level = matrix[s.id]?.[skill] ?? 0;
                    return (
                      <td key={skill} className="px-2 py-2 text-center">
                        {editMode ? (
                          <select value={level} onChange={e => setLevel(s.id, skill, Number(e.target.value))}
                            className="w-full px-1 py-1 text-[10px] border border-[var(--toss-border)] rounded-[6px] bg-[var(--toss-card)] outline-none">
                            {LEVELS.map(l => <option key={l} value={l}>{l} {LEVEL_LABELS[l]}</option>)}
                          </select>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${LEVEL_COLORS[level]}`}>
                            {level === 0 ? '-' : LEVEL_LABELS[level]}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 직원 상세 패널 */}
      {staffDetail && (
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-5 shadow-sm">
          <h4 className="text-sm font-bold text-[var(--foreground)] mb-3">{staffDetail.name} 스킬 프로필</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {allSkills.filter(skill => (staffSkills[skill] ?? 0) > 0).map(skill => {
              const level = staffSkills[skill];
              return (
                <div key={skill} className="flex items-center justify-between p-2.5 bg-[var(--toss-gray-1)] rounded-[10px]">
                  <span className="text-xs font-medium text-[var(--foreground)]">{skill}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${LEVEL_COLORS[level]}`}>{LEVEL_LABELS[level]}</span>
                </div>
              );
            })}
            {Object.values(staffSkills).filter(v => v > 0).length === 0 && (
              <p className="col-span-3 text-xs text-[var(--toss-gray-3)] text-center py-4">등록된 스킬이 없습니다.</p>
            )}
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className="flex flex-wrap gap-2">
        {LEVELS.filter(l => l > 0).map(l => (
          <span key={l} className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${LEVEL_COLORS[l]}`}>{l} {LEVEL_LABELS[l]}</span>
        ))}
      </div>
    </div>
  );
}
