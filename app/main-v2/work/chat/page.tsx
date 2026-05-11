/**
 * chat/page.tsx — 채팅 (RSC)
 *
 * JM: 단일 책임 — metadata + ChatClient 마운트
 */

import type { Metadata } from 'next';
import { ChatClient } from './ChatClient';

export const metadata: Metadata = { title: '채팅' };

export default function ChatPage() {
  return <ChatClient />;
}
