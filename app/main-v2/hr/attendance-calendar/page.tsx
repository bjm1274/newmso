/**
 * attendance-calendar/page.tsx — 근태 달력 (RSC)
 *
 * JM : 단일 책임 — metadata + Client 마운트
 */

import type { Metadata } from 'next';
import { AttendanceCalendarClient } from './AttendanceCalendarClient';

export const metadata: Metadata = { title: '근태 달력' };

export default function AttendanceCalendarPage() {
  return <AttendanceCalendarClient />;
}
