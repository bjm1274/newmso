'use client';
import { toast } from '@/lib/toast';
import { useActionDialog } from '@/app/components/useActionDialog';
import { CameraInput } from '@/app/components/CameraInput';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { STORAGE_KEYS } from '@/lib/storage-keys';

interface Props {
  user: any;
  selectedCo: string;
}

interface Seal {
  id: string;
  company: string;
  type: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

const SEAL_TYPES = ['법인인감', '대표인', '부서인'];

const LOCAL_SEALS_KEY = STORAGE_KEYS.COMPANY_SEALS;

function isMissingTableError(error: unknown, tableName = 'company_seals') {
  if (!error) return false;
  const err = error as { code?: string; message?: string; details?: string };
  const code = String(err?.code || '');
  const message = String(err?.message || err?.details || '').toLowerCase();
  return code === 'PGRST205' || message.includes(tableName.toLowerCase());
}

function readLocalSeals(): Seal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SEALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalSeals(next: Seal[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_SEALS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function uploadSealImage(imageFile: File, company: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('company', company);

  const response = await fetch('/api/admin/seal/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || '직인 업로드에 실패했습니다.');
  }

  const result = (await response.json()) as { url: string };
  return result.url;
}

export default function SealManager({ user, selectedCo }: Props) {
  const { dialog, openConfirm } = useActionDialog();
  const [seals, setSeals] = useState<Seal[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [company, setCompany] = useState(selectedCo === '전체' ? '' : selectedCo);
  const [sealType, setSealType] = useState('법인인감');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewSeal, setPreviewSeal] = useState<Seal | null>(null);

  const fetchSeals = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_seals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        if (!isMissingTableError(error, 'company_seals')) {
          throw error;
        }
        setSeals(readLocalSeals());
        return;
      }
      const next = data || [];
      setSeals(next);
      writeLocalSeals(next);
    } catch {
      setSeals(readLocalSeals());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSeals(); }, []);

  const handleFilesSelected = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!company.trim()) return toast('법인명을 입력해주세요.', 'warning');
    if (!imageFile && !imagePreview) return toast('직인 이미지를 업로드해주세요.', 'warning');
    setSaving(true);
    try {
      let imageUrl = imagePreview || '';
      if (imageFile) {
        imageUrl = await uploadSealImage(imageFile, company.trim());
      }
      const nextSeal: Seal = {
        id: globalThis.crypto?.randomUUID?.() || `local-seal-${Date.now()}`,
        company: company.trim(),
        type: sealType,
        image_url: imageUrl,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('company_seals').insert(nextSeal);
      if (error) {
        if (!isMissingTableError(error, 'company_seals')) {
          throw error;
        }
        const next = [nextSeal, ...readLocalSeals()];
        setSeals(next);
        writeLocalSeals(next);
      } else {
        await fetchSeals();
      }
      toast('직인이 등록되었습니다.', 'success');
      setShowForm(false);
      setCompany(selectedCo === '전체' ? '' : selectedCo);
      setSealType('법인인감');
      setImagePreview(null);
      setImageFile(null);
    } catch {
      toast('저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (seal: Seal) => {
    try {
      const nextActive = !seal.is_active;
      const { error } = await supabase.from('company_seals').update({ is_active: nextActive }).eq('id', seal.id);
      if (error) {
        if (!isMissingTableError(error, 'company_seals')) {
          throw error;
        }
        const next = readLocalSeals().map((item) => item.id === seal.id ? { ...item, is_active: nextActive } : item);
        setSeals(next);
        writeLocalSeals(next);
        return;
      }
      const next = seals.map((item) => item.id === seal.id ? { ...item, is_active: nextActive } : item);
      setSeals(next);
      writeLocalSeals(next);
    } catch {
      toast('변경에 실패했습니다.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const targetSeal = seals.find((seal) => seal.id === id);
    const confirmed = await openConfirm({
      title: '직인 이미지를 삭제할까요?',
      description: [
        targetSeal ? `${targetSeal.company} · ${targetSeal.type} 직인을 삭제합니다.` : '선택한 직인을 삭제합니다.',
        '삭제 후 새 결재 완료 문서에는 이 직인이 자동 삽입되지 않습니다.',
      ].join('\n'),
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('company_seals').delete().eq('id', id);
      if (error) {
        if (!isMissingTableError(error, 'company_seals')) {
          throw error;
        }
        const nextLocal = readLocalSeals().filter((item) => item.id !== id);
        setSeals(nextLocal);
        writeLocalSeals(nextLocal);
        return;
      }
      const next = seals.filter((item) => item.id !== id);
      setSeals(next);
      writeLocalSeals(next);
    } catch {
      toast('삭제에 실패했습니다.', 'error');
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {dialog}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">법인 직인 이미지 관리</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">결재 완료된 문서에 자동 삽입됩니다.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90"
        >
          직인 등록
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <div className="p-4 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">법인명</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="법인명 입력" className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--muted)]" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">직인 유형</label>
              <select value={sealType} onChange={e => setSealType(e.target.value)} className="w-full p-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--muted)]">
                {SEAL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">직인 이미지 (PNG, 투명 배경 권장)</label>
            <CameraInput
              accept="image/png,image/jpeg"
              compress={false}
              onFiles={handleFilesSelected}
              label="파일 선택"
              ariaLabel="직인 이미지 파일 선택"
            />
            {imagePreview && <img src={imagePreview} alt="직인 미리보기" className="mt-2 h-20 border border-[var(--border)] rounded-[var(--radius-md)] p-1" />}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-bold border border-[var(--border)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">취소</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-xs font-bold bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* 직인 목록 */}
      {loading ? (
        <div className="text-center py-5 text-sm text-[var(--toss-gray-3)]">로딩 중...</div>
      ) : seals.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[var(--border)] rounded-[var(--radius-md)]">
          <p className="text-sm text-[var(--toss-gray-3)]">등록된 직인이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {seals.map(seal => (
            <div key={seal.id} className={`p-4 rounded-[var(--radius-md)] border ${seal.is_active ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'} bg-[var(--card)]`}>
              <div className="flex items-start gap-3">
                {seal.image_url ? (
                  <img src={seal.image_url} alt={seal.type} className="w-16 h-16 object-contain border border-[var(--border)] rounded-[var(--radius-md)] p-1 cursor-pointer" onClick={() => setPreviewSeal(seal)} />
                ) : (
                  <div className="w-16 h-16 bg-[var(--muted)] rounded-[var(--radius-md)] flex items-center justify-center text-2xl">🔏</div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-bold text-[var(--foreground)]">{seal.company}</p>
                  <p className="text-[11px] text-[var(--toss-gray-4)]">{seal.type}</p>
                  <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">{new Date(seal.created_at).toLocaleDateString('ko-KR')}</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleToggleActive(seal)} className={`text-[10px] font-bold px-2 py-0.5 rounded-[var(--radius-md)] ${seal.is_active ? 'bg-green-500/20 text-green-700' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}>
                      {seal.is_active ? '활성' : '비활성'}
                    </button>
                    <button onClick={() => handleDelete(seal.id)} className="text-[10px] font-bold px-2 py-0.5 rounded-[var(--radius-md)] bg-red-500/10 text-red-500">삭제</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 직인 미리보기 모달 (A4 배경 오버레이) */}
      {previewSeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreviewSeal(null)}>
          <div className="relative bg-[var(--card)] shadow-sm rounded overflow-hidden" style={{ width: 420, height: 594 }} onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="border-b-2 border-gray-800 pb-4 mb-4">
                <h4 className="text-lg font-bold text-center text-[var(--foreground)]">결재 문서</h4>
              </div>
              <div className="h-80 bg-[var(--tab-bg)] border border-[var(--border)] rounded p-4 text-sm text-[var(--toss-gray-4)] flex items-center justify-center">문서 내용 영역</div>
              <div className="flex justify-end mt-4">
                <div className="relative">
                  <div className="w-20 h-20 border-2 border-[var(--border)] flex items-center justify-center">
                    <img src={previewSeal.image_url} alt="직인" className="w-full h-full object-contain opacity-70" />
                  </div>
                  <p className="text-[10px] text-center text-[var(--toss-gray-3)] mt-1">{previewSeal.company} {previewSeal.type}</p>
                </div>
              </div>
            </div>
            <button onClick={() => setPreviewSeal(null)} className="absolute top-2 right-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-5)] text-xl font-bold">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
