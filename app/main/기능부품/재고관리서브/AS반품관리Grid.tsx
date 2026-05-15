'use client';

import { EditableGrid, type EditableGridField } from '@/app/components/EditableGrid';

/**
 * AS반품관리 — AS표/반품표 격자 분리 컴포넌트
 * - 기존 인라인 <select>(상태 변경)와 수정/삭제 버튼 패턴을 EditableGrid로 표준화
 * - 모바일에서는 카드 1장 = 행 1개, 셀의 select/버튼이 그대로 노출됨
 */

export type AsStatus = '접수' | '처리중' | '완료' | '반품';
export type ReturnStatus = '요청' | '승인' | '완료';

export interface AsRecord {
  id: string;
  device_name: string;
  model_name: string;
  received_date: string;
  problem_description: string;
  company_name: string;
  manager_name: string;
  status: AsStatus;
  created_at: string;
  type: 'as';
}

export interface ReturnRecord {
  id: string;
  item_name: string;
  quantity: number;
  return_reason: string;
  company_name: string;
  return_date: string;
  status: ReturnStatus;
  created_at: string;
  type: 'return';
}

export const AS_STATUS_OPTIONS: AsStatus[] = ['접수', '처리중', '완료', '반품'];
export const RETURN_STATUS_OPTIONS: ReturnStatus[] = ['요청', '승인', '완료'];

export const AS_STATUS_COLORS: Record<AsStatus, string> = {
  접수: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]',
  처리중: 'bg-blue-500/10 text-blue-600',
  완료: 'bg-green-500/10 text-green-600',
  반품: 'bg-red-500/10 text-red-600',
};

export const RETURN_STATUS_COLORS: Record<ReturnStatus, string> = {
  요청: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]',
  승인: 'bg-blue-500/10 text-blue-600',
  완료: 'bg-green-500/10 text-green-600',
};

/* ───── 공통 액션 버튼 (수정/삭제) ───── */
type RowActionsProps = {
  editTestId: string;
  deleteTestId: string;
  onEdit: () => void;
  onDelete: () => void;
};

function RowActions({ editTestId, deleteTestId, onEdit, onDelete }: RowActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 justify-end">
      <button
        type="button"
        onClick={onEdit}
        data-testid={editTestId}
        className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-80"
      >
        수정
      </button>
      <button
        type="button"
        onClick={onDelete}
        data-testid={deleteTestId}
        className="px-2 py-1 bg-red-500/10 text-red-600 text-[11px] font-semibold rounded-[var(--radius-md)] hover:bg-red-500/20"
      >
        삭제
      </button>
    </div>
  );
}

/* ───── 상태 select 셀 ───── */
type StatusSelectProps<S extends string> = {
  value: S;
  options: readonly S[];
  onChange: (next: S) => void;
  className: string;
  testId: string;
  ariaLabel: string;
};

function StatusSelect<S extends string>({
  value,
  options,
  onChange,
  className,
  testId,
  ariaLabel,
}: StatusSelectProps<S>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as S)}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`px-2 py-1 rounded-full text-[11px] font-semibold border-0 cursor-pointer outline-none ${className}`}
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

/* ───── AS 표 ───── */
export type ASRecordGridProps = {
  records: AsRecord[];
  updateStatus: (id: string, status: AsStatus) => void;
  onEdit: (record: AsRecord) => void;
  onDelete: (id: string) => void;
};

export function ASRecordGrid({ records, updateStatus, onEdit, onDelete }: ASRecordGridProps) {
  const fields: EditableGridField<AsRecord>[] = [
    {
      id: 'device',
      label: '기기명 / 모델',
      width: '200px',
      render: (r) => (
        <div>
          <p className="text-xs font-semibold text-[var(--foreground)]">{r.device_name}</p>
          {r.model_name && (
            <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">{r.model_name}</p>
          )}
        </div>
      ),
    },
    {
      id: 'received_date',
      label: '접수일',
      width: '110px',
      render: (r) => (
        <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{r.received_date}</p>
      ),
    },
    {
      id: 'problem',
      label: '문제 내용',
      width: '220px',
      render: (r) => (
        <p
          className="text-xs text-[var(--toss-gray-4)] truncate md:max-w-[200px]"
          title={r.problem_description}
        >
          {r.problem_description || '-'}
        </p>
      ),
    },
    {
      id: 'company',
      label: '업체 / 담당자',
      width: '160px',
      render: (r) => (
        <div>
          <p className="text-xs font-semibold text-[var(--foreground)]">{r.company_name || '-'}</p>
          <p className="text-[11px] text-[var(--toss-gray-3)]">{r.manager_name || '-'}</p>
        </div>
      ),
    },
    {
      id: 'status',
      label: '상태',
      align: 'center',
      width: '110px',
      render: (r) => (
        <StatusSelect<AsStatus>
          value={r.status}
          options={AS_STATUS_OPTIONS}
          onChange={(next) => updateStatus(r.id, next)}
          className={AS_STATUS_COLORS[r.status]}
          testId={`as-status-${r.id}`}
          ariaLabel={`${r.device_name} 상태`}
        />
      ),
    },
  ];

  return (
    <EditableGrid<AsRecord>
      rows={records}
      fields={fields}
      rowKey={(r) => r.id}
      mobileTitle={(r) => (
        <span>
          {r.device_name}
          {r.model_name ? (
            <span className="ml-2 text-xs font-medium text-[var(--toss-gray-3)]">
              {r.model_name}
            </span>
          ) : null}
        </span>
      )}
      actions={(r) => (
        <RowActions
          editTestId={`as-edit-${r.id}`}
          deleteTestId={`as-delete-${r.id}`}
          onEdit={() => onEdit(r)}
          onDelete={() => onDelete(r.id)}
        />
      )}
      emptyMessage="등록된 AS 접수 내역이 없습니다."
    />
  );
}

/* ───── 반품 표 ───── */
export type ReturnRecordGridProps = {
  records: ReturnRecord[];
  updateStatus: (id: string, status: ReturnStatus) => void;
  onEdit: (record: ReturnRecord) => void;
  onDelete: (id: string) => void;
};

export function ReturnRecordGrid({
  records,
  updateStatus,
  onEdit,
  onDelete,
}: ReturnRecordGridProps) {
  const fields: EditableGridField<ReturnRecord>[] = [
    {
      id: 'item',
      label: '품목명',
      width: '200px',
      render: (r) => (
        <p className="text-xs font-semibold text-[var(--foreground)]">{r.item_name}</p>
      ),
    },
    {
      id: 'quantity',
      label: '수량',
      align: 'center',
      width: '80px',
      render: (r) => (
        <p className="text-xs font-semibold text-[var(--foreground)]">{r.quantity}</p>
      ),
    },
    {
      id: 'reason',
      label: '반품사유',
      width: '200px',
      render: (r) => (
        <p
          className="text-xs text-[var(--toss-gray-4)] truncate md:max-w-[180px]"
          title={r.return_reason}
        >
          {r.return_reason || '-'}
        </p>
      ),
    },
    {
      id: 'company',
      label: '업체',
      width: '140px',
      render: (r) => (
        <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{r.company_name || '-'}</p>
      ),
    },
    {
      id: 'return_date',
      label: '반품일',
      width: '110px',
      render: (r) => (
        <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{r.return_date}</p>
      ),
    },
    {
      id: 'status',
      label: '상태',
      align: 'center',
      width: '110px',
      render: (r) => (
        <StatusSelect<ReturnStatus>
          value={r.status}
          options={RETURN_STATUS_OPTIONS}
          onChange={(next) => updateStatus(r.id, next)}
          className={RETURN_STATUS_COLORS[r.status]}
          testId={`return-status-${r.id}`}
          ariaLabel={`${r.item_name} 상태`}
        />
      ),
    },
  ];

  return (
    <EditableGrid<ReturnRecord>
      rows={records}
      fields={fields}
      rowKey={(r) => r.id}
      mobileTitle={(r) => (
        <span>
          {r.item_name}
          <span className="ml-2 text-xs font-medium text-[var(--toss-gray-3)]">
            × {r.quantity}
          </span>
        </span>
      )}
      actions={(r) => (
        <RowActions
          editTestId={`return-edit-${r.id}`}
          deleteTestId={`return-delete-${r.id}`}
          onEdit={() => onEdit(r)}
          onDelete={() => onDelete(r.id)}
        />
      )}
      emptyMessage="등록된 반품 내역이 없습니다."
    />
  );
}
