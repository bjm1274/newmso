'use client';

import { createContext, useContext } from 'react';

export interface NavigationState {
  mainMenu: string;
  setMainMenu: (menu: string) => void;
  subView: string | null;
  setSubView: (v: string | null) => void;
}

const NavigationContext = createContext<NavigationState | null>(null);

export function NavigationProvider({
  value,
  children,
}: {
  value: NavigationState;
  children: React.ReactNode;
}) {
  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationState {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
