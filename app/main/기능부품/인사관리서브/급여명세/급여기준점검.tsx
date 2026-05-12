'use client';

import MinWageChecker from './최저임금체크';
import TaxFreeLimitChecker from './비과세한도체크';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

export default function PayrollComplianceCheck({ staffs, selectedCo, user }: Props) {
  return (
    <div className="space-y-4 p-4 md:p-4" data-testid="payroll-compliance-check-view">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <MinWageChecker staffs={staffs} selectedCo={selectedCo} user={user} />
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <TaxFreeLimitChecker staffs={staffs} selectedCo={selectedCo} user={user} />
        </div>
      </div>
    </div>
  );
}
