'use client';

/**
 * 회사 관리 — 계약 템플릿 탭
 * 양식 카드 그리드 (3열)
 */

import { useEffect, useState } from 'react';
import { d1 } from '@/lib/supabase';
import { Card, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_TEMPLATES } from './fallback-data';
import type { TemplateItem } from './types';
import ContractManager from '../../관리자전용서브/계약관리도구';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function formatDate(isoStr: unknown): string {
  if (typeof isoStr !== 'string') return '-';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  } catch {
    return '-';
  }
}

async function loadTemplates(): Promise<TemplateItem[]> {
  try {
    // 1. Fetch contract templates with correct schema columns
    const { data, error } = await d1
      .from('contract_templates')
      .select('company_name,updated_at')
      .limit(50);
    
    if (error || !Array.isArray(data) || data.length === 0) {
      return FALLBACK_TEMPLATES;
    }

    // 2. Fetch staff members to map staff_id -> company
    const { data: staffData } = await d1
      .from('staff_members')
      .select('id,company')
      .limit(1000);

    // 3. Fetch employment contracts to count usage
    const { data: contractData } = await d1
      .from('employment_contracts')
      .select('staff_id')
      .limit(1000);

    const staffCompanyMap = new Map<string, string>();
    if (Array.isArray(staffData)) {
      for (const s of staffData) {
        if (s && typeof s === 'object' && 'id' in s && 'company' in s) {
          staffCompanyMap.set(String(s.id), String(s.company));
        }
      }
    }

    const companyContractCountMap = new Map<string, number>();
    let totalContracts = 0;
    if (Array.isArray(contractData)) {
      for (const c of contractData) {
        if (c && typeof c === 'object' && 'staff_id' in c) {
          totalContracts++;
          const co = staffCompanyMap.get(String(c.staff_id));
          if (co) {
            companyContractCountMap.set(co, (companyContractCountMap.get(co) || 0) + 1);
          }
        }
      }
    }

    // 4. Map DB rows to TemplateItem structure
    return data.filter(isRecord).map((r): TemplateItem => {
      const companyName = typeof r.company_name === 'string' ? r.company_name : '-';
      const name = companyName === '전체' ? '공통 표준계약서' : `${companyName} 표준계약서`;
      const used = companyName === '전체' ? totalContracts : (companyContractCountMap.get(companyName) || 0);
      return {
        name,
        version: 'v1.0',
        used,
        lastDate: formatDate(r.updated_at),
        companyName,
      };
    });
  } catch (err) {
    console.error('Error loading contract templates:', err);
    return FALLBACK_TEMPLATES;
  }
}

export default function CompanyTemplateTab() {
  const [items, setItems] = useState<TemplateItem[]>(FALLBACK_TEMPLATES);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadTemplates().then((d) => {
      if (alive) setItems(d);
    });
    return () => {
      alive = false;
    };
  }, [editingCompany]);

  if (editingCompany !== null) {
    return (
      <ContractManager
        initialCompany={editingCompany}
        onBack={() => setEditingCompany(null)}
      />
    );
  }

  return (
    <Card
      title={`계약 템플릿 (${items.length})`}
      action={
        <SmBtn
          primary
          ariaLabel="새 템플릿 추가"
          onClick={() => setEditingCompany('전체')}
        >
          + 새 템플릿
        </SmBtn>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {items.map((t) => (
          <div
            key={t.name}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 hover:border-[var(--accent)]/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="font-bold text-[12.5px] text-[var(--foreground)] line-clamp-2">
                {t.name}
              </div>
              <SmBtn
                ariaLabel={`${t.name} 편집`}
                onClick={() => setEditingCompany(t.companyName)}
              >
                편집
              </SmBtn>
            </div>
            <div className="text-[10.5px] text-[var(--toss-gray-4)]">
              <span className="tabular-nums">{t.version}</span>
              <span className="mx-1">·</span>
              <span>사용 {t.used}회</span>
              <span className="mx-1">·</span>
              <span>최근 {t.lastDate}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
