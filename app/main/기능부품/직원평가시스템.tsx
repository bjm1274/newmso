'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Evaluation {
    id: string;
    staff_id: string;
    evaluator_id: string;
    category: string;
    content: string;
    score: number | null;
    created_at: string;
    evaluator_name?: string;
    evaluator_position?: string;
}

export default function StaffEvaluationSystem({ user, staffs = [] }: { user: any; staffs?: any[] }) {
    const [selectedStaff, setSelectedStaff] = useState<Record<string, unknown> | null>(null);
    const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // 입력 폼 상태
    const [category, setCategory] = useState('성과');
    const [content, setContent] = useState('');
    const [score, setScore] = useState<number>(3);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchEvaluations = useCallback(async (staffId: string) => {
        setLoading(true);
        setFetchError(null);
        try {
            const { data, error } = await supabase
                .from('staff_evaluations')
                .select(`
          *,
          evaluator:evaluator_id ( name, position )
        `)
                .eq('staff_id', staffId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formatted = (data || []).map((item: any) => ({
                ...item,
                evaluator_name: item.evaluator?.name || '관리자',
                evaluator_position: item.evaluator?.position || ''
            }));

            setEvaluations(formatted);
        } catch (err) {
            console.error('평가 데이터 로드 실패:', err);
            setFetchError('평가 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedStaff?.id) {
            fetchEvaluations(selectedStaff.id as string);

            // 실시간 구독
            const channel = supabase
                .channel(`staff-eval-${selectedStaff.id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'staff_evaluations',
                    filter: `staff_id=eq.${selectedStaff.id}`
                }, () => {
                    fetchEvaluations(selectedStaff.id as string);
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        } else {
            setEvaluations([]);
        }
    }, [selectedStaff?.id, fetchEvaluations]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStaff?.id || !content.trim()) return;

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('staff_evaluations').insert([{
                staff_id: selectedStaff.id,
                evaluator_id: user.id,
                category,
                content,
                score: category === '성과' ? score : null
            }]);

            if (error) throw error;

            setEvaluations(prev => [
                {
                    id: crypto.randomUUID(),
                    staff_id: selectedStaff.id as string,
                    evaluator_id: user.id,
                    category,
                    content,
                    score: category === '?깃낵' ? score : null,
                    created_at: new Date().toISOString(),
                    evaluator_name: user.name || '관리자',
                    evaluator_position: user.position || '',
                },
                ...prev,
            ]);

            setContent('');
            setCategory('성과');
            setScore(3);
            alert('기록이 완료되었습니다.');
        } catch (err) {
            console.error('평가 저장 실패:', err);
            alert('저장에 실패했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const deleteEvaluation = async (id: string) => {
        if (!confirm('이 기록을 정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('staff_evaluations').delete().eq('id', id);
            if (error) throw error;
            setEvaluations(prev => prev.filter((item) => item.id !== id));
        } catch (err) {
            alert('삭제에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col lg:flex-row h-full gap-4 animate-in fade-in duration-500" data-testid="staff-evaluation-view">
            {/* 1. 직원 목록 (좌측) */}
            <aside className="w-full lg:w-80 flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-sm overflow-hidden">
                <div className="p-5 border-b border-[var(--border)] bg-[var(--muted)]/30">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">평가 대상 직원</h3>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                    {staffs.map((s) => (
                        <button
                            key={s.id}
                            data-testid={`staff-evaluation-select-${s.id}`}
                            onClick={() => setSelectedStaff(s)}
                            className={`w-full flex items-center gap-3 p-3 rounded-[var(--radius-lg)] transition-all text-left ${selectedStaff?.id === s.id
                                    ? 'bg-[var(--accent)] text-white shadow-md'
                                    : 'hover:bg-[var(--muted)] text-[var(--foreground)]'
                                }`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${selectedStaff?.id === s.id ? 'bg-[var(--card)]/20' : 'bg-[var(--toss-gray-2)] text-[var(--toss-gray-4)]'
                                }`}>
                                {s.name?.slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold truncate">{s.name}</p>
                                <p className={`text-[9px] font-medium opacity-70 truncate`}>{s.department} · {s.position}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            {/* 2. 기록 및 타임라인 (우측) */}
            <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                {!selectedStaff ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] border-dashed text-[var(--toss-gray-3)]">
                        <span className="text-4xl mb-4">✍️</span>
                        <p className="text-sm font-bold">직원을 선택하여 평가 및 기록을 시작하세요</p>
                    </div>
                ) : (
                    <>
                        {/* 상단: 새 기록 입력 */}
                        <section className="bg-[var(--card)] p-4 rounded-[var(--radius-xl)] border border-[var(--border)] shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded-full flex items-center justify-center text-xl font-black">
                                        {(selectedStaff.name as string)?.slice(0, 1)}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-[var(--foreground)]">{selectedStaff.name as string} <span className="text-[var(--toss-gray-3)] text-xs font-medium">{selectedStaff.position as string}</span></h3>
                                        <p className="text-[11px] font-bold text-[var(--accent)] uppercase tracking-wider">{selectedStaff.department as string} 소속</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">기록자 (부서장)</p>
                                    <p className="text-xs font-bold text-[var(--foreground)]">{user.name} {user.position}</p>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">기록 유형</label>
                                        <div className="flex gap-1.5 p-1 bg-[var(--muted)] rounded-[var(--radius-lg)]">
                                            {['성과', '문제사항', '칭찬', '주의', '기타'].map((cat) => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => setCategory(cat)}
                                                    className={`flex-1 py-2 text-[10px] font-bold rounded-[var(--radius-md)] transition-all ${category === cat
                                                            ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                                                            : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
                                                        }`}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {category === '성과' && (
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">평정 점수 (1-5)</label>
                                            <div className="flex items-center gap-4 py-2">
                                                <input
                                                    type="range" min="1" max="5" step="1"
                                                    value={score} onChange={(e) => setScore(parseInt(e.target.value))}
                                                    className="flex-1 accent-[var(--accent)] cursor-pointer"
                                                />
                                                <span className="text-lg font-black text-[var(--accent)] w-4">{score}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">상세 기록 사항</label>
                                    <textarea
                                        data-testid="staff-evaluation-content"
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder="업무 성과, 태도 변화, 발생한 이슈 등을 구체적으로 기록하세요..."
                                        className="w-full h-24 p-4 bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] text-xs font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all resize-none"
                                        required
                                    />
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        data-testid="staff-evaluation-submit"
                                        disabled={isSubmitting}
                                        className="px-5 py-3 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-lg)] shadow-sm hover:opacity-95 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        {isSubmitting ? '기록 중...' : '실시간 기록 저장'}
                                    </button>
                                </div>
                            </form>
                        </section>

                        {/* 하단: 기록 타임라인 */}
                        <section className="flex-1 flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-sm overflow-hidden">
                            <div className="p-5 border-b border-[var(--border)] flex justify-between items-center">
                                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                                    <span>📜</span> 평가 기록 히스토리
                                </h3>
                                {loading && <span className="text-[10px] text-[var(--accent)] animate-pulse font-bold uppercase">새로고침 중...</span>}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                                {fetchError ? (
                                    <div className="h-full flex flex-col items-center justify-center text-red-400">
                                        <p className="text-xs font-bold">{fetchError}</p>
                                    </div>
                                ) : evaluations.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                                        <p className="text-xs font-bold">기록된 이력이 없습니다.</p>
                                    </div>
                                ) : (
                                    <div className="relative border-l-2 border-[var(--muted)] ml-2 pl-6 space-y-5">
                                        {evaluations.map((ev) => (
                                            <div key={ev.id} data-testid={`staff-evaluation-item-${ev.id}`} className="relative group">
                                                {/* 타임라인 점 */}
                                                <div className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full border-4 border-[var(--card)] shadow-sm ${ev.category === '문제사항' ? 'bg-red-500' :
                                                        ev.category === '칭찬' ? 'bg-emerald-500' :
                                                            ev.category === '주의' ? 'bg-orange-500' : 'bg-[var(--accent)]'
                                                    }`} />

                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${ev.category === '문제사항' ? 'bg-red-50 text-red-600' :
                                                                    ev.category === '칭찬' ? 'bg-emerald-50 text-emerald-600' :
                                                                        ev.category === '주의' ? 'bg-orange-50 text-orange-600' :
                                                                            'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                                                                }`}>
                                                                {ev.category} {ev.score ? ` · ${ev.score}점` : ''}
                                                            </span>
                                                            <span className="text-[10px] text-[var(--toss-gray-3)] font-medium">
                                                                {new Date(ev.created_at).toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => deleteEvaluation(ev.id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-all"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>

                                                    <div className="bg-[var(--muted)]/50 p-4 rounded-[var(--radius-lg)] border border-[var(--border)]/50">
                                                        <p className="text-xs text-[var(--foreground)] font-medium leading-relaxed whitespace-pre-wrap">
                                                            {ev.content}
                                                        </p>
                                                        <div className="mt-3 flex items-center justify-end gap-1 text-[9px] text-[var(--toss-gray-3)] font-bold">
                                                            <span>작성자:</span>
                                                            <span className="text-[var(--toss-gray-4)]">{ev.evaluator_name} {ev.evaluator_position}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}
