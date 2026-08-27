import { db } from '@/lib/db-client';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { readLocalStorage, writeLocalStorage } from '@/lib/storage-utils';
import type { FormTypeRow, TemplateDesign, TemplateDesignStore, FormTypeStore } from './types';

const LOCAL_APPROVAL_FORM_TYPES_KEY = STORAGE_KEYS.APPROVAL_FORM_TYPES_CUSTOM;
const LOCAL_FORM_TEMPLATE_DESIGNS_KEY = STORAGE_KEYS.FORM_TEMPLATE_DESIGNS;

export function isMissingTableError(error: any, tableName = 'system_settings') {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === 'PGRST205' || message.includes(tableName.toLowerCase());
}

export type WriteFailureKind = 'missing-table' | 'missing-column' | 'other';

/**
 * 쓰기 실패 사유를 구분한다.
 * isMissingTableError 는 `message.includes(tableName)` 이라,
 * `table approval_form_types has no column named base_slug` 같은 **컬럼 누락** 오류까지
 * "테이블 자체가 없음" 으로 삼켜 버렸다(10차 TB5 — 그래서 console.warn 조차 남지 않았다).
 * → 컬럼 오류를 먼저 걸러낸 뒤에 테이블 판정을 한다.
 */
export function classifyWriteFailure(error: any, tableName: string): WriteFailureKind {
  const message = String(error?.message || error?.details || '').toLowerCase();
  if (
    message.includes('no column named') ||
    message.includes('no such column') ||
    message.includes('has no column')
  ) {
    return 'missing-column';
  }
  if (isMissingTableError(error, tableName)) return 'missing-table';
  return 'other';
}

export function slugFromName(name: string) {
  return name.replace(/\s+/g, '').replace(/[^\w가-힣a-zA-Z0-9-]/g, '') || 'custom';
}

export function normalizeCompanyKey(companyName?: string | null) {
  const trimmed = String(companyName || '').trim();
  return trimmed || '전체';
}

export function createEmptyDesignStore(): TemplateDesignStore {
  return { version: 2, defaults: {}, companies: {} };
}

export function normalizeTemplateDesignStore(value: unknown): TemplateDesignStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyDesignStore();
  }

  const raw = value as Partial<TemplateDesignStore> & Record<string, unknown>;
  if (raw.version === 2 && (raw.defaults || raw.companies)) {
    return {
      version: 2,
      defaults:
        typeof raw.defaults === 'object' && raw.defaults && !Array.isArray(raw.defaults)
          ? raw.defaults
          : {},
      companies:
        typeof raw.companies === 'object' && raw.companies && !Array.isArray(raw.companies)
          ? raw.companies
          : {} };
  }

  return {
    version: 2,
    defaults: value as Record<string, TemplateDesign>,
    companies: {} };
}

export function normalizeFormTypeStore(value: unknown): FormTypeStore {
  if (Array.isArray(value)) {
    return { version: 2, defaults: value as FormTypeRow[], companies: {} };
  }

  if (value && typeof value === 'object') {
    const raw = value as Partial<FormTypeStore>;
    if (raw.version === 2 && (raw.defaults || raw.companies)) {
      return {
        version: 2,
        defaults: Array.isArray(raw.defaults) ? raw.defaults : [],
        companies:
          raw.companies &&
          typeof raw.companies === 'object' &&
          !Array.isArray(raw.companies)
            ? raw.companies
            : {} };
    }
  }

  return { version: 2, defaults: [], companies: {} };
}

export function readLocalRowsForCompany(companyName: string) {
  const store = normalizeFormTypeStore(readLocalStorage<unknown>(LOCAL_APPROVAL_FORM_TYPES_KEY, []));
  const key = normalizeCompanyKey(companyName);
  const rows = store.companies[key] || store.defaults || [];
  return rows.map((row) => ({ ...row, company_name: normalizeCompanyKey(row.company_name || key) }));
}

export function writeLocalRowsForCompany(companyName: string, rows: FormTypeRow[]) {
  const store = normalizeFormTypeStore(readLocalStorage<unknown>(LOCAL_APPROVAL_FORM_TYPES_KEY, []));
  const key = normalizeCompanyKey(companyName);
  const normalizedRows = rows.map((row) => ({ ...row, company_name: key }));
  store.companies = { ...store.companies, [key]: normalizedRows };
  writeLocalStorage(LOCAL_APPROVAL_FORM_TYPES_KEY, store);
}

export function getDesignsForCompany(store: TemplateDesignStore, companyName: string) {
  const key = normalizeCompanyKey(companyName);
  return store.companies[key] || store.defaults || {};
}

export function readLocalDesignsStore(): unknown {
  return readLocalStorage<unknown>(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, {});
}

export function writeLocalDesignsStore(value: unknown): void {
  writeLocalStorage(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, value);
}

export async function persistDesignsForCompany(
  companyName: string,
  designs: Record<string, TemplateDesign>,
  previousStore: TemplateDesignStore,
) {
  const key = normalizeCompanyKey(companyName);
  const nextStore: TemplateDesignStore = {
    version: 2,
    defaults: { ...previousStore.defaults },
    companies: { ...previousStore.companies } };

  if (key === '전체') {
    nextStore.defaults = designs;
  } else {
    nextStore.companies[key] = designs;
  }

  writeLocalStorage(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, nextStore);
  const result = await db
    .from('system_settings')
    .upsert(
      {
        key: 'form_template_designs',
        value: JSON.stringify(nextStore),
        updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (isMissingTableError(result.error, 'system_settings')) {
    return { data: nextStore, error: null };
  }

  if (result.error) {
    return { data: nextStore, error: result.error };
  }

  return { data: nextStore, error: null };
}
