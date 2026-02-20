'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Template = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  body_part?: string | null;
};

// 부위 목록 (게시판 사람 모형·필터와 동일: 아래팔/위팔만, 손·손가락·팔꿈치 제외)
const BODY_PARTS = [
  { id: 'cervical', label: '경추/목' },
  { id: 'chest', label: '흉부/가슴' },
  { id: 'lumbar', label: '요추/허리' },
  { id: 'shoulder', label: '어깨' },
  { id: 'upper_arm', label: '위팔' },
  { id: 'forearm', label: '아래팔' },
  { id: 'hip', label: '고관절/골반' },
  { id: 'knee', label: '무릎' },
  { id: 'ankle', label: '발목/발' },
  { id: 'other', label: '기타' },
];

export default function SurgeryExamTemplateManager() {
  const [surgeryTemplates, setSurgeryTemplates] = useState<Template[]>([]);
  const [mriTemplates, setMriTemplates] = useState<Template[]>([]);
  const [newSurgeryName, setNewSurgeryName] = useState('');
  const [newMriName, setNewMriName] = useState('');
  const [newSurgeryPart, setNewSurgeryPart] = useState<string>(BODY_PARTS[0].id);
  const [newMriPart, setNewMriPart] = useState<string>(BODY_PARTS[0].id);
  const [loading, setLoading] = useState(false);

  const loadAll = async () => {
    try {
      const [{ data: s }, { data: m }] = await Promise.all([
        supabase
          .from('surgery_templates')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase.from('mri_templates').select('*').order('sort_order', {
          ascending: true,
        }),
      ]);
      setSurgeryTemplates((s || []) as Template[]);
      setMriTemplates((m || []) as Template[]);
    } catch (e) {
      console.error('템플릿 로딩 실패', e);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const addTemplate = async (type: 'surgery' | 'mri') => {
    const name = type === 'surgery' ? newSurgeryName.trim() : newMriName.trim();
    if (!name) {
      alert('항목 이름을 입력해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const table = type === 'surgery' ? 'surgery_templates' : 'mri_templates';
      const list = type === 'surgery' ? surgeryTemplates : mriTemplates;
      const bodyPart = type === 'surgery' ? newSurgeryPart : newMriPart;
      const maxSort =
        list.length > 0 ? Math.max(...list.map((t) => t.sort_order || 0)) : 0;
      const { error } = await supabase.from(table).insert([
        {
          name,
          sort_order: maxSort + 1,
          is_active: true,
          body_part: bodyPart || null,
        },
      ]);
      if (error) throw error;
      if (type === 'surgery') {
        setNewSurgeryName('');
      } else {
        setNewMriName('');
      }
      await loadAll();
    } catch (e) {
      console.error('템플릿 추가 실패', e);
      alert('항목 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const removeTemplate = async (type: 'surgery' | 'mri', id: string) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      const table = type === 'surgery' ? 'surgery_templates' : 'mri_templates';
      await supabase.from(table).delete().eq('id', id);
      await loadAll();
    } catch (e) {
      console.error('템플릿 삭제 실패', e);
      alert('항목 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (type: 'surgery' | 'mri', tmpl: Template) => {
    setLoading(true);
    try {
      const table = type === 'surgery' ? 'surgery_templates' : 'mri_templates';
      await supabase
        .from(table)
        .update({ is_active: !tmpl.is_active })
        .eq('id', tmpl.id);
      await loadAll();
    } catch (e) {
      console.error('템플릿 상태 변경 실패', e);
      alert('활성/비활성 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm space-y-8">
      <h2 className="text-xl font-black text-gray-900 tracking-tighter mb-2">
        수술 · 검사명 템플릿 관리
      </h2>
      <p className="text-[11px] text-gray-500 font-bold">
        수술일정표 / MRI일정표 작성 시 드롭다운으로 선택할 수 있는 수술명·검사명
        목록을 관리합니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 수술 템플릿 */}
        <section className="space-y-3">
          <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
            <span className="text-lg">🏥</span>
            수술명 템플릿
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-[11px] font-black text-gray-600 shrink-0">부위 선택</span>
              <select
                value={newSurgeryPart}
                onChange={(e) => setNewSurgeryPart(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold bg-white min-w-[160px]"
              >
                {BODY_PARTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                value={newSurgeryName}
                onChange={(e) => setNewSurgeryName(e.target.value)}
                placeholder="예: 전방십자인대 재건술"
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => addTemplate('surgery')}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-black disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
          <div className="border border-gray-100 rounded-2xl p-3 max-h-64 overflow-y-auto custom-scrollbar space-y-1 bg-gray-50/40">
            {surgeryTemplates.length === 0 ? (
              <p className="text-[11px] text-gray-400 font-bold text-center py-4">
                등록된 수술명 템플릿이 없습니다.
              </p>
            ) : (
              surgeryTemplates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-gray-100 text-[11px]"
                >
                  <span
                    className={`flex-1 truncate font-bold ${
                      t.is_active ? 'text-gray-800' : 'text-gray-300 line-through'
                    }`}
                  >
                    {t.name}
                    {t.body_part && (
                      <span className="ml-1.5 text-[9px] font-normal text-gray-400">
                        ({BODY_PARTS.find((p) => p.id === t.body_part)?.label ?? t.body_part})
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleActive('surgery', t)}
                    className="px-2 py-1 rounded-lg text-[10px] font-black border border-gray-200 text-gray-500 hover:bg-gray-100"
                  >
                    {t.is_active ? '숨기기' : '보이기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTemplate('surgery', t.id)}
                    className="px-2 py-1 rounded-lg text-[10px] font-black text-red-500 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* MRI 템플릿 */}
        <section className="space-y-3">
          <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
            <span className="text-lg">🔬</span>
            MRI 검사명 템플릿
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-[11px] font-black text-gray-600 shrink-0">부위 선택</span>
              <select
                value={newMriPart}
                onChange={(e) => setNewMriPart(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold bg-white min-w-[160px]"
              >
                {BODY_PARTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                value={newMriName}
                onChange={(e) => setNewMriName(e.target.value)}
                placeholder="예: 요추부 MRI"
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => addTemplate('mri')}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-black disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
          <div className="border border-gray-100 rounded-2xl p-3 max-h-64 overflow-y-auto custom-scrollbar space-y-1 bg-gray-50/40">
            {mriTemplates.length === 0 ? (
              <p className="text-[11px] text-gray-400 font-bold text-center py-4">
                등록된 검사명 템플릿이 없습니다.
              </p>
            ) : (
              mriTemplates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-gray-100 text-[11px]"
                >
                  <span
                    className={`flex-1 truncate font-bold ${
                      t.is_active ? 'text-gray-800' : 'text-gray-300 line-through'
                    }`}
                  >
                    {t.name}
                    {t.body_part && (
                      <span className="ml-1.5 text-[9px] font-normal text-gray-400">
                        ({BODY_PARTS.find((p) => p.id === t.body_part)?.label ?? t.body_part})
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleActive('mri', t)}
                    className="px-2 py-1 rounded-lg text-[10px] font-black border border-gray-200 text-gray-500 hover:bg-gray-100"
                  >
                    {t.is_active ? '숨기기' : '보이기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTemplate('mri', t.id)}
                    className="px-2 py-1 rounded-lg text-[10px] font-black text-red-500 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

