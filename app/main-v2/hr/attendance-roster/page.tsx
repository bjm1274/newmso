/**
 * attendance-roster/page.tsx — 근무표 (RSC)
 *
 * JM : 단일 책임 — metadata + Client 마운트
 */

import type { Metadata } from 'next';
import { AttendanceRosterClient } from './AttendanceRosterClient';

export const metadata: Metadata = { title: '근무표' };

export default function AttendanceRosterPage() {
  return <AttendanceRosterClient />;
}
