'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import TaxFreeSettingsPanel from './급여명세/비과세항목설정';
import LegalStandardsPanel from './급여명세/법정기준패널';
import TaxInsuranceRatesPanel from './급여명세/세율보험요율관리';
import PayrollLockPanel from './급여명세/급여월마감잠금';
import ShiftPatternManager from './급여명세/교대제스케줄관리';

export default function IntegratedHRSettings({ companyName }: { companyName: string }) {
    const [activeMenu, setActiveMenu] = useState('policy');

    return (
        <div className="flex flex-col md:flex-row h-full rounded-[24px] overflow-hidden bg-[var(--page-bg)] border border-[var(--toss-border)] shadow-sm">
            {/* Left Sidebar */}
            <aside className="w-full md:w-64 bg-[var(--toss-gray-1)] border-r border-[var(--toss-border)] p-4 shrink-0 flex flex-col gap-2">
                <h3 className="px-3 pb-3 pt-2 text-xs font-bold text-[var(--toss-gray-4)] uppercase tracking-widest border-b border-[var(--toss-border)] mb-2">인사/급여 앱 설정</h3>
                {[
                    { id: 'policy', icon: '📝', label: '인사 정책 및 룰 (Rules)' },
                    { id: 'tax', icon: '💳', label: '세법 및 비과세 기준' },
                    { id: 'shift', icon: '⏰', label: '스케줄 및 근무제형' },
                    { id: 'lock', icon: '🔒', label: '급여 마감 및 잠금' },
                ].map(menu => (
                    <button
                        key={menu.id}
                        onClick={() => setActiveMenu(menu.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-bold transition-all ${activeMenu === menu.id ? 'bg-[var(--toss-card)] text-[var(--toss-blue)] shadow-sm' : 'text-[var(--foreground)] hover:bg-[var(--toss-gray-2)]'
                            }`}
                    >
                        <span className="text-lg">{menu.icon}</span>
                        <span>{menu.label}</span>
                    </button>
                ))}
            </aside>

            {/* Right Content */}
            <main className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar bg-[var(--page-bg)]">
                {activeMenu === 'policy' && <HRPolicies companyName={companyName} />}
                {activeMenu === 'tax' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col gap-2 mb-6">
                            <h2 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">세법 및 비과세 기준</h2>
                            <p className="text-sm font-medium text-[var(--toss-gray-4)]">최신 한국 세법에 따른 4대보험 요율 및 비과세 한도 룰을 관리합니다.</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            <div className="bg-[var(--toss-card)] p-6 rounded-[20px] shadow-sm border border-[var(--toss-border)]">
                                <TaxFreeSettingsPanel companyName={companyName} />
                            </div>
                            <div className="space-y-8">
                                <div className="bg-[var(--toss-card)] p-6 rounded-[20px] shadow-sm border border-[var(--toss-border)]">
                                    <TaxInsuranceRatesPanel companyName={companyName} />
                                </div>
                                <div className="bg-[var(--toss-card)] p-6 rounded-[20px] shadow-sm border border-[var(--toss-border)]">
                                    <LegalStandardsPanel />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {activeMenu === 'shift' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col gap-2 mb-6">
                            <h2 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">스케줄 및 근무제형</h2>
                            <p className="text-sm font-medium text-[var(--toss-gray-4)]">병원, 교대근무자 등 다양한 근무형태(Day/Eve/Night/Off)를 설정합니다.</p>
                        </div>
                        <div className="bg-[var(--toss-card)] p-6 rounded-[20px] shadow-sm border border-[var(--toss-border)]">
                            <ShiftPatternManager selectedCo={companyName} />
                        </div>
                    </div>
                )}
                {activeMenu === 'lock' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
                        <div className="flex flex-col gap-2 mb-6">
                            <h2 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">급여 마감 및 잠금</h2>
                            <p className="text-sm font-medium text-[var(--toss-gray-4)]">특정 월의 급여 정산이 끝나면 잠금 처리하여 수정 및 덮어쓰기를 원천 차단합니다.</p>
                        </div>
                        <div className="bg-[var(--toss-card)] p-6 rounded-[20px] shadow-sm border border-[var(--toss-border)] border-l-4 border-l-amber-500">
                            <PayrollLockPanel yearMonth={new Date().toISOString().slice(0, 7)} companyName={companyName} />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

// 토글 기능을 포함하는 핵심 인사 정책 화면
function HRPolicies({ companyName }: { companyName: string }) {
    const [policies, setPolicies] = useState({
        annualLeaveStandard: '입사일', // '회계연도' or '입사일'
        autoHolidayPay: true,
        deductLateArrivals: false,
        includeOvertimeInBase: true,
        autoConvertOvertimeToLeave: false
    });

    return (
        <div className="max-w-4xl space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2 mb-6">
                <h2 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">인사 정책 설정 (Rules)</h2>
                <p className="text-sm font-medium text-[var(--toss-gray-4)]">자동화된 시스템이 백그라운드에서 어떤 룰을 기준으로 계산할지 켜고 끕니다.</p>
            </div>

            <div className="space-y-6">
                <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[20px] shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-[var(--toss-border)] bg-[var(--toss-gray-1)]">
                        <h3 className="text-[14px] font-bold text-[var(--toss-blue)] uppercase tracking-wider">연차 및 휴일 룰 🏝️</h3>
                    </div>

                    <div className="p-0 divide-y divide-[var(--toss-border)]">
                        <div className="p-6 flex items-center justify-between hover:bg-[var(--toss-gray-1)]/50 transition-colors">
                            <div>
                                <h4 className="font-bold text-[var(--foreground)] text-[15px] mb-1">법정 공휴일 자동 유급 처리</h4>
                                <p className="text-[12px] text-[var(--toss-gray-4)]">빨간날(대체공휴일 포함)을 근무일에서 자동으로 제외하고 유급 휴일로 계산합니다.</p>
                            </div>
                            <ToggleSwitch checked={policies.autoHolidayPay} onChange={(v) => setPolicies({ ...policies, autoHolidayPay: v })} />
                        </div>

                        <div className="p-6 flex items-center justify-between hover:bg-[var(--toss-gray-1)]/50 transition-colors">
                            <div>
                                <h4 className="font-bold text-[var(--foreground)] text-[15px] mb-1">연차 발생 기준</h4>
                                <p className="text-[12px] text-[var(--toss-gray-4)]">연차 부여 시점을 입사일 기준(정확함)으로 할지, 1월 1일 회계연도 기준(일괄부여)으로 할지 선택합니다.</p>
                            </div>
                            <div className="flex bg-[var(--toss-gray-2)] rounded-[12px] p-1 shadow-inner">
                                <button onClick={() => setPolicies({ ...policies, annualLeaveStandard: '입사일' })} className={`px-4 py-2 text-[12px] font-bold rounded-[8px] transition-all ${policies.annualLeaveStandard === '입사일' ? 'bg-white text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-4)]'}`}>입사일 기준</button>
                                <button onClick={() => setPolicies({ ...policies, annualLeaveStandard: '회계연도' })} className={`px-4 py-2 text-[12px] font-bold rounded-[8px] transition-all ${policies.annualLeaveStandard === '회계연도' ? 'bg-white text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-4)]'}`}>회계년도 기준</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[20px] shadow-sm overflow-hidden mt-8">
                    <div className="p-6 border-b border-[var(--toss-border)] bg-[var(--toss-gray-1)]">
                        <h3 className="text-[14px] font-bold text-[var(--toss-danger)] uppercase tracking-wider">근태 및 차감 룰 ⏰</h3>
                    </div>

                    <div className="p-0 divide-y divide-[var(--toss-border)]">
                        <div className="p-6 flex items-center justify-between hover:bg-[var(--toss-gray-1)]/50 transition-colors">
                            <div>
                                <h4 className="font-bold text-[var(--foreground)] text-[15px] mb-1">지각/조퇴 시 분 단위 자동 시급 차감</h4>
                                <p className="text-[12px] text-[var(--toss-gray-4)]">출결 기록에서 지각이 확인되면, 한 달치 시급을 합산하여 급여 정산 마법사 구동 시 자동으로 기본급에서 차감합니다.</p>
                            </div>
                            <ToggleSwitch checked={policies.deductLateArrivals} onChange={(v) => setPolicies({ ...policies, deductLateArrivals: v })} />
                        </div>

                        <div className="p-6 flex items-center justify-between hover:bg-[var(--toss-gray-1)]/50 transition-colors">
                            <div>
                                <h4 className="font-bold text-[var(--foreground)] text-[15px] mb-1">연장근로 무조건 보상휴가(대휴) 전환</h4>
                                <p className="text-[12px] text-[var(--toss-gray-4)]">추가 수당(돈)을 지급하는 대신, 1.5배 가산된 시간만큼 직원의 '보상 연차' 개수에 자동으로 더해줍니다.</p>
                            </div>
                            <ToggleSwitch checked={policies.autoConvertOvertimeToLeave} onChange={(v) => setPolicies({ ...policies, autoConvertOvertimeToLeave: v })} />
                        </div>

                        <div className="p-6 flex items-center justify-between hover:bg-[var(--toss-gray-1)]/50 transition-colors">
                            <div>
                                <h4 className="font-bold text-[var(--foreground)] text-[15px] mb-1">포괄임금제 (고정 연장수당) 적용 자동화</h4>
                                <p className="text-[12px] text-[var(--toss-gray-4)]">직원 등록 시 월 20시간 등의 연장수당이 미리 세팅된 경우, 초과근무 발생 시 자동 상계(차감) 처리합니다.</p>
                            </div>
                            <ToggleSwitch checked={policies.includeOvertimeInBase} onChange={(v) => setPolicies({ ...policies, includeOvertimeInBase: v })} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button className="px-6 py-3 bg-[var(--toss-blue)] text-white font-bold text-sm rounded-[12px] hover:opacity-90 shadow-lg hover:shadow-xl hover:translate-y-[-1px] transition-all">
                    저장하기
                </button>
            </div>
        </div>
    );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div
            onClick={() => onChange(!checked)}
            className={`relative w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${checked ? 'bg-emerald-500' : 'bg-[var(--toss-gray-3)]'}`}
        >
            <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-6' : 'translate-x-0'}`}></div>
        </div>
    )
}
