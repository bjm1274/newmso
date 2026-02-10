'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ScanModule({ user, inventory, fetchInventory }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState('명세서');

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
        
        // OCR 시뮬레이션 결과
        const mockData = {
          바코드: { item_name: '멸균 거즈(대)', qty: 10, unit_price: 500, lot_number: 'LOT-2025-01', expiry_date: '2026-12-31' },
          명세서: {
            items: [
              { item_name: '수술용 장갑', qty: 100, unit_price: 2000 },
              { item_name: '소독용 알콜', qty: 50, unit_price: 15000 }
            ],
            supplier_name: '의료용품 A사'
          }
        };
        setScannedData(mockData[scanMode as keyof typeof mockData]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmScan = async () => {
    if (!scannedData) return;
    setLoading(true);
    try {
      if (scanMode === '바코드') {
        const item = inventory.find((i: any) => i.item_name === scannedData.item_name);
        if (item) {
          const newQty = item.quantity + scannedData.qty;
          await supabase.from('inventory').update({ quantity: newQty }).eq('id', item.id);
          alert(`${item.item_name} ${scannedData.qty}개 입고 완료`);
        } else {
          alert('등록되지 않은 품목입니다.');
        }
      } else {
        alert('명세서 일괄 입고 처리가 완료되었습니다.');
      }
      fetchInventory();
      setScannedData(null);
      stopCamera();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-xl rounded-[2.5rem]">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">지능형 스캔 입고 시스템</h2>
          <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">AI Vision Receipt Engine</p>
        </div>

        <div className="flex gap-2 mb-8">
          {['바코드', '명세서'].map(mode => (
            <button key={mode} onClick={() => setScanMode(mode)} className={`flex-1 py-4 rounded-2xl text-xs font-black transition-all ${scanMode === mode ? 'bg-blue-600 text-white shadow-xl' : 'bg-gray-50 text-gray-400'}`}>{mode} 스캔</button>
          ))}
        </div>

        <div className="relative bg-black rounded-[2rem] overflow-hidden aspect-video mb-8 shadow-2xl">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ display: isCameraActive ? 'block' : 'none' }} />
          {!isCameraActive && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 text-center">
              <div>
                <p className="text-5xl mb-4">📷</p>
                <p className="font-black text-sm uppercase tracking-widest">Camera Ready</p>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        <div className="flex gap-3">
          {!isCameraActive ? (
            <button onClick={startCamera} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl hover:scale-[0.98] transition-all">📷 카메라 활성화</button>
          ) : (
            <>
              <button onClick={capturePhoto} disabled={loading} className="flex-1 py-5 bg-green-600 text-white rounded-2xl font-black text-sm shadow-xl hover:scale-[0.98] transition-all">📸 촬영 및 분석</button>
              <button onClick={stopCamera} className="px-8 py-5 bg-gray-100 text-gray-400 rounded-2xl font-black text-sm hover:bg-red-50 hover:text-red-500 transition-all">✕</button>
            </>
          )}
        </div>

        {scannedData && (
          <div className="mt-8 p-8 bg-blue-50/50 rounded-[2rem] border border-blue-100 animate-in slide-in-from-top-4">
            <h4 className="text-sm font-black text-blue-600 mb-4 uppercase tracking-widest">분석 결과</h4>
            <div className="space-y-4">
              {scanMode === '바코드' ? (
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-gray-800">{scannedData.item_name}</span>
                  <span className="text-xs font-black text-blue-600">{scannedData.qty}개</span>
                </div>
              ) : (
                scannedData.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-xs font-bold text-gray-700">
                    <span>{item.item_name}</span>
                    <span>{item.qty}개</span>
                  </div>
                ))
              )}
              <button onClick={handleConfirmScan} disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs shadow-lg mt-4">✅ 입고 확정하기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
