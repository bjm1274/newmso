'use client';
import { useRef, useState, useEffect, useCallback } from 'react';

/** 모바일(터치)·PC(마우스) 모두 지원하는 캔버스 서명 패드 */
export default function SignaturePad({ onSave, width = 300, height = 150 }: { onSave: (dataUrl: string) => void; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPoint = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, []);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    e.preventDefault();
    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }, [isDrawing, getPoint]);

  const startDrawing = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [getPoint]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#191F28';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  return (
    <div className="space-y-3">
      <div className="border-2 border-[#E5E8EB] rounded-[12px] overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="block w-full"
          style={{ touchAction: 'none', maxWidth: '100%', height: 180 }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          onTouchCancel={stopDrawing}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="px-4 py-2 text-[13px] font-semibold text-[#4E5968] bg-[#F2F4F6] rounded-[10px] hover:bg-[#E5E8EB]"
        >
          다시 쓰기
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasDrawn}
          className="flex-1 px-4 py-2 text-[13px] font-semibold text-white bg-[#3182F6] rounded-[10px] hover:bg-[#1B64DA] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          서명 적용
        </button>
      </div>
    </div>
  );
}
