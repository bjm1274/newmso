'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type TemplateDesign = {
  title?: string;
  subtitle?: string;
  companyLabel?: string;
  primaryColor?: string;
  borderColor?: string;
  footerText?: string;
  showSignArea?: boolean;
  // 미리보기에서 제목 위치(%) – 마우스로 클릭해서 조정
  titleXPercent?: number;
  titleYPercent?: number;
  // 부제 위치
  subtitleXPercent?: number;
  subtitleYPercent?: number;
  // 서명 영역 위치
  signXPercent?: number;
  signYPercent?: number;
};

const DEFAULT_DESIGN: TemplateDesign = {
  title: '서식 제목',
  subtitle: '설명 또는 부제목',
  companyLabel: '박철홍정형외과',
  primaryColor: '#2563eb',
  borderColor: '#e5e7eb',
  footerText: '',
  showSignArea: true,
  titleXPercent: 8,
  titleYPercent: 12,
  subtitleXPercent: 8,
  subtitleYPercent: 32,
  signXPercent: 75,
  signYPercent: 78,
};

const builtinTemplates = [
  { slug: 'payroll_slip', name: '급여명세서(급여 서식)' },
  { slug: 'annual_leave', name: '연차/휴가 신청서' },
  { slug: 'personnel_order', name: '인사명령서' },
];

/** 관리자: 전자결재 서식/양식 + 디자인 통합 관리 */
export default function ApprovalFormTypesManager() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [addName, setAddName] = useState('');
  const [addSlug, setAddSlug] = useState('');

  // 서식 디자인 관리용 상태
  const [designs, setDesigns] = useState<any>({});
  const [designLoading, setDesignLoading] = useState(true);
  const [savingDesign, setSavingDesign] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>('payroll_slip');
  const [selectedName, setSelectedName] = useState<string>('급여명세서(급여 서식)');
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<'title' | 'subtitle' | 'sign'>('title');

  const fetchList = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('approval_form_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error) setList(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchList();
  }, []);

  // 디자인 전체 로딩
  useEffect(() => {
    const loadDesigns = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('*')
          .eq('key', 'form_template_designs')
          .maybeSingle();

        if (!error && data?.value) {
          try {
            const parsed =
              typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            setDesigns(parsed || {});
          } catch (e) {
            console.warn('form_template_designs JSON 파싱 실패:', e);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setDesignLoading(false);
      }
    };

    loadDesigns();
  }, []);

  const slugFromName = (name: string) =>
    name.replace(/\s+/g, '').replace(/[^\w가-힣a-zA-Z0-9]/g, '') || 'custom';

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return alert('양식 이름을 입력하세요.');
    const slug = (addSlug.trim() || slugFromName(name)).slice(0, 50);
    if (slug === 'payroll_slip' || name.includes('급여명세')) {
      alert('급여명세서는 기본 서식으로 고정되어 있어, 별도로 추가할 수 없습니다.');
      return;
    }
    const { error } = await supabase.from('approval_form_types').insert({
      name,
      slug,
      sort_order: list.length,
      is_active: true,
    });
    if (error) {
      alert('추가 실패: ' + error.message);
      return;
    }
    setAddName('');
    setAddSlug('');
    fetchList();
  };

  const startEdit = (row: any) => {
    setEditingId(row.id);
    setEditName(row.name);
    setEditSlug(row.slug || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return alert('이름을 입력하세요.');
    const slug = (editSlug.trim() || slugFromName(name)).slice(0, 50);
    const { error } = await supabase
      .from('approval_form_types')
      .update({ name, slug, updated_at: new Date().toISOString() })
      .eq('id', editingId);
    if (error) {
      alert('수정 실패: ' + error.message);
      return;
    }
    setEditingId(null);
    fetchList();
  };

  const toggleActive = async (row: any) => {
    const { error } = await supabase
      .from('approval_form_types')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (!error) fetchList();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 양식을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('approval_form_types').delete().eq('id', id);
    if (!error) fetchList();
    else alert('삭제 실패: ' + error.message);
  };

  const combinedTemplates = [
    ...builtinTemplates,
    ...list
      .filter((row: any) => !builtinTemplates.some(b => b.slug === row.slug))
      .map((row: any) => ({ slug: row.slug || String(row.id), name: row.name })),
  ];

  const currentDesign: TemplateDesign =
    selectedSlug && designs[selectedSlug]
      ? { ...DEFAULT_DESIGN, ...designs[selectedSlug] }
      : { ...DEFAULT_DESIGN };

  const handleSelectTemplate = (slug: string, name: string) => {
    setSelectedSlug(slug);
    setSelectedName(name);
  };

  const updateCurrentDesign = (field: keyof TemplateDesign, value: string | boolean | number) => {
    if (!selectedSlug) return;
    setDesigns((prev: any) => ({
      ...prev,
      [selectedSlug]: {
        ...DEFAULT_DESIGN,
        ...(prev?.[selectedSlug] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveDesign = async () => {
    if (!selectedSlug) {
      alert('먼저 디자인할 서식을 선택하세요.');
      return;
    }
    setSavingDesign(true);
    try {
      const payload = {
        key: 'form_template_designs',
        value: JSON.stringify(designs || {}),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('system_settings')
        .upsert(payload, { onConflict: 'key' });

      if (error) {
        console.error(error);
        alert('서식 디자인 저장에 실패했습니다. (system_settings 테이블을 확인해 주세요)');
        return;
      }
      alert('선택한 서식의 디자인이 저장되었습니다.');
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingDesign(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[var(--foreground)]">서식양식 관리</h2>
        <p className="text-xs text-[var(--toss-gray-3)] mt-1">
          전자결재에서 사용할 서식/양식을 관리하고, 각 서식의 디자인(제목, 색상, 하단 문구 등)을 설정합니다.
          여기서 추가한 양식은 전자결재 작성하기 탭에 함께 표시됩니다.
        </p>
      </div>

      {/* 추가 */}
      <div className="bg-white p-6 rounded-lg border border-[var(--toss-border)] shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">양식 추가</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">표시 이름</label>
            <input
              type="text"
              value={addName}
              onChange={e => {
                setAddName(e.target.value);
                if (!addSlug) setAddSlug(slugFromName(e.target.value));
              }}
              placeholder="예: 외부출장신청"
              className="w-48 md:w-56 p-3 rounded-xl border border-[var(--toss-border)] text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[var(--toss-gray-3)] mb-1">양식 코드(slug)</label>
            <input
              type="text"
              value={addSlug}
              onChange={e => setAddSlug(e.target.value)}
              placeholder="자동 생성 또는 입력"
              className="w-40 md:w-48 p-3 rounded-xl border border-[var(--toss-border)] text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-5 py-3 bg-[var(--toss-blue)] text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
          >
            추가
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-lg border border-[var(--toss-border)] shadow-sm overflow-hidden">
        <h3 className="text-sm font-semibold text-[var(--foreground)] p-4 border-b border-gray-50">등록된 추가 양식</h3>
        {loading ? (
          <div className="p-8 text-center text-[var(--toss-gray-3)]">로딩 중...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-[var(--toss-gray-3)]">추가 양식이 없습니다. 위에서 새로 등록하세요.</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {list.map(row => (
              <li key={row.id} className="flex items-center justify-between gap-4 p-4 hover:bg-[var(--toss-gray-1)]/50">
                {editingId === row.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 p-2 rounded-lg border text-sm font-bold"
                    />
                    <input
                      value={editSlug}
                      onChange={e => setEditSlug(e.target.value)}
                      className="w-32 p-2 rounded-lg border text-xs"
                      placeholder="slug"
                    />
                    <button onClick={saveEdit} className="px-3 py-1.5 bg-[var(--toss-blue)] text-white rounded-lg text-xs font-bold">저장</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-[var(--toss-gray-2)] rounded-lg text-xs">취소</button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <span className="font-bold text-[var(--foreground)]">{row.name}</span>
                      <span className="ml-2 text-xs text-[var(--toss-gray-3)]">{row.slug}</span>
                      {!row.is_active && <span className="ml-2 text-xs text-red-500">(비활성)</span>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleActive(row)} className="px-3 py-1.5 bg-[var(--toss-gray-1)] rounded-lg text-xs font-bold hover:bg-[var(--toss-gray-2)]">
                        {row.is_active ? '비활성' : '활성'}
                      </button>
                      <button onClick={() => startEdit(row)} className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold">수정</button>
                      <button onClick={() => handleDelete(row.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold">삭제</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 서식 디자인 설정 */}
      <div className="bg-white rounded-lg border border-[var(--toss-border)] shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">서식 디자인 설정</h3>
            <p className="text-[11px] text-[var(--toss-gray-3)]">
              좌측에서 서식을 선택한 뒤, 우측에서 제목/색상/하단 문구 등을 조정합니다. 급여명세서 서식도 여기에서 함께 관리됩니다.
            </p>
          </div>
          {designLoading && (
            <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">디자인 불러오는 중...</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
          {/* 서식 목록 (서식 선택) */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">디자인 대상 서식 선택</p>
            <div className="border border-[var(--toss-border)] rounded-lg bg-[var(--toss-gray-1)]/60 max-h-64 overflow-y-auto custom-scrollbar">
              {combinedTemplates.length === 0 ? (
                <div className="p-4 text-[11px] text-[var(--toss-gray-3)] text-center">
                  등록된 서식이 없습니다. 위에서 먼저 양식을 추가하세요.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--toss-border)]">
                  {combinedTemplates.map((tpl) => {
                    const isBuiltin = builtinTemplates.some(b => b.slug === tpl.slug);
                    const active = selectedSlug === tpl.slug;
                    return (
                      <li key={tpl.slug}>
                        <button
                          type="button"
                          onClick={() => handleSelectTemplate(tpl.slug, tpl.name)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left text-[12px] font-bold transition-all ${
                            active
                              ? 'bg-white text-[var(--toss-blue)] shadow-sm'
                              : 'text-[var(--toss-gray-4)] hover:bg-white/80'
                          }`}
                        >
                          <span className="truncate">{tpl.name}</span>
                          {isBuiltin && (
                            <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-semibold">
                              기본
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* 디자인 폼 + 미리보기 */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                  선택된 서식
                </p>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {selectedName || '서식을 선택해 주세요'}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-[var(--toss-gray-1)] border border-[var(--toss-border)] rounded-full px-1 py-1">
                {(['title', 'subtitle', 'sign'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveHandle(k)}
                    className={`px-3 py-1 rounded-full text-[10px] font-semibold transition-all ${
                      activeHandle === k
                        ? 'bg-[var(--toss-blue)] text-white'
                        : 'text-[var(--toss-gray-3)] hover:bg-white'
                    }`}
                  >
                    {k === 'title' && '제목 위치'}
                    {k === 'subtitle' && '부제 위치'}
                    {k === 'sign' && '서명 위치'}
                  </button>
                ))}
              </div>
            </div>

            {/* 입력 폼 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
              <div className="space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">제목</span>
                  <input
                    type="text"
                    value={currentDesign.title || ''}
                    onChange={(e) => updateCurrentDesign('title', e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">부제 (설명)</span>
                  <input
                    type="text"
                    value={currentDesign.subtitle || ''}
                    onChange={(e) => updateCurrentDesign('subtitle', e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">회사명 라벨</span>
                  <input
                    type="text"
                    value={currentDesign.companyLabel || ''}
                    onChange={(e) => updateCurrentDesign('companyLabel', e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <label className="flex-1 flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                      대표 색상 (Primary)
                    </span>
                    <input
                      type="text"
                      value={currentDesign.primaryColor || ''}
                      onChange={(e) => updateCurrentDesign('primaryColor', e.target.value)}
                      className="px-3 py-2 rounded-xl border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                      placeholder="#2563eb"
                    />
                  </label>
                  <label className="w-20 flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">색상</span>
                    <span
                      className="w-full h-9 rounded-xl border border-[var(--toss-border)]"
                      style={{ backgroundColor: currentDesign.primaryColor || '#2563eb' }}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">테두리 색상</span>
                  <input
                    type="text"
                    value={currentDesign.borderColor || ''}
                    onChange={(e) => updateCurrentDesign('borderColor', e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                    placeholder="#e5e7eb"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">하단 문구</span>
                  <input
                    type="text"
                    value={currentDesign.footerText || ''}
                    onChange={(e) => updateCurrentDesign('footerText', e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[var(--toss-border)] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400"
                    placeholder="예: 위 내용과 금액을 확인하였습니다."
                  />
                </label>
                <label className="inline-flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    checked={currentDesign.showSignArea !== false}
                    onChange={(e) => updateCurrentDesign('showSignArea', e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--toss-border)]"
                  />
                  <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">
                    하단에 서명란(직원/결재자 서명) 표시
                  </span>
                </label>
              </div>
            </div>

            {/* 미리보기 – 클릭으로 제목/부제/서명 위치 조정 */}
            <div className="mt-1 border border-dashed border-[var(--toss-border)] rounded-lg p-4 bg-[var(--toss-gray-1)]">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                  Preview
                </p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">
                  미리보기 안을 클릭하면{' '}
                  <span className="font-bold">
                    {activeHandle === 'title'
                      ? '제목'
                      : activeHandle === 'subtitle'
                      ? '부제'
                      : '서명'}
                  </span>
                  {' '}위치가 이동합니다.
                </p>
              </div>
              <div
                ref={previewRef}
                className="bg-white rounded-lg text-xs font-bold relative overflow-hidden cursor-pointer"
                style={{
                  borderColor: currentDesign.borderColor || '#e5e7eb',
                  borderWidth: 1,
                  padding: 16,
                  height: 180,
                }}
                onClick={(e) => {
                  if (!previewRef.current || !selectedSlug) return;
                  const rect = previewRef.current.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  // 0~100 범위로 클램프
                  const clampedX = Math.max(0, Math.min(100, x));
                  const clampedY = Math.max(0, Math.min(100, y));
                  const vx = Number(clampedX.toFixed(1));
                  const vy = Number(clampedY.toFixed(1));
                  if (activeHandle === 'title') {
                    updateCurrentDesign('titleXPercent', vx);
                    updateCurrentDesign('titleYPercent', vy);
                  } else if (activeHandle === 'subtitle') {
                    updateCurrentDesign('subtitleXPercent', vx);
                    updateCurrentDesign('subtitleYPercent', vy);
                  } else if (activeHandle === 'sign') {
                    updateCurrentDesign('signXPercent', vx);
                    updateCurrentDesign('signYPercent', vy);
                  }
                }}
              >
                {/* 제목(절대 위치) */}
                <div
                  className="absolute text-sm font-extrabold select-none"
                  style={{
                    color: currentDesign.primaryColor || '#2563eb',
                    top: `${currentDesign.titleYPercent ?? 12}%`,
                    left: `${currentDesign.titleXPercent ?? 8}%`,
                    transform: 'translate(-0%, -0%)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {currentDesign.title || '서식 제목'}
                </div>

                {/* 부제/회사 라벨 – 위치 조정 가능 */}
                <div
                  className="absolute text-[11px] text-[var(--toss-gray-3)] select-none"
                  style={{
                    top: `${currentDesign.subtitleYPercent ?? 32}%`,
                    left: `${currentDesign.subtitleXPercent ?? 8}%`,
                    transform: 'translate(-0%, -0%)',
                  }}
                >
                  <div className="mb-1">
                    {(currentDesign.subtitle || '설명 또는 부제목')}{' '}
                    · {currentDesign.companyLabel || '박철홍정형외과'}
                  </div>
                </div>

                {/* 본문/하단 예시 */}
                <div className="absolute left-4 right-4 top-24 text-[11px] text-[var(--toss-gray-3)]">
                  <div className="border-t border-[var(--toss-border)] pt-2 mt-1 flex justify-between text-[11px] text-[var(--toss-gray-4)]">
                    <span>본문 내용 영역 예시</span>
                    <span style={{ color: currentDesign.primaryColor || '#2563eb' }}>
                      중요 수치/상태
                    </span>
                  </div>
                  {currentDesign.footerText && (
                    <div className="mt-3 text-[10px] text-[var(--toss-gray-3)]">
                      {currentDesign.footerText}
                    </div>
                  )}
                  {currentDesign.showSignArea !== false && (
                    <div
                      className="absolute text-[10px] text-[var(--toss-gray-3)] select-none"
                      style={{
                        top: `${currentDesign.signYPercent ?? 78}%`,
                        left: `${currentDesign.signXPercent ?? 75}%`,
                        transform: 'translate(-0%, -0%)',
                      }}
                    >
                      <span>서명: ____________________</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveDesign}
                disabled={savingDesign}
                className="px-5 py-2.5 rounded-xl bg-[var(--toss-blue)] text-white text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingDesign ? '디자인 저장 중...' : '선택 서식 디자인 저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
