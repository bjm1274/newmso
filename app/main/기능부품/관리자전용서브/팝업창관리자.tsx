'use client';
import { toast } from '@/lib/toast';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const VIDEO_TYPES = new Set(['video/mp4']);

type PopupDraft = {
  title: string;
  media_url: string;
  media_type: 'image' | 'video';
  width: number;
  height: number;
};

type SignedUploadResponse = {
  path?: string;
  token?: string;
  url?: string;
  error?: string;
};

function isAllowedFile(file: File, mediaType: PopupDraft['media_type']) {
  const allowedTypes = mediaType === 'video' ? VIDEO_TYPES : IMAGE_TYPES;

  if (!allowedTypes.has(file.type)) {
    return mediaType === 'video'
      ? '동영상은 MP4 파일만 업로드할 수 있습니다.'
      : '이미지는 JPG 또는 PNG 파일만 업로드할 수 있습니다.';
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return '파일 크기는 25MB 이하여야 합니다.';
  }

  return null;
}

export default function PopupManager() {
  const [popups, setPopups] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingPopupId, setDeletingPopupId] = useState<string | null>(null);
  const [newPopup, setNewPopup] = useState<PopupDraft>({
    title: '',
    media_url: '',
    media_type: 'image',
    width: 400,
    height: 500,
  });

  const previewUrl = useMemo(() => {
    if (selectedFile) {
      return URL.createObjectURL(selectedFile);
    }
    return newPopup.media_url;
  }, [newPopup.media_url, selectedFile]);

  useEffect(() => {
    return () => {
      if (previewUrl && selectedFile) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, selectedFile]);

  const loadPopups = async () => {
    const { data } = await supabase
      .from('popups')
      .select('*')
      .order('created_at', { ascending: false });
    setPopups(data || []);
  };

  useEffect(() => {
    void loadPopups();
  }, []);

  const uploadSelectedFile = async () => {
    if (!selectedFile) return newPopup.media_url;

    const fileError = isAllowedFile(selectedFile, newPopup.media_type);
    if (fileError) {
      throw new Error(fileError);
    }

    const signResponse = await fetch('/api/admin/popups/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: selectedFile.name,
        contentType: selectedFile.type,
      }),
    });

    const signPayload = (await signResponse.json().catch(() => null)) as SignedUploadResponse | null;
    if (!signResponse.ok || !signPayload?.path || !signPayload?.token || !signPayload?.url) {
      throw new Error(signPayload?.error || '파일 업로드 준비에 실패했습니다.');
    }

    const { error: uploadError } = await supabase.storage
      .from('popups')
      .uploadToSignedUrl(signPayload.path, signPayload.token, selectedFile, {
        cacheControl: '3600',
        contentType: selectedFile.type,
      });

    if (uploadError) {
      throw new Error(uploadError.message || '파일 업로드에 실패했습니다.');
    }

    return signPayload.url;
  };

  const handleAddPopup = async () => {
    if (!newPopup.title.trim()) {
      return toast('팝업 제목을 입력해주세요.', 'warning');
    }

    if (!selectedFile && !newPopup.media_url.trim()) {
      return toast('팝업에 사용할 파일을 선택해주세요.', 'warning');
    }

    setSaving(true);

    try {
      const finalUrl = await uploadSelectedFile();
      const { error } = await supabase
        .from('popups')
        .insert([{ ...newPopup, title: newPopup.title.trim(), media_url: finalUrl, is_active: true }]);

      if (error) {
        throw new Error(error.message || '팝업 저장에 실패했습니다.');
      }

      toast('새 팝업이 생성되었습니다.');
      setSelectedFile(null);
      setNewPopup({ title: '', media_url: '', media_type: 'image', width: 400, height: 500 });
      await loadPopups();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '파일 업로드에 실패했습니다.';
      toast(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePopup = async (popup: any) => {
    if (!popup?.id) return;
    if (!confirm(`"${popup.title || '제목 없음'}" 팝업을 삭제하시겠습니까?`)) {
      return;
    }

    setDeletingPopupId(popup.id);
    try {
      const response = await fetch('/api/admin/popups/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ popupId: popup.id }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '팝업 삭제에 실패했습니다.');
      }

      toast(payload?.warning || payload?.message || '팝업이 삭제되었습니다.', 'success');
      await loadPopups();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '팝업 삭제 중 오류가 발생했습니다.';
      toast(message);
    } finally {
      setDeletingPopupId(null);
    }
  };

  return (
    <div className="space-y-4 animate-in slide-in-from-right-4 duration-500">
      <div className="bg-[var(--card)] p-4 border border-[var(--border)] shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-4">
          <h3 className="font-semibold text-base text-[var(--foreground)] tracking-tight">
            홈페이지 팝업 설정
          </h3>
          <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
            등록된 팝업 {popups.length}개
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
              팝업 제목
            </label>
            <input
              className="w-full p-2 bg-[var(--muted)] border border-[var(--border)] text-xs font-bold outline-none"
              placeholder="예: 박철홍정형외과 설날 진료 안내"
              value={newPopup.title}
              onChange={(e) => setNewPopup({ ...newPopup, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
              미디어 타입
            </label>
            <select
              className="w-full p-2 bg-[var(--muted)] border border-[var(--border)] text-xs font-bold outline-none"
              value={newPopup.media_type}
              onChange={(e) => {
                setSelectedFile(null);
                setNewPopup({
                  ...newPopup,
                  media_type: e.target.value as PopupDraft['media_type'],
                });
              }}
            >
              <option value="image">이미지 (JPG, PNG)</option>
              <option value="video">동영상 (MP4)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
            {newPopup.media_type === 'video'
              ? '동영상 파일 선택 (MP4)'
              : '이미지 파일 선택 (JPG, PNG)'}
          </label>
          <input
            type="file"
            accept={newPopup.media_type === 'video' ? 'video/mp4' : 'image/png,image/jpeg,image/jpg'}
            className="w-full text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setSelectedFile(file);
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={() => setShowPreview(true)}
            className="w-full py-2.5 bg-orange-50 text-orange-600 border border-orange-100 text-[11px] font-semibold shadow-sm uppercase tracking-widest"
          >
            👁️ 홈페이지 실시간 시뮬레이션
          </button>
          <button
            onClick={handleAddPopup}
            disabled={saving}
            className="w-full py-2.5 bg-gray-900 text-white text-[11px] font-semibold shadow-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? '업로드 중...' : '팝업 즉시 생성'}
          </button>
        </div>

        <div className="border-t border-[var(--border)] pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold text-[var(--foreground)]">등록된 팝업 목록</h4>
            <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">최신순</span>
          </div>

          {popups.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-10 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
              등록된 팝업이 없습니다.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {popups.map((popup) => (
                <div
                  key={popup.id}
                  className="flex gap-4 border border-[var(--border)] bg-[var(--muted)] p-4 shadow-sm"
                >
                  <div className="w-28 h-36 shrink-0 overflow-hidden bg-[var(--card)] border border-[var(--border)]">
                    {popup.media_type === 'video' ? (
                      <video
                        src={popup.media_url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={popup.media_url}
                        alt={popup.title || '팝업 이미지'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--foreground)] truncate">
                          {popup.title || '제목 없음'}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          {popup.media_type === 'video' ? '동영상' : '이미지'} · {popup.width}x{popup.height}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          등록일 {popup.created_at ? new Date(popup.created_at).toLocaleString('ko-KR') : '-'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeletePopup(popup)}
                        disabled={deletingPopupId === popup.id}
                        data-testid={`popup-delete-button-${popup.id}`}
                        className="shrink-0 px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {deletingPopupId === popup.id ? '삭제 중...' : '삭제'}
                      </button>
                    </div>

                    <a
                      href={popup.media_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-[11px] font-semibold text-[var(--accent)] hover:underline"
                    >
                      미디어 열기
                    </a>

                    <p className="break-all text-[10px] text-[var(--toss-gray-3)]">
                      {popup.media_url}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPreview && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-5 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="w-full h-full max-w-6xl bg-[var(--card)] border border-[var(--foreground)] shadow-sm relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--muted)] p-2 border-b flex justify-between items-center px-4">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 bg-red-400" />
                <span className="w-3 h-3 bg-yellow-400" />
                <span className="w-3 h-3 bg-green-400" />
              </div>
              <div className="text-[11px] font-bold text-[var(--toss-gray-3)] tracking-widest">
                사이트 미리보기: https://www.pchos.kr
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="px-5 py-1.5 bg-black text-white text-[11px] font-semibold"
              >
                닫기 X
              </button>
            </div>
            <div className="flex-1 relative bg-[var(--muted)] overflow-hidden">
              <iframe
                src="https://www.pchos.kr"
                className="w-full h-full border-0 pointer-events-none opacity-40"
              />
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--card)] shadow-sm border border-[var(--foreground)] overflow-hidden"
                style={{ width: `${newPopup.width}px`, height: `${newPopup.height}px` }}
              >
                {newPopup.media_type === 'video' ? (
                  <video
                    src={previewUrl}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img src={previewUrl} alt="Popup" className="w-full h-full object-fill" />
                )}
                <div className="absolute bottom-0 w-full h-8 bg-black text-white flex justify-between items-center px-3 text-[11px] font-semibold">
                  <span>오늘 하루 열지 않기</span>
                  <span>닫기 X</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
