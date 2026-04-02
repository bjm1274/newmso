import { supabase } from '@/lib/supabase';

export type RosterPolicyType = 'pattern_profile' | 'generation_rule';

type RosterPolicyStorageRow = {
  policy_type?: RosterPolicyType | null;
  policy_id?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  name?: string | null;
  payload?: Record<string, unknown> | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type RosterPolicyStorageRecord = {
  policyType: RosterPolicyType;
  policyId: string;
  companyId?: string | null;
  companyName: string;
  name: string;
  payload: Record<string, unknown>;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function normalizeRosterPolicyStorageRecord(row: RosterPolicyStorageRow): RosterPolicyStorageRecord | null {
  const policyType = row.policy_type;
  const policyId = String(row.policy_id || '').trim();
  const name = String(row.name || '').trim();

  if ((policyType !== 'pattern_profile' && policyType !== 'generation_rule') || !policyId || !name) {
    return null;
  }

  return {
    policyType,
    policyId,
    companyId: String(row.company_id || '').trim() || null,
    companyName: String(row.company_name || '').trim() || '전체',
    name,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    createdBy: String(row.created_by || '').trim() || null,
    updatedBy: String(row.updated_by || '').trim() || null,
    createdAt: String(row.created_at || '').trim() || null,
    updatedAt: String(row.updated_at || '').trim() || null,
  };
}

export function isMissingRosterPolicyStorageError(error: unknown): boolean {
  const source = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
  const code = String(source?.code || '').trim();
  const haystack = [source?.message, source?.details, source?.hint]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    haystack.includes('roster_policy_settings') ||
    haystack.includes('relation') && haystack.includes('does not exist')
  );
}

export async function loadRosterPolicyStorageRecords(policyType: RosterPolicyType) {
  const { data, error } = await supabase
    .from('roster_policy_settings')
    .select('policy_type, policy_id, company_id, company_name, name, payload, created_by, updated_by, created_at, updated_at')
    .eq('policy_type', policyType)
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingRosterPolicyStorageError(error)) {
      return {
        storageAvailable: false as const,
        records: [] as RosterPolicyStorageRecord[],
      };
    }
    throw error;
  }

  return {
    storageAvailable: true as const,
    records: Array.isArray(data)
      ? data
          .map((row) => normalizeRosterPolicyStorageRecord(row as RosterPolicyStorageRow))
          .filter((record): record is RosterPolicyStorageRecord => record !== null)
      : [],
  };
}

export async function upsertRosterPolicyStorageRecord(record: RosterPolicyStorageRecord) {
  const { error } = await supabase.from('roster_policy_settings').upsert(
    {
      policy_type: record.policyType,
      policy_id: record.policyId,
      company_id: record.companyId ?? null,
      company_name: record.companyName || '전체',
      name: record.name,
      payload: record.payload,
      created_by: record.createdBy ?? null,
      updated_by: record.updatedBy ?? null,
      updated_at: record.updatedAt ?? new Date().toISOString(),
    },
    {
      onConflict: 'policy_type,policy_id',
    }
  );

  if (error) {
    if (isMissingRosterPolicyStorageError(error)) {
      return { storageAvailable: false as const };
    }
    throw error;
  }

  return { storageAvailable: true as const };
}

export async function deleteRosterPolicyStorageRecord(policyType: RosterPolicyType, policyId: string) {
  const { error } = await supabase
    .from('roster_policy_settings')
    .delete()
    .eq('policy_type', policyType)
    .eq('policy_id', policyId);

  if (error) {
    if (isMissingRosterPolicyStorageError(error)) {
      return { storageAvailable: false as const };
    }
    throw error;
  }

  return { storageAvailable: true as const };
}
