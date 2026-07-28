import type { SystemMasterOperationsPayload } from './types';
import { formatDateTime, formatPushPlatformLabel } from './utils';

type OperationsPanelProps = {
  operations: SystemMasterOperationsPayload;
};

export function OperationsPanel({ operations }: OperationsPanelProps) {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        {[
          { id: 'queue-pending', label: '대기 푸시 작업', value: operations.queue?.pending ?? 0 },
          { id: 'queue-dead', label: 'Dead Letter', value: operations.queue?.deadLettered ?? 0 },
          { id: 'push-total', label: '푸시 구독', value: operations.subscriptions?.total ?? 0 },
          { id: 'backup-count', label: '최근 백업', value: (operations.recentBackups || []).length },
          { id: 'restore-count', label: '복원 이력', value: (operations.restoreRuns || []).length },
          { id: 'todo-due', label: '리마인더 대기', value: operations.todoAutomation?.dueReminders ?? 0 },
          { id: 'wiki-version', label: '위키 버전', value: operations.wiki?.versions ?? 0 },
        ].map((card) => (
          <article key={card.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">{Number(card.value || 0).toLocaleString('ko-KR')}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">실패/주의 작업 모니터</h3>
            </div>
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
              마지막 갱신 {formatDateTime(operations.checkedAt)}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {(operations.failureItems || []).length === 0 && (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)]">
                현재 감지된 실패/주의 작업이 없습니다.
              </div>
            )}
            {(operations.failureItems || []).map((item) => (
              <div
                key={item.id}
                className={`rounded-[var(--radius-lg)] border px-4 py-3 ${
                  item.severity === 'critical'
                    ? 'border-red-500/20 bg-red-500/10'
                    : item.severity === 'warning'
                      ? 'border-warning/20 bg-warning/10'
                      : 'border-[var(--border)] bg-[var(--page-bg)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[var(--foreground)]">{item.label}</p>
                  <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                    {Number(item.count || 0).toLocaleString('ko-KR')}건
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h3 className="text-base font-bold text-[var(--foreground)]">푸시 큐 / 백업 / 크론 상태</h3>
          <div className="mt-4 space-y-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
              <p className="text-xs font-bold text-[var(--foreground)]">채팅 푸시 큐</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <p className="text-[11px] text-[var(--toss-gray-3)]">Ready <span className="font-bold text-[var(--foreground)]">{Number(operations.queue?.ready || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">Retrying <span className="font-bold text-[var(--foreground)]">{Number(operations.queue?.retrying || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">In Flight <span className="font-bold text-[var(--foreground)]">{Number(operations.queue?.inFlight || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">Migration Ready <span className="font-bold text-[var(--foreground)]">{operations.queue?.migrationReady ? '예' : '아니오'}</span></p>
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
              <p className="text-xs font-bold text-[var(--foreground)]">푸시 구독 상태</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <p className="text-[11px] text-[var(--toss-gray-3)]">Null Staff <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.nullStaff || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">Orphan <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.orphan || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">중복 그룹 <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.duplicateEndpointGroups || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">중복 행 <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.duplicateRows || 0).toLocaleString('ko-KR')}</span></p>
              </div>
            </div>

            <div
              data-testid="system-master-push-diagnostics"
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold text-[var(--foreground)]">푸시 진단</p>
                <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                  최근 실패 {Number(operations.pushFailures?.total || 0).toLocaleString('ko-KR')}건
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <p className="text-[11px] text-[var(--toss-gray-3)]">FCM 연결 <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.fcmEnabled || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">Web Push 전용 <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.webPushOnly || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">가상 Endpoint <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.placeholderEndpoints || 0).toLocaleString('ko-KR')}</span></p>
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-bold text-[var(--foreground)]">플랫폼 분포</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(operations.subscriptions?.platformSummary || []).length === 0 && (
                    <span className="text-[11px] text-[var(--toss-gray-3)]">표시할 플랫폼 데이터가 없습니다.</span>
                  )}
                  {(operations.subscriptions?.platformSummary || []).map((entry) => (
                    <span
                      key={String(entry.platform)}
                      className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--foreground)]"
                    >
                      {formatPushPlatformLabel(entry.platform)} {Number(entry.count || 0).toLocaleString('ko-KR')}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-[11px] font-bold text-[var(--foreground)]">최근 실패 사유</p>
                  <div className="mt-2 space-y-2">
                    {(operations.pushFailures?.summary || []).length === 0 && (
                      <p className="text-[11px] text-[var(--toss-gray-3)]">최근 실패 사유가 없습니다.</p>
                    )}
                    {(operations.pushFailures?.summary || []).slice(0, 4).map((entry) => (
                      <div key={String(entry.error)} className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-semibold text-[var(--foreground)]">{String(entry.error || 'unknown')}</span>
                        <span className="text-[var(--toss-gray-3)]">{Number(entry.count || 0).toLocaleString('ko-KR')}건</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-[var(--foreground)]">최근 구독 흐름</p>
                  <div className="mt-2 space-y-2">
                    {(operations.subscriptions?.recentSubscriptions || []).length === 0 && (
                      <p className="text-[11px] text-[var(--toss-gray-3)]">최근 구독 데이터가 없습니다.</p>
                    )}
                    {(operations.subscriptions?.recentSubscriptions || []).slice(0, 4).map((entry) => (
                      <div key={String(entry.id)} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <p className="text-[11px] font-semibold text-[var(--foreground)]">{formatPushPlatformLabel(entry.platform)} · {entry.has_fcm ? 'FCM 포함' : 'Web Push'}</p>
                        <p className="mt-1 text-[10px] text-[var(--toss-gray-3)]">{formatDateTime(entry.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
              <p className="text-xs font-bold text-[var(--foreground)]">크론 스케줄</p>
              <div className="mt-3 space-y-2">
                {(operations.cronJobs || []).map((cron) => (
                  <div key={cron.path} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-semibold text-[var(--foreground)]">{cron.label}</span>
                    <span className="text-[var(--toss-gray-3)]">{cron.schedule}</span>
                  </div>
                ))}
              </div>
            </div>

            {/*
              크론 실패는 audit_logs 에만 쌓여서 아무도 안 본다.
              2026-07 에 12일간 백업·푸시·연차자동화가 전부 죽어 있었는데도
              실패 3,624건이 눈에 띄지 않았다. 여기서 라우트별로 드러낸다.
            */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-[var(--foreground)]">
                  크론 실패 ({operations.cronHealth?.windowDays ?? 7}일)
                </p>
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  총 {Number(operations.cronHealth?.totalFailures || 0).toLocaleString('ko-KR')}건
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {(operations.cronHealth?.byRoute || []).length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-[var(--toss-gray-3)]">
                    실패한 크론이 없습니다.
                  </p>
                ) : (
                  (operations.cronHealth?.byRoute || []).map((item) => (
                    <div key={item.target} className="rounded-[var(--radius-md)] border border-red-300 bg-red-50 px-3 py-2 dark:bg-red-950/30">
                      <div className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-semibold text-[var(--foreground)]">{item.target}</span>
                        <span className="font-bold text-red-600">{Number(item.count || 0).toLocaleString('ko-KR')}회</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                        {formatDateTime(item.firstAt)}부터 · 최근 {formatDateTime(item.lastAt)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--toss-gray-3)]">
                        마지막 성공 {item.lastSuccessAt ? formatDateTime(item.lastSuccessAt) : '조회 기간 내 없음'}
                      </p>
                      {item.lastError ? (
                        <p className="mt-1 break-all text-[11px] font-medium text-red-600">{item.lastError}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
              <p className="text-xs font-bold text-[var(--foreground)]">할일 자동화 / 위키 버전</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <p className="text-[11px] text-[var(--toss-gray-3)]">리마인더 대기 <span className="font-bold text-[var(--foreground)]">{Number(operations.todoAutomation?.dueReminders || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">반복 할일 <span className="font-bold text-[var(--foreground)]">{Number(operations.todoAutomation?.repeatingOpenTodos || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">24시간 리마인더 <span className="font-bold text-[var(--foreground)]">{Number(operations.todoAutomation?.reminderLogs24h || 0).toLocaleString('ko-KR')}</span></p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">위키 문서/버전 <span className="font-bold text-[var(--foreground)]">{Number(operations.wiki?.documents || 0).toLocaleString('ko-KR')} / {Number(operations.wiki?.versions || 0).toLocaleString('ko-KR')}</span></p>
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
              <p className="text-xs font-bold text-[var(--foreground)]">실기기 QA 체크리스트</p>
              <div className="mt-3 space-y-2 text-[11px] text-[var(--toss-gray-3)]">
                <p>1. Android Chrome 또는 iPhone 설치형 앱에서 알림 권한이 허용된 상태인지 확인합니다.</p>
                <p>2. 앱을 완전히 내려놓은 뒤 다른 계정에서 채팅 메시지를 보내 상단 푸시가 오는지 확인합니다.</p>
                <p>3. 푸시를 눌렀을 때 채팅방, 결재 문서, 게시글이 정확한 대상까지 열리는지 확인합니다.</p>
                <p>4. 앱을 다시 열어 알림 설정의 푸시 상태가 연결됨으로 복구되는지 확인합니다.</p>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_0.9fr_1.1fr]">
        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h3 className="text-base font-bold text-[var(--foreground)]">최근 백업</h3>
          <div className="mt-4 space-y-3">
            {(operations.recentBackups || []).map((backup) => (
              <div key={backup.name} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                <p className="text-sm font-bold text-[var(--foreground)]">{backup.name}</p>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{formatDateTime(backup.created_at)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h3 className="text-base font-bold text-[var(--foreground)]">최근 복원 / 위키 버전</h3>
          <div className="mt-4 space-y-3">
            {(operations.restoreRuns || []).slice(0, 3).map((run) => (
              <div key={run.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-[var(--foreground)]">{run.file_name}</p>
                  <span className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${run.status === 'completed' ? 'bg-success/15 text-success' : run.status === 'failed' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'}`}>
                    {run.status === 'completed' ? '완료' : run.status === 'failed' ? '실패' : '진행'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{formatDateTime(run.started_at)}</p>
              </div>
            ))}
            {(operations.wiki?.recentVersions || []).slice(0, 2).map((version) => (
              <div key={version.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                <p className="text-sm font-bold text-[var(--foreground)]">{version.title}</p>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">버전 {Number(version.version_no || 0).toLocaleString('ko-KR')} · {formatDateTime(version.created_at)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h3 className="text-base font-bold text-[var(--foreground)]">기능별 사용 로그</h3>
          <div className="mt-4 space-y-3">
            {(operations.usageSummary || []).map((entry) => (
              <div key={entry.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-[var(--foreground)]">{entry.label}</p>
                  <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                    {Number(entry.count || 0).toLocaleString('ko-KR')}건
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">최근 액션 {entry.topAction || '-'} · {formatDateTime(entry.latestAt)}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
