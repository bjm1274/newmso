'use client';
import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db-client';

type Company = { id: string; name: string; type: string };

let cachedCompanies: Company[] | null = null;
let fetchPromise: Promise<Company[]> | null = null;

async function fetchCompanies(): Promise<Company[]> {
  const { data } = await db
    .from('companies')
    .select('id, name, type')
    .order('name');
  return (data ?? []) as Company[];
}

export function useCompaniesCache() {
  const [companies, setCompanies] = useState<Company[]>(cachedCompanies ?? []);
  const [loading, setLoading] = useState(!cachedCompanies);

  useEffect(() => {
    if (cachedCompanies) {
      setCompanies(cachedCompanies);
      setLoading(false);
      return;
    }
    if (!fetchPromise) {
      fetchPromise = fetchCompanies();
    }
    fetchPromise.then((data) => {
      cachedCompanies = data;
      setCompanies(data);
      setLoading(false);
    });
  }, []);

  const refresh = useCallback(async () => {
    fetchPromise = null;
    cachedCompanies = null;
    const data = await fetchCompanies();
    cachedCompanies = data;
    fetchPromise = null;
    setCompanies(data);
  }, []);

  return { companies, loading, refresh };
}
