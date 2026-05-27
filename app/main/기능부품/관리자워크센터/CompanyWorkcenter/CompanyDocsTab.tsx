'use client';

/**
 * 회사 관리 — 문서 보관 탭
 * 보관 표 1개
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_DOCS } from './fallback-data';
import type { DocRow } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function loadDocs(): Promise<DocRow[]> {
  try {
    const { data, error } = await supabase
      .from('company_documents')
      .select('name,category,date,size,access')
      .limit(100);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_DOCS;
    return data.filter(isRecord).map((r): DocRow => {
      const accessRaw = typeof r.access === 'string' ? r.access : '전사';
      const access: DocRow['access'] =
        accessRaw === '관리자' || accessRaw === '경영진' ? accessRaw : '전사';
      return {
        name: typeof r.name === 'string' ? r.name : '-',
        category: typeof r.category === 'string' ? r.category : '-',
        date: typeof r.date === 'string' ? r.date : '-',
        size: typeof r.size === 'string' ? r.size : '-',
        access,
      };
    });
  } catch {
    return FALLBACK_DOCS;
  }
}

export default function CompanyDocsTab() {
  const [rows, setRows] = useState<DocRow[]>(FALLBACK_DOCS);

  useEffect(() => {
    let alive = true;
    void loadDocs().then((d) => {
      if (alive) setRows(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card
      title={`회사 문서 보관함 (${rows.length})`}
      action={<SmBtn primary ariaLabel="문서 업로드">+ 문서 업로드</SmBtn>}
    >
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px]">
          <caption className="sr-only">회사 문서 보관함 목록</caption>
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[10.5px] text-[var(--toss-gray-4)]">
              <th scope="col" className="px-2 py-2 font-semibold">문서명</th>
              <th scope="col" className="px-2 py-2 font-semibold">분류</th>
              <th scope="col" className="px-2 py-2 font-semibold">업로드</th>
              <th scope="col" className="px-2 py-2 font-semibold">크기</th>
              <th scope="col" className="px-2 py-2 font-semibold">접근</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone =
                r.access === '관리자' ? 'danger' : r.access === '경영진' ? 'warn' : 'muted';
              return (
                <tr
                  key={`${r.name}-${r.date}`}
                  className="border-b border-[var(--border)]/60 hover:bg-[var(--muted)]"
                >
                  <td className="px-2 py-2 font-bold text-[var(--foreground)]">{r.name}</td>
                  <td className="px-2 py-2 text-[var(--toss-gray-4)]">{r.category}</td>
                  <td className="px-2 py-2 tabular-nums text-[var(--toss-gray-4)]">{r.date}</td>
                  <td className="px-2 py-2 tabular-nums text-[var(--toss-gray-4)]">{r.size}</td>
                  <td className="px-2 py-2">
                    <Chip tone={tone}>{r.access}</Chip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
