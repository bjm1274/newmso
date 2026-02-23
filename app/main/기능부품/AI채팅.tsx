'use client';

import { useState, useCallback } from 'react';
import { AIChatBox, Message } from './AIChatBox';

export default function AIChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = useCallback(async (content: string) => {
    const userMsg: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = (await res.json()) as { content?: string; error?: string };
      const assistantContent = data.content || data.error || '응답을 받지 못했습니다.';

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantContent },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '연결 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] p-4 md:p-8">
      <header className="mb-6">
        <h2 className="text-xl md:text-2xl font-semibold text-gray-800 tracking-tighter italic">
          AI 업무 도우미
        </h2>
        <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1 tracking-widest">
          인사·급여·근태·전자결재 문의
        </p>
      </header>
      <div className="flex-1 min-h-0">
        <AIChatBox
          messages={messages}
          onSendMessage={handleSend}
          isLoading={isLoading}
          placeholder="질문을 입력하세요..."
          height="100%"
          emptyStateMessage="SY INC. MSO 시스템에 대해 무엇이든 물어보세요"
          suggestedPrompts={[
            '급여 명세서 조회 방법',
            '연차 신청 절차',
            '전자결재 양식 안내',
            '근태 기록 확인 방법',
          ]}
        />
      </div>
    </div>
  );
}
