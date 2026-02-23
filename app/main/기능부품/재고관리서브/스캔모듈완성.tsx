'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// 의료기기 QR/바코드 스캔 전용 모듈
// - 명세서 OCR, 카메라 촬영, 이미지 업로드 기능 완전히 제거
// - 바코드/UDI 스캐너가 입력한 문자열을 그대로 받아 재고에 반영

type ScanModuleProps = {
  user: any;
  inventory: any[];
  fetchInventory: () => void;
};

type ScannedItem = {
  id: string;           // inventory id
  item_name: string;
  company: string;
  barcode?: string | null;
  udi_code?: string | null;
  qty: number;
};

export default function ScanModule({ user, inventory, fetchInventory }: ScanModuleProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 스캐너 포커스 유지
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleScanEnter = () => {
    const raw = codeInput.trim();
    if (!raw) return;

    // 하드웨어 바코드/QR 스캐너는 대부분 "코드 + 엔터" 를 한 번에 보내므로
    // 엔터가 눌린 시점에 문자열 전체를 받아 처리한다.
    // 1) 코드 정규화 (공백 제거)
    const code = raw.replace(/\s+/g, '');

    // 2) inventory 에서 barcode 또는 udi_code 로 검색
    //    - QR UDI 처럼 (01)...(17)... 형태 문자열도 고려하여
    //      "완전일치 / 포함 / 역포함" 까지 허용
    const normalize = (v: string | null | undefined) =>
      (v || '').replace(/\s+/g, '');

    const match = inventory.find((it: any) => {
      const b = normalize(it.barcode);
      const u = normalize(it.udi_code);

      const matchBarcode =
        b &&
        (b === code ||
          code.includes(b) ||
          b.includes(code));

      const matchUdi =
        u &&
        (u === code ||
          code.includes(u) ||
          u.includes(code));

      return matchBarcode || matchUdi;
    });

    if (!match) {
      alert(`등록되지 않은 의료기기 코드입니다.\n(${code})`);
      setCodeInput('');
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    setScannedItems(prev => {
      const idx = prev.findIndex(p => p.id === match.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          id: match.id,
          item_name: match.item_name || match.name,
          company: match.company,
          barcode: match.barcode,
          udi_code: match.udi_code,
          qty: 1,
        },
      ];
    });

    setCodeInput('');
    if (inputRef.current) inputRef.current.focus();
  };

  const handleChangeQty = (id: string, delta: number) => {
    setScannedItems(prev =>
      prev
        .map(item =>
          item.id === id ? { ...item, qty: Math.max(1, item.qty + delta) } : item,
        )
        .filter(item => item.qty > 0),
    );
  };

  const handleRemoveItem = (id: string) => {
    setScannedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleConfirmScan = async () => {
    if (!scannedItems.length) {
      alert('입고할 스캔 항목이 없습니다.');
      return;
    }

    if (!confirm(`총 ${scannedItems.length}개 품목의 입고를 확정할까요?`)) return;

    setLoading(true);
    try {
      const actorName = user?.name || '시스템';

      for (const scanned of scannedItems) {
        const current = inventory.find((it: any) => it.id === scanned.id);
        if (!current) continue;

        const prevQty = current.quantity ?? current.stock ?? 0;
        const nextQty = prevQty + scanned.qty;

        // 재고 반영
        await supabase
          .from('inventory')
          .update({ quantity: nextQty, stock: nextQty })
          .eq('id', scanned.id);

        // 이력 기록
        await supabase.from('inventory_logs').insert([
          {
            item_id: scanned.id,
            inventory_id: scanned.id,
            type: '입고',
            change_type: '입고',
            quantity: scanned.qty,
            prev_quantity: prevQty,
            next_quantity: nextQty,
            actor_name: actorName,
            company: current.company,
          },
        ]);
      }

      alert('스캔된 의료기기 입고 처리가 완료되었습니다.');
      setScannedItems([]);
      fetchInventory();
      if (inputRef.current) inputRef.current.focus();
    } catch (err) {
      console.error('스캔 입고 처리 오류:', err);
      alert('입고 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 md:p-10 border border-[var(--toss-border)] shadow-xl rounded-[2.5rem]">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tighter italic">
            의료기기 QR·바코드 스캔 입고
          </h2>
          <p className="text-[11px] text-[var(--toss-blue)] font-bold mt-1 uppercase tracking-widest">
            Handheld Scanner / 카메라 스캐너 입력 전용
          </p>
          <p className="text-[11px] text-[var(--toss-gray-3)] mt-2">
            의료기기 QR코드·바코드를 스캐너로 찍으면 아래 입력창에 자동으로 코드가 들어오고,
            엔터(↵)를 누르면 해당 품목의 입고 수량이 1개씩 증가합니다.
          </p>
        </div>

        {/* 스캐너 입력 영역 */}
        <div className="mb-6 p-4 bg-[var(--toss-gray-1)] rounded-[12px] border border-dashed border-[var(--toss-border)]">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] mb-2 block">
            스캐너 입력창
          </label>
          <input
            ref={inputRef}
            value={codeInput}
            onChange={e => setCodeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleScanEnter();
              }
            }}
            placeholder="의료기기 QR/바코드를 스캔하거나 수동으로 코드를 입력 후 Enter..."
            className="w-full px-4 py-3 rounded-[16px] border border-[var(--toss-border)] bg-white text-sm font-mono tracking-wide focus:ring-2 focus:ring-[var(--toss-blue)]/30 focus:border-blue-400 outline-none"
          />
          <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
            입력창이 항상 선택된 상태여야 스캐너 인식이 정상 동작합니다.
          </p>
        </div>

        {/* 스캔 목록 */}
        <div className="bg-white rounded-[12px] border border-[var(--toss-border)] shadow-inner p-4 md:p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">스캔된 의료기기 목록</h3>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">
              총 {scannedItems.length}개 품목
            </span>
          </div>

          {scannedItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--toss-gray-3)] font-bold">
              아직 스캔된 품목이 없습니다. 스캐너로 의료기기를 찍어주세요.
            </div>
          ) : (
            <div className="space-y-2">
              {scannedItems.map(item => (
                <div
                  key={item.id}
                  className="flex flex-col md:flex-row md:items-center gap-2 bg-[var(--toss-gray-1)] rounded-[16px] px-3 py-2 border border-[var(--toss-border)]"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[var(--toss-blue)]">
                        {item.company}
                      </span>
                      <span className="text-xs font-semibold text-[var(--foreground)]">
                        {item.item_name}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.barcode && (
                        <span className="px-2 py-0.5 rounded-full bg-white text-[11px] font-mono text-[var(--toss-gray-3)] border border-[var(--toss-border)]">
                          BAR: {item.barcode}
                        </span>
                      )}
                      {item.udi_code && (
                        <span className="px-2 py-0.5 rounded-full bg-white text-[11px] font-mono text-purple-500 border border-purple-100">
                          UDI: {item.udi_code}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white rounded-full border border-[var(--toss-border)] px-2">
                      <button
                        type="button"
                        onClick={() => handleChangeQty(item.id, -1)}
                        className="w-7 h-7 flex items-center justify-center text-xs font-semibold text-[var(--toss-gray-3)] hover:text-[var(--foreground)]"
                      >
                        −
                      </button>
                      <span className="w-9 text-center text-xs font-semibold text-[var(--foreground)]">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleChangeQty(item.id, +1)}
                        className="w-7 h-7 flex items-center justify-center text-xs font-semibold text-[var(--toss-gray-3)] hover:text-[var(--foreground)]"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-[11px] font-semibold text-red-500 px-2 py-1 rounded-[12px] hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirmScan}
            disabled={loading || scannedItems.length === 0}
            className="mt-5 w-full py-4 bg-[var(--toss-blue)] text-white rounded-[12px] font-semibold text-sm shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-[var(--toss-blue)]"
          >
            {loading ? '입고 처리 중...' : '✅ 스캔된 의료기기 입고 확정하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

