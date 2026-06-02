'use client';

import { useState, useRef, useEffect } from 'react';
import { LucideIcon } from './조직도서브/조직도측면창';
import { toast } from '@/lib/toast';

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
};

type QuickTemplate = {
  icon: string;
  title: string;
  description: string;
  query: string;
  colorClass: string;
};

const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    icon: 'CalendarDays',
    title: '📅 근무 교대표 팁',
    description: '효율적인 나이트/이브닝 순환 듀티 배정 요령',
    query: '교대 근무표를 짤 때 직원 건강과 의료 사고를 막기 위한 배치 팁을 가르쳐줘.',
    colorClass: 'from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  {
    icon: 'Award',
    title: '📋 연차 유급휴가 기준',
    description: '근로기준법에 따른 연차 휴가 발생과 소멸 규정',
    query: '근로기준법 60조에 따른 연차 발생 기준과 연차 소멸/촉진 제도에 대해 쉽게 설명해줘.',
    colorClass: 'from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    icon: 'Package',
    title: '📦 소모품 적정 재고선',
    description: '안전재고(Min Stock) 산출식 및 선입선출법',
    query: '병원 내 소모품의 안전재고(Min Stock) 설정식과 재고 관리 최적화 방안을 가르쳐줘.',
    colorClass: 'from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    icon: 'Sparkles',
    title: '🌟 Gemini 기능 소개',
    description: '이 AI 어시스턴트로 할 수 있는 행정 업무 질문 목록',
    query: '안녕하세요! 당신이 누구인지 소개하고, 병원 행정 비서로서 무엇을 도와줄 수 있는지 가이드라인을 알려주세요.',
    colorClass: 'from-purple-500/10 to-pink-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  },
];

export default function GeminiAssistant({ user }: { user?: any }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 초기 웰컴 메시지 등록
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        content: `안녕하세요, ${user?.name || '직원'}님! 🌟 병원 행정 및 MSO 업무를 돕는 전문 AI 비서 **Gemini**입니다.

인사·근태 규정, 근무표 작성 요령, 소모품 적정 재고 분석 등 궁금한 점이 있으시다면 언제든 무엇이든 편하게 물어보세요!
아래의 퀵 템플릿 카드를 클릭하시거나 채팅창에 자유롭게 질문을 입력해 주시면 됩니다.`,
        timestamp: new Date(),
      },
    ]);
  }, [user?.name]);

  // 스크롤 항상 아래로 유지
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    try {
      const chatHistory = [...messages, userMsg].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          systemInstruction: `당신은 병원 행정 및 간호 업무를 돕는 친절한 MSO(병원경영지원) 전문 AI 비서 "Gemini"입니다. 
사용자 이름은 ${user?.name || '직원'}이고 직책은 ${user?.position || '사원'}, 소속 부서는 ${user?.department || '부서 미정'}입니다.
답변은 읽기 쉽게 Markdown 형식으로 서식을 제공하고, 병원 업무 관점에서 항상 상냥하고 상세하게 답해 주세요.`,
        }),
      });

      const data = (await res.json().catch(() => null)) as { ok: boolean; text?: string; error?: string } | null;

      if (!res.ok || !data || !data.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          content: data.text || '죄송합니다. 답변을 받지 못했습니다.',
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error('[GeminiAssistant] 전송 실패:', err);
      toast('Gemini 답변을 가져오는 도중 오류가 발생했습니다.', 'error');
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'model',
          content: `⚠️ **AI 응답 중 에러가 발생했습니다.**
          
서버와의 연결이 일시적으로 원활하지 않거나 API 호출 제한에 도달했을 수 있습니다. 잠시 후 다시 시도해 주세요.
*오류 내용: ${err instanceof Error ? err.message : '알 수 없는 연결 실패'}*`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex h-[calc(100vh-140px)] min-h-[500px] w-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-xl animate-in fade-in duration-300"
      data-testid="gemini-assistant-panel"
    >
      {/* AI 헤더 */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent)]/5 via-transparent to-[var(--accent)]/5 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md animate-pulse">
            <LucideIcon name="Sparkles" size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-[var(--foreground)]">Gemini AI 행정 어시스턴트</h3>
            <p className="text-[10.5px] font-bold text-[var(--toss-gray-3)]">
              구글 Gemini 3.5 Flash 모델 기반 · 병원 전문 비서
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
          실시간 연동 활성화
        </div>
      </header>

      {/* 대화 뷰 및 사이드 템플릿 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 중앙 채팅 영역 */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[var(--muted)]/20">
          <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-6 space-y-4">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex w-full gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {/* AI 아이콘 */}
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500 border border-indigo-500/20 shadow-sm">
                      <LucideIcon name="Sparkles" size={14} />
                    </div>
                  )}

                  {/* 메시지 버블 */}
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm font-semibold whitespace-pre-wrap ${
                      isUser
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none'
                        : 'bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-tl-none prose dark:prose-invert prose-sm max-w-none'
                    }`}
                  >
                    {msg.content}
                    <div
                      className={`text-[9px] mt-1.5 font-bold ${
                        isUser ? 'text-white/60 text-right' : 'text-[var(--toss-gray-3)]'
                      }`}
                    >
                      {msg.timestamp.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI 답변 중 로딩 */}
            {loading && (
              <div className="flex w-full gap-3 justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500 border border-indigo-500/20 shadow-sm animate-spin">
                  <LucideIcon name="Loader2" size={14} />
                </div>
                <div className="rounded-2xl rounded-tl-none border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--toss-gray-3)]">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    Gemini가 근무표, 연차 및 재고 규정을 분석하며 적절한 답변을 작성 중입니다...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 템플릿 카드덱 (메시지가 웰컴 메시지뿐일 때만 더 크게 보여주고, 이후에는 입력창 위에 작게 배치) */}
          {messages.length <= 1 && (
            <div className="px-5 pb-3 pt-2 shrink-0 border-t border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm">
              <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-2 uppercase tracking-wider">
                💡 자주 묻는 퀵 템플릿
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {QUICK_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.title}
                    type="button"
                    onClick={() => handleSend(tmpl.query)}
                    className={`flex flex-col items-start p-3 rounded-xl border bg-gradient-to-br ${tmpl.colorClass} text-left transition-all hover:scale-[0.98] hover:shadow-md group`}
                  >
                    <div className="mb-2 shrink-0 rounded-lg bg-[var(--card)] p-1.5 shadow-sm transition-transform group-hover:scale-110">
                      <LucideIcon name={tmpl.icon} size={14} />
                    </div>
                    <p className="text-xs font-black text-[var(--foreground)] leading-tight mb-1">{tmpl.title}</p>
                    <p className="text-[10px] font-medium text-[var(--toss-gray-3)] leading-relaxed">
                      {tmpl.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 입력 폼 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(inputValue);
            }}
            className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--card)] p-4"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={loading}
              placeholder="예: 1년 미만 입사자의 연차 지급 규정을 알려줘"
              className="flex-1 rounded-xl bg-[var(--muted)] border border-[var(--border)] px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all disabled:opacity-50 text-[var(--foreground)]"
            />
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-sm hover:scale-[0.96] transition-all disabled:opacity-40 disabled:hover:scale-100"
              title="메시지 전송"
            >
              <LucideIcon name="Send" size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
