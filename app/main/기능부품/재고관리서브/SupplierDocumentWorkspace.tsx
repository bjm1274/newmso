'use client';

import { useEffect, useState } from 'react';
import SupplierManagement from './거래처관리';
import InvoiceManagement from './명세서관리';

type WorkspaceTab = 'suppliers' | 'documents';

type Props = {
  user: any;
  inventory: any[];
  suppliers: any[];
  fetchSuppliers: () => Promise<void> | void;
  initialTab?: WorkspaceTab;
};

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'suppliers', label: '거래처' },
  { id: 'documents', label: '거래명세서' },
];

export default function SupplierDocumentWorkspace({
  user,
  inventory,
  suppliers,
  fetchSuppliers,
  initialTab = 'suppliers',
}: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'suppliers' ? (
        <SupplierManagement user={user} />
      ) : (
        <InvoiceManagement
          user={user}
          inventory={inventory}
          suppliers={suppliers}
          fetchSuppliers={fetchSuppliers}
          documentOnly
        />
      )}
    </div>
  );
}
