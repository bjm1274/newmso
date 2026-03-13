import { supabase } from './supabase';

export const DOCUMENT_DESIGN_SETTING_KEY = 'document_designs_v2';
const LOCAL_SYSTEM_SETTING_PREFIX = 'erp_local_system_setting_';

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

const DOCUMENT_DESIGN_TYPES: DocumentDesignType[] = ['payroll_slip', 'certificate'];
const CERTIFICATE_DEFAULT_TITLE = '재직증명서';
const DOCUMENT_DESIGN_FIELDS: (keyof DocumentDesign)[] = [
  'title',
  'subtitle',
  'companyLabel',
  'primaryColor',
  'borderColor',
  'footerText',
  'showSignArea',
];

export const DEFAULT_DOCUMENT_DESIGNS: Record<DocumentDesignType, DocumentDesign> = {
  payroll_slip: {
    title: '급여명세서',
    subtitle: '월별 급여 지급 내역',
    companyLabel: 'SY INC.',
    primaryColor: '#163b70',
    borderColor: '#d8e1ee',
    footerText: '본 문서는 전자 발급된 급여 확인 문서이며 회사 보관본과 동일한 효력을 가집니다.',
    showSignArea: true,
  },
  certificate: {
    title: '공식 증명서',
    subtitle: '',
    companyLabel: 'SY INC.',
    primaryColor: '#2d93a8',
    borderColor: '#d7e0e6',
    footerText: '',
    showSignArea: true,
  },
};

const EMPTY_STORE: DocumentDesignStore = {
  version: 2,
  defaults: {},
  companies: {},
};

function isMissingTableError(error: any, tableName = 'system_settings') {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === 'PGRST205' || message.includes(tableName.toLowerCase());
}

function readLocalSystemSetting(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_SYSTEM_SETTING_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalSystemSetting(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `${LOCAL_SYSTEM_SETTING_PREFIX}${key}`,
      JSON.stringify(value),
    );
  } catch {
    // ignore
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePatchString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDesignPatch(value: unknown): DesignPatch {
  if (!isRecord(value)) return {};

  const patch: DesignPatch = {};

  if (Object.prototype.hasOwnProperty.call(value, 'title')) {
    patch.title = normalizePatchString(value.title);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'subtitle')) {
    patch.subtitle = normalizePatchString(value.subtitle);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'companyLabel')) {
    patch.companyLabel = normalizePatchString(value.companyLabel);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'primaryColor')) {
    patch.primaryColor = normalizePatchString(value.primaryColor);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'borderColor')) {
    patch.borderColor = normalizePatchString(value.borderColor);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'footerText')) {
    patch.footerText = normalizePatchString(value.footerText);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'showSignArea') && typeof value.showSignArea === 'boolean') {
    patch.showSignArea = value.showSignArea;
  }

  return patch;
}

function normalizeScopedDesigns(value: unknown): ScopedDesigns {
  if (!isRecord(value)) return {};

  const scoped: ScopedDesigns = {};
  if (Object.prototype.hasOwnProperty.call(value, 'payroll_slip')) {
    scoped.payroll_slip = normalizeDesignPatch(value.payroll_slip);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'certificate')) {
    scoped.certificate = normalizeDesignPatch(value.certificate);
  }
  return scoped;
}

function hasPatchValue(patch?: DesignPatch) {
  return !!patch && Object.keys(patch).length > 0;
}

function buildCompanyLabel(base: DocumentDesign, defaults: DesignPatch, companyName?: string | null) {
  return defaults.companyLabel || companyName || base.companyLabel;
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
  const localValue = readLocalSystemSetting(key);
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, 'system_settings')) {
      return localValue;
    }
    throw error;
  }

  if (!data?.value) return localValue;

  let parsedValue = null;
  if (typeof data.value === 'string') {
    try {
      parsedValue = JSON.parse(data.value);
    } catch {
      parsedValue = null;
    }
  } else {
    parsedValue = data.value;
  }

  if (parsedValue != null) {
    writeLocalSystemSetting(key, parsedValue);
    return parsedValue;
  }

  return localValue;
}

async function applyLegacyPayrollFallback(store: DocumentDesignStore) {
  if (hasPatchValue(store.defaults.payroll_slip)) return store;

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
  return store;
}

export function resolveDocumentDesignReference(
  store: DocumentDesignStore | null | undefined,
  type: DocumentDesignType,
  companyName?: string | null,
) {
  const base = DEFAULT_DOCUMENT_DESIGNS[type];
  const fallbackTitle = type === 'certificate' ? CERTIFICATE_DEFAULT_TITLE : base.title;

  if (!companyName) {
    return {
      ...base,
      title: fallbackTitle,
      companyLabel: base.companyLabel,
    };
  }

  const defaults = store?.defaults?.[type] || {};
  return {
    ...base,
    ...defaults,
    title: defaults.title || fallbackTitle,
    companyLabel: buildCompanyLabel(base, defaults, companyName),
  };
}

export function resolveDocumentDesign(
  store: DocumentDesignStore | null | undefined,
  type: DocumentDesignType,
  companyName?: string | null,
) {
  const base = DEFAULT_DOCUMENT_DESIGNS[type];
  const defaults = store?.defaults?.[type] || {};
  const companyScoped = companyName ? store?.companies?.[companyName]?.[type] || {} : {};
  const fallbackTitle = type === 'certificate' ? CERTIFICATE_DEFAULT_TITLE : base.title;

  return {
    ...base,
    ...defaults,
    ...companyScoped,
    title: companyScoped.title || defaults.title || fallbackTitle,
    companyLabel:
      companyScoped.companyLabel ||
      buildCompanyLabel(base, defaults, companyName),
  };
}

export function getDocumentDesignScopePatch(
  store: DocumentDesignStore | null | undefined,
  type: DocumentDesignType,
  companyName?: string | null,
) {
  return companyName ? store?.companies?.[companyName]?.[type] || {} : store?.defaults?.[type] || {};
}

export function buildDocumentDesignPatch(reference: DocumentDesign, nextDesign: DocumentDesign): DesignPatch {
  const patch: DesignPatch = {};

  DOCUMENT_DESIGN_FIELDS.forEach((field) => {
    const referenceValue = reference[field];
    const nextValue = nextDesign[field];
    if (nextValue !== referenceValue) {
      patch[field] = nextValue as never;
    }
  });

  return patch;
}

export function compactDocumentDesignStore(store: DocumentDesignStore | null | undefined) {
  const normalized = normalizeDocumentDesignStore(store);
  const defaults: ScopedDesigns = {};
  const companies: Record<string, ScopedDesigns> = {};

  DOCUMENT_DESIGN_TYPES.forEach((type) => {
    const patch = normalized.defaults[type];
    if (!patch) return;
    const reference = resolveDocumentDesignReference(normalized, type);
    const applied = { ...reference, ...patch };
    const compactPatch = buildDocumentDesignPatch(reference, applied);
    if (hasPatchValue(compactPatch)) {
      defaults[type] = compactPatch;
    }
  });

  Object.entries(normalized.companies).forEach(([companyName, scopedDesigns]) => {
    const nextScoped: ScopedDesigns = {};

    DOCUMENT_DESIGN_TYPES.forEach((type) => {
      const patch = scopedDesigns?.[type];
      if (!patch) return;

      const reference = resolveDocumentDesignReference(
        { version: 2, defaults, companies },
        type,
        companyName,
      );
      const applied = { ...reference, ...patch };
      const compactPatch = buildDocumentDesignPatch(reference, applied);

      if (hasPatchValue(compactPatch)) {
        nextScoped[type] = compactPatch;
      }
    });

    if (Object.keys(nextScoped).length > 0) {
      companies[companyName] = nextScoped;
    }
  });

  return {
    version: 2,
    defaults,
    companies,
  } satisfies DocumentDesignStore;
}

export async function fetchDocumentDesignStore() {
  const raw = await readSetting(DOCUMENT_DESIGN_SETTING_KEY).catch(() => null);
  const store = normalizeDocumentDesignStore(raw);
  await applyLegacyPayrollFallback(store);
  applyCertificateFallback(store);
  return compactDocumentDesignStore(store);
}

export async function saveDocumentDesignStore(store: DocumentDesignStore) {
  const compacted = compactDocumentDesignStore(store);
  const payload = {
    key: DOCUMENT_DESIGN_SETTING_KEY,
    value: JSON.stringify(compacted),
    updated_at: new Date().toISOString(),
  };

  writeLocalSystemSetting(DOCUMENT_DESIGN_SETTING_KEY, compacted);

  const result = await supabase
    .from('system_settings')
    .upsert(payload, { onConflict: 'key' });
  if (isMissingTableError(result.error, 'system_settings')) {
    return { data: payload, error: null } as unknown as typeof result;
  }
  return result;
}

export function updateDocumentDesignStore(
  store: DocumentDesignStore,
  type: DocumentDesignType,
  design: DocumentDesign,
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

  const reference = resolveDocumentDesignReference(store, type, companyName);
  const patch = buildDocumentDesignPatch(reference, design);

  if (!companyName) {
    if (hasPatchValue(patch)) {
      next.defaults[type] = patch;
    } else {
      const { [type]: _removed, ...rest } = next.defaults;
      next.defaults = rest;
    }
    return compactDocumentDesignStore(next);
  }

  const currentScoped = {
    ...(store.companies[companyName] || {}),
  };

  if (hasPatchValue(patch)) {
    currentScoped[type] = patch;
    next.companies[companyName] = currentScoped;
  } else {
    const { [type]: _removed, ...restScoped } = currentScoped;
    if (Object.keys(restScoped).length > 0) {
      next.companies[companyName] = restScoped;
    } else {
      const { [companyName]: _removedCompany, ...restCompanies } = next.companies;
      next.companies = restCompanies;
    }
  }

  return compactDocumentDesignStore(next);
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
    const { [type]: _removed, ...rest } = next.defaults;
    next.defaults = rest;
    return compactDocumentDesignStore(next);
  }

  const scoped = { ...(next.companies[companyName] || {}) };
  const { [type]: _removed, ...rest } = scoped;

  if (Object.keys(rest).length > 0) {
    next.companies[companyName] = rest;
  } else {
    const { [companyName]: _removedCompany, ...restCompanies } = next.companies;
    next.companies = restCompanies;
  }

  return compactDocumentDesignStore(next);
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
