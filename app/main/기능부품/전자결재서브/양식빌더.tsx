'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';
import ApprovalFormTypesManager from '../관리자전용서브/전자결재양식관리';
import PayrollDocumentDesignManager from '../관리자전용서브/급여명세서서식관리';

type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'checkbox' | 'radio';

interface FormField {
    id: string;
    type: FieldType;
    label: string;
    required: boolean;
    options?: string[]; // For radio
}

export default function FormBuilder({ user }: any) {
    const [mode, setMode] = useState<'approval' | 'build' | 'document'>('approval');
    const [formName, setFormName] = useState('');
    const [fields, setFields] = useState<FormField[]>([]);
    const [saving, setSaving] = useState(false);

    // Available field types to drag from (rendered as clickable for simplicity)
    const availableTypes: { type: FieldType; label: string; icon: string }[] = [
        { type: 'text', label: '단답형 텍스트', icon: '📝' },
        { type: 'textarea', label: '장문형 텍스트', icon: '📄' },
        { type: 'date', label: '날짜 선택', icon: '📅' },
        { type: 'number', label: '숫자 입력', icon: '🔢' },
        { type: 'checkbox', label: '체크박스 (다중)', icon: '☑️' },
        { type: 'radio', label: '단일 선택 (라디오)', icon: '🔘' },
    ];

    const addField = (type: FieldType) => {
        setFields([...fields, {
            id: crypto.randomUUID(),
            type,
            label: `새 ${type} 필드`,
            required: false,
            options: type === 'radio' ? ['옵션 1', '옵션 2'] : undefined
        }]);
    };

    const updateField = (id: string, updates: Partial<FormField>) => {
        setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const removeField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
    };

    const handleSaveForm = async () => {
        if (!formName.trim()) return alert("양식 이름을 입력해주세요.");
        if (fields.length === 0) return alert("최소 1개의 필드를 추가해주세요.");

        setSaving(true);
        try {
            // In a real app, this would be saved to a custom_templates table.
            // We'll simulate by logging or saving to a generic settings table.
            const payload = {
                name: formName,
                schema: fields,
                created_by: user.id,
                company: user.company
            };

            const { error } = await supabase.from('company_settings').insert([{
                company_name: user.company,
                setting_key: `approval_form_${Date.now()}`,
                setting_value: payload
            }]);

            if (error) throw error;
            alert(`[${formName}] 양식이 성공적으로 발행되었습니다. 이제 전자결재 작성기에서 선택할 수 있습니다.`);
            setFormName('');
            setFields([]);
        } catch (e) {
            console.error(e);
            alert("저장 중 오류가 발생했습니다.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in">
            <div className="flex items-center gap-6 mb-6 px-2 border-b border-slate-200">
                <button
                    onClick={() => setMode('approval')}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 ${mode === 'approval' ? 'border-[var(--toss-blue)] text-[var(--toss-blue)]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    📑 결재 양식
                </button>
                <button
                    onClick={() => setMode('build')}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 ${mode === 'build' ? 'border-[var(--toss-blue)] text-[var(--toss-blue)]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    🛠️ 양식 빌더
                </button>
                <button
                    onClick={() => setMode('document')}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 ${mode === 'document' ? 'border-[var(--toss-blue)] text-[var(--toss-blue)]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    📄 문서 양식
                </button>
            </div>

            {mode === 'approval' ? (
                <div className="flex-1 overflow-y-auto pb-10 custom-scrollbar">
                    <ApprovalFormTypesManager />
                </div>
            ) : mode === 'document' ? (
                <div className="flex-1 overflow-y-auto pb-10 custom-scrollbar">
                    <PayrollDocumentDesignManager />
                </div>
            ) : (
                <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
                    {/* Left: Tools Pane */}
                    <div className="w-full md:w-64 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm shrink-0 flex flex-col">
                        <h3 className="text-sm font-black text-slate-800 mb-4">필드 추가</h3>
                        <div className="space-y-2 flex-1 overflow-y-auto">
                            {availableTypes.map(t => (
                                <button
                                    key={t.type}
                                    onClick={() => addField(t.type)}
                                    className="w-full flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-[var(--toss-blue-light)] hover:border-[var(--toss-blue)]/30 transition-all text-left group"
                                >
                                    <span className="text-lg">{t.icon}</span>
                                    <span className="text-xs font-bold text-slate-700 group-hover:text-[var(--toss-blue)]">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Builder Canvas */}
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-3xl p-6 md:p-10 shadow-inner flex flex-col overflow-hidden relative">
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6 shrink-0 z-10">
                            <input
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                placeholder="결재 양식 이름 (예: 재택근무 신청서)"
                                className="text-xl font-black text-slate-800 outline-none w-1/2 bg-transparent placeholder-slate-300"
                            />
                            <button
                                onClick={handleSaveForm}
                                disabled={saving}
                                className="px-6 py-2.5 bg-[var(--toss-blue)] text-white text-xs font-bold rounded-xl shadow-md hover:scale-105 transition-transform disabled:opacity-50"
                            >
                                {saving ? '저장중...' : '양식 발행하기 🚀'}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto w-full max-w-2xl mx-auto space-y-4 pb-20 custom-scrollbar">
                            {fields.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <div className="text-6xl mb-4 opacity-50">📋</div>
                                    <p className="font-bold text-sm">왼쪽에서 필드를 추가하여 직접 설계해보세요.</p>
                                </div>
                            ) : (
                                fields.map((field, index) => (
                                    <div key={field.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative group animate-in slide-in-from-bottom-2">
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                            <button onClick={() => updateField(field.id, { required: !field.required })} className={`px-2 py-1 text-[10px] font-bold rounded ${field.required ? 'bg-[var(--toss-blue)] text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                필수
                                            </button>
                                            <button onClick={() => removeField(field.id)} className="w-6 h-6 rounded bg-red-50 text-red-500 flex items-center justify-center font-black text-xs hover:bg-red-500 hover:text-white transition-colors">✕</button>
                                        </div>

                                        <div className="flex items-center gap-3 mb-4 pr-16">
                                            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">{index + 1}</span>
                                            <input
                                                value={field.label}
                                                onChange={e => updateField(field.id, { label: e.target.value })}
                                                className="flex-1 text-sm font-black text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-[var(--toss-blue)] focus:outline-none transition-colors py-1"
                                            />
                                        </div>

                                        <div className="pl-9 pointer-events-none opacity-50">
                                            {field.type === 'text' && <input type="text" disabled placeholder="단답형 텍스트 입력창" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs" />}
                                            {field.type === 'textarea' && <textarea disabled placeholder="장문형 텍스트 입력창" className="w-full h-20 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs" />}
                                            {field.type === 'date' && <SmartDatePicker value="" onChange={() => { }} disabled className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg text-xs" />}
                                            {field.type === 'number' && <input type="number" disabled placeholder="0" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs" />}
                                            {field.type === 'checkbox' && (
                                                <div className="flex items-center gap-2">
                                                    <input type="checkbox" disabled className="w-4 h-4 accent-[var(--toss-blue)]" />
                                                    <span className="text-xs font-bold">확인/승인</span>
                                                </div>
                                            )}
                                            {field.type === 'radio' && (
                                                <div className="space-y-2 pointer-events-auto opacity-100">
                                                    {(field.options || []).map((opt, i) => (
                                                        <div key={i} className="flex items-center gap-2">
                                                            <input type="radio" disabled name={field.id} className="w-4 h-4" />
                                                            <input
                                                                value={opt}
                                                                onChange={e => {
                                                                    const newOpts = [...(field.options || [])];
                                                                    newOpts[i] = e.target.value;
                                                                    updateField(field.id, { options: newOpts });
                                                                }}
                                                                className="text-xs font-bold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[var(--toss-blue)] outline-none"
                                                            />
                                                            <button onClick={() => {
                                                                const newOpts = (field.options || []).filter((_, idx) => idx !== i);
                                                                updateField(field.id, { options: newOpts });
                                                            }} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => updateField(field.id, { options: [...(field.options || []), `옵션 ${(field.options?.length || 0) + 1}`] })} className="text-[10px] font-bold text-[var(--toss-blue)] mt-2 hover:underline">
                                                        + 옵션 추가
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
