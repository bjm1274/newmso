'use client';
import { useRef, useEffect, useState } from 'react';

interface Props {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export default function ElectronicSignaturePad({ onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    lastPos.current = pos;
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  const COLORS = [
    { value: '#000000', label: '검정' },
    { value: '#1a56db', label: '파랑' },
    { value: '#e02424', label: '빨강' },
  ];

  const LINE_WIDTHS = [
    { value: 1, label: '얇게' },
    { value: 2, label: '보통' },
    { value: 4, label: '굵게' },
  ];

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h3 className="text-sm font-bold text-[var(--foreground)]">전자 서명</h3>

      {/* 옵션 */}
      <div className="flex gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold text-[var(--toss-gray-4)] mb-1">색상</p>
          <div className="flex gap-1">
            {COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                title={c.label}
                className={`w-7 h-7 rounded-full border-2 transition-all ${color === c.value ? 'border-[var(--toss-blue)] scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--toss-gray-4)] mb-1">굵기</p>
          <div className="flex gap-1">
            {LINE_WIDTHS.map(w => (
              <button
                key={w.value}
                onClick={() => setLineWidth(w.value)}
                className={`px-2 py-1 text-[10px] font-bold rounded-[6px] transition-all ${lineWidth === w.value ? 'bg-[var(--toss-blue)] text-white' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 캔버스 */}
      <div className="relative border-2 border-dashed border-[var(--toss-border)] rounded-[12px] overflow-hidden">
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-[var(--toss-gray-2)] font-bold">여기에 서명하세요</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          className="w-full touch-none cursor-crosshair"
          style={{ background: '#fff' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      {/* 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={clearCanvas}
          className="px-4 py-2 text-xs font-bold bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-[8px] hover:bg-[var(--toss-gray-2)] transition-all"
        >
          지우기
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-bold border border-[var(--toss-border)] text-[var(--toss-gray-4)] rounded-[8px] hover:bg-[var(--toss-gray-1)] transition-all"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={!hasSignature}
          className="flex-1 py-2 text-xs font-bold bg-[var(--toss-blue)] text-white rounded-[8px] hover:opacity-90 disabled:opacity-40 transition-all"
        >
          서명 저장
        </button>
      </div>
    </div>
  );
}
