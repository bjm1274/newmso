'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Tesseract from 'tesseract.js';

/** 거래명세서 OCR 텍스트에서 품목·수량 파싱 */
function parseStatementText(text: string): { item_name: string; qty: number; unit_price?: number }[] {
  const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
  const items: { item_name: string; qty: number; unit_price?: number }[] = [];
  const numPat = /[\d,]+/g;

  for (const line of lines) {
    // "품목명  수량  단가  금액" 또는 "품목명 100 2000 200000" 형태
    const parts = line.split(/\s{2,}|\t/).filter(Boolean);
    if (parts.length >= 2) {
      const name = parts[0].replace(/[^\uAC00-\uD7A3\w\s\-\.]/g, '').trim();
      const qtyMatch = parts[1].replace(/,/g, '').match(/\d+/);
      const qty = qtyMatch ? parseInt(qtyMatch[0], 10) : 0;
      const raw = (parts[2] || '').replace(/,/g, '');
      const unitPrice = parts.length >= 3 ? (parseInt(raw, 10) || undefined) : undefined;
      if (name && name.length >= 2 && !/^\d+$/.test(name) && qty > 0) {
        items.push({ item_name: name, qty, unit_price: unitPrice });
      }
    } else {
      // 한 줄에 "품목명 100개" 또는 "품목명 100 2000" 형태
      const nums = line.match(numPat);
      const namePart = line.replace(numPat, '').replace(/\s+/g, ' ').trim();
      if (nums && namePart.length >= 2 && !/^[\d\s,]+$/.test(namePart)) {
        const qty = parseInt(nums[0].replace(/,/g, ''), 10) || 0;
        if (qty > 0) items.push({ item_name: namePart, qty, unit_price: nums[1] ? parseInt(nums[1].replace(/,/g, ''), 10) : undefined });
      }
    }
  }
  return items;
}

export default function ScanModule({ user, inventory, fetchInventory }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState<'명세서' | '바코드'>('명세서');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);

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
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      setIsCameraActive(false);
    }
    setUploadedImage(null);
    setScannedData(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }
    setLoading(true);
    setOcrProgress(0);
    try {
      const dataUrl = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(file);
      });
      setUploadedImage(dataUrl);

      const { data: { text } } = await Tesseract.recognize(dataUrl, 'kor+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100));
        }
      });

      if (scanMode === '명세서') {
        const items = parseStatementText(text);
        setScannedData(items.length > 0 ? { items, supplier_name: '' } : null);
        if (items.length === 0) alert('거래명세서에서 품목을 인식하지 못했습니다. 이미지 품질을 확인하세요.');
      } else {
        setScannedData({ item_name: '스캔 품목', qty: 1, unit_price: 0 });
      }
    } catch (err) {
      console.error(err);
      alert('OCR 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setOcrProgress(0);
      e.target.value = '';
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setLoading(true);
    try {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setUploadedImage(dataUrl);

        const { data: { text } } = await Tesseract.recognize(dataUrl, 'kor+eng', {
          logger: (m) => { if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100)); }
        });

        if (scanMode === '명세서') {
          const items = parseStatementText(text);
          setScannedData(items.length > 0 ? { items } : null);
        } else {
          setScannedData({ item_name: '스캔 품목', qty: 1, unit_price: 0 });
        }
      }
    } finally {
      setLoading(false);
      setOcrProgress(0);
    }
  };

  const handleConfirmScan = async () => {
    if (!scannedData) return;
    setLoading(true);
    try {
      if (scanMode === '명세서' && scannedData.items?.length) {
        let successCount = 0;
        const company = user?.company || '박철홍정형외과';

        for (const it of scannedData.items) {
          const existing = inventory.find((i: any) =>
            (i.item_name || i.name || '').includes(it.item_name) || (it.item_name || '').includes(i.item_name || i.name || '')
          );
          if (existing) {
            const newQty = (existing.quantity ?? existing.stock ?? 0) + it.qty;
            await supabase.from('inventory').update({ quantity: newQty, stock: newQty }).eq('id', existing.id);
            await supabase.from('inventory_logs').insert([{
              item_id: existing.id,
              inventory_id: existing.id,
              type: '입고',
              change_type: '입고',
              quantity: it.qty,
              prev_quantity: existing.quantity ?? existing.stock,
              next_quantity: newQty,
              actor_name: user?.name,
              company
            }]);
            successCount++;
          } else {
            const { data: inserted } = await supabase.from('inventory').insert([{
              item_name: it.item_name,
              name: it.item_name,
              quantity: it.qty,
              stock: it.qty,
              min_quantity: 5,
              unit_price: it.unit_price || 0,
              company,
              category: '스캔입고'
            }]).select('id').single();
            if (inserted) {
              await supabase.from('inventory_logs').insert([{
                item_id: inserted.id,
                inventory_id: inserted.id,
                type: '입고',
                change_type: '입고',
                quantity: it.qty,
                prev_quantity: 0,
                next_quantity: it.qty,
                actor_name: user?.name,
                company
              }]);
              successCount++;
            }
          }
        }
        alert(`${successCount}건 입고 처리 완료`);
        fetchInventory();
      } else if (scanMode === '바코드' && scannedData.item_name) {
        const item = inventory.find((i: any) => (i.item_name || i.name) === scannedData.item_name);
        if (item) {
          const newQty = (item.quantity ?? item.stock ?? 0) + (scannedData.qty || 1);
          await supabase.from('inventory').update({ quantity: newQty, stock: newQty }).eq('id', item.id);
          await supabase.from('inventory_logs').insert([{ item_id: item.id, inventory_id: item.id, type: '입고', change_type: '입고', quantity: scannedData.qty || 1, actor_name: user?.name }]);
          alert(`${item.item_name || item.name} 입고 완료`);
          fetchInventory();
        } else {
          alert('등록되지 않은 품목입니다.');
        }
      }
      setScannedData(null);
      setUploadedImage(null);
      stopCamera();
    } finally {
      setLoading(false);
    }
  };

  const triggerFileUpload = () => fileInputRef.current?.click();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

      <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-xl rounded-[2.5rem]">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">거래명세서 스캔 입고</h2>
          <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">PC 스캐너 → 이미지 업로드 → OCR → 자동입고</p>
        </div>

        <div className="flex gap-2 mb-8">
          {(['명세서', '바코드'] as const).map(mode => (
            <button key={mode} onClick={() => { setScanMode(mode); setScannedData(null); setUploadedImage(null); }} className={`flex-1 py-4 rounded-2xl text-xs font-black transition-all ${scanMode === mode ? 'bg-blue-600 text-white shadow-xl' : 'bg-gray-50 text-gray-400'}`}>{mode} 스캔</button>
          ))}
        </div>

        {/* PC 스캐너 안내 + 파일 업로드 */}
        <div className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100">
          <h4 className="text-sm font-black text-blue-800 mb-2">📄 1단계: 스캔 이미지 준비</h4>
          <p className="text-xs font-bold text-blue-700 mb-4">
            PC에 연결된 스캐너/복합기에서 거래명세서를 스캔한 뒤, 저장된 이미지 파일을 선택하세요.
          </p>
          <button onClick={triggerFileUpload} disabled={loading} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl hover:scale-[0.98] transition-all disabled:opacity-50">
            📁 스캔한 이미지 파일 선택
          </button>
        </div>

        {/* 카메라 (모바일 대안) */}
        <div className="relative bg-black rounded-[2rem] overflow-hidden aspect-video mb-8 shadow-2xl">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ display: isCameraActive ? 'block' : 'none' }} />
          {uploadedImage && !isCameraActive && (
            <img src={uploadedImage} alt="스캔" className="w-full h-full object-contain" />
          )}
          {!isCameraActive && !uploadedImage && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 text-center">
              <p className="text-5xl mb-2">📷</p>
              <p className="font-black text-sm">카메라 촬영 (모바일)</p>
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        <div className="flex gap-3">
          {!isCameraActive ? (
            <button onClick={startCamera} className="flex-1 py-5 bg-gray-100 text-gray-600 rounded-2xl font-black text-sm">📷 카메라로 촬영</button>
          ) : (
            <>
              <button onClick={capturePhoto} disabled={loading} className="flex-1 py-5 bg-green-600 text-white rounded-2xl font-black text-sm shadow-xl">📸 촬영 및 OCR</button>
              <button onClick={stopCamera} className="px-8 py-5 bg-gray-100 text-gray-400 rounded-2xl font-black text-sm">✕</button>
            </>
          )}
        </div>

        {loading && ocrProgress > 0 && (
          <div className="mt-4">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${ocrProgress}%` }} />
            </div>
            <p className="text-[10px] font-bold text-gray-500 mt-1">OCR 분석 중... {ocrProgress}%</p>
          </div>
        )}

        {scannedData && (
          <div className="mt-8 p-8 bg-blue-50/50 rounded-[2rem] border border-blue-100 animate-in slide-in-from-top-4">
            <h4 className="text-sm font-black text-blue-600 mb-4 uppercase tracking-widest">분석 결과 (확인 후 입고)</h4>
            <div className="space-y-4">
              {scanMode === '명세서' && scannedData.items?.length ? (
                scannedData.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-xs font-bold text-gray-700 bg-white p-4 rounded-xl">
                    <span>{item.item_name}</span>
                    <span className="font-black text-blue-600">{item.qty}개 {item.unit_price ? `× ₩${item.unit_price.toLocaleString()}` : ''}</span>
                  </div>
                ))
              ) : scanMode === '바코드' ? (
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-gray-800">{scannedData.item_name}</span>
                  <span className="text-xs font-black text-blue-600">{scannedData.qty || 1}개</span>
                </div>
              ) : null}
              <button onClick={handleConfirmScan} disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs shadow-lg mt-4">✅ 입고 확정하기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
