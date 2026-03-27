'use client';

import { useMemo, useState } from 'react';
import AssetLoanManager from '../인사관리서브/비품장비대여관리';

type StaffLike = {
  id?: string;
  name?: string;
  company?: string | null;
};

export default function AssetLoanSettingsAdminView({
  staffs = [],
  user,
}: {
  staffs?: StaffLike[];
  user?: { company?: string | null } | null;
}) {
  const companyOptions = useMemo(() => {
    const names = new Set<string>();
    names.add('전체');

    (Array.isArray(staffs) ? staffs : []).forEach((staff) => {
      const companyName = String(staff?.company || '').trim();
      if (companyName) {
        names.add(companyName);
      }
    });

    const currentCompany = String(user?.company || '').trim();
    if (currentCompany) {
      names.add(currentCompany);
    }

    return Array.from(names);
  }, [staffs, user?.company]);

  const [selectedCompany, setSelectedCompany] = useState<string>('전체');

  return (
    <div
      className="space-y-4"
      data-testid="asset-loan-settings-admin-view"
    >
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-[var(--foreground)]">비품대여 물품 설정</h3>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              회사별 비품 대여 물품 목록을 관리자 화면에서 바로 관리합니다.
            </p>
          </div>
          <label className="flex min-w-[220px] flex-col gap-1 text-xs font-semibold text-[var(--toss-gray-4)]">
            회사 선택
            <select
              data-testid="asset-loan-settings-company-select"
              value={selectedCompany}
              onChange={(event) => setSelectedCompany(event.target.value)}
              className="h-11 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              {companyOptions.map((companyName) => (
                <option key={companyName} value={companyName}>
                  {companyName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <AssetLoanManager staffs={staffs} selectedCo={selectedCompany} />
    </div>
  );
}
