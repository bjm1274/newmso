'use client';
import { toast } from '@/lib/toast';
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';

export default function OffboardingView({ staffs, selectedCo = '전체', onRefresh }: Record<string, unknown>) {
    const _staffs = (staffs as Record<string, unknown>[]) ?? [];
    const _onRefresh = onRefresh as () => void;
    const [activeTab, setActiveTab] = useState<'진행중' | '과거이력'>('진행중');
    const [selectedStaff, setSelectedStaff] = useState<string>('');
    const [exitDate, setExitDate] = useState<string>('');
    const [reason, setReason] = useState<string>('개인 사유');
    const [offboardings, setOffboardings] = useState<any[]>([]); // mock or fetch from DB
    const [loading, setLoading] = useState(false);
    const [checklist, setChecklist] = useState<Record<string, Record<string, boolean>>>({});

    const toggleCheck = (staffId: string, item: string) => {
        setChecklist(prev => ({
            ...prev,
            [staffId]: { ...(prev[staffId] || {}), [item]: !(prev[staffId]?.[item]) }
        }));
    };
    const isChecked = (staffId: string, item: string) => !!checklist[staffId]?.[item];
    const allChecked = (staffId: string) => {
        const items = checklist[staffId];
        if (!items) return false;
        return ['계정파기', '비품회수', '서약서징구', '퇴직금정산'].every(k => items[k]);
    };

    // Filter active staffs who are NOT currently offboarding
    // Filter active staffs who are NOT currently offboarding, respect company filter
    const eligibleStaffs = _staffs.filter((s: any) =>
        (s.status === '재직' || s.status === '계약') &&
        (selectedCo === '전체' || s.company === selectedCo)
    );

    const handleStartOffboarding = async () => {
        if (!selectedStaff || !exitDate) return toast('대상자와 퇴사 예정일을 선택해주세요.', 'warning');
        const staff = _staffs.find((s: any) => s.id === selectedStaff);
        if (!staff) return;

        if (!confirm(`[${staff.name}] 님의 오프보딩 파이프라인을 가동하시겠습니까?\n퇴사 예정일: ${exitDate}`)) return;

        setLoading(true);
        try {
            // 1. Status change logic
            await supabase.from('staff_members').update({ status: '퇴사예정', resigned_at: exitDate }).eq('id', selectedStaff);

            // 2. Offboarding checklist tracking (create a new record in a custom table if exists, else we simulate it)
            // For this UI, we can just visually update or rely on '퇴사예정' status
            toast(`${staff.name} 오프보딩 파이프라인이 생성되었습니다.`);
            _onRefresh();
            setSelectedStaff('');
            setExitDate('');
        } catch (e) {
            console.error(e);
            toast('처리 중 오류가 발생했습니다.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const pendingList = _staffs.filter((s: any) =>
        (s.status === '퇴사예정' || (s.status === '퇴사' && s.resigned_at > new Date().toISOString().slice(0, 10))) &&
        (selectedCo === '전체' || s.company === selectedCo)
    );
    const pastList = _staffs.filter((s: any) =>
        s.status === '퇴사' &&
        (selectedCo === '전체' || s.company === selectedCo)
    );

    const concludeOffboarding = async (id: string, name: string) => {
        if (!confirm(`${name} 님의 모든 체크리스트가 완료되었습니다.\n최종 퇴사 처리하시겠습니까?`)) return;
        setLoading(true);
        try {
            // 1. 직원 상태 변경 + 권한 비활성화
            await supabase.from('staff_members').update({
                status: '퇴사',
                permissions: {},
                role: 'inactive',
            }).eq('id', id);

            // 2. 채팅방 멤버에서 제거
            await supabase.from('chat_participants').delete().eq('user_id', id);

            // 3. 알림 구독 해제 (push_subscriptions)
            await supabase.from('push_subscriptions').delete().eq('user_id', id);

            // 4. 미읽은 알림 정리 (일괄 읽음 처리)
            await supabase.from('notifications')
                .update({ read_at: new Date().toISOString() })
                .eq('user_id', id)
                .is('read_at', null);

            // 5. 활성 세션 무효화 (force_logout)
            await supabase.from('staff_members').update({
                force_logout_at: new Date().toISOString(),
            }).eq('id', id);

            // 6. 감사 로그 기록
            await supabase.from('audit_logs').insert({
                action: '퇴사처리완료',
                target_type: 'staff_member',
                target_id: id,
                details: { name, completed_at: new Date().toISOString() },
            });

            toast(`${name} 님의 최종 퇴사 처리가 완료되었습니다.`, 'success');
            _onRefresh();
        } catch (e) {
            console.error(e);
            toast('퇴사 처리 중 일부 오류가 발생했습니다.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-500 max-w-6xl mx-auto" data-testid="offboarding-view">
            <div className="flex justify-between items-end border-b border-[var(--border)] pb-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-[var(--foreground)] tracking-tight">원클릭 오프보딩 파이프라인</h2>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setActiveTab('진행중')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${activeTab === '진행중' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}>진행 중인 퇴사자</button>
                    <button onClick={() => setActiveTab('과거이력')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${activeTab === '과거이력' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}>과거 이력</button>
                </div>
            </div>

            {activeTab === '진행중' && (
                <div className="space-y-5">
                    {/* 오프보딩 시작 패널 */}
                    <div className="bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-700 relative overflow-hidden flex flex-col md:flex-row gap-3 items-center">
                        <div className="absolute top-0 right-0 p-5 text-8xl opacity-5 transform translate-x-1/4 -translate-y-1/4">🚪</div>
                        <div className="flex-1 space-y-2 z-10 w-full">
                            <h3 className="text-xl font-black text-white">새 오프보딩 시작</h3>
                            <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">퇴사 예정일을 입력하면 권한 회수, 비품 반납 체커가 자동으로 세팅됩니다.</p>

                            <div className="flex flex-col sm:flex-row gap-3 mt-4">
                                <select
                                    data-testid="offboarding-staff-select"
                                    className="px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-sm flex-1 focus:ring-2 focus:ring-[var(--accent)]"
                                    value={selectedStaff}
                                    onChange={e => setSelectedStaff(e.target.value)}
                                >
                                    <option value="">대상 직원 선택</option>
                                    {eligibleStaffs.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.department} / {s.company})</option>
                                    ))}
                                </select>
                                <SmartDatePicker
                                    data-testid="offboarding-date-input"
                                    inputClassName="px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-sm shrink-0"
                                    value={exitDate}
                                    onChange={val => setExitDate(val)}
                                />
                                <select data-testid="offboarding-reason-select" value={reason} onChange={e => setReason(e.target.value)} className="px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-sm">
                                    <option value="개인 사유">개인 사유 (자발적)</option>
                                    <option value="권고사직">권고사직</option>
                                    <option value="계약만료">계약만료</option>
                                </select>
                            </div>
                        </div>
                        <button
                            data-testid="offboarding-start-button"
                            onClick={handleStartOffboarding}
                            disabled={loading}
                            className="z-10 w-full md:w-auto px-5 py-4 bg-[var(--accent)] text-white text-sm font-black rounded-xl hover:scale-105 active:scale-95 transition-transform shadow-md disabled:opacity-50"
                        >
                            {loading ? '처리중...' : '파이프라인 가동 🚀'}
                        </button>
                    </div>

                    {/* 진행 중인 리스트 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {pendingList.length === 0 && (
                            <div className="col-span-full py-20 text-center">
                                <p className="text-4xl mb-4 opacity-50">🏃</p>
                                <p className="text-sm font-bold text-[var(--toss-gray-3)]">현재 퇴사 수속을 밟고 있는 직원이 없습니다.</p>
                            </div>
                        )}
                        {pendingList.map((s: any) => (
                            <div key={s.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 w-full left-0 h-1 bg-gradient-to-r from-orange-400 to-red-500"></div>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 font-black text-lg flex items-center justify-center">{s.name[0]}</div>
                                        <div>
                                            <h4 className="text-lg font-black text-[var(--foreground)]">{s.name}</h4>
                                            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] tracking-widest uppercase">{s.department}</p>
                                        </div>
                                    </div>
                                    <span className="bg-orange-100 text-orange-600 px-2 py-1 rounded text-[10px] font-black">D-{(new Date(s.resigned_at || new Date()).getTime() - new Date().getTime()) / (1000 * 3600 * 24) | 0}</span>
                                </div>

                                {/* Checklist - 실제 상태 추적 */}
                                <div className="space-y-3 mb-4">
                                    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--tab-bg)] cursor-pointer transition-colors">
                                        <input type="checkbox" className="w-5 h-5 accent-[var(--accent)]" checked={isChecked(s.id, '계정파기')} onChange={() => toggleCheck(s.id, '계정파기')} />
                                        <span className={`text-xs font-bold ${isChecked(s.id, '계정파기') ? 'text-green-500 line-through' : 'text-[var(--toss-gray-5)]'}`}>사내 시스템 계정 파기</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--tab-bg)] cursor-pointer transition-colors">
                                        <input type="checkbox" className="w-5 h-5 accent-[var(--accent)]" checked={isChecked(s.id, '비품회수')} onChange={() => toggleCheck(s.id, '비품회수')} />
                                        <span className={`text-xs font-bold ${isChecked(s.id, '비품회수') ? 'text-green-500 line-through' : 'text-[var(--toss-gray-5)]'}`}>대여 비품 (노트북 등) 회수</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--tab-bg)] cursor-pointer transition-colors">
                                        <input type="checkbox" className="w-5 h-5 accent-[var(--accent)]" checked={isChecked(s.id, '서약서징구')} onChange={() => toggleCheck(s.id, '서약서징구')} />
                                        <span className={`text-xs font-bold ${isChecked(s.id, '서약서징구') ? 'text-green-500 line-through' : 'text-[var(--toss-gray-5)]'}`}>보안 서약서 및 사직서 징구</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--tab-bg)] cursor-pointer transition-colors">
                                        <input type="checkbox" className="w-5 h-5 accent-[var(--accent)]" checked={isChecked(s.id, '퇴직금정산')} onChange={() => toggleCheck(s.id, '퇴직금정산')} />
                                        <span className={`text-[11px] font-bold ${isChecked(s.id, '퇴직금정산') ? 'text-green-500 line-through' : 'text-[var(--accent)]'} underline underline-offset-2`}>퇴직금 정산 시작하기 💸</span>
                                    </label>
                                </div>

                                <button
                                    data-testid={`offboarding-finalize-${s.id}`}
                                    onClick={() => {
                                        if (!allChecked(s.id)) {
                                            toast('모든 체크리스트 항목을 완료해주세요.', 'warning');
                                            return;
                                        }
                                        concludeOffboarding(s.id, s.name);
                                    }}
                                    disabled={loading}
                                    className={`w-full py-3 text-white text-[11px] font-black rounded-xl transition-colors disabled:opacity-50 ${allChecked(s.id) ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800 opacity-60'}`}
                                >
                                    {allChecked(s.id) ? '최종 퇴사 처리 (계정 비활성화)' : '체크리스트를 먼저 완료해주세요'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === '과거이력' && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden min-h-[500px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead className="bg-[var(--tab-bg)]">
                                <tr className="border-b border-[var(--border-subtle)] text-[var(--toss-gray-4)] uppercase tracking-widest font-black">
                                    <th className="px-4 py-4">직원명</th>
                                    <th className="px-4 py-4">부서 / 회사</th>
                                    <th className="px-4 py-4">입사일</th>
                                    <th className="px-4 py-4 text-danger">퇴사일</th>
                                    <th className="px-4 py-4">근속 일수</th>
                                    <th className="px-4 py-4 text-right">증명서 발급</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pastList.length === 0 && (
                                    <tr><td colSpan={6} className="text-center py-10 text-[var(--toss-gray-3)] font-bold">퇴사자 이력이 없습니다.</td></tr>
                                )}
                                {pastList.map((s: any) => {
                                    const days = Math.floor((new Date(s.resigned_at).getTime() - new Date(s.joined_at).getTime()) / (1000 * 3600 * 24));
                                    return (
                                        <tr key={s.id} className="hover:bg-[var(--tab-bg)] transition-colors">
                                            <td className="px-4 py-4 font-black flex items-center gap-2 text-[var(--foreground)]">
                                                <div className="w-6 h-6 rounded-full bg-[var(--tab-bg)] flex items-center justify-center text-[8px] opacity-50">{s.name[0]}</div>
                                                {s.name}
                                            </td>
                                            <td className="px-4 py-4 font-bold text-[var(--toss-gray-4)]">{s.department} <br /> <span className="text-[9px] font-medium">{s.company}</span></td>
                                            <td className="px-4 py-4 font-mono text-[var(--toss-gray-4)]">{s.joined_at}</td>
                                            <td className="px-4 py-4 font-mono text-danger font-bold">{s.resigned_at}</td>
                                            <td className="px-4 py-4 font-bold text-[var(--toss-gray-5)]">{days > 0 ? `${days}일` : '-'}</td>
                                            <td className="px-4 py-4 text-right">
                                                <button className="px-3 py-1.5 bg-[var(--tab-bg)] text-[10px] font-bold text-[var(--toss-gray-4)] rounded hover:bg-[var(--tab-bg)]">경력증명서 📄</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
