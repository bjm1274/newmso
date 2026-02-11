'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type PayrollSlipDesign = {
  title: string;
  subtitle: string;
  companyLabel: string;
  primaryColor: string;
  borderColor: string;
  footerText: string;
  showSignArea: boolean;
};

const DEFAULT_DESIGN: PayrollSlipDesign = {
  title: '급여명세서',
  subtitle: '월별 급여 내역서',
  companyLabel: '박철홍정형외과',
  primaryColor: '#2563eb',
  borderColor: '#e5e7eb',
  footerText: '위 금액을 수령하였습니다.',
  showSignArea: true,
};

/** 관리자: 급여명세서 서식(디자인) 관리 */
export default function PayrollSlipDesignManager() {
  const [design, setDesign] = useState<PayrollSlipDesign>(DEFAULT_DESIGN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('*')
          .eq('key', 'payroll_slip_design')
          .maybeSingle();

        if (error) {
          console.error('급여명세서 서식 설정 조회 실패:', error);
          return;
        }

        if (data?.value) {
          try {
            const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            setDesign({
              ...DEFAULT_DESIGN,
              ...(parsed || {}),
            });
          } catch (e) {
            console.warn('payroll_slip_design JSON 파싱 실패, 기본값 사용:', e);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (field: keyof PayrollSlipDesign, value: string | boolean) => {
    setDesign((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        key: 'payroll_slip_design',
        value: JSON.stringify(design),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('system_settings')
        .upsert(payload, { onConflict: 'key' });

      if (error) {
        console.error(error);
        alert('저장에 실패했습니다. (DB 설정을 확인해주세요)');
        return;
      }
      alert('급여명세서 서식이 저장되었습니다.');
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-gray-800">급여명세서 서식 관리</h2>
          <p className="text-[11px] text-gray-500">
            PDF 급여명세서 상단 제목, 색상, 회사명, 하단 문구 등을 설정합니다.
          </p>
        </div>
        {loading && (
          <span className="text-[11px] text-gray-400 font-bold">불러오는 중...</span>
        )}
      </div>

      {/* 설정 폼 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-black text-gray-500">제목</span>
            <input
              type="text"
              value={design.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-black text-gray-500">부제 (설명)</span>
            <input
              type="text"
              value={design.subtitle}
              onChange={(e) => handleChange('subtitle', e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-black text-gray-500">회사명 라벨</span>
            <input
              type="text"
              value={design.companyLabel}
              onChange={(e) => handleChange('companyLabel', e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex gap-3">
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-[11px] font-black text-gray-500">대표 색상 (Primary)</span>
              <input
                type="text"
                value={design.primaryColor}
                onChange={(e) => handleChange('primaryColor', e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                placeholder="#2563eb"
              />
            </label>
            <label className="w-20 flex flex-col gap-1">
              <span className="text-[11px] font-black text-gray-500">색상 미리보기</span>
              <span
                className="w-full h-9 rounded-xl border border-gray-200"
                style={{ backgroundColor: design.primaryColor }}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-black text-gray-500">테두리 색상</span>
            <input
              type="text"
              value={design.borderColor}
              onChange={(e) => handleChange('borderColor', e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              placeholder="#e5e7eb"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-black text-gray-500">하단 문구</span>
            <input
              type="text"
              value={design.footerText}
              onChange={(e) => handleChange('footerText', e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              placeholder="예: 위 금액을 수령하였습니다."
            />
          </label>
          <label className="inline-flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={design.showSignArea}
              onChange={(e) => handleChange('showSignArea', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-[11px] font-bold text-gray-600">
              하단에 서명란(직원 서명) 표시
            </span>
          </label>
        </div>
      </div>

      {/* 미리보기 */}
      <div className="mt-2 border border-dashed border-gray-200 rounded-2xl p-4 bg-gray-50">
        <p className="text-[11px] font-black text-gray-400 mb-2 uppercase tracking-widest">
          Preview
        </p>
        <div
          className="bg-white rounded-2xl p-4 text-xs font-bold"
          style={{ borderColor: design.borderColor || '#e5e7eb', borderWidth: 1 }}
        >
          <div
            className="mb-1 text-sm font-extrabold"
            style={{ color: design.primaryColor || '#2563eb' }}
          >
            {design.title || '급여명세서'}
          </div>
          <div className="mb-3 text-[11px] text-gray-500">
            {design.subtitle || '월별 급여 내역서'} · {design.companyLabel || '회사명'}
          </div>
          <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between text-[11px] text-gray-600">
            <span>기본급 / 공제 / 실지급액 요약</span>
            <span style={{ color: design.primaryColor || '#2563eb' }}>실지급액 0원</span>
          </div>
          {design.footerText && (
            <div className="mt-3 text-[10px] text-gray-400">
              {design.footerText}
            </div>
          )}
          {design.showSignArea && (
            <div className="mt-4 pt-3 border-t border-dotted border-gray-200 flex justify-end text-[10px] text-gray-500">
              <span>
                직원 서명: ____________________
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[12px] font-black hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? '저장 중...' : '급여명세서 서식 저장'}
        </button>
      </div>
    </div>
  );
}

