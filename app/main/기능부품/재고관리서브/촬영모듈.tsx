'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function PhotoModule({ user, inventory, fetchInventory }: Record<string, unknown>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [recognizedData, setRecognizedData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      alert('카메라 접근 권한이 필요합니다.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      setIsCameraActive(false);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setLoading(true);
    try {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const imageData = canvasRef.current.toDataURL('image/jpeg');
        
        // OCR 시뮬레이션
        setRecognizedData({
          item_name: '인공관절(무릎)',
          barcode: '8801234567890',
          expiry_date: '2027-12-31',
          lot_number: 'LOT-2025-K001',
          image_url: imageData
        });
        setShowConfirmDialog(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const _inventory = (inventory as Record<string, unknown>[]) ?? [];
  const _fetchInventory = fetchInventory as () => void;

  const handleConfirmRecognition = async () => {
    if (!recognizedData) return;
    setLoading(true);
    try {
      const item = _inventory.find((i: any) => i.item_name === recognizedData.item_name);
      if (item) {
        const newQty = (item.quantity as number) + 1;
        await supabase.from('inventory').update({
          quantity: newQty,
          expiry_date: recognizedData.expiry_date,
          lot_number: recognizedData.lot_number
        }).eq('id', item.id);
        alert(`${item.item_name} 1개 입고 완료`);
        _fetchInventory();
        setRecognizedData(null);
        setShowConfirmDialog(false);
        stopCamera();
      } else {
        alert('등록되지 않은 품목입니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="bg-[var(--card)] p-4 md:p-5 border border-[var(--border)] shadow-sm rounded-2xl">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">AI 비주얼 촬영 입고</h2>
          <p className="text-[11px] text-green-600 font-bold mt-1 uppercase tracking-widest">AI Visual Recognition Engine</p>
        </div>

        <div className="relative bg-black rounded-[var(--radius-lg)] overflow-hidden aspect-video mb-5 shadow-sm">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ display: isCameraActive ? 'block' : 'none' }} />
          {!isCameraActive && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 text-center">
              <div>
                <p className="text-5xl mb-4">📸</p>
                <p className="font-semibold text-sm uppercase tracking-widest">Visual Scanner Ready</p>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        <div className="flex gap-3">
          {!isCameraActive ? (
            <button onClick={startCamera} className="flex-1 py-5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm hover:scale-[0.98] transition-all">📷 카메라 활성화</button>
          ) : (
            <>
              <button onClick={capturePhoto} disabled={loading} className="flex-1 py-5 bg-green-600 text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm hover:scale-[0.98] transition-all">📸 촬영 및 인식</button>
              <button onClick={stopCamera} className="px-5 py-5 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-sm hover:bg-red-50 hover:text-red-500 transition-all">✕</button>
            </>
          )}
        </div>
      </div>

      {showConfirmDialog && recognizedData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-[var(--card)] rounded-2xl p-5 md:p-5 max-w-2xl w-full shadow-sm animate-in zoom-in-95 duration-300">
            <h3 className="text-2xl font-semibold text-[var(--foreground)] mb-5 tracking-tight">인식 정보 확인</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              <img
                src={recognizedData.image_url as string}
                alt="인식된 재고 이미지"
                className="rounded-[var(--radius-md)] border-4 border-[var(--border-subtle)] shadow-sm"
              />
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">제품명</p>
                  <p className="text-lg font-semibold text-[var(--foreground)]">{recognizedData.item_name as string}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">유효기간</p>
                    <p className="text-sm font-semibold text-[var(--accent)]">{recognizedData.expiry_date as string}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">LOT번호</p>
                    <p className="text-sm font-semibold text-[var(--accent)]">{recognizedData.lot_number as string}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleConfirmRecognition} disabled={loading} className="flex-1 py-5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm">✅ 확인 및 입고</button>
              <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-5 bg-[var(--muted)] text-[var(--toss-gray-3)] rounded-[var(--radius-md)] font-semibold text-sm">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
