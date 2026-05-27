'use client';

/**
 * 내정보 라우터 — home/attend/todo/docs/alert 5 sub-route 전환.
 * MobileShell이 tab === 'home' 일 때 마운트.
 * JM: 단일 책임 (분기만), ~60줄
 */

import type { ErpUser } from '@/types';
import type { MHomeSub } from '../셸/m-routes';
import SHome from './홈';
import SAttend from './출퇴근체크인';
import STodo from './할일';
import SDocs from './서류제출';
import SAlert from './알림';

export type 내정보Props = {
  user: ErpUser;
  sub?: MHomeSub;
  onSub: (sub: MHomeSub | undefined) => void;
  onLogout: () => void;
};

export default function 내정보({ user, sub, onSub, onLogout }: 내정보Props) {
  const staffId = typeof user.id === 'string' ? user.id : null;
  const staffName = typeof user.name === 'string' ? user.name : undefined;
  const company = typeof user.company === 'string' ? user.company : undefined;

  if (sub === 'attend') {
    return (
      <SAttend
        staffId={staffId}
        staffName={staffName}
        company={company}
        onBack={() => onSub(undefined)}
      />
    );
  }
  if (sub === 'todo') {
    return <STodo staffId={staffId} onBack={() => onSub(undefined)} />;
  }
  if (sub === 'docs') {
    return <SDocs staffId={staffId} onBack={() => onSub(undefined)} />;
  }
  if (sub === 'alert') {
    return <SAlert staffId={staffId} onBack={() => onSub(undefined)} />;
  }
  return <SHome user={user} onSub={onSub} onLogout={onLogout} />;
}
