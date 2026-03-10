'use client';

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
      return alert('팝업 제목을 입력해주세요.');
    }

    if (!selectedFile && !newPopup.media_url.trim()) {
      return alert('팝업에 사용할 파일을 선택해주세요.');
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

      alert('새 팝업이 생성되었습니다.');
      setSelectedFile(null);
      setNewPopup({ title: '', media_url: '', media_type: 'image', width: 400, height: 500 });
      await loadPopups();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '파일 업로드에 실패했습니다.';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="bg-white p-10 border border-[var(--toss-border)] shadow-sm space-y-8">
        <div className="flex justify-between items-center border-b border-gray-50 pb-6">
          <h3 className="font-semibold text-xl text-[var(--foreground)] tracking-tight">
            홈페이지 팝업 설정
          </h3>
          <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
            등록된 팝업 {popups.length}개
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
              팝업 제목
            </label>
            <input
              className="w-full p-4 bg-[var(--toss-gray-1)] border border-[var(--toss-border)] text-xs font-bold outline-none"
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
              className="w-full p-4 bg-[var(--toss-gray-1)] border border-[var(--toss-border)] text-xs font-bold outline-none"
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
            className="w-full py-5 bg-orange-50 text-orange-600 border border-orange-100 text-[11px] font-semibold shadow-sm uppercase tracking-widest"
          >
            👁️ 홈페이지 실시간 시뮬레이션
          </button>
          <button
            onClick={handleAddPopup}
            disabled={saving}
            className="w-full py-5 bg-gray-900 text-white text-[11px] font-semibold shadow-xl uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? '업로드 중...' : '팝업 즉시 생성'}
          </button>
        </div>
      </div>

      {showPreview && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-8 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="w-full h-full max-w-6xl bg-white border border-[var(--foreground)] shadow-2xl relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--toss-gray-1)] p-2 border-b flex justify-between items-center px-4">
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
            <div className="flex-1 relative bg-[var(--toss-gray-1)] overflow-hidden">
              <iframe
                src="https://www.pchos.kr"
                className="w-full h-full border-0 pointer-events-none opacity-40"
              />
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white shadow-2xl border border-[var(--foreground)] overflow-hidden"
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
