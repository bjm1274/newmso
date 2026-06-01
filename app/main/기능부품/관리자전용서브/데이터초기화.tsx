'use client';
import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';

type ResetActionType =
  | 'chat'
  | 'inventory'
  | 'board'
  | 'schedule'
  | 'system_logs'
  | 'expired_contracts'
  | 'expired_popups'
  | 'force_logout'
  | 'staff';

type ResetAction = {
  type: ResetActionType;
  label: string;
  badge?: string;
  description: string;
  impact: string[];
  recovery: string;
  confirmationText: string;
  dangerLevel: 'warning' | 'critical';
};

type BackupSummary = {
  file_name?: string | null;
  status?: string | null;
  total_tables?: number | null;
  total_rows?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
};

const RESET_ACTIONS: ResetAction[] = [
  {
    type: 'chat',
    label: '사내 채팅 내역 및 채팅방 전체 삭제',
    description: '메시지, 읽음 상태, 알림 설정, 채팅방 정보를 삭제합니다.',
    impact: ['messages', 'message_reads', 'room_notification_settings', 'chat_rooms'],
    recovery: '백업 파일 또는 DB 스냅샷 없이는 대화 이력 복원이 어렵습니다.',
    confirmationText: '채팅 초기화',
    dangerLevel: 'critical',
  },
  {
    type: 'inventory',
    label: '재고 현황 및 입출고 로그 전체 삭제',
    description: '현재 재고와 입출고 이력 데이터를 함께 삭제합니다.',
    impact: ['inventory_logs', 'inventory'],
    recovery: '재고 기준 수량과 이력 재입력이 필요할 수 있습니다.',
    confirmationText: '재고 초기화',
    dangerLevel: 'critical',
  },
  {
    type: 'board',
    label: '게시판 게시물 전체 삭제',
    description: '수술/MRI 일정표를 제외한 공지, 경조사 등 게시판 데이터를 삭제합니다.',
    impact: ['posts', 'board_post_comments', 'board_posts'],
    recovery: '공지와 댓글 이력은 백업 기준으로만 복구할 수 있습니다.',
    confirmationText: '게시판 초기화',
    dangerLevel: 'critical',
  },
  {
    type: 'schedule',
    label: '수술일정 및 MRI일정표 전체 삭제',
    description: '일정 게시판으로 분류된 수술/MRI 일정을 삭제합니다.',
    impact: ['board_posts: 수술일정, MRI일정표, mri'],
    recovery: '운영 일정이 즉시 사라지므로 최근 백업 여부를 먼저 확인해야 합니다.',
    confirmationText: '일정 초기화',
    dangerLevel: 'critical',
  },
  {
    type: 'system_logs',
    label: '시스템 활동 및 접속 로그 초기화',
    description: '감사/접속 로그를 삭제해 용량을 확보합니다.',
    impact: ['audit_logs'],
    recovery: '감사 추적 자료가 사라지므로 별도 보관본이 필요합니다.',
    confirmationText: '로그 초기화',
    dangerLevel: 'warning',
  },
  {
    type: 'expired_contracts',
    label: '30일 경과 미체결 계약서 초안 일괄 삭제',
    description: '생성 후 30일이 지난 pending 계약서 초안을 정리합니다.',
    impact: ['employment_contracts: status=pending, created_at<30일'],
    recovery: '체결 전 초안만 삭제되지만 재생성이 필요할 수 있습니다.',
    confirmationText: '계약 초안 삭제',
    dangerLevel: 'warning',
  },
  {
    type: 'expired_popups',
    label: '비활성화된 홈페이지 팝업 데이터 정리',
    description: 'is_active=false 상태의 팝업 데이터를 삭제합니다.',
    impact: ['popups: is_active=false'],
    recovery: '비활성 팝업 템플릿을 다시 사용할 수 없습니다.',
    confirmationText: '팝업 정리',
    dangerLevel: 'warning',
  },
  {
    type: 'force_logout',
    label: '모든 시스템 접속자 강제 로그아웃',
    description: '전체 인증 기준 시각을 갱신해 모든 사용자의 재로그인을 유도합니다.',
    impact: ['system_configs: min_auth_time'],
    recovery: '데이터 삭제는 없지만 전체 사용자의 진행 중 작업이 끊길 수 있습니다.',
    confirmationText: '전체 로그아웃',
    dangerLevel: 'warning',
  },
  {
    type: 'staff',
    label: '관리자 제외 전 직원 계정 및 데이터 삭제',
    badge: '관리자 유지',
    description: '관리자 계정을 제외한 직원 계정과 연결 데이터를 서버 API로 정리합니다.',
    impact: ['staff_members 및 직원 연결 업무 데이터', '서버 reset-staff 정책 범위'],
    recovery: '가장 위험한 초기화입니다. 실행 직전 전체 백업을 권장합니다.',
    confirmationText: '직원 데이터 초기화',
    dangerLevel: 'critical',
  },
];

function formatDateTime(value?: string | null) {
  if (!value) return '기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '기록 없음';
  return date.toLocaleString('ko-KR');
}

export default function DataReseter(props: { onRefresh: () => void }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DesktopOnlyNotice feature="데이터 초기화" />;
  }
  return <DataReseterDesktop {...props} />;
}

function DataReseterDesktop({ onRefresh }: { onRefresh: () => void }) {
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [resetting, setResetting] = useState<ResetActionType | null>(null);
  const [selectedAction, setSelectedAction] = useState<ResetAction | null>(null);
  const [reviewStep, setReviewStep] = useState<1 | 2>(1);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [latestBackup, setLatestBackup] = useState<BackupSummary | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  const confirmationMatches = useMemo(
    () => selectedAction !== null && typedConfirmation.trim() === selectedAction.confirmationText,
    [selectedAction, typedConfirmation]
  );

  useEffect(() => {
    if (!isUnlocked) return;
    let cancelled = false;
    const loadLatestBackup = async () => {
      setBackupLoading(true);
      try {
        const { data, error } = await supabase
          .from('backup_restore_runs')
          .select('file_name,status,total_tables,total_rows,started_at,finished_at')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setLatestBackup((data as BackupSummary | null) || null);
      } catch (error) {
        console.error('최근 백업 조회 실패:', error);
        if (!cancelled) setLatestBackup(null);
      } finally {
        if (!cancelled) setBackupLoading(false);
      }
    };

    void loadLatestBackup();
    return () => {
      cancelled = true;
    };
  }, [isUnlocked]);

  const openDangerReview = (action: ResetAction) => {
    setSelectedAction(action);
    setReviewStep(1);
    setTypedConfirmation('');
  };

  const closeDangerReview = () => {
    if (resetting) return;
    setSelectedAction(null);
    setReviewStep(1);
    setTypedConfirmation('');
  };

  // 1. 보안 잠금 해제 로직 (서버에서 bcrypt 검증)
  const handleUnlock = async () => {
    const res = await fetch('/api/admin/verify-unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    if (data.ok) {
      setIsUnlocked(true);
      toast("보안 잠금이 해제되었습니다. 모든 초기화 기능이 활성화됩니다.");
    } else {
      toast("보안 암호가 일치하지 않습니다.");
    }
  };

  // 모든 파괴적 초기화 직전에 서버에서 관리자 세션 + 비밀번호를 재검증한다.
  // isUnlocked 클라이언트 state만으로는 우회 가능하므로, 실제 삭제 직전마다
  // /api/admin/verify-unlock(세션검사 + bcrypt + rate-limit)을 다시 통과해야 한다.
  const verifyServerAuthorization = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/verify-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      return res.ok && data?.ok === true;
    } catch {
      return false;
    }
  };

  // 2. 통합 초기화 로직
  const runReset = async (type: ResetActionType) => {
    if (resetting) return;

    setResetting(type);
    try {
      // staff 타입은 자체 전용 서버 라우트(/api/admin/reset-staff)에서 비밀번호를 재검증하므로
      // 여기서 중복 검증하지 않고, 그 외 클라이언트 직접 삭제 타입은 서버 재검증을 강제한다.
      if (type !== 'staff') {
        const authorized = await verifyServerAuthorization();
        if (!authorized) {
          throw new Error('서버 권한 재검증에 실패했습니다. 보안 암호를 다시 확인해 주세요.');
        }
      }

      if (
        type === 'chat' ||
        type === 'inventory' ||
        type === 'board' ||
        type === 'schedule' ||
        type === 'system_logs' ||
        type === 'expired_contracts' ||
        type === 'expired_popups' ||
        type === 'force_logout'
      ) {
        const res = await fetch('/api/admin/data-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
      }
      else if (type === 'staff') {
        const res = await fetch('/api/admin/reset-staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        toast((data?.message || '삭제 완료') + " 페이지를 새로고침합니다.", 'success');
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      toast("선택하신 데이터 초기화 작업이 성공적으로 완료되었습니다.", 'success');
      setSelectedAction(null);
      setReviewStep(1);
      setTypedConfirmation('');
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast("데이터 삭제 중 오류가 발생했습니다.\n\n" + msg + "\n\nSupabase 대시보드에서 RLS 정책 또는 API 권한을 확인해 주세요.", 'error');
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-500">
      {!isUnlocked ? (
        <div className="bg-[var(--card)] p-6 border border-danger/20 rounded-[var(--radius-xl)] shadow-sm text-center space-y-4 max-w-sm w-full">
          <h3 className="font-semibold text-base text-danger tracking-tight uppercase">시스템 보안 인증</h3>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold tracking-widest uppercase">보안 구역 접근을 위해 암호를 입력하세요</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            className="w-full p-2 bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-md)] text-center font-semibold text-xl outline-none focus:border-danger"
            placeholder="••••••"
          />
          <button onClick={handleUnlock} className="w-full py-2 bg-danger text-white text-xs font-semibold rounded-[var(--radius-md)] shadow-sm">보안 잠금 해제</button>
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-danger/10 p-4 border border-danger/20 rounded-[var(--radius-lg)] text-center mb-4">
            <h3 className="text-danger font-semibold text-sm mb-1 tracking-tight uppercase">통합 데이터 초기화 관리</h3>
            <p className="text-[11px] text-danger/70 font-bold uppercase tracking-widest">항목 선택 후 영향 범위와 백업 상태를 확인해야 실행할 수 있습니다.</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {RESET_ACTIONS.map((action) => (
              <ResetButton
                key={action.type}
                onClick={() => openDangerReview(action)}
                label={action.label}
                badge={action.badge}
                disabled={resetting !== null}
                loading={resetting === action.type}
                dangerLevel={action.dangerLevel}
              />
            ))}
          </div>

          <button
            onClick={() => setIsUnlocked(false)}
            className="w-full py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest hover:text-[var(--toss-gray-4)] transition-colors"
          >
            관리자 모드 종료 및 화면 잠금
          </button>

          {selectedAction ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
              <div className="w-full max-w-xl overflow-hidden rounded-[var(--radius-xl)] border border-danger/25 bg-[var(--card)] shadow-2xl">
                <div className="border-b border-danger/15 bg-danger/10 px-5 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-danger">
                    위험 작업 {reviewStep}/2
                  </p>
                  <h3 className="mt-1 text-lg font-black text-[var(--foreground)]">{selectedAction.label}</h3>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--toss-gray-4)]">{selectedAction.description}</p>
                </div>

                <div className="space-y-4 px-5 py-4">
                  {reviewStep === 1 ? (
                    <>
                      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/50 p-4">
                        <p className="text-[12px] font-black text-[var(--foreground)]">영향 범위</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedAction.impact.map((item) => (
                            <span key={item} className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] ring-1 ring-[var(--border)]">
                              {item}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 text-[11px] font-semibold leading-relaxed text-danger">
                          {selectedAction.recovery}
                        </p>
                      </section>

                      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
                        <p className="text-[12px] font-black text-[var(--foreground)]">최근 백업 상태</p>
                        {backupLoading ? (
                          <p className="mt-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">백업 이력을 확인하는 중입니다.</p>
                        ) : latestBackup ? (
                          <div className="mt-2 grid gap-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                            <p>파일: {latestBackup.file_name || '이름 없음'}</p>
                            <p>상태: {latestBackup.status || '미상'} · {Number(latestBackup.total_tables || 0).toLocaleString('ko-KR')}개 테이블 · {Number(latestBackup.total_rows || 0).toLocaleString('ko-KR')}건</p>
                            <p>시작: {formatDateTime(latestBackup.started_at)} / 종료: {formatDateTime(latestBackup.finished_at)}</p>
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] font-semibold text-danger">
                            조회 가능한 백업 이력이 없습니다. 데이터 백업 메뉴에서 백업을 먼저 생성하는 것을 권장합니다.
                          </p>
                        )}
                      </section>
                    </>
                  ) : (
                    <section className="rounded-[var(--radius-lg)] border border-danger/20 bg-danger/10 p-4">
                      <p className="text-[12px] font-black text-danger">최종 입력 확인</p>
                      <p className="mt-2 text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-4)]">
                        아래 입력칸에 <span className="font-black text-danger">{selectedAction.confirmationText}</span> 문구를 정확히 입력해야 실행 버튼이 활성화됩니다.
                      </p>
                      <input
                        value={typedConfirmation}
                        onChange={(event) => setTypedConfirmation(event.target.value)}
                        className="mt-3 w-full rounded-[var(--radius-md)] border border-danger/20 bg-[var(--card)] px-3 py-2 text-sm font-bold outline-none focus:border-danger"
                        placeholder={selectedAction.confirmationText}
                      />
                    </section>
                  )}
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--muted)]/40 px-5 py-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDangerReview}
                    disabled={resetting !== null}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[12px] font-bold text-[var(--toss-gray-4)] disabled:opacity-50"
                  >
                    취소
                  </button>
                  {reviewStep === 1 ? (
                    <button
                      type="button"
                      onClick={() => setReviewStep(2)}
                      className="rounded-[var(--radius-md)] bg-[var(--foreground)] px-4 py-2 text-[12px] font-bold text-white"
                    >
                      영향 확인 완료
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void runReset(selectedAction.type)}
                      disabled={!confirmationMatches || resetting !== null}
                      className="rounded-[var(--radius-md)] bg-danger px-4 py-2 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resetting === selectedAction.type ? '실행 중...' : '초기화 실행'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ResetButton({
  onClick,
  label,
  badge,
  disabled,
  loading,
  dangerLevel,
}: {
  onClick: () => void;
  label: string;
  badge?: string;
  disabled?: boolean;
  loading?: boolean;
  dangerLevel: 'warning' | 'critical';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-3 bg-[var(--card)] border rounded-[var(--radius-md)] hover:border-danger hover:text-danger text-left font-semibold text-xs flex justify-between items-center transition-all group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-inherit ${
        dangerLevel === 'critical' ? 'border-danger/15' : 'border-[var(--border)]'
      }`}
    >
      <span>{loading ? '처리 중...' : label}</span>
      <span className="text-[11px] font-bold uppercase text-danger">
        {badge || '검토하기'}
      </span>
    </button>
  );
}
