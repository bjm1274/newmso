'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  user: any;
}

interface FormField {
  id: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'file' | 'signature';
  label: string;
  required: boolean;
  placeholder: string;
  options: string[];
}

const FIELD_TYPES: { type: FormField['type']; label: string }[] = [
  { type: 'text', label: '텍스트' },
  { type: 'number', label: '숫자' },
  { type: 'date', label: '날짜' },
  { type: 'select', label: '선택(드롭다운)' },
  { type: 'checkbox', label: '체크박스' },
  { type: 'textarea', label: '텍스트영역' },
  { type: 'file', label: '파일첨부' },
  { type: 'signature', label: '서명란' },
];

export default function ApprovalFormBuilder({ user }: Props) {
  const [tab, setTab] = useState<'빌더' | '목록'>('빌더');
  const [formName, setFormName] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [savedForms, setSavedForms] = useState<any[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchForms = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('custom_form_templates')
        .select('*')
        .order('created_at', { ascending: false });
      setSavedForms(data || []);
    } catch {
      setSavedForms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === '목록') fetchForms();
  }, [tab]);

  const addField = (type: FormField['type']) => {
    setFields(prev => [...prev, {
      id: Date.now().toString(),
      type,
      label: FIELD_TYPES.find(f => f.type === type)?.label || type,
      required: false,
      placeholder: '',
      options: type === 'select' ? ['옵션1', '옵션2'] : [],
    }]);
  };

  const updateField = (id: string, update: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...update } : f));
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const moveField = (id: string, dir: 'up' | 'down') => {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === prev.length - 1)) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!formName.trim()) return toast('양식 이름을 입력해주세요.', 'warning');
    if (fields.length === 0) return toast('최소 1개 이상의 필드를 추가해주세요.');
    setSaving(true);
    try {
      await supabase.from('custom_form_templates').insert({
        name: formName.trim(),
        fields,
        created_by: user?.id,
        created_at: new Date().toISOString(),
      });
      toast('양식이 저장되었습니다.', 'success');
      setFormName('');
      setFields([]);
    } catch {
      toast('저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 양식을 삭제하시겠습니까?')) return;
    try {
      await supabase.from('custom_form_templates').delete().eq('id', id);
      setSavedForms(prev => prev.filter(f => f.id !== id));
    } catch {
      toast('삭제에 실패했습니다.', 'error');
    }
  };

  const renderPreviewField = (field: FormField) => {
    switch (field.type) {
      case 'text': return <input type="text" placeholder={field.placeholder || field.label} className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--muted)]" disabled />;
      case 'number': return <input type="number" placeholder={field.placeholder} className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--muted)]" disabled />;
      case 'date': return <input type="date" className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--muted)]" disabled />;
      case 'select': return <select className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--muted)]" disabled><option>-- 선택 --</option>{field.options.map(o => <option key={o}>{o}</option>)}</select>;
      case 'checkbox': return <input type="checkbox" className="w-4 h-4" disabled />;
      case 'textarea': return <textarea className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm h-24 bg-[var(--muted)]" placeholder={field.placeholder} disabled />;
      case 'file': return <input type="file" className="w-full text-sm" disabled />;
      case 'signature': return <div className="w-full h-20 border-2 border-dashed border-[var(--border)] rounded-[var(--radius-md)] flex items-center justify-center text-xs text-[var(--toss-gray-3)]">서명란</div>;
      default: return null;
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">결재 양식 빌더</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">커스텀 결재 양식을 직접 만들어 저장합니다.</p>
        </div>
        <div className="flex gap-2">
          {(['빌더', '목록'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] ${tab === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === '빌더' ? (
        <>
          <input
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder="양식 이름 입력"
            className="w-full p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold"
          />

          {/* 필드 추가 버튼 */}
          <div>
            <p className="text-xs font-bold text-[var(--toss-gray-4)] mb-1.5">필드 추가</p>
            <div className="flex flex-wrap gap-2">
              {FIELD_TYPES.map(({ type, label }) => (
                <button key={type} onClick={() => addField(type)} className="px-3 py-1.5 text-xs font-bold bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--accent)] hover:text-white transition-all">
                  + {label}
                </button>
              ))}
            </div>
          </div>

          {/* 필드 목록 */}
          {fields.length > 0 && (
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div key={field.id} className="p-3 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">{FIELD_TYPES.find(f => f.type === field.type)?.label}</span>
                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => moveField(field.id, 'up')} disabled={idx === 0} className="text-xs px-2 py-0.5 bg-[var(--muted)] rounded disabled:opacity-30">▲</button>
                      <button onClick={() => moveField(field.id, 'down')} disabled={idx === fields.length - 1} className="text-xs px-2 py-0.5 bg-[var(--muted)] rounded disabled:opacity-30">▼</button>
                      <button onClick={() => removeField(field.id)} className="text-xs px-2 py-0.5 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20">삭제</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[var(--toss-gray-3)]">라벨</label>
                      <input value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} className="w-full p-1.5 text-xs border border-[var(--border)] rounded-md bg-[var(--muted)]" />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--toss-gray-3)]">Placeholder</label>
                      <input value={field.placeholder} onChange={e => updateField(field.id, { placeholder: e.target.value })} className="w-full p-1.5 text-xs border border-[var(--border)] rounded-md bg-[var(--muted)]" />
                    </div>
                    {field.type === 'select' && (
                      <div className="col-span-2">
                        <label className="text-[10px] text-[var(--toss-gray-3)]">옵션 (쉼표 구분)</label>
                        <input value={field.options.join(',')} onChange={e => updateField(field.id, { options: e.target.value.split(',') })} className="w-full p-1.5 text-xs border border-[var(--border)] rounded-md bg-[var(--muted)]" />
                      </div>
                    )}
                    <label className="flex items-center gap-2 col-span-2 cursor-pointer">
                      <input type="checkbox" checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} className="accent-[var(--accent)]" />
                      <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">필수 항목</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setPreviewOpen(true)} disabled={fields.length === 0} className="px-4 py-2 bg-[var(--muted)] text-[var(--toss-gray-4)] text-xs font-bold rounded-[var(--radius-md)] hover:bg-[var(--toss-gray-2)] disabled:opacity-40">미리보기</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>

          {/* 미리보기 모달 */}
          {previewOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreviewOpen(false)}>
              <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 max-w-md w-full mx-4 shadow-sm max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">{formName || '양식 미리보기'}</h3>
                  <button onClick={() => setPreviewOpen(false)} className="text-[var(--toss-gray-3)] hover:text-[var(--foreground)]">✕</button>
                </div>
                <div className="space-y-4">
                  {fields.map(field => (
                    <div key={field.id}>
                      <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">
                        {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderPreviewField(field)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {loading ? <div className="text-center py-5 text-sm text-[var(--toss-gray-3)]">로딩 중...</div> :
          savedForms.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-[var(--border)] rounded-[var(--radius-md)]">
              <p className="text-sm text-[var(--toss-gray-3)]">저장된 양식이 없습니다.</p>
            </div>
          ) : savedForms.map(form => (
            <div key={form.id} className="flex items-center justify-between p-3 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)]">
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">{form.name}</p>
                <p className="text-[11px] text-[var(--toss-gray-3)]">필드 {(form.fields || []).length}개 · {new Date(form.created_at).toLocaleDateString('ko-KR')}</p>
              </div>
              <button onClick={() => handleDelete(form.id)} className="px-3 py-1.5 text-xs font-bold text-red-500 bg-red-500/10 rounded-[var(--radius-md)] hover:bg-red-500/20">삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
