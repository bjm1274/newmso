import { useState, useEffect } from 'react';
import {
  fetchTaxFreeSettings,
  saveTaxFreeSettings,
  DEFAULT_SETTINGS,
  TAX_FREE_LEGAL_LIMITS,
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
      meal_limit: TAX_FREE_LEGAL_LIMITS.meal.limit,
      vehicle_limit: TAX_FREE_LEGAL_LIMITS.vehicle.limit,
      childcare_limit: TAX_FREE_LEGAL_LIMITS.childcare.limit,
      research_limit: TAX_FREE_LEGAL_LIMITS.research.limit,
      uniform_limit: TAX_FREE_LEGAL_LIMITS.uniform.limit,
      congratulations_limit: TAX_FREE_LEGAL_LIMITS.congratulations.limit,
      housing_limit: TAX_FREE_LEGAL_LIMITS.housing.limit,
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
      <div className="border border-[var(--toss-border)] p-5 bg-[var(--toss-card)] rounded-[12px]">
        <p className="text-sm font-medium text-[var(--toss-gray-3)]">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--toss-border)] p-5 bg-[var(--toss-card)] rounded-[12px] shadow-sm">
      <div className="pb-3 border-b border-[var(--toss-border)] mb-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">비과세 항목 설정</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">법정 한도 내 회사별 한도 조정 [{co}]</p>
      </div>
      <div className="flex gap-2 mb-4">
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium"
        >
          {[2025, 2026].map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        <button onClick={resetToLegal} className="px-3 py-2 border border-[var(--toss-border)] rounded-md text-xs font-medium text-[var(--toss-gray-4)] hover:bg-[var(--toss-gray-1)]">
          법정 기준 초기화
        </button>
      </div>
      <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar">
        {ITEMS.map(({ key, label, basis }) => (
          <div key={key} className="flex items-center justify-between gap-4 py-2 border-b border-[var(--toss-border)] last:border-0">
            <div>
              <p className="text-xs font-medium text-[var(--foreground)]">{label}</p>
              <p className="text-[11px] text-[var(--toss-gray-3)]">{basis}</p>
            </div>
            <input type="number" value={settings[key]} onChange={(e) => update(key, parseInt(e.target.value) || 0)} className="w-24 h-9 px-2 border border-[var(--toss-border)] rounded-md text-sm font-medium text-right" />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving} className="w-full mt-4 py-3 bg-[var(--toss-blue)] text-white text-sm font-medium rounded-[12px] hover:opacity-90 disabled:opacity-50">
        {saving ? '저장 중...' : '저장하기'}
      </button>
    </div>
  );
}
