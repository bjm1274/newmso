'use client';

/**
 * CameraInput.tsx
 *
 * 모바일 표준 카메라/이미지 업로드 컴포넌트 (docs/mobile/MSO_Mobile_Advanced.md §3)
 * - 후면/전면 카메라 호출 (`capture` prop)
 * - 클라이언트 측 canvas 리사이즈 + JPEG 압축
 * - HEIC → JPEG 변환 (heic2any 동적 로드, 미설치 시 원본 유지)
 * - 진행률 콜백 (onProgress: 처리한 파일 수 / 전체)
 *
 * JM: 한 파일 단일 책임, 약 150줄 이내
 * JM3: 파일 처리 실패는 toast로 알리고 원본 또는 빈 배열로 우아하게 폴백
 * JM4: any 금지, File/HTMLImageElement 타입 명시
 * JM5: accept(MIME)로 확장자 제한, 클라이언트 압축으로 업로드 크기 통제
 * JM6: label↔input 묶음, sr-only input, aria-label, focus-visible 링
 */

import { useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { toast } from '../../lib/toast';

export type CameraInputProps = {
  onFiles: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  /** 기본 'image/*'. 비이미지(PDF 등)도 받으려면 'image/*,.pdf' 식으로 지정 */
  accept?: string;
  /** 'environment'=후면(문서/현장), 'user'=전면(셀카). 미지정 시 갤러리 선택 가능 */
  capture?: 'environment' | 'user';
  /** 클라이언트 압축 활성 (이미지 한정). 기본 true. PNG 원본 보존이 필요하면 false */
  compress?: boolean;
  /** 압축 시 JPEG 품질 (0~1). 기본 0.85 */
  quality?: number;
  /** 긴 변 최대 픽셀. 기본 2000 */
  maxWidth?: number;
  /** 진행률 콜백: (처리 완료 수, 전체 수) */
  onProgress?: (done: number, total: number) => void;
  /** 버튼 라벨. 기본 '사진 추가' */
  label?: ReactNode;
  /** 추가 클래스 (래퍼 label에 병합) */
  className?: string;
  /** 비활성화 */
  disabled?: boolean;
  /** 접근성: 버튼 설명. 미지정 시 label/capture로부터 자동 생성 */
  ariaLabel?: string;
};

const IMAGE_MIME_RE = /^image\//i;
const HEIC_RE = /\.(heic|heif)$/i;

export function CameraInput({
  onFiles,
  multiple,
  accept = 'image/*',
  capture,
  compress = true,
  quality = 0.85,
  maxWidth = 2000,
  onProgress,
  label,
  className,
  disabled,
  ariaLabel }: CameraInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const total = files.length;
      const processed: File[] = [];
      for (let i = 0; i < total; i++) {
        const out = await processFile(files[i], { compress, quality, maxWidth });
        processed.push(out);
        onProgress?.(i + 1, total);
      }
      await onFiles(processed);
    } catch (err) {
      console.error('[CameraInput] processing failed:', err);
      toast('사진 처리에 실패했습니다. 다시 시도해 주세요.', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const finalAria = ariaLabel ?? (capture === 'user' ? '사진 촬영 (전면 카메라)' : capture === 'environment' ? '사진 촬영 (후면 카메라)' : '사진 또는 파일 선택');

  return (
    <label
      htmlFor={inputId}
      className={[
        'inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white px-4 py-2 text-xs font-bold cursor-pointer transition-colors hover:bg-[var(--accent-hover)] focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2',
        disabled || busy ? 'opacity-60 cursor-not-allowed pointer-events-none' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      <Camera className="h-4 w-4" aria-hidden="true" />
      <span>{busy ? '처리 중…' : (label ?? '사진 추가')}</span>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture}
        onChange={handleChange}
        disabled={disabled || busy}
        aria-label={finalAria}
        className="sr-only"
      />
    </label>
  );
}

// ----- 파일 처리 유틸 -----

type ProcessOpts = { compress: boolean; quality: number; maxWidth: number };

async function processFile(file: File, opts: ProcessOpts): Promise<File> {
  // 이미지가 아니면 원본 그대로
  if (!IMAGE_MIME_RE.test(file.type) && !HEIC_RE.test(file.name)) return file;

  // HEIC → JPEG (heic2any 가 설치된 경우에만)
  let working: File = file;
  if (file.type === 'image/heic' || file.type === 'image/heif' || HEIC_RE.test(file.name)) {
    working = await convertHeic(file);
  }

  if (!opts.compress) return working;
  if (!IMAGE_MIME_RE.test(working.type)) return working;

  try {
    return await resizeAndCompress(working, opts);
  } catch (err) {
    console.warn('[CameraInput] compression failed, using original:', err);
    return working;
  }
}

async function convertHeic(file: File): Promise<File> {
  // heic2any 의존성은 Cloudflare Worker 핸들러 크기 한도(3MB) 초과 원인이라 제거함.
  // libheif-js 디코더가 ~1.4MB 청크로 SSR 번들에 박혀 deploy 실패 유발.
  // HEIC 업로드는 원본 그대로 전달 — 서버 측 변환이 필요하면 추후 R2 + edge function 도입.
  return file;
}

async function resizeAndCompress(file: File, { quality, maxWidth }: ProcessOpts): Promise<File> {
  const img = await loadImage(file);
  try {
    const longest = Math.max(img.width, img.height);
    const scale = longest > maxWidth ? maxWidth / longest : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    const newName = file.name.replace(/\.(heic|heif|png|webp|bmp|gif)$/i, '.jpg');
    return new File([blob], /\.jpe?g$/i.test(newName) ? newName : `${newName}.jpg`, { type: 'image/jpeg' });
  } finally {
    if ('src' in img) URL.revokeObjectURL(img.src);
  }
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = url;
  });
  return img;
}

export default CameraInput;
