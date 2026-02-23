'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function PhotoModule({ user, inventory, fetchInventory }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [recognizedData, setRecognizedData] = useState<any>(null);
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

  const handleConfirmRecognition = async () => {
    if (!recognizedData) return;
    setLoading(true);
    try {
      const item = inventory.find((i: any) => i.item_name === recognizedData.item_name);
      if (item) {
        const newQty = item.quantity + 1;
        await supabase.from('inventory').update({ 
          quantity: newQty,
          expiry_date: recognizedData.expiry_date,
          lot_number: recognizedData.lot_number
        }).eq('id', item.id);
        alert(`${item.item_name} 1개 입고 완료`);
        fetchInventory();
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-xl rounded-[2.5rem]">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tighter italic">AI 비주얼 촬영 입고</h2>
          <p className="text-[10px] text-green-600 font-bold mt-1 uppercase tracking-widest">AI Visual Recognition Engine</p>
        </div>

        <div className="relative bg-black rounded-[2rem] overflow-hidden aspect-video mb-8 shadow-2xl">
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
            <button onClick={startCamera} className="flex-1 py-5 bg-blue-600 text-white rounded-lg font-semibold text-sm shadow-xl hover:scale-[0.98] transition-all">📷 카메라 활성화</button>
          ) : (
            <>
              <button onClick={capturePhoto} disabled={loading} className="flex-1 py-5 bg-green-600 text-white rounded-lg font-semibold text-sm shadow-xl hover:scale-[0.98] transition-all">📸 촬영 및 인식</button>
              <button onClick={stopCamera} className="px-8 py-5 bg-gray-100 text-gray-400 rounded-lg font-semibold text-sm hover:bg-red-50 hover:text-red-500 transition-all">✕</button>
            </>
          )}
        </div>
      </div>

      {showConfirmDialog && recognizedData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="text-2xl font-semibold text-gray-900 mb-8 tracking-tighter italic">인식 정보 확인</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <img
                src={recognizedData.image_url}
                alt="인식된 재고 이미지"
                className="rounded-lg border-4 border-gray-50 shadow-lg"
              />
              <div className="space-y-4">
                <div>
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">제품명</p>
                  <p className="text-lg font-semibold text-gray-900">{recognizedData.item_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">유효기간</p>
                    <p className="text-sm font-semibold text-blue-600">{recognizedData.expiry_date}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">LOT번호</p>
                    <p className="text-sm font-semibold text-blue-600">{recognizedData.lot_number}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleConfirmRecognition} disabled={loading} className="flex-1 py-5 bg-blue-600 text-white rounded-lg font-semibold text-sm shadow-xl">✅ 확인 및 입고</button>
              <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-5 bg-gray-100 text-gray-400 rounded-lg font-semibold text-sm">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
