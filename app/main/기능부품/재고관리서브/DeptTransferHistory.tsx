'use client';
/**
 * DeptTransferHistory — 부서별 최근 이동 이력 카드 목록
 *
 * 책임: 전달받은 이동 이력을 카드 형태로 렌더링하는 표시 전용 컴포넌트.
 * JM: 단일책임·표시 전용
 * JM6: 시맨틱 요소 유지
 */

interface TransferRecord {
  id: string | number;
  item_name?: string;
  quantity?: number;
  from_company?: string;
  from_department?: string;
  to_company?: string;
  to_department?: string;
  transferred_by?: string;
  created_at?: string;
  status?: string;
}

interface Props {
  transfers: TransferRecord[];
  loading: boolean;
  effectiveDept: string;
}

export default function DeptTransferHistory({ transfers, loading, effectiveDept }: Props) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
        🔄 {effectiveDept ? `[${effectiveDept}] 최근 부서 이동 이력` : '최근 부서 이동 이력'}
      </h3>
      {loading ? (
        <p className="text-[var(--toss-gray-3)] text-sm">로딩 중...</p>
      ) : transfers.length === 0 ? (
        <p className="text-[var(--toss-gray-3)] text-sm">표시할 이동 이력이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {transfers.map((transfer) => {
            const fromLabel =
              [transfer.from_company, transfer.from_department].filter(Boolean).join(' · ') || '-';
            const toLabel =
              [transfer.to_company, transfer.to_department].filter(Boolean).join(' · ') || '-';
            return (
              <div
                key={transfer.id}
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--page-bg)] px-4 py-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">
                      {transfer.item_name || '이동 품목'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                      {fromLabel} → {toLabel}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--toss-gray-3)]">
                    <span className="font-semibold text-[var(--foreground)]">
                      {transfer.quantity || 0}개
                    </span>
                    <span>{transfer.transferred_by || '담당자 미기록'}</span>
                    <span>
                      {transfer.created_at
                        ? new Date(transfer.created_at).toLocaleString('ko-KR')
                        : '-'}
                    </span>
                    <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                      {transfer.status || '완료'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
