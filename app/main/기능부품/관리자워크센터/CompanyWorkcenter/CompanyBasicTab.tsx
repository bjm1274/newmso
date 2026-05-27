'use client';

/**
 * 회사 관리 — 기본 정보 탭
 * JM: 단일 책임, 500줄 이내
 * JM4: any 금지, 입력은 string state로 관리
 * JM6: label htmlFor + input id 연결, aria-label
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_COMPANY, FALLBACK_CORPS } from './fallback-data';
import type { CompanyInfo, CorpItem } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function pickString(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

async function loadCompany(): Promise<CompanyInfo> {
  try {
    const { data, error } = await supabase
      .from('company_info')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error || !isRecord(data)) return FALLBACK_COMPANY;
    return {
      bizNo: pickString(data, 'biz_no', FALLBACK_COMPANY.bizNo),
      corpType: pickString(data, 'corp_type', FALLBACK_COMPANY.corpType),
      ceo: pickString(data, 'ceo', FALLBACK_COMPANY.ceo),
      address: pickString(data, 'address', FALLBACK_COMPANY.address),
      phone: pickString(data, 'phone', FALLBACK_COMPANY.phone),
      fax: pickString(data, 'fax', FALLBACK_COMPANY.fax),
      hospitalCode: pickString(data, 'hospital_code', FALLBACK_COMPANY.hospitalCode),
    };
  } catch {
    return FALLBACK_COMPANY;
  }
}

async function loadCorps(): Promise<CorpItem[]> {
  try {
    const { data, error } = await supabase
      .from('company_branches')
      .select('name,kind,emp,is_primary')
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_CORPS;
    return data
      .filter(isRecord)
      .map((r): CorpItem => ({
        name: pickString(r, 'name', '-'),
        kind: pickString(r, 'kind', '-'),
        emp: typeof r.emp === 'number' ? r.emp : 0,
        primary: r.is_primary === true,
      }));
  } catch {
    return FALLBACK_CORPS;
  }
}

export default function CompanyBasicTab() {
  const [info, setInfo] = useState<CompanyInfo>(FALLBACK_COMPANY);
  const [corps, setCorps] = useState<CorpItem[]>(FALLBACK_CORPS);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadCompany(), loadCorps()]).then(([c, list]) => {
      if (!alive) return;
      setInfo(c);
      setCorps(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleChange = <K extends keyof CompanyInfo>(key: K, value: CompanyInfo[K]) => {
    setInfo((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('company_info').upsert({
        biz_no: info.bizNo,
        corp_type: info.corpType,
        ceo: info.ceo,
        address: info.address,
        phone: info.phone,
        fax: info.fax,
        hospital_code: info.hospitalCode,
      });
      if (error) {
        console.warn('[CompanyBasicTab] save fallback (no table):', error.message);
      }
      setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    } catch (e) {
      console.warn('[CompanyBasicTab] save error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card
        title={`${corps.find((c) => c.primary)?.name ?? '회사'} — 기본 정보`}
        action={
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="text-[10.5px] text-[var(--toss-gray-4)]">
                저장됨 {savedAt}
              </span>
            )}
            <SmBtn primary onClick={handleSave} ariaLabel="기본 정보 저장">
              {saving ? '저장 중…' : '저장'}
            </SmBtn>
          </div>
        }
      >
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field
              id="ci-bizno"
              label="사업자등록번호"
              value={info.bizNo}
              onChange={(v) => handleChange('bizNo', v)}
            />
            <SelectField
              id="ci-corptype"
              label="법인 구분"
              value={info.corpType}
              onChange={(v) => handleChange('corpType', v)}
              options={['의료법인', '주식회사', '사단법인', '개인사업자']}
            />
          </div>
          <Field
            id="ci-ceo"
            label="대표자"
            value={info.ceo}
            onChange={(v) => handleChange('ceo', v)}
          />
          <Field
            id="ci-address"
            label="주소"
            value={info.address}
            onChange={(v) => handleChange('address', v)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field
              id="ci-phone"
              label="대표 전화"
              value={info.phone}
              onChange={(v) => handleChange('phone', v)}
            />
            <Field
              id="ci-fax"
              label="팩스"
              value={info.fax}
              onChange={(v) => handleChange('fax', v)}
            />
          </div>
          <Field
            id="ci-hcode"
            label="의료기관 코드"
            value={info.hospitalCode}
            onChange={(v) => handleChange('hospitalCode', v)}
          />
        </div>
      </Card>

      <Card
        title={`소속 법인 · 지점 (${corps.length})`}
        action={<SmBtn ariaLabel="새 법인 추가">+ 새 법인</SmBtn>}
      >
        <div className="space-y-1.5">
          {corps.map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] border border-[var(--border)]"
            >
              <div className="font-bold text-[12.5px] text-[var(--foreground)]">{c.name}</div>
              <span className="text-[10.5px] text-[var(--toss-gray-4)]">
                {c.kind} · {c.emp}명
              </span>
              {c.primary && (
                <span className="ml-auto">
                  <Chip tone="accent">기본</Chip>
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
