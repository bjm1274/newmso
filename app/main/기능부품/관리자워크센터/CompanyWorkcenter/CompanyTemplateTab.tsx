'use client';

/**
 * 회사 관리 — 계약 템플릿 탭
 * 양식 카드 그리드 (3열)
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_TEMPLATES } from './fallback-data';
import type { TemplateItem } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function loadTemplates(): Promise<TemplateItem[]> {
  try {
    const { data, error } = await supabase
      .from('contract_templates')
      .select('name,version,used,last_date')
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_TEMPLATES;
    return data.filter(isRecord).map((r): TemplateItem => ({
      name: typeof r.name === 'string' ? r.name : '-',
      version: typeof r.version === 'string' ? r.version : 'v1.0',
      used: typeof r.used === 'number' ? r.used : 0,
      lastDate: typeof r.last_date === 'string' ? r.last_date : '-',
    }));
  } catch {
    return FALLBACK_TEMPLATES;
  }
}

export default function CompanyTemplateTab() {
  const [items, setItems] = useState<TemplateItem[]>(FALLBACK_TEMPLATES);

  useEffect(() => {
    let alive = true;
    void loadTemplates().then((d) => {
      if (alive) setItems(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card
      title={`계약 템플릿 (${items.length})`}
      action={<SmBtn primary ariaLabel="새 템플릿 추가">+ 새 템플릿</SmBtn>}
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
              <SmBtn ariaLabel={`${t.name} 편집`}>편집</SmBtn>
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
