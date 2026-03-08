import { supabase } from './supabase';

export const DOCUMENT_DESIGN_SETTING_KEY = 'document_designs_v2';

export type DocumentDesignType = 'payroll_slip' | 'certificate';

export type DocumentDesign = {
  title: string;
  subtitle: string;
  companyLabel: string;
  primaryColor: string;
  borderColor: string;
  footerText: string;
  showSignArea: boolean;
};

type DesignPatch = Partial<DocumentDesign>;
type ScopedDesigns = Partial<Record<DocumentDesignType, DesignPatch>>;

export type DocumentDesignStore = {
  version: 2;
  defaults: ScopedDesigns;
  companies: Record<string, ScopedDesigns>;
};

export const DEFAULT_DOCUMENT_DESIGNS: Record<DocumentDesignType, DocumentDesign> = {
  payroll_slip: {
    title: '급여명세서',
    subtitle: '월별 급여 지급 내역',
    companyLabel: 'SY INC.',
    primaryColor: '#1d4ed8',
    borderColor: '#dbe4f0',
    footerText: '본 문서는 전자 발급 문서이며 회사 보관본과 동일한 효력을 가집니다.',
    showSignArea: true,
  },
  certificate: {
    title: '재직증명서',
    subtitle: '증명서 발급 문서',
    companyLabel: 'SY INC.',
    primaryColor: '#0f766e',
    borderColor: '#d7e6e3',
    footerText: '본 문서는 전자 발급 문서이며 제출용 원본으로 사용할 수 있습니다.',
    showSignArea: true,
  },
};

const EMPTY_STORE: DocumentDesignStore = {
  version: 2,
  defaults: {},
  companies: {},
};

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeDesignPatch(value: unknown): DesignPatch {
  if (!isRecord(value)) return {};

  return {
    title: normalizeString(value.title, ''),
    subtitle: normalizeString(value.subtitle, ''),
    companyLabel: normalizeString(value.companyLabel, ''),
    primaryColor: normalizeString(value.primaryColor, ''),
    borderColor: normalizeString(value.borderColor, ''),
    footerText: normalizeString(value.footerText, ''),
    showSignArea: normalizeBoolean(value.showSignArea, true),
  };
}

function normalizeScopedDesigns(value: unknown): ScopedDesigns {
  if (!isRecord(value)) return {};

  const scoped: ScopedDesigns = {};
  if (value.payroll_slip) scoped.payroll_slip = normalizeDesignPatch(value.payroll_slip);
  if (value.certificate) scoped.certificate = normalizeDesignPatch(value.certificate);
  return scoped;
}

export function normalizeDocumentDesignStore(value: unknown): DocumentDesignStore {
  if (!isRecord(value)) return { ...EMPTY_STORE, companies: {} };

  const defaults = normalizeScopedDesigns(value.defaults);
  const companies: Record<string, ScopedDesigns> = {};

  if (isRecord(value.companies)) {
    for (const [companyName, scopedValue] of Object.entries(value.companies)) {
      companies[companyName] = normalizeScopedDesigns(scopedValue);
    }
  }

  return {
    version: 2,
    defaults,
    companies,
  };
}

async function readSetting(key: string) {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.value) return null;

  if (typeof data.value === 'string') {
    try {
      return JSON.parse(data.value);
    } catch {
      return null;
    }
  }

  return data.value;
}

function isEmptyPatch(patch?: DesignPatch) {
  if (!patch) return true;
  return Object.values(patch).every((value) => value === '' || value === undefined);
}

async function applyLegacyPayrollFallback(store: DocumentDesignStore) {
  if (!isEmptyPatch(store.defaults.payroll_slip)) return store;

  const formTemplateDesigns = await readSetting('form_template_designs').catch(() => null);
  if (isRecord(formTemplateDesigns) && isRecord(formTemplateDesigns.payroll_slip)) {
    store.defaults.payroll_slip = normalizeDesignPatch(formTemplateDesigns.payroll_slip);
    return store;
  }

  const legacyPayroll = await readSetting('payroll_slip_design').catch(() => null);
  if (legacyPayroll) {
    store.defaults.payroll_slip = normalizeDesignPatch(legacyPayroll);
  }

  return store;
}

function applyCertificateFallback(store: DocumentDesignStore) {
  if (!isEmptyPatch(store.defaults.certificate)) return store;

  const payrollBase = store.defaults.payroll_slip || {};
  store.defaults.certificate = {
    primaryColor: payrollBase.primaryColor,
    borderColor: payrollBase.borderColor,
    companyLabel: payrollBase.companyLabel,
  };
  return store;
}

export async function fetchDocumentDesignStore() {
  const raw = await readSetting(DOCUMENT_DESIGN_SETTING_KEY).catch(() => null);
  const store = normalizeDocumentDesignStore(raw);
  await applyLegacyPayrollFallback(store);
  applyCertificateFallback(store);
  return store;
}

export async function saveDocumentDesignStore(store: DocumentDesignStore) {
  const payload = {
    key: DOCUMENT_DESIGN_SETTING_KEY,
    value: JSON.stringify(store),
    updated_at: new Date().toISOString(),
  };

  return supabase
    .from('system_settings')
    .upsert(payload, { onConflict: 'key' });
}

export function resolveDocumentDesign(
  store: DocumentDesignStore | null | undefined,
  type: DocumentDesignType,
  companyName?: string | null,
) {
  const base = DEFAULT_DOCUMENT_DESIGNS[type];
  const defaults = store?.defaults?.[type] || {};
  const companyScoped = companyName ? store?.companies?.[companyName]?.[type] || {} : {};

  return {
    ...base,
    ...defaults,
    ...companyScoped,
    companyLabel:
      companyScoped.companyLabel ||
      defaults.companyLabel ||
      companyName ||
      base.companyLabel,
  };
}

export function updateDocumentDesignStore(
  store: DocumentDesignStore,
  type: DocumentDesignType,
  design: DesignPatch,
  companyName?: string | null,
) {
  const next: DocumentDesignStore = {
    version: 2,
    defaults: {
      ...store.defaults,
    },
    companies: {
      ...store.companies,
    },
  };

  if (!companyName) {
    next.defaults[type] = {
      ...(store.defaults[type] || {}),
      ...design,
    };
    return next;
  }

  next.companies[companyName] = {
    ...(store.companies[companyName] || {}),
    [type]: {
      ...(store.companies[companyName]?.[type] || {}),
      ...design,
    },
  };

  return next;
}

export function resetDocumentDesignScope(
  store: DocumentDesignStore,
  type: DocumentDesignType,
  companyName?: string | null,
) {
  const next: DocumentDesignStore = {
    version: 2,
    defaults: {
      ...store.defaults,
    },
    companies: {
      ...store.companies,
    },
  };

  if (!companyName) {
    const { [type]: _, ...rest } = next.defaults;
    next.defaults = rest;
    return next;
  }

  const scoped = { ...(next.companies[companyName] || {}) };
  const { [type]: _, ...rest } = scoped;
  next.companies[companyName] = rest;
  return next;
}

export function alphaColor(hexColor: string | undefined | null, alpha: number) {
  if (!hexColor || typeof hexColor !== 'string') return `rgba(0,0,0,${alpha})`;
  const cleaned = hexColor.replace('#', '');

  if (![3, 6].includes(cleaned.length)) {
    return hexColor;
  }

  const expanded = cleaned.length === 3
    ? cleaned.split('').map((char) => `${char}${char}`).join('')
    : cleaned;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
