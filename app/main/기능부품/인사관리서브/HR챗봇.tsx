'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function HRAIChatbot({ user }: any) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'ai'; content: string }[]>([
        { role: 'ai', content: `안녕하세요, ${user?.name || '직원'}님! 사내 규정, 남은 연차, 비품 신청 등 궁금한 점을 물어보세요. 🤖` }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    // Mock AI response logic tailored to HR SaaS context
    const getAIResponse = async (text: string) => {
        const query = text.toLowerCase();

        return new Promise<string>((resolve) => {
            setTimeout(async () => {
                // Mock DB fetch for specific questions
                if (query.includes('연차') && (query.includes('몇') || query.includes('남았'))) {
                    try {
                        const { data } = await supabase.from('staff_members').select('annual_leave_total, annual_leave_used').eq('id', user?.id).single();
                        if (data) {
                            resolve(`${user?.name}님의 총 발생 연차는 **${data.annual_leave_total}일**이며, 현재까지 사용한 연차는 **${data.annual_leave_used}일**입니다. 따라서 잔여 연차는 **${data.annual_leave_total - data.annual_leave_used}일** 남았습니다! 더 필요하신 게 있나요?`);
                        } else {
                            resolve(`현재 ${user?.name}님의 연차 정보를 조회할 수 없습니다. 인사팀에 확인해주세요.`);
                        }
                    } catch {
                        resolve(`일시적인 오류로 연차 정보를 불러오지 못했습니다.`);
                    }
                    return;
                }

                if (query.includes('퇴사')) {
                    resolve('퇴사 절차는 인사관리 시스템의 **원클릭 오프보딩** 기능을 통해 진행됩니다. 퇴사 예정일자 30일 이전에 부서장에게 면담을 요청하신 뒤 인사팀에 통보해주세요.');
                    return;
                }

                if (query.includes('비품') || query.includes('노트북')) {
                    resolve('사내 비품 대여는 **재고관리 > 자산** 탭에서 신청하실 수 있습니다. 필요하신 노트북이나 법인카드의 QR 코드를 스캔하거나 시스템에서 직접 승인 요청을 해주세요.');
                    return;
                }

                if (query.includes('경조사') || query.includes('축의금')) {
                    resolve('본인 결혼 시 경조금 50만원과 특별휴가 5일이 지급됩니다. `게시판 > 규정위키`에서 더 자세한 취업 규칙을 확인하실 수 있습니다.');
                    return;
                }

                resolve('질문하신 내용과 관련된 사내 위키 문서를 찾고 있습니다... 구체적으로 어떤 부서의 어떤 절차가 궁금하신가요?');
            }, 1000);
        });
    };

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setLoading(true);

        const aiMsg = await getAIResponse(userMsg);
        setMessages(prev => [...prev, { role: 'ai', content: aiMsg }]);
        setLoading(false);
    };

    return (
        <>
            {/* Floating Button */}
            <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-[100]">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-16 h-16 bg-slate-800 text-white rounded-full shadow-2xl flex items-center justify-center text-3xl hover:-translate-y-1 transition-transform relative group"
                >
                    🤖
                    {!isOpen && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                    )}
                    <span className="absolute -top-10 right-0 w-max px-3 py-1 bg-black/80 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
                        HR 규정 / 연차 즉답 봇
                    </span>
                </button>
            </div>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-24 right-4 md:right-10 w-[calc(100vw-32px)] md:w-96 h-[500px] max-h-[70vh] bg-white rounded-3xl shadow-2xl border border-slate-200 z-[100] flex flex-col animate-in slide-in-from-bottom-5 duration-300 overflow-hidden">
                    <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <div>
                                <h3 className="text-sm font-black">AI 사내 비서</h3>
                                <p className="text-[10px] text-slate-300">사내 규정 위키 기반 즉답</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-slate-300 hover:text-white p-2">✕</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 relative custom-scrollbar">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {m.role === 'ai' && <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs mr-2 shrink-0">🤖</div>}
                                <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-xs font-medium leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-[var(--toss-blue)] text-white rounded-tr-sm' : 'bg-white border text-slate-700 rounded-tl-sm'}`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs mr-2 shrink-0">🤖</div>
                                <div className="px-5 py-3 rounded-2xl bg-white border rounded-tl-sm flex items-center gap-1">
                                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></span>
                                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSend} className="p-3 border-t border-slate-200 bg-white shrink-0 flex gap-2">
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="예: 내 연차 며칠 남았어?"
                            className="flex-1 px-4 py-3 bg-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/50 transition-all"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || loading}
                            className="w-12 h-12 bg-slate-800 text-white rounded-xl flex items-center justify-center shadow hover:bg-slate-700 disabled:opacity-50 transition-colors shrink-0"
                        >
                            ↑
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}
