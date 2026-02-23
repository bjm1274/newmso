'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function InventoryScanModule({ onScanComplete }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState('바코드'); // '바코드' 또는 '명세서'

  // 카메라 시작
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error('카메라 접근 실패:', err);
      alert('카메라 접근 권한이 필요합니다.');
    }
  };

  // 카메라 중지
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      setIsCameraActive(false);
    }
  };

  // 사진 촬영
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setLoading(true);
    try {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);

        // 캔버스를 이미지로 변환
        const imageData = canvasRef.current.toDataURL('image/jpeg');

        // OCR 처리 (실제 구현 시 Tesseract.js 또는 Google Vision API 사용)
        await processImageWithOCR(imageData);
      }
    } catch (err) {
      console.error('사진 촬영 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  // OCR 처리 (시뮬레이션)
  const processImageWithOCR = async (imageData: string) => {
    // 실제 구현: Tesseract.js 또는 Google Vision API 호출
    // 여기서는 시뮬레이션
    
    const mockData = {
      바코드: {
        product_name: '인슐린 주사기',
        barcode: '8801234567890',
        qty: 10,
        unit_price: 5000,
        expiry_date: '2026-12-31',
        lot_number: 'LOT-2025-001'
      },
      명세서: {
        items: [
          { product_name: '수술용 장갑', qty: 100, unit_price: 2000 },
          { product_name: '소독용 알콜', qty: 50, unit_price: 15000 },
          { product_name: '멸균 거즈', qty: 200, unit_price: 1000 }
        ],
        supplier_name: '의료용품 A사',
        invoice_date: new Date().toISOString().split('T')[0]
      }
    };

    const result = mockData[scanMode as keyof typeof mockData];
    setScannedData(result);
    setRecognizedText(JSON.stringify(result, null, 2));
  };

  // 파일 업로드로 스캔 (모바일 미지원 환경용)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageData = event.target?.result as string;
        await processImageWithOCR(imageData);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('파일 업로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  // 스캔 데이터 확인 및 입고 처리
  const handleConfirmScan = async () => {
    if (!scannedData) return alert('스캔 데이터가 없습니다.');

    setLoading(true);
    try {
      if (scanMode === '바코드') {
        // 바코드 스캔: 단일 제품 입고
        const { data: existingProduct } = await supabase
          .from('inventory')
          .select('*')
          .eq('name', scannedData.product_name)
          .single();

        if (existingProduct) {
          // 기존 제품: 수량 증가
          const newStock = existingProduct.stock + scannedData.qty;
          await supabase
            .from('inventory')
            .update({ stock: newStock })
            .eq('id', existingProduct.id);

          // 입고 이력 기록
          await supabase.from('inventory_receipts').insert([{
            item_id: existingProduct.id,
            qty: scannedData.qty,
            unit_price: scannedData.unit_price,
            receipt_type: '스캔',
            lot_number: scannedData.lot_number,
            expiry_date: scannedData.expiry_date
          }]);

          alert(`${scannedData.product_name} ${scannedData.qty}개가 입고되었습니다.`);
        } else {
          alert('등록되지 않은 제품입니다. 물품등록 탭에서 먼저 등록해주세요.');
        }
      } else {
        // 명세서 스캔: 여러 제품 일괄 입고
        for (const item of scannedData.items) {
          const { data: existingProduct } = await supabase
            .from('inventory')
            .select('*')
            .eq('name', item.product_name)
            .single();

          if (existingProduct) {
            const newStock = existingProduct.stock + item.qty;
            await supabase
              .from('inventory')
              .update({ stock: newStock })
              .eq('id', existingProduct.id);

            await supabase.from('inventory_receipts').insert([{
              item_id: existingProduct.id,
              qty: item.qty,
              unit_price: item.unit_price,
              receipt_type: '스캔'
            }]);
          }
        }
        alert(`${scannedData.items.length}개 품목이 입고되었습니다.`);
      }

      // 스캔 완료 콜백
      if (onScanComplete) onScanComplete(scannedData);

      // 초기화
      setScannedData(null);
      setRecognizedText('');
      stopCamera();
    } catch (err) {
      console.error('입고 처리 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--toss-gray-1)]/30 overflow-y-auto custom-scrollbar space-y-6 p-8">
      <header>
        <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tighter italic">스캔 입고</h2>
        <p className="text-xs text-[var(--toss-gray-3)] font-bold uppercase mt-1">바코드 또는 명세서 스캔</p>
      </header>

      {/* 스캔 모드 선택 */}
      <div className="flex gap-2 bg-white p-4 rounded-[12px] border border-[var(--toss-border)] shadow-sm">
        <button
          onClick={() => setScanMode('바코드')}
          className={`flex-1 px-6 py-3 rounded-[16px] text-xs font-semibold transition-all ${
            scanMode === '바코드'
              ? 'bg-[var(--toss-blue)] text-white shadow-lg'
              : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'
          }`}
        >
          📱 바코드 스캔
        </button>
        <button
          onClick={() => setScanMode('명세서')}
          className={`flex-1 px-6 py-3 rounded-[16px] text-xs font-semibold transition-all ${
            scanMode === '명세서'
              ? 'bg-[var(--toss-blue)] text-white shadow-lg'
              : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'
          }`}
        >
          📄 명세서 스캔
        </button>
      </div>

      {/* 카메라 뷰 */}
      <div className="bg-white p-8 border border-[var(--toss-border)] shadow-sm rounded-[12px] space-y-4">
        <div className="relative bg-black rounded-[12px] overflow-hidden aspect-video">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            style={{ display: isCameraActive ? 'block' : 'none' }}
          />
          {!isCameraActive && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-center">
              <div>
                <p className="text-2xl mb-2">📷</p>
                <p className="font-bold">카메라 준비 필요</p>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          {!isCameraActive ? (
            <button
              onClick={startCamera}
              className="flex-1 py-4 bg-[var(--toss-blue)] text-white rounded-[16px] font-semibold text-sm shadow-lg hover:scale-[0.98] transition-all"
            >
              📷 카메라 시작
            </button>
          ) : (
            <>
              <button
                onClick={capturePhoto}
                disabled={loading}
                className="flex-1 py-4 bg-green-600 text-white rounded-[16px] font-semibold text-sm shadow-lg hover:scale-[0.98] transition-all disabled:opacity-50"
              >
                📸 촬영
              </button>
              <button
                onClick={stopCamera}
                className="flex-1 py-4 bg-red-600 text-white rounded-[16px] font-semibold text-sm shadow-lg hover:scale-[0.98] transition-all"
              >
                ✕ 중지
              </button>
            </>
          )}
        </div>

        {/* 파일 업로드 대체 */}
        <div className="border-t pt-4">
          <label className="flex items-center justify-center gap-2 py-4 bg-[var(--toss-gray-1)] rounded-[16px] cursor-pointer hover:bg-[var(--toss-gray-1)] transition-all">
            <span className="text-xs font-semibold text-[var(--toss-gray-4)]">📁 파일 업로드</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* 인식된 데이터 표시 */}
      {scannedData && (
        <div className="bg-white p-8 border border-[var(--toss-border)] shadow-sm rounded-[12px] space-y-4">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">✅ 인식된 데이터</h3>

          {scanMode === '바코드' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">제품명</p>
                  <p className="font-semibold text-[var(--foreground)] mt-1">{scannedData.product_name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">바코드</p>
                  <p className="font-semibold text-[var(--foreground)] mt-1">{scannedData.barcode}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">수량</p>
                  <p className="font-semibold text-[var(--foreground)] mt-1">{scannedData.qty}개</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">단가</p>
                  <p className="font-semibold text-[var(--foreground)] mt-1">₩{scannedData.unit_price.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">유효기간</p>
                  <p className="font-semibold text-[var(--foreground)] mt-1">{scannedData.expiry_date}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">LOT번호</p>
                  <p className="font-semibold text-[var(--foreground)] mt-1">{scannedData.lot_number}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-bold text-[var(--toss-gray-4)]">거래처: {scannedData.supplier_name}</p>
              <p className="text-sm font-bold text-[var(--toss-gray-4)]">송장일: {scannedData.invoice_date}</p>
              <div className="space-y-2">
                {scannedData.items.map((item: any, idx: number) => (
                  <div key={idx} className="p-3 bg-blue-50 rounded-[12px] border border-blue-200">
                    <p className="font-semibold text-[var(--foreground)]">{item.product_name}</p>
                    <p className="text-xs text-[var(--toss-gray-4)] font-bold">
                      {item.qty}개 × ₩{item.unit_price.toLocaleString()} = ₩{(item.qty * item.unit_price).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 추가 정보 입력 여부 */}
          <div className="bg-yellow-50 p-4 rounded-[16px] border border-yellow-200">
            <p className="text-xs font-bold text-yellow-700">
              ⚠️ 스캔된 정보 외에 추가 입력이 필요한 항목이 있으신가요?
            </p>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-[12px] text-xs font-semibold">
                수정하기
              </button>
              <button className="flex-1 px-4 py-2 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-[12px] text-xs font-semibold">
                그대로 진행
              </button>
            </div>
          </div>

          {/* 입고 처리 버튼 */}
          <button
            onClick={handleConfirmScan}
            disabled={loading}
            className="w-full py-4 bg-green-600 text-white rounded-[16px] font-semibold text-sm shadow-lg hover:scale-[0.98] transition-all disabled:opacity-50"
          >
            ✅ 입고 처리
          </button>
        </div>
      )}

      {/* 인식된 텍스트 (디버그) */}
      {recognizedText && (
        <div className="bg-gray-800 p-6 rounded-[12px] border border-gray-700">
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase mb-3">OCR 결과 (Raw)</p>
          <pre className="text-xs text-[var(--toss-gray-3)] font-mono overflow-x-auto whitespace-pre-wrap break-words">
            {recognizedText}
          </pre>
        </div>
      )}
    </div>
  );
}
