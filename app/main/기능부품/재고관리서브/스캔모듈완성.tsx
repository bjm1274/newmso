'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Tesseract from 'tesseract.js';

/** 거래명세서 OCR 텍스트에서 품목·수량 파싱 (보험코드 패턴 기준으로 필터링) */
type ParsedLine = {
  item_name: string;
  qty: number;
  unit_price?: number;
  insurance_code?: string;
  spec?: string;
  expiry_date?: string;
};

function parseStatementText(text: string): ParsedLine[] {
  const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
  const items: ParsedLine[] = [];
  const numPat = /[\d,]+/g;

  for (const line of lines) {
    // 보험코드 패턴(B+7자리 숫자 등)이 없는 줄은 품목 행이 아닐 확률이 높으므로 스킵
    const insuranceMatch = line.match(/[A-Z]\d{7}/i);
    if (!insuranceMatch) continue;
    const insuranceCode = insuranceMatch[0].toUpperCase();

    // 유효기간 패턴 (예: 20271231, 2027-12-31, 2027.12.31)
    let expiry: string | undefined;
    const expiryRawMatch = line.match(/(20\d{2})[.\-\/]?(0[1-9]|1[0-2])[.\-\/]?(0[1-9]|[12]\d|3[01])/);
    if (expiryRawMatch) {
      const y = expiryRawMatch[1];
      const m = expiryRawMatch[2];
      const d = expiryRawMatch[3];
      expiry = `${y}-${m}-${d}`;
    }

    // 보험코드 이후 부분만 사용해서 품명/수량/단가 추출
    const afterCode = line.slice(line.indexOf(insuranceCode) + insuranceCode.length).trim();

    // "품목명   규격   수량   단가   금액" 형태를 가정하고 2칸 이상 공백/탭 기준으로 분리
    const parts = afterCode.split(/\s{2,}|\t/).filter(Boolean);
    if (parts.length >= 2) {
      const nameAndSpec = parts[0].replace(/[^\uAC00-\uD7A3\w\s\-\.]/g, ' ').trim();
      const name = nameAndSpec; // 우선 전체를 품명으로 두고, 필요 시 뒷부분을 규격으로 나눌 수 있음
      const qtyMatch = parts[1].replace(/,/g, '').match(/\d+/);
      const qty = qtyMatch ? parseInt(qtyMatch[0], 10) : 0;
      const raw = (parts[2] || '').replace(/,/g, '');
      const unitPrice = parts.length >= 3 ? (parseInt(raw, 10) || undefined) : undefined;
      if (name && name.length >= 2 && !/^\d+$/.test(name) && qty > 0) {
        items.push({ item_name: name, qty, unit_price: unitPrice, insurance_code: insuranceCode, spec: '', expiry_date: expiry });
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
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState<'명세서' | '바코드'>('명세서');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [inputMethod, setInputMethod] = useState<'image' | 'camera'>('image');

  // 공통 OCR 실행 함수 (이미지 DataURL → Tesseract)
  const runOcrFromDataUrl = async (dataUrl: string) => {
    setUploadedImage(dataUrl);
    const { data: { text } } = await Tesseract.recognize(dataUrl, 'kor+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100));
      }
    });

    if (scanMode === '명세서') {
      const items = parseStatementText(text);
      const editable = items.map((it) => ({ ...it }));
      setScannedItems(editable);
      setScannedData(editable.length > 0 ? { items: editable, supplier_name: '' } : null);
      if (editable.length === 0) alert('거래명세서에서 품목을 인식하지 못했습니다. 이미지 품질을 확인하세요.');
    } else {
      setScannedItems([]);
      setScannedData({ item_name: '스캔 품목', qty: 1, unit_price: 0 });
    }
  };

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
    setScannedItems([]);
    setInputMethod('image');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setOcrProgress(0);
    try {
      let dataUrl: string | null = null;

      if (file.type.startsWith('image/')) {
        dataUrl = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(file);
        });
      } else if (file.type === 'application/pdf') {
        const pdfjs = await import('pdfjs-dist');
        // CDN 기반 워커 설정 (Next.js 환경에서 간단히 사용)
        (pdfjs as any).GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = (pdfjs as any).getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        dataUrl = canvas.toDataURL('image/png');
      } else {
        alert('이미지 또는 PDF 파일만 업로드 가능합니다.');
        return;
      }

      if (dataUrl) {
        await runOcrFromDataUrl(dataUrl);
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

        await runOcrFromDataUrl(dataUrl);
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
      if (scanMode === '명세서') {
        const itemsToApply = (scannedItems.length ? scannedItems : scannedData.items) || [];
        const validItems = itemsToApply.filter(
          (it: any) => (it.item_name || '').trim().length >= 2 && (it.qty || 0) > 0,
        );
        if (validItems.length === 0) {
          alert('입고할 품목이 없습니다. 품목명과 수량을 확인해 주세요.');
          return;
        }
        let successCount = 0;
        const company = user?.company || '박철홍정형외과';

        for (const it of validItems) {
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
              category: '스캔입고',
              insurance_code: it.insurance_code || null,
              spec: it.spec || null,
              expiry_date: it.expiry_date || null,
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
      setScannedItems([]);
      setUploadedImage(null);
      stopCamera();
    } finally {
      setLoading(false);
    }
  };

  const triggerFileUpload = () => fileInputRef.current?.click();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" />

      <div className="bg-white p-6 md:p-10 border border-gray-100 shadow-xl rounded-[2.5rem]">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">거래명세서 스캔 입고</h2>
          <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-widest">
            {scanMode === '명세서'
              ? '스캔 이미지 · 카메라 촬영으로 거래명세서 인식'
              : '스캔 이미지 · 카메라 촬영으로 바코드 인식'}
          </p>
        </div>

        {/* 스캔 종류 선택 (명세서 / 바코드) */}
        <div className="flex gap-2 mb-4">
          {(['명세서', '바코드'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => {
                setScanMode(mode);
                setScannedData(null);
                setScannedItems([]);
                setUploadedImage(null);
                setInputMethod('image');
              }}
              className={`flex-1 py-4 rounded-2xl text-xs font-black transition-all ${
                scanMode === mode ? 'bg-blue-600 text-white shadow-xl' : 'bg-gray-50 text-gray-400'
              }`}
            >
              {mode} 스캔
            </button>
          ))}
        </div>

        {/* 입력 방식 선택: 스캔 이미지 / 카메라 스캔 */}
        <div className="mb-6 flex gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-100">
          {([
            { id: 'image', label: '🖼 스캔 이미지' },
            { id: 'camera', label: '📷 카메라 스캔' },
          ] as const).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setInputMethod(m.id);
                if (m.id !== 'camera') {
                  stopCamera();
                }
              }}
              className={`flex-1 py-3 rounded-2xl text-[11px] font-black transition-all ${
                inputMethod === m.id ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-500'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* 파일 기반 스캔 (스캔 이미지) */}
        {inputMethod === 'image' && (
          <div className="mb-8 p-6 bg-blue-50 rounded-2xl border border-blue-100">
            <h4 className="text-sm font-black text-blue-800 mb-2">📄 스캔 이미지 파일로 인식</h4>
            <p className="text-xs font-bold text-blue-700 mb-4">
              {scanMode === '명세서'
                ? '거래명세서를 스캐너·복합기에서 스캔(이미지)한 뒤, 저장된 파일을 선택해 주세요.'
                : '제품 바코드가 잘 보이도록 스캔(이미지)한 뒤, 저장된 파일을 선택해 주세요.'}
            </p>
            <button
              onClick={triggerFileUpload}
              disabled={loading}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl hover:scale-[0.98] transition-all disabled:opacity-50"
            >
              📁 {scanMode === '명세서' ? '명세서 스캔 파일 선택' : '바코드 스캔 파일 선택'}
            </button>
          </div>
        )}

        {/* 카메라 스캔 */}
        {inputMethod === 'camera' && (
          <>
            <div className="relative bg-black rounded-[2rem] overflow-hidden aspect-video mb-8 shadow-2xl">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                style={{ display: isCameraActive ? 'block' : 'none' }}
              />
              {uploadedImage && !isCameraActive && (
                <img src={uploadedImage} alt="스캔" className="w-full h-full object-contain" />
              )}
              {!isCameraActive && !uploadedImage && (
                <div className="absolute inset-0 flex items-center justify-center text-white/50 text-center">
                  <div>
                    <p className="text-5xl mb-2">📷</p>
                    <p className="font-black text-sm">
                      {scanMode === '명세서'
                        ? '거래명세서를 화면에 맞춰 촬영하세요.'
                        : '바코드가 선명하게 보이도록 촬영하세요.'}
                    </p>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>

            <div className="flex gap-3">
              {!isCameraActive ? (
                <button
                  onClick={startCamera}
                  className="flex-1 py-5 bg-gray-100 text-gray-600 rounded-2xl font-black text-sm"
                >
                  📷 카메라 시작
                </button>
              ) : (
                <>
                  <button
                    onClick={capturePhoto}
                    disabled={loading}
                    className="flex-1 py-5 bg-green-600 text-white rounded-2xl font-black text-sm shadow-xl disabled:opacity-50"
                  >
                    {loading ? '인식 중...' : '📸 촬영 및 OCR'}
                  </button>
                  <button
                    onClick={stopCamera}
                    className="px-8 py-5 bg-gray-100 text-gray-400 rounded-2xl font-black text-sm"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          </>
        )}

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
            <h4 className="text-sm font-black text-blue-600 mb-2 uppercase tracking-widest">
              분석 결과 (입고 전 수정 가능)
            </h4>
            {scanMode === '명세서' && scannedItems.length > 0 && (
              <p className="text-[11px] text-gray-500 mb-4">
                인식 결과가 깨져 보이면, <span className="font-black">품목명·수량·단가를 직접 고치거나 불필요한 행은 삭제</span>한 뒤 아래 입고 버튼을 눌러 주세요.
              </p>
            )}
            <div className="space-y-4">
              {scanMode === '명세서' && scannedItems.length > 0 ? (
                <>
                  {/* 명세서 스타일 헤더 */}
                  <div className="hidden md:flex text-[10px] font-black text-gray-400 px-1">
                    <div className="w-20">보험코드</div>
                    <div className="flex-1">품명</div>
                    <div className="w-32">규격</div>
                    <div className="w-14 text-right">수량</div>
                    <div className="w-24 text-right">단가</div>
                    <div className="w-28 text-center">유효기간</div>
                    <div className="w-8" />
                  </div>
                  {scannedItems.map((item: any, i: number) => (
                    <div
                      key={i}
                      className="bg-white p-2 rounded-xl border border-gray-100 text-[11px]"
                    >
                      <div className="flex flex-col md:flex-row gap-2 items-center">
                        <input
                          value={item.insurance_code || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setScannedItems((prev) => {
                              const copy = [...prev];
                              copy[i] = { ...copy[i], insurance_code: v };
                              return copy;
                            });
                          }}
                          className="w-full md:w-20 px-2 py-1.5 rounded-lg border border-gray-200 font-mono text-xs"
                          placeholder="보험코드"
                        />
                        <input
                          value={item.item_name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setScannedItems((prev) => {
                              const copy = [...prev];
                              copy[i] = { ...copy[i], item_name: v };
                              return copy;
                            });
                          }}
                          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 font-bold text-gray-800 text-xs"
                          placeholder="품명"
                        />
                        <input
                          value={item.spec || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setScannedItems((prev) => {
                              const copy = [...prev];
                              copy[i] = { ...copy[i], spec: v };
                              return copy;
                            });
                          }}
                          className="w-full md:w-32 px-2 py-1.5 rounded-lg border border-gray-200 text-xs"
                          placeholder="규격"
                        />
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => {
                            const v = Math.max(0, parseInt(e.target.value || '0', 10));
                            setScannedItems((prev) => {
                              const copy = [...prev];
                              copy[i] = { ...copy[i], qty: v };
                              return copy;
                            });
                          }}
                          className="w-full md:w-14 px-2 py-1.5 rounded-lg border border-gray-200 font-bold text-right text-xs"
                          placeholder="수량"
                        />
                        <input
                          type="number"
                          value={item.unit_price ?? ''}
                          onChange={(e) => {
                            const v = parseInt(e.target.value || '0', 10);
                            setScannedItems((prev) => {
                              const copy = [...prev];
                              copy[i] = { ...copy[i], unit_price: isNaN(v) ? 0 : v };
                              return copy;
                            });
                          }}
                          className="w-full md:w-24 px-2 py-1.5 rounded-lg border border-gray-200 font-bold text-right text-xs"
                          placeholder="단가"
                        />
                        <input
                          type="date"
                          value={item.expiry_date || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setScannedItems((prev) => {
                              const copy = [...prev];
                              copy[i] = { ...copy[i], expiry_date: v };
                              return copy;
                            });
                          }}
                          className="w-full md:w-28 px-2 py-1.5 rounded-lg border border-gray-200 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setScannedItems((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="w-full md:w-8 text-[10px] font-black text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : scanMode === '바코드' ? (
                <div className="flex justify-between items-center bg-white p-4 rounded-xl text-xs font-bold text-gray-700">
                  <span className="text-xs font-black text-gray-800">{scannedData.item_name}</span>
                  <span className="text-xs font-black text-blue-600">{scannedData.qty || 1}개</span>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">인식된 데이터가 없습니다.</p>
              )}
              <button
                onClick={handleConfirmScan}
                disabled={loading}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs shadow-lg mt-4 disabled:opacity-50"
              >
                ✅ 입고 확정하기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
