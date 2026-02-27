'use client';
import { useState } from 'react';

export default function FinancialDashboard() {
    const [period, setPeriod] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4' | '초기화'>('Q1');

    // Hardcoded mockup data removed. Now initializing with zero.
    const [cashFlow, setCashFlow] = useState({
        in: 0,
        out: 0,
        balance: 0
    });

    const [budgets, setBudgets] = useState<any[]>([]);

    // TODO: useEffect에서 실제 supabase fetch (daily_closures 등) 로직 구현 가능


    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-[var(--toss-border)] pb-4 space-y-4 md:space-y-0">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-[var(--foreground)] tracking-tight">C-Level 재무분석 보드</h2>
                    <p className="text-[11px] md:text-xs text-[var(--toss-gray-3)] font-bold uppercase mt-1">Financial & Budget Dashboard</p>
                </div>
                <div className="flex gap-2">
                    {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                        <button key={q} onClick={() => setPeriod(q as any)} className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${period === q ? 'bg-[var(--toss-blue)] text-white' : 'bg-slate-100 text-slate-500'}`}>{q}</button>
                    ))}
                </div>
            </div>

            {/* Top: Cash Flow Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="w-8 h-8 rounded-full bg-emerald-200 text-emerald-700 flex items-center justify-center font-black">↓</span>
                        <span className="text-xs font-black text-emerald-800 uppercase">Cash In (수익/입금)</span>
                    </div>
                    <p className="text-3xl font-black text-emerald-700 mt-4">₩ {(cashFlow.in).toLocaleString()}</p>
                </div>
                <div className="p-6 bg-red-50 rounded-3xl border border-red-100">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="w-8 h-8 rounded-full bg-red-200 text-red-700 flex items-center justify-center font-black">↑</span>
                        <span className="text-xs font-black text-red-800 uppercase">Cash Out (지출/출금)</span>
                    </div>
                    <p className="text-3xl font-black text-red-700 mt-4">₩ {(cashFlow.out).toLocaleString()}</p>
                </div>
                <div className="p-6 bg-[var(--toss-blue-light)] rounded-3xl border border-[var(--toss-blue)]/20">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="w-8 h-8 rounded-full bg-[var(--toss-blue)] text-white flex items-center justify-center font-black">💰</span>
                        <span className="text-xs font-black text-[var(--toss-blue)] uppercase">Net Balance (순잉여금)</span>
                    </div>
                    <p className="text-3xl font-black text-[var(--toss-blue)] mt-4">₩ {(cashFlow.balance).toLocaleString()}</p>
                </div>
            </div>

            {/* Middle: Budget vs Actuals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
                    <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
                        <span>🔥</span> 부서별 예산 통제 현황 (Budget Burn Rate)
                    </h3>
                    <div className="space-y-6">
                        {budgets.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                                예산 데이터가 없습니다
                            </div>
                        ) : budgets.map((b, i) => {
                            const percent = (b.used / b.total) * 100;
                            const isWarning = percent > 85;
                            return (
                                <div key={i} className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-slate-700">{b.name}</span>
                                        <span className="text-slate-500">{(b.used).toLocaleString()} / {(b.total).toLocaleString()} 원 ({percent.toFixed(1)}%)</span>
                                    </div>
                                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                                        <div
                                            className={`h-full ${isWarning ? 'bg-red-500' : 'bg-[var(--toss-blue)]'}`}
                                            style={{ width: `${percent}%`, transition: 'width 1s ease-out' }}
                                        ></div>
                                    </div>
                                    {isWarning && <p className="text-[10px] text-red-500 font-bold text-right -mt-1">예산 소진율 85% 초과 (통제 필요)</p>}
                                </div>
                            );
                        })}

                    </div>
                </div>

                <div className="bg-slate-900 rounded-3xl p-6 md:p-8 shadow-xl text-white relative overflow-hidden flex flex-col justify-center border border-slate-700">
                    <div className="absolute top-0 right-0 p-8 text-8xl opacity-10">📉</div>
                    <h3 className="text-sm font-black text-white mb-2 relative z-10">AI 재무 건전성 분석</h3>
                    <p className="text-[11px] font-medium text-slate-400 leading-relaxed relative z-10 italic">
                        실제 데이터를 분석 중입니다. 데이터가 충분히 쌓이면 경영진을 위한 인사이트가 자동으로 생성됩니다.
                    </p>
                    <div className="mt-8 grid grid-cols-2 gap-4 relative z-10">
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">런웨이 (Runway)</p>
                            <p className="text-xl font-black mt-1">데이터 부족</p>
                        </div>
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">OpEx 런레이트</p>
                            <p className="text-xl font-black mt-1 text-slate-500">-</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
