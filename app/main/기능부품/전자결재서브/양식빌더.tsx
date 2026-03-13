'use client';

import ApprovalFormTypesManager from '@/app/main/기능부품/관리자전용서브/전자결재양식관리';

export default function FormBuilder(_props: { user?: any }) {
  return (
    <div className="h-full overflow-y-auto pb-10 custom-scrollbar">
      <ApprovalFormTypesManager />
    </div>
  );
}
