'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from './공통/SmartDatePicker';

interface ChartLine {
    code: string;
    name: string;
    category: string;
    amount: number;
    raw: string;
}

interface CheckItem {
    id: string;
    label: string;
    code: string;
    checked: boolean;
}

interface Template {
    id: string;
    title: string;
    data: string; // 원본 차트 데이터
}

interface DischargeReview {
    id: string;
    patient_name: string;
    birth_date: string;
    gender: string;
    department: string;
    admission_date: string;
    discharge_date: string;
    diagnosis: string;
    template_id: string;
    insurance_type: string;
    surgery_name: string;
    surgery_date: string;
    room_grade: string;
    doctor_name: string;
    comorbidities: string;
    disease_codes: string;
    admission_route: string;
    discharge_type: string;
    drg_code: string;
    items: CheckItem[];
    chart_data: string;
    status: string;
    reviewer_name: string;
    reviewer_id: string;
    ai_analysis: string;
    created_at: string;
}

function parseChartData(raw: string): ChartLine[] {
    return raw.split('\n').map(l => l.trim()).filter(l => l && !l.match(/^#\t#\t#/))
        .map(line => {
            const cols = line.split('\t');
            if (cols.length >= 3) {
                const code = (cols[0] || '').trim();
                const name = (cols[2] || cols[1] || '').trim();
                const category = (cols[3] || '').trim();
                const amountStr = (cols[7] || cols[6] || '0').replace(/,/g, '');
                if (name && name !== '#') return { code, name, category, amount: parseFloat(amountStr) || 0, raw: line };
            }
            return null;
        }).filter(Boolean) as ChartLine[];
}

function chartLinesToCheckItems(lines: ChartLine[]): CheckItem[] {
    return lines.map((l, i) => ({ id: `item-${i}-${Date.now()}`, label: l.name, code: l.code, checked: false }));
}

type Tab = 'reviews' | 'template' | 'new';

export default function DischargeReviewPage({ user }: { user: any }) {
    const [tab, setTab] = useState<Tab>('reviews');
    const [reviews, setReviews] = useState<DischargeReview[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReview, setSelectedReview] = useState<DischargeReview | null>(null);

    // 템플릿 편집
    const [editTmplId, setEditTmplId] = useState<string | null>(null);
    const [editTmplTitle, setEditTmplTitle] = useState('');
    const [editTmplData, setEditTmplData] = useState('');

    // 새 심사 폼
    const [patientName, setPatientName] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [gender, setGender] = useState('');
    const [department, setDepartment] = useState('');
    const [admissionDate, setAdmissionDate] = useState('');
    const [dischargeDate, setDischargeDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [insuranceType, setInsuranceType] = useState('');
    const [surgeryName, setSurgeryName] = useState('');
    const [surgeryDate, setSurgeryDate] = useState('');
    const [roomGrade, setRoomGrade] = useState('');
    const [doctorName, setDoctorName] = useState('');
    const [comorbidities, setComorbidities] = useState('');
    const [diseaseCodes, setDiseaseCodes] = useState('');
    const [admissionRoute, setAdmissionRoute] = useState('');
    const [dischargeType, setDischargeType] = useState('');
    const [drgCode, setDrgCode] = useState('');
    const [newChartData, setNewChartData] = useState('');

    // 관리자 수술목록
    const [surgeryOptions, setSurgeryOptions] = useState<{ id: string; name: string }[]>([]);

    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState('');
    const [compareResult, setCompareResult] = useState<{ matched: string[]; missing: string[]; extra: string[] } | null>(null);

    // 수정 모드
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<DischargeReview>>({});

    const parsedNewChart = useMemo(() => parseChartData(newChartData), [newChartData]);
    const selectedTemplate = useMemo(() => templates.find(t => t.id === selectedTemplateId), [templates, selectedTemplateId]);
    const parsedSelectedTemplate = useMemo(() => selectedTemplate ? parseChartData(selectedTemplate.data) : [], [selectedTemplate]);
    const editParsed = useMemo(() => parseChartData(editTmplData), [editTmplData]);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [{ data: tmpls }, { data: revs }, { data: surgTmpls }] = await Promise.all([
                supabase.from('discharge_templates').select('*').order('id'),
                supabase.from('discharge_reviews').select('*').order('created_at', { ascending: false }).limit(100),
                supabase.from('surgery_templates').select('id, name').eq('is_active', true).order('sort_order'),
            ]);
            if (tmpls && tmpls.length > 0) {
                setTemplates(tmpls.map((t: any) => ({
                    id: t.id,
                    title: t.title || t.id,
                    data: typeof t.items === 'string' ? t.items : (Array.isArray(t.items) ? t.items.join('\n') : ''),
                })));
            }
            setReviews((revs || []) as DischargeReview[]);
            setSurgeryOptions((surgTmpls || []).map((s: any) => ({ id: s.id, name: s.name })));
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    // 템플릿 CRUD
    const saveTemplate = async (tmpl: Template) => {
        const isNew = !templates.find(t => t.id === tmpl.id);
        if (isNew) {
            setTemplates([...templates, tmpl]);
        } else {
            setTemplates(templates.map(t => t.id === tmpl.id ? tmpl : t));
        }
        try {
            await supabase.from('discharge_templates').upsert({
                id: tmpl.id, title: tmpl.title, items: tmpl.data, updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
        } catch (err) { console.error(err); }
    };

    const deleteTemplate = async (id: string) => {
        if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
        setTemplates(templates.filter(t => t.id !== id));
        if (editTmplId === id) { setEditTmplId(null); setEditTmplTitle(''); setEditTmplData(''); }
        try { await supabase.from('discharge_templates').delete().eq('id', id); } catch (err) { console.error(err); }
    };

    const startNewTemplate = () => {
        setEditTmplId(`tmpl-${Date.now()}`);
        setEditTmplTitle('');
        setEditTmplData('');
    };

    const startEditTemplate = (t: Template) => {
        setEditTmplId(t.id);
        setEditTmplTitle(t.title);
        setEditTmplData(t.data);
    };

    const handleSaveTemplate = () => {
        if (!editTmplTitle.trim()) { alert('항목 제목을 입력하세요.'); return; }
        if (!editTmplData.trim()) { alert('차트 데이터를 붙여넣기 하세요.'); return; }
        saveTemplate({ id: editTmplId!, title: editTmplTitle.trim(), data: editTmplData });
        setEditTmplId(null); setEditTmplTitle(''); setEditTmplData('');
    };

    // 새 심사 생성
    const createReview = async () => {
        if (!patientName.trim()) { alert('환자명을 입력하세요.'); return; }
        if (!department.trim()) { alert('진료과를 입력하세요.'); return; }
        if (!admissionDate) { alert('입원일을 입력하세요.'); return; }
        if (parsedNewChart.length === 0) { alert('차트 데이터를 붙여넣기 하세요.'); return; }

        const items = chartLinesToCheckItems(parsedNewChart);
        const diagnosisLabel = selectedTemplate?.title || '';

        const review: any = {
            patient_name: patientName, birth_date: birthDate, gender,
            department, admission_date: admissionDate, discharge_date: dischargeDate,
            diagnosis: diagnosisLabel, template_id: selectedTemplateId || '',
            insurance_type: insuranceType, surgery_name: surgeryName, surgery_date: surgeryDate,
            room_grade: roomGrade, doctor_name: doctorName, comorbidities,
            disease_codes: diseaseCodes,
            admission_route: admissionRoute, discharge_type: dischargeType, drg_code: drgCode,
            items, chart_data: newChartData,
            status: 'pending',
            reviewer_name: user?.name || '알 수 없음', reviewer_id: user?.id || 'unknown',
            ai_analysis: '', created_at: new Date().toISOString(),
        };

        try {
            const { data, error } = await supabase.from('discharge_reviews').insert([review]).select();
            if (error) {
                review.id = crypto.randomUUID();
                setReviews([review as DischargeReview, ...reviews]);
            } else if (data) {
                const created = data[0] as DischargeReview;
                setReviews([created, ...reviews]);
                setSelectedReview(created);
                if (selectedTemplate) { runAutoCompare(created, selectedTemplate); }
            }
        } catch (err) { console.error(err); }

        setPatientName(''); setBirthDate(''); setGender(''); setDepartment('');
        setAdmissionDate(''); setNewChartData(''); setSelectedTemplateId('');
        setInsuranceType(''); setSurgeryName(''); setSurgeryDate('');
        setRoomGrade(''); setDoctorName(''); setComorbidities(''); setDiseaseCodes('');
        setAdmissionRoute(''); setDischargeType(''); setDrgCode('');
        setTab('reviews');
    };

    // 자동 비교 로직
    const runAutoCompare = async (review: DischargeReview, tmpl: Template) => {
        const templateItems = parseChartData(tmpl.data);
        const chartItems = review.items;

        const templateCodes = new Set(templateItems.map(t => t.code || t.name).filter(Boolean));
        const templateNames = new Set(templateItems.map(t => t.name).filter(Boolean));
        const chartCodes = new Set(chartItems.map(c => c.code || c.label).filter(Boolean));
        const chartNames = new Set(chartItems.map(c => c.label).filter(Boolean));

        const matched: string[] = [], missing: string[] = [], extra: string[] = [];

        for (const t of templateItems) {
            const key = t.code || t.name;
            if (chartCodes.has(key) || chartNames.has(t.name)) matched.push(`[${t.code}] ${t.name}`);
            else missing.push(`[${t.code}] ${t.name}`);
        }
        for (const c of chartItems) {
            const key = c.code || c.label;
            if (!templateCodes.has(key) && !templateNames.has(c.label)) extra.push(`[${c.code}] ${c.label}`);
        }

        setCompareResult({ matched, missing, extra });

        const updatedItems = chartItems.map(item => {
            const key = item.code || item.label;
            return { ...item, checked: templateCodes.has(key) || templateNames.has(item.label) };
        });
        setSelectedReview({ ...review, items: updatedItems });
        setReviews(prev => prev.map(r => r.id === review.id ? { ...r, items: updatedItems } : r));
        try { await supabase.from('discharge_reviews').update({ items: updatedItems }).eq('id', review.id); } catch { }
    };

    const autoCompare = () => {
        if (!selectedReview) return;
        // 심사에 저장된 template_id 사용하거나 목록에서 선택
        const tmpl = templates.find(t => t.id === selectedReview.template_id) || templates[0];
        if (!tmpl) { alert('기본 항목 설정이 필요합니다.'); return; }
        runAutoCompare(selectedReview, tmpl);
    };

    const toggleItem = async (reviewId: string, itemId: string) => {
        if (!selectedReview) return;
        const updated = selectedReview.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i);
        setSelectedReview({ ...selectedReview, items: updated });
        setReviews(reviews.map(r => r.id === reviewId ? { ...r, items: updated } : r));
        try { await supabase.from('discharge_reviews').update({ items: updated }).eq('id', reviewId); } catch { }
    };

    const toggleAll = async (check: boolean) => {
        if (!selectedReview) return;
        const updated = selectedReview.items.map(i => ({ ...i, checked: check }));
        setSelectedReview({ ...selectedReview, items: updated });
        setReviews(reviews.map(r => r.id === selectedReview.id ? { ...r, items: updated } : r));
        try { await supabase.from('discharge_reviews').update({ items: updated }).eq('id', selectedReview.id); } catch { }
    };

    const approveReview = async (id: string) => {
        if (!selectedReview) return;
        const u = selectedReview.items.filter(i => !i.checked);
        if (u.length > 0 && !confirm(`${u.length}개 미체크 항목이 있습니다. 승인하시겠습니까?`)) return;
        setSelectedReview({ ...selectedReview, status: 'approved' });
        setReviews(reviews.map(r => r.id === id ? { ...r, status: 'approved' } : r));
        try { await supabase.from('discharge_reviews').update({ status: 'approved' }).eq('id', id); } catch { }
    };

    const deleteReview = async (id: string) => {
        if (!confirm('삭제하시겠습니까?')) return;
        setReviews(reviews.filter(r => r.id !== id));
        if (selectedReview?.id === id) setSelectedReview(null);
        try { await supabase.from('discharge_reviews').delete().eq('id', id); } catch { }
    };

    const handleStartEdit = () => {
        if (!selectedReview) return;
        setEditForm({ ...selectedReview });
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditForm({});
    };

    const handleUpdateReview = async () => {
        if (!selectedReview || !editForm) return;

        let updatedItems = editForm.items || [];
        if (editForm.chart_data !== selectedReview.chart_data) {
            if (confirm('차트 데이터가 변경되었습니다. 체크리스트 항목을 다시 생성하시겠습니까? (기본 체크 해제됨)')) {
                const newLines = parseChartData(editForm.chart_data || '');
                updatedItems = chartLinesToCheckItems(newLines);
            }
        }

        const updatedReview = { ...selectedReview, ...editForm, items: updatedItems } as DischargeReview;

        try {
            const { error } = await supabase.from('discharge_reviews').update({
                patient_name: updatedReview.patient_name,
                birth_date: updatedReview.birth_date,
                gender: updatedReview.gender,
                department: updatedReview.department,
                admission_date: updatedReview.admission_date,
                discharge_date: updatedReview.discharge_date,
                diagnosis: updatedReview.diagnosis,
                template_id: updatedReview.template_id,
                insurance_type: updatedReview.insurance_type,
                surgery_name: updatedReview.surgery_name,
                surgery_date: updatedReview.surgery_date,
                room_grade: updatedReview.room_grade,
                doctor_name: updatedReview.doctor_name,
                comorbidities: updatedReview.comorbidities,
                disease_codes: updatedReview.disease_codes,
                admission_route: updatedReview.admission_route,
                discharge_type: updatedReview.discharge_type,
                drg_code: updatedReview.drg_code,
                chart_data: updatedReview.chart_data,
                items: updatedReview.items,
            }).eq('id', selectedReview.id);

            if (error) throw error;

            setSelectedReview(updatedReview);
            setReviews(reviews.map(r => r.id === selectedReview.id ? updatedReview : r));
            setIsEditing(false);
        } catch (err) {
            console.error(err);
            alert('수정 중 오류가 발생했습니다.');
        }
    };

    const requestAiAnalysis = async () => {
        if (!selectedReview) return;
        setAiLoading(true); setAiResult('');
        const tmpl = templates.find(t => t.id === selectedReview.template_id);
        try {
            const res = await fetch('/api/discharge-review', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientName: selectedReview.patient_name,
                    birthDate: selectedReview.birth_date,
                    gender: selectedReview.gender,
                    department: selectedReview.department,
                    admissionDate: selectedReview.admission_date,
                    dischargeDate: selectedReview.discharge_date,
                    diagnosis: selectedReview.diagnosis,
                    insuranceType: selectedReview.insurance_type,
                    surgeryName: selectedReview.surgery_name,
                    surgeryDate: selectedReview.surgery_date,
                    roomGrade: selectedReview.room_grade,
                    doctorName: selectedReview.doctor_name,
                    comorbidities: selectedReview.comorbidities,
                    admissionRoute: selectedReview.admission_route,
                    dischargeType: selectedReview.discharge_type,
                    drgCode: selectedReview.drg_code,
                    diseaseCodes: selectedReview.disease_codes || '',
                    checkedItems: selectedReview.items.filter(i => i.checked),
                    allItems: selectedReview.items,
                    chartData: selectedReview.chart_data || '',
                    templateData: tmpl?.data || '',
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            setAiResult(data.analysis);
            setSelectedReview({ ...selectedReview, ai_analysis: data.analysis });
            setReviews(reviews.map(r => r.id === selectedReview.id ? { ...r, ai_analysis: data.analysis } : r));
            await supabase.from('discharge_reviews').update({ ai_analysis: data.analysis }).eq('id', selectedReview.id);
        } catch (err) {
            setAiResult('AI 분석 실패: ' + (err instanceof Error ? err.message : String(err)));
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
                        <button key={t} onClick={() => { setTab(t); if (t !== 'reviews') setSelectedReview(null); setCompareResult(null); }}
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
                        {/* 템플릿 목록 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-800">📋 항목 템플릿 목록 ({templates.length}개)</h3>
                                <button onClick={startNewTemplate} className="px-4 py-2 text-xs font-bold text-white bg-gray-900 rounded-xl hover:bg-black transition-all">➕ 새 템플릿 추가</button>
                            </div>
                            <p className="text-xs text-gray-400 font-medium">진단명/입원사유별로 기본 항목 템플릿을 만들어 두면, 심사 시 드롭다운으로 선택할 수 있습니다.</p>

                            {templates.length === 0 && !editTmplId && (
                                <div className="text-center py-10 space-y-3">
                                    <div className="text-4xl opacity-30">📋</div>
                                    <p className="text-sm text-gray-400 font-medium">아직 등록된 템플릿이 없습니다.</p>
                                    <button onClick={startNewTemplate} className="px-4 py-2 text-xs font-bold text-[var(--toss-blue)] bg-blue-50 rounded-xl hover:bg-blue-100">첫 번째 템플릿 만들기</button>
                                </div>
                            )}

                            <div className="space-y-2">
                                {templates.map(t => (
                                    <div key={t.id} className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${editTmplId === t.id ? 'border-[var(--toss-blue)] bg-blue-50/30' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-gray-800">{t.title}</h4>
                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">{parseChartData(t.data).length}개 항목</p>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button onClick={() => startEditTemplate(t)} className="px-3 py-1.5 text-[11px] font-bold text-[var(--toss-blue)] bg-blue-50 rounded-lg hover:bg-blue-100">수정</button>
                                            <button onClick={() => deleteTemplate(t.id)} className="px-3 py-1.5 text-[11px] font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100">삭제</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 템플릿 편집 폼 */}
                        {editTmplId && (
                            <div className="bg-white rounded-2xl border-2 border-[var(--toss-blue)] p-6 shadow-sm space-y-4">
                                <h3 className="text-sm font-bold text-gray-800">{templates.find(t => t.id === editTmplId) ? '✏️ 템플릿 수정' : '➕ 새 템플릿 추가'}</h3>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">항목 제목 (진단명/입원사유) *</label>
                                    <input value={editTmplTitle} onChange={e => setEditTmplTitle(e.target.value)}
                                        placeholder="예: TKR 슬관절 전치환술, 폐렴 치료, 척추수술..."
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">차트 기본 항목 데이터 *</label>
                                    <textarea value={editTmplData} onChange={e => setEditTmplData(e.target.value)}
                                        placeholder="차트 프로그램에서 해당 진단의 표준 항목을 복사-붙여넣기..."
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 resize-none h-48 custom-scrollbar placeholder:text-gray-400" />
                                </div>

                                {editParsed.length > 0 && (
                                    <div className="bg-blue-50 p-3 rounded-xl">
                                        <p className="text-xs font-bold text-[var(--toss-blue)]">📋 {editParsed.length}개 항목 인식됨</p>
                                    </div>
                                )}

                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => { setEditTmplId(null); setEditTmplTitle(''); setEditTmplData(''); }}
                                        className="px-4 py-2.5 text-xs font-bold text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
                                    <button onClick={handleSaveTemplate}
                                        className="px-6 py-2.5 text-xs font-bold text-white bg-[var(--toss-blue)] rounded-xl hover:opacity-90">저장하기</button>
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

                            {/* 필수 환자 정보 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">환자명 *</label>
                                    <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="홍길동"
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">생년월일</label>
                                    <SmartDatePicker value={birthDate} onChange={val => setBirthDate(val)} className="w-full h-[46px] px-4 bg-gray-50 border-none rounded-xl text-sm font-medium" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">성별</label>
                                    <select value={gender} onChange={e => setGender(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 appearance-none cursor-pointer">
                                        <option value="">선택</option>
                                        <option value="남">남</option>
                                        <option value="여">여</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">진료과 *</label>
                                    <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="정형외과, 내과..."
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">입원일 *</label>
                                    <SmartDatePicker value={admissionDate} onChange={val => setAdmissionDate(val)} className="w-full h-[46px] px-4 bg-gray-50 border-none rounded-xl text-sm font-medium" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">퇴원 예정일</label>
                                    <SmartDatePicker value={dischargeDate} onChange={val => setDischargeDate(val)} className="w-full h-[46px] px-4 bg-gray-50 border-none rounded-xl text-sm font-medium" />
                                </div>
                            </div>

                            {/* 보험 및 의료 정보 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">보험 구분</label>
                                    <select value={insuranceType} onChange={e => setInsuranceType(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 appearance-none cursor-pointer">
                                        <option value="">선택</option>
                                        <option value="건강보험">건강보험</option>
                                        <option value="의료급여 1종">의료급여 1종</option>
                                        <option value="의료급여 2종">의료급여 2종</option>
                                        <option value="차상위">차상위</option>
                                        <option value="산재보험">산재보험</option>
                                        <option value="자동차보험">자동차보험</option>
                                        <option value="급여 환자">급여 환자</option>
                                        <option value="비급여">비급여</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">주치의</label>
                                    <input value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="김OO"
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">병실 등급</label>
                                    <select value={roomGrade} onChange={e => setRoomGrade(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 appearance-none cursor-pointer">
                                        <option value="">선택</option>
                                        <option value="1인실">1인실</option>
                                        <option value="2인실">2인실</option>
                                        <option value="4인실">4인실</option>
                                    </select>
                                </div>
                            </div>

                            {/* 수술 정보 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">수술명</label>
                                    <select value={surgeryName} onChange={e => setSurgeryName(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 appearance-none cursor-pointer">
                                        <option value="">수술 없음</option>
                                        {surgeryOptions.map(s => (
                                            <option key={s.id} value={s.name}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">수술일</label>
                                    <SmartDatePicker value={surgeryDate} onChange={val => setSurgeryDate(val)} className="w-full h-[46px] px-4 bg-gray-50 border-none rounded-xl text-sm font-medium" />
                                </div>
                            </div>

                            {/* 기타 정보 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">입원 경로</label>
                                    <select value={admissionRoute} onChange={e => setAdmissionRoute(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 appearance-none cursor-pointer">
                                        <option value="">선택</option>
                                        <option value="외래">외래</option>
                                        <option value="응급">응급</option>
                                        <option value="전원">전원</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">퇴원 유형</label>
                                    <select value={dischargeType} onChange={e => setDischargeType(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 appearance-none cursor-pointer">
                                        <option value="">선택</option>
                                        <option value="정상퇴원">정상퇴원</option>
                                        <option value="전원">전원</option>
                                        <option value="자의퇴원">자의퇴원</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">DRG 코드</label>
                                    <input value={drgCode} onChange={e => setDrgCode(e.target.value)} placeholder="포괄수가 코드"
                                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">동반 질환</label>
                                <input value={comorbidities} onChange={e => setComorbidities(e.target.value)} placeholder="고혈압, 당뇨, 심부전..."
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">상병명 (진단코드)</label>
                                <textarea value={diseaseCodes} onChange={e => setDiseaseCodes(e.target.value)}
                                    placeholder="차트에서 상병명을 복사-붙여넣기 (여러 줄 가능)
예: M17.1 원발성 무릎관절증
    I10 고혈압
    E11 2형 당뇨"
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 resize-none h-28 custom-scrollbar placeholder:text-gray-400" />
                                {diseaseCodes.trim() && (
                                    <p className="text-[11px] font-bold text-purple-500">🏥 {diseaseCodes.trim().split('\n').filter(l => l.trim()).length}개 상병 입력됨</p>
                                )}
                            </div>

                            {/* 진단명 드롭다운 */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">진단명 / 입원 사유 (템플릿 선택)</label>
                                <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 appearance-none cursor-pointer">
                                    <option value="">-- 템플릿 선택 (선택 안 함) --</option>
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>{t.title} ({parseChartData(t.data).length}개 항목)</option>
                                    ))}
                                </select>
                                {selectedTemplate && (
                                    <div className="bg-blue-50 p-3 rounded-xl mt-2">
                                        <p className="text-xs font-bold text-[var(--toss-blue)]">📋 "{selectedTemplate.title}" 템플릿 선택됨 — 심사 생성 시 자동 비교</p>
                                    </div>
                                )}
                            </div>

                            {admissionDate && dischargeDate && (
                                <div className="bg-blue-50 p-3 rounded-xl flex items-center gap-4">
                                    <p className="text-sm font-bold text-[var(--toss-blue)]">입원 기간: {stayDays(admissionDate, dischargeDate)}일</p>
                                    {birthDate && <p className="text-sm font-medium text-gray-500">나이: {Math.floor((Date.now() - new Date(birthDate).getTime()) / 31557600000)}세</p>}
                                </div>
                            )}
                        </div>

                        {/* 차트 데이터 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                            <h3 className="text-sm font-bold text-gray-800">📊 환자 차트 데이터 붙여넣기 *</h3>
                            <p className="text-xs text-gray-400 font-medium">차트 프로그램에서 환자의 계산내역을 복사해서 붙여넣기 하세요.</p>

                            <textarea value={newChartData} onChange={e => setNewChartData(e.target.value)}
                                placeholder="차트 프로그램에서 복사한 데이터를 여기에 붙여넣기..."
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 resize-none h-48 custom-scrollbar placeholder:text-gray-400" />

                            {parsedNewChart.length > 0 && (
                                <div className="bg-blue-50 p-4 rounded-xl space-y-2">
                                    <p className="text-xs font-bold text-[var(--toss-blue)]">📋 {parsedNewChart.length}개 항목이 체크리스트로 생성됩니다</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {parsedNewChart.slice(0, 8).map((it, i) => (
                                            <span key={i} className="px-2 py-1 bg-white rounded-lg text-[10px] font-medium text-gray-600 border border-blue-200 truncate max-w-[180px]">{it.name}</span>
                                        ))}
                                        {parsedNewChart.length > 8 && <span className="px-2 py-1 text-[10px] font-bold text-blue-400">+{parsedNewChart.length - 8}개 더</span>}
                                    </div>
                                </div>
                            )}

                            <button onClick={createReview} disabled={parsedNewChart.length === 0}
                                className="w-full py-4 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-black transition-all active:scale-[0.99] disabled:opacity-40">
                                퇴원심사 생성하기 ({parsedNewChart.length}개 항목) {selectedTemplate ? `→ "${selectedTemplate.title}" 자동 비교` : ''}
                            </button>
                        </div>
                    </div>
                )}

                {/* ===== 심사 목록 ===== */}
                {tab === 'reviews' && !selectedReview && (
                    <div className="max-w-3xl mx-auto space-y-4">
                        {loading ? (
                            <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-gray-100 border-t-[var(--toss-blue)] rounded-full animate-spin" /></div>
                        ) : reviews.length === 0 ? (
                            <div className="text-center py-20 space-y-4">
                                <div className="text-6xl opacity-30">🏥</div>
                                <h4 className="text-lg font-bold text-gray-800">등록된 퇴원심사가 없습니다</h4>
                                <button onClick={() => setTab('new')} className="px-6 py-3 bg-gray-900 text-white text-xs font-bold rounded-xl">➕ 새 심사 등록</button>
                            </div>
                        ) : reviews.map(r => (
                            <button key={r.id} onClick={() => { setSelectedReview(r); setAiResult(r.ai_analysis || ''); setCompareResult(null); }}
                                className="w-full p-5 bg-white rounded-2xl border border-[var(--toss-border)] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {r.status === 'approved' ? '✅ 승인' : '⏳ 심사 중'}
                                            </span>
                                            <span className="text-sm font-bold text-gray-800">{r.patient_name}</span>
                                            {r.diagnosis && <span className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-lg">{r.diagnosis}</span>}
                                        </div>
                                        <p className="text-xs text-gray-400 font-medium">{r.department} · {stayDays(r.admission_date, r.discharge_date)}일 · {r.items.length}개 항목</p>
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
                        <div className="flex justify-between items-center">
                            <button onClick={() => { setSelectedReview(null); setCompareResult(null); setIsEditing(false); }} className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline">← 목록으로</button>
                            {!isEditing && selectedReview.status !== 'approved' && (
                                <button onClick={handleStartEdit} className="px-3 py-1.5 text-[11px] font-bold text-[var(--toss-blue)] bg-blue-50 rounded-lg hover:bg-blue-100">✏️ 정보 수정</button>
                            )}
                        </div>

                        {/* 환자 정보 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${selectedReview.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {selectedReview.status === 'approved' ? '✅ 승인' : '⏳ 심사 중'}
                                        </span>
                                        {isEditing ? (
                                            <select value={editForm.template_id} onChange={e => {
                                                const tmpl = templates.find(t => t.id === e.target.value);
                                                setEditForm({ ...editForm, template_id: e.target.value, diagnosis: tmpl?.title || '' });
                                            }} className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-1 rounded-lg border-none outline-none">
                                                <option value="">템플릿 선택</option>
                                                {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                                            </select>
                                        ) : (
                                            selectedReview.diagnosis && <span className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-lg">{selectedReview.diagnosis}</span>
                                        )}
                                        {isEditing ? (
                                            <select value={editForm.insurance_type} onChange={e => setEditForm({ ...editForm, insurance_type: e.target.value })}
                                                className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg border-none outline-none">
                                                <option value="건강보험">건강보험</option>
                                                <option value="의료급여 1종">의료급여 1종</option>
                                                <option value="의료급여 2종">의료급여 2종</option>
                                                <option value="산재보험">산재보험</option>
                                                <option value="자동차보험">자동차보험</option>
                                                <option value="비급여">비급여</option>
                                            </select>
                                        ) : (
                                            selectedReview.insurance_type && <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg">{selectedReview.insurance_type}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isEditing ? (
                                            <input value={editForm.patient_name} onChange={e => setEditForm({ ...editForm, patient_name: e.target.value })}
                                                className="text-xl font-bold text-gray-800 bg-gray-50 px-2 py-1 rounded-lg w-32 border-none outline-none" />
                                        ) : (
                                            <h3 className="text-xl font-bold text-gray-800">{selectedReview.patient_name}</h3>
                                        )}
                                        {isEditing ? (
                                            <div className="flex gap-1 items-center">
                                                <select value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value })} className="text-sm bg-gray-50 px-1 py-1 rounded-lg border-none outline-none">
                                                    <option value="남">남</option>
                                                    <option value="여">여</option>
                                                </select>
                                                <SmartDatePicker value={editForm.birth_date || ''} onChange={val => setEditForm({ ...editForm, birth_date: val })} className="text-sm bg-gray-50 h-8 px-2 rounded-lg border-none outline-none w-32" />
                                            </div>
                                        ) : (
                                            <>
                                                {selectedReview.gender && <span className="text-sm font-medium text-gray-400 ml-1">({selectedReview.gender})</span>}
                                                {selectedReview.birth_date && <span className="text-sm font-medium text-gray-400 ml-1">만 {Math.floor((Date.now() - new Date(selectedReview.birth_date).getTime()) / 31557600000)}세</span>}
                                            </>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        {isEditing ? (
                                            <div className="flex gap-2 items-center">
                                                <input value={editForm.department} onChange={e => setEditForm({ ...editForm, department: e.target.value })} className="text-sm bg-gray-50 px-2 py-1 rounded-lg border-none outline-none w-24" />
                                                <span className="text-gray-300">|</span>
                                                <input value={editForm.doctor_name} onChange={e => setEditForm({ ...editForm, doctor_name: e.target.value })} placeholder="주치의" className="text-sm bg-gray-50 px-2 py-1 rounded-lg border-none outline-none w-24" />
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-400 font-medium">{selectedReview.department} · {stayDays(selectedReview.admission_date, selectedReview.discharge_date)}일 입원{selectedReview.doctor_name ? ` · 주치의: ${selectedReview.doctor_name}` : ''}</p>
                                        )}
                                    </div>
                                </div>
                                {!isEditing && <button onClick={() => deleteReview(selectedReview.id)} className="px-3 py-2 text-[11px] font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100">🗑️</button>}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">입원일</p>
                                    {isEditing ? (
                                        <SmartDatePicker value={editForm.admission_date || ''} onChange={val => setEditForm({ ...editForm, admission_date: val })} className="w-full text-xs font-bold bg-transparent border-none outline-none text-center" />
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700">{selectedReview.admission_date}</p>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">퇴원일</p>
                                    {isEditing ? (
                                        <SmartDatePicker value={editForm.discharge_date || ''} onChange={val => setEditForm({ ...editForm, discharge_date: val })} className="w-full text-xs font-bold bg-transparent border-none outline-none text-center" />
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700">{selectedReview.discharge_date}</p>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">입원 기간</p>
                                    <p className="text-sm font-bold text-[var(--toss-blue)]">{stayDays(isEditing ? (editForm.admission_date || '') : selectedReview.admission_date, isEditing ? (editForm.discharge_date || '') : selectedReview.discharge_date)}일</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">병실</p>
                                    {isEditing ? (
                                        <select value={editForm.room_grade} onChange={e => setEditForm({ ...editForm, room_grade: e.target.value })} className="w-full text-xs font-bold bg-transparent border-none outline-none text-center">
                                            <option value="">선택</option>
                                            <option value="1인실">1인실</option>
                                            <option value="2인실">2인실</option>
                                            <option value="4인실">4인실</option>
                                        </select>
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700">{selectedReview.room_grade || '-'}</p>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                <div className="bg-gray-50 rounded-xl p-3 flex flex-col items-center">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">수술/시술</p>
                                    {isEditing ? (
                                        <div className="flex gap-2 w-full">
                                            <select value={editForm.surgery_name} onChange={e => setEditForm({ ...editForm, surgery_name: e.target.value })} className="flex-1 text-xs font-bold bg-white px-2 py-1 rounded border border-gray-100">
                                                <option value="">수술 없음</option>
                                                {surgeryOptions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                            </select>
                                            <SmartDatePicker value={editForm.surgery_date || ''} onChange={val => setEditForm({ ...editForm, surgery_date: val })} className="w-28 text-xs font-bold bg-white px-2 py-1 rounded border border-gray-100" />
                                        </div>
                                    ) : (
                                        <p className="text-xs font-bold text-gray-700">{selectedReview.surgery_name || '-'}{selectedReview.surgery_date ? ` (${selectedReview.surgery_date})` : ''}</p>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 flex flex-col items-center">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">동반질환/참고사항</p>
                                    {isEditing ? (
                                        <input value={editForm.comorbidities} onChange={e => setEditForm({ ...editForm, comorbidities: e.target.value })} className="w-full text-xs font-bold bg-white px-2 py-1 rounded border border-gray-100 text-center" />
                                    ) : (
                                        <p className="text-xs font-bold text-gray-700">{selectedReview.comorbidities || '-'}</p>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-center mt-3">
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">입원경로</p>
                                    {isEditing ? (
                                        <select value={editForm.admission_route} onChange={e => setEditForm({ ...editForm, admission_route: e.target.value })} className="w-full text-xs font-bold bg-transparent border-none outline-none text-center">
                                            <option value="">선택</option>
                                            <option value="외래">외래</option>
                                            <option value="응급">응급</option>
                                            <option value="전원">전원</option>
                                        </select>
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700">{selectedReview.admission_route || '-'}</p>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">퇴원유형</p>
                                    {isEditing ? (
                                        <select value={editForm.discharge_type} onChange={e => setEditForm({ ...editForm, discharge_type: e.target.value })} className="w-full text-xs font-bold bg-transparent border-none outline-none text-center">
                                            <option value="">선택</option>
                                            <option value="정상퇴원">정상퇴원</option>
                                            <option value="전원">전원</option>
                                            <option value="자의퇴원">자의퇴원</option>
                                        </select>
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700">{selectedReview.discharge_type || '-'}</p>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-gray-400 mb-1">DRG</p>
                                    {isEditing ? (
                                        <input value={editForm.drg_code} onChange={e => setEditForm({ ...editForm, drg_code: e.target.value })} className="w-full text-xs font-bold bg-transparent border-none outline-none text-center" />
                                    ) : (
                                        <p className="text-sm font-bold text-gray-700">{selectedReview.drg_code || '-'}</p>
                                    )}
                                </div>
                            </div>

                            {isEditing ? (
                                <div className="space-y-1.5 mt-3">
                                    <label className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">상병명 (진단코드)</label>
                                    <textarea value={editForm.disease_codes} onChange={e => setEditForm({ ...editForm, disease_codes: e.target.value })}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-mono outline-none focus:ring-2 focus:ring-purple-200 resize-none h-24 custom-scrollbar" />
                                </div>
                            ) : (
                                selectedReview.disease_codes && (
                                    <div className="bg-purple-50 p-3 rounded-xl mt-3">
                                        <p className="text-[10px] font-bold text-purple-500 mb-1">🏥 상병명</p>
                                        <p className="text-xs font-mono text-gray-700 whitespace-pre-line">{selectedReview.disease_codes}</p>
                                    </div>
                                )
                            )}

                            {isEditing && (
                                <div className="space-y-1.5 mt-3">
                                    <label className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">차트 데이터 (수정 시 체크리스트 재구성 가능)</label>
                                    <textarea value={editForm.chart_data} onChange={e => setEditForm({ ...editForm, chart_data: e.target.value })}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-[10px] font-mono outline-none focus:ring-2 focus:ring-blue-200 resize-none h-32 custom-scrollbar" />
                                </div>
                            )}
                        </div>

                        {isEditing && (
                            <div className="flex gap-2">
                                <button onClick={handleCancelEdit} className="flex-1 py-3 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all">취소</button>
                                <button onClick={handleUpdateReview} className="flex-[2] py-3 bg-[var(--toss-blue)] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-blue-600/20">변경 내용 저장</button>
                            </div>
                        )}

                        {/* 체크리스트 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-3">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-800">체크리스트 ({selectedReview.items.filter(i => i.checked).length}/{selectedReview.items.length})</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[var(--toss-blue)]">{selectedReview.items.length > 0 ? Math.round((selectedReview.items.filter(i => i.checked).length / selectedReview.items.length) * 100) : 0}%</span>
                                    {selectedReview.status !== 'approved' && (
                                        <div className="flex gap-1">
                                            <button onClick={() => toggleAll(true)} className="px-2 py-1 text-[10px] font-bold text-green-600 bg-green-50 rounded hover:bg-green-100">전체✓</button>
                                            <button onClick={() => toggleAll(false)} className="px-2 py-1 text-[10px] font-bold text-gray-500 bg-gray-100 rounded hover:bg-gray-200">해제</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[var(--toss-blue)] rounded-full transition-all duration-500"
                                    style={{ width: `${selectedReview.items.length > 0 ? (selectedReview.items.filter(i => i.checked).length / selectedReview.items.length) * 100 : 0}%` }} />
                            </div>
                            <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                                {selectedReview.items.map(item => (
                                    <button key={item.id} onClick={() => selectedReview.status !== 'approved' && toggleItem(selectedReview.id, item.id)}
                                        disabled={selectedReview.status === 'approved'}
                                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all ${item.checked ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-transparent hover:border-gray-200'} ${selectedReview.status === 'approved' ? 'cursor-default' : 'cursor-pointer'}`}>
                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center border-2 shrink-0 text-[10px] ${item.checked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>{item.checked && '✓'}</div>
                                        {item.code && <span className="font-mono text-[10px] text-gray-400 w-20 shrink-0 truncate">{item.code}</span>}
                                        <span className={`text-xs font-medium flex-1 ${item.checked ? 'text-green-700 line-through' : 'text-gray-700'}`}>{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 자동 비교 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><span className="text-lg">🔍</span> 템플릿 자동 비교</h3>
                                <button onClick={autoCompare} disabled={templates.length === 0}
                                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-all">
                                    {templates.length > 0 ? '🔍 자동 비교' : '⚙️ 템플릿 설정 필요'}
                                </button>
                            </div>

                            {compareResult && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
                                            <p className="text-2xl font-bold text-green-600">{compareResult.matched.length}</p>
                                            <p className="text-[10px] font-bold text-green-500 mt-1">✅ 일치</p>
                                        </div>
                                        <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
                                            <p className="text-2xl font-bold text-red-600">{compareResult.missing.length}</p>
                                            <p className="text-[10px] font-bold text-red-500 mt-1">❌ 누락</p>
                                        </div>
                                        <div className="bg-yellow-50 rounded-xl p-3 text-center border border-yellow-200">
                                            <p className="text-2xl font-bold text-yellow-600">{compareResult.extra.length}</p>
                                            <p className="text-[10px] font-bold text-yellow-600 mt-1">🆕 추가</p>
                                        </div>
                                    </div>
                                    {compareResult.missing.length > 0 && (
                                        <div className="border border-red-200 rounded-xl p-4 space-y-2">
                                            <h4 className="text-xs font-bold text-red-600">❌ 누락 항목 (기본값에 있지만 차트에 없음)</h4>
                                            <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                                                {compareResult.missing.map((item, idx) => <div key={idx} className="text-xs text-red-700 bg-red-50 p-2 rounded-lg font-medium">{item}</div>)}
                                            </div>
                                        </div>
                                    )}
                                    {compareResult.extra.length > 0 && (
                                        <div className="border border-yellow-200 rounded-xl p-4 space-y-2">
                                            <h4 className="text-xs font-bold text-yellow-600">🆕 추가 항목 (차트에 있지만 기본값에 없음)</h4>
                                            <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                                                {compareResult.extra.map((item, idx) => <div key={idx} className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded-lg font-medium">{item}</div>)}
                                            </div>
                                        </div>
                                    )}
                                    {compareResult.missing.length === 0 && compareResult.extra.length === 0 && (
                                        <div className="bg-green-50 p-4 rounded-xl text-center"><p className="text-sm font-bold text-green-600">✅ 모든 항목이 일치합니다!</p></div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* AI 분석 */}
                        <div className="bg-white rounded-2xl border border-[var(--toss-border)] p-6 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><span className="text-lg">🤖</span> AI 분석 <span className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-lg">Gemini 3</span></h3>
                                <button onClick={requestAiAnalysis} disabled={aiLoading}
                                    className="px-4 py-2 text-xs font-bold text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-all flex items-center gap-1.5">
                                    {aiLoading ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 분석 중...</> : '✨ AI 분석'}
                                </button>
                            </div>
                            {(aiResult || aiLoading) && (
                                <div className={`p-5 rounded-xl border ${aiLoading ? 'bg-purple-50/50 border-purple-100' : 'bg-gray-50 border-gray-200'}`}>
                                    {aiLoading ? (
                                        <div className="flex items-center gap-3"><div className="w-5 h-5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /><p className="text-sm text-purple-600 font-medium">심사 분석 중...</p></div>
                                    ) : <div className="text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">{aiResult}</div>}
                                </div>
                            )}
                            {!aiResult && !aiLoading && <p className="text-xs text-gray-400 font-medium text-center py-4">AI 분석으로 누락/과잉 청구를 확인하세요.</p>}
                        </div>

                        {selectedReview.status !== 'approved' && (
                            <button onClick={() => approveReview(selectedReview.id)}
                                className="w-full py-4 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-all active:scale-[0.99] shadow-lg shadow-green-600/20">✅ 퇴원 승인</button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
