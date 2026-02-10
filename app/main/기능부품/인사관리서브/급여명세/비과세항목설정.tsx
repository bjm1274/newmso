'use client';
import { useState, useEffect } from 'react';
import {
  fetchTaxFreeSettings,
  saveTaxFreeSettings,
  DEFAULT_SETTINGS,
  TAX_FREE_LEGAL_LIMITS_2024,
  type TaxFreeSettings,
} from '@/lib/use-tax-free-settings';

const ITEMS: { key: keyof TaxFreeSettings; label: string; basis: string }[] = [
  { key: 'meal_limit', label: '식대·식사비', basis: '소득세법 시행령' },
  { key: 'vehicle_limit', label: '자가운전보조금', basis: '소득세법' },
  { key: 'childcare_limit', label: '보육수당', basis: '근로기준법' },
  { key: 'research_limit', label: '연구활동비', basis: '소득세법' },
  { key: 'uniform_limit', label: '출장·업무용복', basis: '소득세법' },
  { key: 'congratulations_limit', label: '경조사비 (연1회)', basis: '소득세법' },
  { key: 'housing_limit', label: '기숙사·숙박비', basis: '소득세법' },
  { key: 'other_taxfree_limit', label: '기타 비과세', basis: '자체 설정' },
];

export default function TaxFreeSettingsPanel({ companyName, onSaved }: { companyName?: string; onSaved?: () => void }) {
  const [settings, setSettings] = useState<TaxFreeSettings>(DEFAULT_SETTINGS);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const co = companyName || '전체';

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      const s = await fetchTaxFreeSettings(co, year);
      if (ok) setSettings(s);
      setLoading(false);
    })();
    return () => { ok = false; };
  }, [co, year]);

  const update = (key: keyof TaxFreeSettings, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  };

  const resetToLegal = () => {
    setSettings({
      meal_limit: TAX_FREE_LEGAL_LIMITS_2024.meal.limit,
      vehicle_limit: TAX_FREE_LEGAL_LIMITS_2024.vehicle.limit,
      childcare_limit: TAX_FREE_LEGAL_LIMITS_2024.childcare.limit,
      research_limit: TAX_FREE_LEGAL_LIMITS_2024.research.limit,
      uniform_limit: TAX_FREE_LEGAL_LIMITS_2024.uniform.limit,
      congratulations_limit: TAX_FREE_LEGAL_LIMITS_2024.congratulations.limit,
      housing_limit: TAX_FREE_LEGAL_LIMITS_2024.housing.limit,
      other_taxfree_limit: 0,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveTaxFreeSettings(co, settings, year);
      alert('비과세 항목 설정이 저장되었습니다.');
      onSaved?.();
    } catch (e) {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem]">
        <p className="text-sm font-bold text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest mb-4">비과세 항목 설정</h3>
      <p className="text-[10px] text-gray-500 mb-4">법정 한도 내에서 회사별 비과세 한도를 조정할 수 있습니다. [{co}]</p>
      <div className="flex gap-2 mb-6">
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="p-2 border rounded-lg text-sm font-bold"
        >
          {[2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        <button onClick={resetToLegal} className="px-3 py-2 border border-gray-200 rounded-lg text-[10px] font-black text-gray-600 hover:bg-gray-50">
          법정 기준으로 초기화
        </button>
      </div>
      <div className="space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar">
        {ITEMS.map(({ key, label, basis }) => (
          <div key={key} className="flex items-center justify-between gap-4 py-2 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-xs font-black text-gray-800">{label}</p>
              <p className="text-[9px] text-gray-400">{basis}</p>
            </div>
            <input
              type="number"
              value={settings[key]}
              onChange={(e) => update(key, parseInt(e.target.value) || 0)}
              className="w-28 p-2 border rounded-lg text-sm font-black text-right"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full mt-4 py-3 bg-emerald-600 text-white text-[10px] font-black rounded-xl hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? '저장 중...' : '설정 저장'}
      </button>
    </div>
  );
}
