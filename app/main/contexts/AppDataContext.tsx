'use client';

import { createContext, useContext } from 'react';
import type { ErpUser, ERPData } from '@/types';

export interface AppDataState {
  user: ErpUser | null;
  data: ERPData;
  onRefresh: () => void;
}

const AppDataContext = createContext<AppDataState | null>(null);

export function AppDataProvider({
  value,
  children,
}: {
  value: AppDataState;
  children: React.ReactNode;
}) {
  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataState {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
