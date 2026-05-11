'use client';

/**
 * DepartmentTable.tsx — 법인·부서별 상세 현황 테이블
 * JM6: th scope, 상태 배지 텍스트+색상 병기
 */

import { DEPARTMENT_STATS, type DepartmentStat } from '../dummy-data';

const STATUS_LABEL: Record<DepartmentStat['status'], string> = {
  normal: '정상',
  caution: '주의',
  warning: '위험',
};

const STATUS_CLASS: Record<DepartmentStat['status'], string> = {
  normal: 'badge badge-green',
  caution: 'badge badge-blue',
  warning: 'badge badge-red',
};

export function DepartmentTable() {
  return (
    <div className="app-card overflow-x-auto p-5">
      <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">법인·부서별 상세 현황</h3>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
            <th scope="col" className="py-3 px-3 text-left font-semibold">법인</th>
            <th scope="col" className="py-3 px-3 text-left font-semibold">부서</th>
            <th scope="col" className="py-3 px-3 text-right font-semibold">매출(M)</th>
            <th scope="col" className="py-3 px-3 text-right font-semibold">이익(M)</th>
            <th scope="col" className="py-3 px-3 text-right font-semibold">이익률</th>
            <th scope="col" className="py-3 px-3 text-right font-semibold">환자(명)</th>
            <th scope="col" className="py-3 px-3 text-center font-semibold">상태</th>
          </tr>
        </thead>
        <tbody>
          {DEPARTMENT_STATS.map((dept) => (
            <tr
              key={dept.id}
              className="border-b border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
            >
              <td className="py-3 px-3 text-xs text-[var(--toss-gray-4)]">{dept.entity}</td>
              <td className="py-3 px-3 font-medium">{dept.name}</td>
              <td className="py-3 px-3 text-right">₩{dept.revenue}</td>
              <td className="py-3 px-3 text-right">₩{dept.profit}</td>
              <td className="py-3 px-3 text-right">{dept.profitRate}%</td>
              <td className="py-3 px-3 text-right">{dept.patients.toLocaleString()}</td>
              <td className="py-3 px-3 text-center">
                <span className={STATUS_CLASS[dept.status]}>
                  {STATUS_LABEL[dept.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
