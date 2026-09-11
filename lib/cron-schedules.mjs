export const CRON_SCHEDULES = {
    // 15초마다: 채팅 푸시 회수 (즉시 디스패치 실패분). 6필드 = 초 단위.
    '*/15 * * * * *': ['/api/cron/chat-push-dispatch'],
    '* * * * *': ['/api/cron/todo-reminders'],
    '0 10 1 * *': ['/api/cron/auto-report'],
    // KST 00:00 (자정): DB 백업, 결근 자동 생성, 채팅 보존 주기 정리
    '0 0 * * *': ['/api/cron/backup', '/api/cron/absent-auto-create', '/api/cron/chat-retention'],
    // KST 03:00 (새벽): 푸시 구독 정리
    '0 3 * * *': ['/api/cron/push-subscription-cleanup'],
    // KST 09:00 (아침): 생일/연차/급여/인사발령/미읽음 알림 발송
    '0 9 * * *': [
      '/api/cron/unread-notification-repush',
      '/api/cron/leave-notice-announcements',
      '/api/cron/birthday-announcements',
      '/api/cron/annual-leave-accrual',
      '/api/cron/annual-leave-promotion',
      '/api/cron/annual-leave-expiry',
      '/api/cron/substitute-holiday',
      '/api/cron/payroll-notice',
      '/api/cron/appointment-apply',
    ],
  };

export const INDIRECT_CRONS = {
  "/api/cron/license-expiry-check": { parent: "/api/cron/push-subscription-cleanup", handler: "runLicenseExpiryJobs" },
  "/api/cron/inapp-notifications": { parent: "/api/cron/push-subscription-cleanup", handler: "runInappNotificationJobs" },
};
