/**
 * my-todo/page.tsx — 할 일 (RSC)
 *
 * JM: 단일 책임 — metadata + TodoClient 마운트
 */

import type { Metadata } from 'next';
import { TodoClient } from './TodoClient';

export const metadata: Metadata = { title: '할 일' };

export default function MyTodoPage() {
  return <TodoClient />;
}
