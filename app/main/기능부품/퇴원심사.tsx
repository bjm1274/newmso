'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

interface ChartLine {
    code: string;
    name: string;
    category: string; // 급, 비, 본100 등
    amount: number;
    raw: string;
}

interface CheckItem {
    id: string;
    label: string;
    code: string;
    checked: boolean;
}

interface DischargeReview {
    id: string;
    patient_name: string;
    department: string;
    admission_date: string;
    discharge_date: string;
    diagnosis: string;
    items: CheckItem[];
    chart_data: string; // 원본 차트 데이터
    status: string;
    reviewer_name: string;
    reviewer_id: string;
    ai_analysis: string;
    created_at: string;
}

// 차트 데이터 파싱: 탭으로 구분된 병원 차트 프로그램 데이터를 파싱
function parseChartData(raw: string): ChartLine[] {
    return raw
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.match(/^#\t#\t#/)) // # 빈행 제거
        .map(line => {
            const cols = line.split('\t');
            // 최소 3컬럼 이상이면 차트 데이터로 인식
            if (cols.length >= 3) {
                const code = (cols[0] || '').trim();
                const name = (cols[2] || cols[1] || '').trim();
                const category = (cols[3] || '').trim();
                const amountStr = (cols[7] || cols[6] || '0').replace(/,/g, '');
                const amount = parseFloat(amountStr) || 0;
                if (name && name !== '#') {
                    return { code, name, category, amount, raw: line };
                }
            }
            return null;
        })
        .filter(Boolean) as ChartLine[];
}

// 차트 라인을 체크 항목으로 변환
function chartLinesToCheckItems(lines: ChartLine[]): CheckItem[] {
    return lines.map((line, idx) => ({
        id: `item-${idx}-${Date.now()}`,
        label: line.name,
        code: line.code,
        checked: false,
    }));
}

type Tab = 'reviews' | 'template' | 'new';

export default function DischargeReviewPage({ user }: { user: any }) {
    const [tab, setTab] = useState<Tab>('reviews');
    const [reviews, setReviews] = useState<DischargeReview[]>([]);

    // 기본 템플릿 (차트 데이터 원본 텍스트)
    const [templateRaw, setTemplateRaw] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedReview, setSelectedReview] = useState<DischargeReview | null>(null);

    // 새 심사 폼
    const [patientName, setPatientName] = useState('');
    const [department, setDepartment] = useState('');
    const [admissionDate, setAdmissionDate] = useState('');
    const [dischargeDate, setDischargeDate] = useState(new Date().toISOString().split('T')[0]);
    const [diagnosis, setDiagnosis] = useState('');
    const [newChartData, setNewChartData] = useState('');

    // AI 분석
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState('');

    // 자동 비교 결과
    const [compareResult, setCompareResult] = useState<{
        matched: string[]; // 템플릿과 일치하는 항목
        missing: string[]; // 템플릿에 있는데 차트에 없는 항목 (누락)
        extra: string[];   // 차트에 있는데 템플릿에 없는 항목 (추가)
    } | null>(null);

    // 파싱된 템플릿
    const parsedTemplate = useMemo(() => parseChartData(templateRaw), [templateRaw]);

    // 새 심사용 파싱된 차트 데이터
    const parsedNewChart = useMemo(() => parseChartData(newChartData), [newChartData]);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: tmpl } = await supabase
                .from('discharge_templates')
                .select('items')
                .eq('id', 'default')
                .maybeSingle();

            if (tmpl?.items) {
                // items가 문자열이면 원본 차트 데이터
                if (typeof tmpl.items === 'string') {
                    setTemplateRaw(tmpl.items);
                } else if (Array.isArray(tmpl.items)) {
                    // 이전 형식 호환
                    setTemplateRaw(tmpl.items.join('\n'));
                }
            }

            const { data: revs } = await supabase
                .from('discharge_reviews')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            setReviews((revs || []) as DischargeReview[]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // 템플릿 저장
    const saveTemplate = async (rawData: string) => {
        setTemplateRaw(rawData);
        try {
            await supabase
                .from('discharge_templates')
                .upsert({ id: 'default', items: rawData, updated_at: new Date().toISOString() }, { onConflict: 'id' });
        } catch (err) {
            console.error(err);
        }
    };

    // 새 퇴원심사 생성 (붙여넣기한 차트 데이터 기반)
    const createReview = async () => {
        if (!patientName.trim()) { alert('환자명을 입력하세요.'); return; }
        if (!department.trim()) { alert('진료과를 입력하세요.'); return; }
        if (!admissionDate) { alert('입원일을 입력하세요.'); return; }
        if (parsedNewChart.length === 0) { alert('차트 데이터를 붙여넣기 하세요.'); return; }

        const items = chartLinesToCheckItems(parsedNewChart);

        const review: any = {
            patient_name: patientName,
            department,
            admission_date: admissionDate,
            discharge_date: dischargeDate,
            diagnosis,
            items,
            chart_data: newChartData,
            status: 'pending',
            reviewer_name: user?.name || '알 수 없음',
            reviewer_id: user?.id || 'unknown',
            ai_analysis: '',
            created_at: new Date().toISOString(),
        };

        try {
            const { data, error } = await supabase.from('discharge_reviews').insert([review]).select();
            if (error) {
                alert('저장 실패: ' + error.message);
                review.id = crypto.randomUUID();
                setReviews([review as DischargeReview, ...reviews]);
            } else if (data) {
                setReviews([data[0] as DischargeReview, ...reviews]);
                setSelectedReview(data[0] as DischargeReview);
            }
        } catch (err) { console.error(err); }

        setPatientName('');
        setDepartment('');
        setAdmissionDate('');
        setDiagnosis('');
        setNewChartData('');
        setTab('reviews');
    };

    // 항목 체크 토글
    const toggleItem = async (reviewId: string, itemId: string) => {
        if (!selectedReview) return;
        const updatedItems = selectedReview.items.map(i =>
            i.id === itemId ? { ...i, checked: !i.checked } : i
        );
        setSelectedReview({ ...selectedReview, items: updatedItems });
        setReviews(reviews.map(r => r.id === reviewId ? { ...r, items: updatedItems } : r));
        try {
            await supabase.from('discharge_reviews').update({ items: updatedItems }).eq('id', reviewId);
        } catch (err) { console.error(err); }
    };

    // 전체 체크/해제
    const toggleAll = async (check: boolean) => {
        if (!selectedReview) return;
        const updatedItems = selectedReview.items.map(i => ({ ...i, checked: check }));
        setSelectedReview({ ...selectedReview, items: updatedItems });
        setReviews(reviews.map(r => r.id === selectedReview.id ? { ...r, items: updatedItems } : r));
        try {
            await supabase.from('discharge_reviews').update({ items: updatedItems }).eq('id', selectedReview.id);
        } catch (err) { console.error(err); }
    };

    // 퇴원 승인
    const approveReview = async (reviewId: string) => {
        if (!selectedReview) return;
        const unchecked = selectedReview.items.filter(i => !i.checked);
        if (unchecked.length > 0) {
            if (!confirm(`아직 ${unchecked.length}개 항목이 미체크 상태입니다. 그래도 승인하시겠습니까?`)) return;
        }
        setSelectedReview({ ...selectedReview, status: 'approved' });
        setReviews(reviews.map(r => r.id === reviewId ? { ...r, status: 'approved' } : r));
        try {
            await supabase.from('discharge_reviews').update({ status: 'approved' }).eq('id', reviewId);
        } catch (err) { console.error(err); }
    };

    // 삭제
    const deleteReview = async (reviewId: string) => {
        if (!confirm('이 퇴원심사를 삭제하시겠습니까?')) return;
        setReviews(reviews.filter(r => r.id !== reviewId));
        if (selectedReview?.id === reviewId) setSelectedReview(null);
        try {
            await supabase.from('discharge_reviews').delete().eq('id', reviewId);
        } catch (err) { console.error(err); }
    };

    // 자동 비교: 기본 템플릿 vs 실제 차트 데이터
    const autoCompare = async () => {
        if (!selectedReview || !templateRaw) {
            alert('기본 항목 설정이 필요합니다. ⚙️ 기본 항목 설정에서 템플릿을 먼저 설정해주세요.');
            return;
        }

        const templateItems = parsedTemplate;
        const chartItems = selectedReview.items;

        // 코드 기반 비교 (코드가 없으면 이름으로 비교)
        const templateCodes = new Set(templateItems.map(t => t.code || t.name).filter(Boolean));
        const templateNames = new Set(templateItems.map(t => t.name).filter(Boolean));
        const chartCodes = new Set(chartItems.map(c => c.code || c.label).filter(Boolean));
        const chartNames = new Set(chartItems.map(c => c.label).filter(Boolean));

        const matched: string[] = [];
        const missing: string[] = []; // 템플릿에 있는데 차트에 없는 것
        const extra: string[] = [];   // 차트에 있는데 템플릿에 없는 것

        // 템플릿 항목 확인
        for (const t of templateItems) {
            const key = t.code || t.name;
            if (chartCodes.has(key) || chartNames.has(t.name)) {
                matched.push(`[${t.code}] ${t.name}`);
            } else {
                missing.push(`[${t.code}] ${t.name}`);
            }
        }

        // 차트에만 있는 항목 확인
        for (const c of chartItems) {
            const key = c.code || c.label;
            if (!templateCodes.has(key) && !templateNames.has(c.label)) {
                extra.push(`[${c.code}] ${c.label}`);
            }
        }

        setCompareResult({ matched, missing, extra });

        // 매칭된 항목 자동 체크
        const updatedItems = chartItems.map(item => {
            const key = item.code || item.label;
            const isMatched = templateCodes.has(key) || templateNames.has(item.label);
            return { ...item, checked: isMatched };
        });
        setSelectedReview({ ...selectedReview, items: updatedItems });
        setReviews(reviews.map(r => r.id === selectedReview.id ? { ...r, items: updatedItems } : r));
        try {
            await supabase.from('discharge_reviews').update({ items: updatedItems }).eq('id', selectedReview.id);
        } catch (err) { console.error(err); }
    };

    // AI 분석 (기본 템플릿 vs 실제 차트 데이터 비교 포함)
    const requestAiAnalysis = async () => {
        if (!selectedReview) return;
        setAiLoading(true);
        setAiResult('');
        try {
            const checkedItems = selectedReview.items.filter(i => i.checked);
            const res = await fetch('/api/discharge-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientName: selectedReview.patient_name,
                    department: selectedReview.department,
                    admissionDate: selectedReview.admission_date,
                    dischargeDate: selectedReview.discharge_date,
                    diagnosis: selectedReview.diagnosis,
                    checkedItems,
                    allItems: selectedReview.items,
                    chartData: selectedReview.chart_data || '',
                    templateData: templateRaw || '',
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            setAiResult(data.analysis);
            setSelectedReview({ ...selectedReview, ai_analysis: data.analysis });
            setReviews(reviews.map(r => r.id === selectedReview.id ? { ...r, ai_analysis: data.analysis } : r));
            await supabase.from('discharge_reviews').update({ ai_analysis: data.analysis }).eq('id', selectedReview.id);
        } catch (err) {
            setAiResult('AI 분석에 실패했습니다: ' + (err instanceof Error ? err.message : String(err)));
        } finally { setAiLoading(false); }
    };

    const stayDays = (a: string, d: string) => { const v = Math.ceil((new Date(d).getTime() - new Date(a).getTime()) / 86400000); return v > 0 ? v : 0; };

    return (
        <div className="bg-[var(--page-bg)] animate-in fade-in duration-300">
            {/* 헤더 */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-white border-b border-[var(--toss-border)] gap-4">
                <div>
                    <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2"><span>🏥</span> 퇴원심사</h2>
                    <p className="text-[12px] text-[var(--toss-gray-3)] mt-1 font-medium">차트 데이터 기반 퇴원 체크리스트 점검 및 AI 분석</p>
                </div>
                <div className="flex gap-2">
                    {(['reviews', 'new', 'template'] as Tab[]).map(t => (
                        <button key={t} onClick={() => { setTab(t); if (t !== 'reviews') setSelectedReview(null); }}
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${tab === t ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {t === 'reviews' ? '📋 심사 목록' : t === 'new' ? '➕ 새 심사' : '⚙️ 기본 항목 설정'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 md:p-6">

                {/* ===== 기본 항목 설정 탭 ===== */}
                {tab === 'template' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                            <h3 className="text-sm font-bold text-gray-800">📋 기본 차트 데이터 설정</h3>
                            <p className="text-xs text-gray-400 font-medium">
                                병원 차트 프로그램에서 <strong>표준 퇴원 항목</strong>을 복사해서 아래에 붙여넣기 하세요.<br />
                                퇴원 환자가 생기면 이 항목들이 자동으로 체크리스트에 복사됩니다.
                            </p>

                            <textarea
                                value={templateRaw}
                                onChange={e => setTemplateRaw(e.target.value)}
                                placeholder={"차트 프로그램에서 복사한 기본 항목 데이터를 여기에 붙여넣기...\n\n예:\n645100242\t645100242\t대한5%포도당가생리식염액_(500mL/백)\t급\t1.\t1.\t1.\t1345.0\n658600301\t658600301\t마토크주(메토카르바몰)_(0.5g/5mL)\t급\t1.\t1.\t1.\t704.0"}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 resize-none h-64 custom-scrollbar placeholder:text-gray-400"
                            />

                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    {parsedTemplate.length > 0 && (
                                        <span className="text-xs font-bold text-[var(--toss-blue)]">📋 {parsedTemplate.length}개 항목 인식됨</span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setTemplateRaw('')} className="px-4 py-2 text-[11px] font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">초기화</button>
                                    <button onClick={() => saveTemplate(templateRaw)} className="px-6 py-2 text-xs font-bold text-white bg-gray-900 rounded-xl hover:bg-black transition-all">저장하기</button>
                                </div>
                            </div>
                        </div>

                        {/* 파싱 결과 미리보기 */}
                        {parsedTemplate.length > 0 && (
                            <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-3">
                                <h3 className="text-sm font-bold text-gray-800">👀 인식된 항목 미리보기 ({parsedTemplate.length}개)</h3>
                                <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {parsedTemplate.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg text-xs">
                                            <span className="font-bold text-gray-400 w-6 text-center shrink-0">{idx + 1}</span>
                                            <span className="font-mono text-gray-400 w-24 shrink-0 truncate">{item.code}</span>
                                            <span className="flex-1 font-medium text-gray-700 truncate">{item.name}</span>
                                            <span className={`px-2 py-0.5 rounded font-bold shrink-0 ${item.category.includes('비') ? 'bg-red-50 text-red-500' : item.category.includes('본') ? 'bg-yellow-50 text-yellow-600' : 'bg-blue-50 text-blue-500'}`}>
                                                {item.category || '-'}
                                            </span>
                                            {item.amount > 0 && <span className="font-bold text-gray-500 w-20 text-right shrink-0">{item.amount.toLocaleString()}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ===== 새 심사 탭 ===== */}
                {tab === 'new' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-5">
                            <h3 className="text-base font-bold text-gray-800">새 퇴원심사 등록</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">환자명 *</label>
                                    <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="홍길동"
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">진료과 *</label>
                                    <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="정형외과, 내과..."
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">입원일 *</label>
                                    <input type="date" value={admissionDate} onChange={e => setAdmissionDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">퇴원 예정일</label>
                                    <input type="date" value={dischargeDate} onChange={e => setDischargeDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">진단명 / 입원 사유</label>
                                <input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="예: TKR (슬관절 전치환술)"
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                            </div>

                            {admissionDate && dischargeDate && (
                                <div className="bg-blue-50 p-4 rounded-xl">
                                    <p className="text-sm font-bold text-[var(--toss-blue)]">입원 기간: {stayDays(admissionDate, dischargeDate)}일</p>
                                </div>
                            )}
                        </div>

                        {/* 차트 데이터 붙여넣기 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-800">📊 환자 차트 데이터 붙여넣기 *</h3>
                                {templateRaw && (
                                    <button onClick={() => setNewChartData(templateRaw)} className="px-3 py-1.5 text-[11px] font-bold text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                                        📋 기본 항목 불러오기
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 font-medium">
                                차트 프로그램에서 환자의 계산내역/처방 데이터를 복사해서 붙여넣기 하세요. 각 항목이 체크리스트가 됩니다.
                            </p>

                            <textarea
                                value={newChartData}
                                onChange={e => setNewChartData(e.target.value)}
                                placeholder="차트 프로그램에서 복사한 환자 데이터를 여기에 붙여넣기..."
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 resize-none h-48 custom-scrollbar placeholder:text-gray-400"
                            />

                            {parsedNewChart.length > 0 && (
                                <div className="bg-blue-50 p-4 rounded-xl space-y-2">
                                    <p className="text-xs font-bold text-[var(--toss-blue)]">📋 {parsedNewChart.length}개 항목이 체크리스트로 생성됩니다</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {parsedNewChart.slice(0, 10).map((it, i) => (
                                            <span key={i} className="px-2 py-1 bg-white rounded-lg text-[10px] font-medium text-gray-600 border border-blue-200 truncate max-w-[200px]">{it.name}</span>
                                        ))}
                                        {parsedNewChart.length > 10 && <span className="px-2 py-1 text-[10px] font-bold text-blue-400">+{parsedNewChart.length - 10}개 더</span>}
                                    </div>
                                </div>
                            )}

                            <button onClick={createReview} disabled={parsedNewChart.length === 0} className="w-full py-4 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-black transition-all active:scale-[0.99] disabled:opacity-40">
                                퇴원심사 생성하기 ({parsedNewChart.length}개 항목)
                            </button>
                        </div>
                    </div>
                )}

                {/* ===== 심사 목록 탭 ===== */}
                {tab === 'reviews' && !selectedReview && (
                    <div className="max-w-3xl mx-auto space-y-4">
                        {loading ? (
                            <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-gray-100 border-t-[var(--toss-blue)] rounded-full animate-spin" /></div>
                        ) : reviews.length === 0 ? (
                            <div className="text-center py-20 space-y-4">
                                <div className="text-6xl opacity-30">🏥</div>
                                <h4 className="text-lg font-bold text-gray-800">등록된 퇴원심사가 없습니다</h4>
                                <p className="text-sm text-gray-400 font-medium">새 심사를 등록해서 시작하세요.</p>
                                <button onClick={() => setTab('new')} className="px-6 py-3 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black">➕ 새 심사 등록</button>
                            </div>
                        ) : reviews.map(r => (
                            <button key={r.id} onClick={() => { setSelectedReview(r); setAiResult(r.ai_analysis || ''); }}
                                className="w-full p-5 bg-white rounded-2xl border border-[var(--toss-border)] shadow-sm hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all text-left group">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {r.status === 'approved' ? '✅ 승인' : '⏳ 심사 중'}
                                            </span>
                                            <span className="text-sm font-bold text-gray-800">{r.patient_name}</span>
                                        </div>
                                        <p className="text-xs text-gray-400 font-medium">
                                            {r.department} · 입원 {stayDays(r.admission_date, r.discharge_date)}일 · {r.items.length}개 항목 · {r.diagnosis || '진단명 미입력'}
                                        </p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-[10px] font-bold text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
                                        <p className="text-[10px] text-gray-400">{r.items.filter(i => i.checked).length}/{r.items.length}</p>
                                    </div>
                                </div>
                                <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${r.status === 'approved' ? 'bg-green-500' : 'bg-[var(--toss-blue)]'}`}
                                        style={{ width: `${r.items.length > 0 ? (r.items.filter(i => i.checked).length / r.items.length) * 100 : 0}%` }} />
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* ===== 심사 상세 ===== */}
                {tab === 'reviews' && selectedReview && (
                    <div className="max-w-4xl mx-auto space-y-4">
                        <button onClick={() => setSelectedReview(null)} className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline">← 목록으로</button>

                        {/* 환자 정보 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${selectedReview.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {selectedReview.status === 'approved' ? '✅ 승인 완료' : '⏳ 심사 중'}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800">{selectedReview.patient_name}</h3>
                                    <p className="text-sm text-gray-400 font-medium mt-1">
                                        {selectedReview.department} · {stayDays(selectedReview.admission_date, selectedReview.discharge_date)}일 입원 · {selectedReview.diagnosis || '-'}
                                    </p>
                                </div>
                                <button onClick={() => deleteReview(selectedReview.id)} className="px-3 py-2 text-[11px] font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100">🗑️ 삭제</button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                                <div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] font-bold text-gray-400 mb-1">입원일</p><p className="text-sm font-bold text-gray-700">{selectedReview.admission_date}</p></div>
                                <div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] font-bold text-gray-400 mb-1">퇴원일</p><p className="text-sm font-bold text-gray-700">{selectedReview.discharge_date}</p></div>
                                <div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] font-bold text-gray-400 mb-1">입원 기간</p><p className="text-sm font-bold text-[var(--toss-blue)]">{stayDays(selectedReview.admission_date, selectedReview.discharge_date)}일</p></div>
                                <div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] font-bold text-gray-400 mb-1">심사자</p><p className="text-sm font-bold text-gray-700">{selectedReview.reviewer_name}</p></div>
                            </div>
                        </div>

                        {/* 체크리스트 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-3">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-800">체크리스트 ({selectedReview.items.filter(i => i.checked).length}/{selectedReview.items.length})</h3>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-[var(--toss-blue)]">
                                        {selectedReview.items.length > 0 ? Math.round((selectedReview.items.filter(i => i.checked).length / selectedReview.items.length) * 100) : 0}%
                                    </span>
                                    {selectedReview.status !== 'approved' && (
                                        <div className="flex gap-1">
                                            <button onClick={() => toggleAll(true)} className="px-2 py-1 text-[10px] font-bold text-green-600 bg-green-50 rounded hover:bg-green-100">전체 ✓</button>
                                            <button onClick={() => toggleAll(false)} className="px-2 py-1 text-[10px] font-bold text-gray-500 bg-gray-100 rounded hover:bg-gray-200">전체 해제</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[var(--toss-blue)] rounded-full transition-all duration-500"
                                    style={{ width: `${selectedReview.items.length > 0 ? (selectedReview.items.filter(i => i.checked).length / selectedReview.items.length) * 100 : 0}%` }} />
                            </div>

                            <div className="space-y-1 max-h-[500px] overflow-y-auto custom-scrollbar">
                                {selectedReview.items.map(item => (
                                    <button key={item.id}
                                        onClick={() => selectedReview.status !== 'approved' && toggleItem(selectedReview.id, item.id)}
                                        disabled={selectedReview.status === 'approved'}
                                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all ${item.checked ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-transparent hover:border-gray-200'
                                            } ${selectedReview.status === 'approved' ? 'cursor-default' : 'cursor-pointer'}`}>
                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center border-2 shrink-0 text-[10px] transition-all ${item.checked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                                            {item.checked && '✓'}
                                        </div>
                                        {item.code && <span className="font-mono text-[10px] text-gray-400 w-20 shrink-0 truncate">{item.code}</span>}
                                        <span className={`text-xs font-medium flex-1 ${item.checked ? 'text-green-700 line-through' : 'text-gray-700'}`}>{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 🔍 자동 비교 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <span className="text-lg">🔍</span> 템플릿 자동 비교
                                </h3>
                                <button onClick={autoCompare} disabled={!templateRaw}
                                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all">
                                    {templateRaw ? '🔍 자동 비교 실행' : '⚙️ 기본 항목 설정 필요'}
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 font-medium">기본 항목과 비교하여 매칭 항목은 자동 체크, 누락/추가 항목을 표시합니다.</p>

                            {compareResult && (
                                <div className="space-y-3">
                                    {/* 요약 */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
                                            <p className="text-2xl font-bold text-green-600">{compareResult.matched.length}</p>
                                            <p className="text-[10px] font-bold text-green-500 mt-1">✅ 일치 항목</p>
                                        </div>
                                        <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
                                            <p className="text-2xl font-bold text-red-600">{compareResult.missing.length}</p>
                                            <p className="text-[10px] font-bold text-red-500 mt-1">❌ 누락 항목</p>
                                        </div>
                                        <div className="bg-yellow-50 rounded-xl p-3 text-center border border-yellow-200">
                                            <p className="text-2xl font-bold text-yellow-600">{compareResult.extra.length}</p>
                                            <p className="text-[10px] font-bold text-yellow-600 mt-1">🆕 추가 항목</p>
                                        </div>
                                    </div>

                                    {/* 누락 항목 (기본값에 있는데 차트에 없는 것) */}
                                    {compareResult.missing.length > 0 && (
                                        <div className="border border-red-200 rounded-xl p-4 space-y-2">
                                            <h4 className="text-xs font-bold text-red-600 flex items-center gap-1">❌ 누락 항목 (기본값에 있지만 차트에 없음)</h4>
                                            <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                                                {compareResult.missing.map((item, idx) => (
                                                    <div key={idx} className="text-xs text-red-700 bg-red-50 p-2 rounded-lg font-medium">{item}</div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 추가 항목 (차트에 있는데 기본값에 없는 것) */}
                                    {compareResult.extra.length > 0 && (
                                        <div className="border border-yellow-200 rounded-xl p-4 space-y-2">
                                            <h4 className="text-xs font-bold text-yellow-600 flex items-center gap-1">🆕 추가 항목 (차트에 있지만 기본값에 없음)</h4>
                                            <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                                                {compareResult.extra.map((item, idx) => (
                                                    <div key={idx} className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded-lg font-medium">{item}</div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {compareResult.missing.length === 0 && compareResult.extra.length === 0 && (
                                        <div className="bg-green-50 p-4 rounded-xl text-center">
                                            <p className="text-sm font-bold text-green-600">✅ 모든 항목이 기본값과 일치합니다!</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* AI 분석 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <span className="text-lg">🤖</span> AI 분석 <span className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-lg">Gemini</span>
                                </h3>
                                <button onClick={requestAiAnalysis} disabled={aiLoading}
                                    className="px-4 py-2 text-xs font-bold text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-all flex items-center gap-1.5">
                                    {aiLoading ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 분석 중...</> : '✨ AI 분석'}
                                </button>
                            </div>

                            {templateRaw && !aiResult && !aiLoading && (
                                <div className="bg-purple-50 p-3 rounded-xl">
                                    <p className="text-xs font-bold text-purple-600">💡 기본 항목 템플릿과 비교하여 누락/과잉 항목을 분석합니다.</p>
                                </div>
                            )}

                            {(aiResult || aiLoading) && (
                                <div className={`p-5 rounded-xl border ${aiLoading ? 'bg-purple-50/50 border-purple-100' : 'bg-gray-50 border-gray-200'}`}>
                                    {aiLoading ? (
                                        <div className="flex items-center gap-3"><div className="w-5 h-5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /><p className="text-sm text-purple-600 font-medium">분석 중...</p></div>
                                    ) : (
                                        <div className="text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">{aiResult}</div>
                                    )}
                                </div>
                            )}

                            {!aiResult && !aiLoading && !templateRaw && (
                                <p className="text-xs text-gray-400 font-medium text-center py-4">AI 분석을 요청하면 차트 데이터의 누락/과잉 청구를 점검합니다.</p>
                            )}
                        </div>

                        {/* 승인 버튼 */}
                        {selectedReview.status !== 'approved' && (
                            <button onClick={() => approveReview(selectedReview.id)}
                                className="w-full py-4 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all active:scale-[0.99] shadow-lg shadow-green-600/20">
                                ✅ 퇴원 승인하기
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
