/**
 * 프로덕션-안전 로깅 유틸리티
 *
 * - 개발 환경: console.warn/error 정상 출력
 * - 프로덕션 환경: console.warn 억제, console.error만 출력
 *
 * 사용법:
 *   import { logger } from '@/lib/logger';
 *   logger.warn('메시지', data);   // 개발에서만 출력
 *   logger.error('메시지', data);  // 항상 출력
 *   logger.info('메시지', data);   // 개발에서만 출력
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  /** 개발 환경에서만 출력되는 경고 로그 */
  warn(...args: unknown[]): void {
    if (isDev) {

      console.warn(...args);
    }
  },

  /** 항상 출력되는 에러 로그 (프로덕션 포함) */
  error(...args: unknown[]): void {

    console.error(...args);
  },

  /** 개발 환경에서만 출력되는 정보 로그 */
  info(...args: unknown[]): void {
    if (isDev) {

      console.info(...args);
    }
  },

  /** 개발 환경에서만 출력되는 디버그 로그 */
  debug(...args: unknown[]): void {
    if (isDev) {

      console.debug(...args);
    }
  },
};
