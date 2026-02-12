import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  crons: [
    { path: '/api/cron/chat-retention', schedule: '0 17 * * *' },
    { path: '/api/cron/backup', schedule: '0 */6 * * *' },
    { path: '/api/cron/backup-full', schedule: '0 15 * * *' },
  ],
};
