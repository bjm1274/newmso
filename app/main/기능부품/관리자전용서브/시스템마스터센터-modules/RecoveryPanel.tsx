import { SYSTEM_MASTER_ACCOUNT_ID } from '@/lib/system-master';
import type { StaffMember } from '@/types';
import type { SystemMasterActionId, SystemMasterUser } from './types';
import AnnualLeaveManualGrant from '../연차수동부여';

type RecoveryPanelProps = {
  opsActionLoading: string;
  runOpsAction: (action: SystemMasterActionId) => void;
};

export function RecoveryPanel({ opsActionLoading, runOpsAction }: RecoveryPanelProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h3 className="text-base font-bold text-[var(--foreground)]">운영자용 문제 복구 센터</h3>
        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
          실패 작업 복구, 푸시 구독 정리, 수동 전체 백업을 운영자가 직접 실행할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {[
          {
            id: 'run_backup_full',
            title: '정기 전체 백업 수동 실행',
            description: '즉시 전체 백업을 만들어 최근 백업 목록을 갱신합니다.',
            button: '전체 백업 실행' },
          {
            id: 'run_chat_push_dispatch',
            title: '채팅 푸시 큐 재처리',
            description: '대기 중인 채팅 푸시 작업을 바로 다시 처리합니다.',
            button: '푸시 큐 재처리' },
          {
            id: 'run_todo_reminders',
            title: '할일 리마인더 수동 실행',
            description: '지금 시점까지 도달한 할일 리마인더를 즉시 발송합니다.',
            button: '리마인더 실행' },
          {
            id: 'cleanup_push_subscriptions',
            title: '푸시 구독 정리',
            description: 'null staff, orphan, 중복 endpoint 구독을 정리합니다.',
            button: '푸시 구독 정리' },
        ].map((action) => (
          <article key={action.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h4 className="text-sm font-bold text-[var(--foreground)]">{action.title}</h4>
            <p className="mt-2 text-[11px] leading-5 text-[var(--toss-gray-3)]">{action.description}</p>
            <button
              type="button"
              onClick={() => runOpsAction(action.id as SystemMasterActionId)}
              disabled={opsActionLoading === action.id}
              className="mt-4 h-10 rounded-[var(--radius-lg)] bg-[var(--foreground)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {opsActionLoading === action.id ? '실행 중...' : action.button}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

type AnnualLeavePanelProps = {
  systemMasterUser: SystemMasterUser | null;
  staffs: StaffMember[];
  onRefresh?: () => void;
};

export function AnnualLeavePanel({ systemMasterUser, staffs, onRefresh }: AnnualLeavePanelProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h3 className="text-base font-bold text-[var(--foreground)]">연차 수동 부여</h3>
        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[11px]">{SYSTEM_MASTER_ACCOUNT_ID}</code>
          {' '}시스템마스터 계정 전용 기능입니다. 자동 부여 규칙과 별개로 직원별 연차 총량과 사용량을 직접 조정합니다.
        </p>
      </div>
      <AnnualLeaveManualGrant user={systemMasterUser} staffs={staffs} onRefresh={onRefresh} />
    </section>
  );
}
