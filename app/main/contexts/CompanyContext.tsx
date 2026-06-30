'use client';

import { createContext, useContext } from 'react';

export interface CompanyState {
  selectedCo: string | null;
  setSelectedCo: (v: string | null) => void;
  companies: { id: string; name: string; type: string }[];
  selectedCompanyId: string | null;
  setSelectedCompanyId: (v: string | null) => void;
}

const CompanyContext = createContext<CompanyState | null>(null);

export function CompanyProvider({
  value,
  children }: {
  value: CompanyState;
  children: React.ReactNode;
}) {
  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany(): CompanyState {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
