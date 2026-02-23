'use client';

import { useState, useRef, useEffect } from 'react';

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export type AIChatBoxProps = {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
};

/**
 * AI 채팅 박스 컴포넌트
 * /api/ai/chat API 호출
 */
export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = '메시지를 입력하세요...',
  className = '',
  height = '500px',
  emptyStateMessage = 'AI 어시스턴트와 대화를 시작하세요',
  suggestedPrompts = [
    '급여 명세서 조회 방법',
    '연차 신청 절차',
    '전자결재 양식 안내',
  ],
}: AIChatBoxProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSendMessage(trimmed);
    setInput('');
  };

  return (
    <div
      className={`flex flex-col bg-white border border-[var(--toss-border)] rounded-[12px] shadow-sm overflow-hidden ${className}`}
      style={{ height }}
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 text-[var(--toss-gray-3)]">
            <span className="text-4xl">✨</span>
            <p className="text-sm font-bold">{emptyStateMessage}</p>
            {suggestedPrompts.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => onSendMessage(prompt)}
                    disabled={isLoading}
                    className="px-4 py-2 text-xs font-bold bg-[var(--toss-gray-1)] hover:bg-[var(--toss-gray-2)] rounded-[16px] transition-colors disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-[12px] text-sm ${
                  msg.role === 'user'
                    ? 'bg-[var(--toss-blue)] text-white'
                    : 'bg-[var(--toss-gray-1)] text-[var(--foreground)]'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] text-sm">
              <span className="animate-pulse">답변 생성 중...</span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 p-4 border-t border-[var(--toss-border)] bg-[var(--toss-gray-1)]"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          className="flex-1 px-4 py-3 rounded-[16px] border border-[var(--toss-border)] bg-white text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="px-5 py-3 bg-[var(--toss-blue)] text-white rounded-[16px] font-bold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          전송
        </button>
      </form>
    </div>
  );
}
