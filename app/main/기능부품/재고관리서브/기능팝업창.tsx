'use client';
import { toast } from '@/lib/toast';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const PRESET_A = { reg_num: '', sangho: '', ceo: '', addr: '', phone: '', status: '', type: '' };
const PRESET_B = { reg_num: '', sangho: '', ceo: '', addr: '', phone: '', status: '', type: '' };

// [모달 3] 발주서 (기존 유지)
export function POModal({ isOpen, onClose: _onClose, inventory: _inventory }: Record<string, unknown>) {
  const onClose = _onClose as ((e?: React.SyntheticEvent) => void);
  const inventory = (_inventory ?? []) as Record<string, unknown>[];
  /* 기존 코드와 동일 */
  if (!isOpen) return null;
  const lowStockItems = inventory.filter((i: Record<string, unknown>) => (i.quantity as number) < ((i.safety_stock as number) * 0.2));
  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-5" onClick={onClose}>
      <div className="bg-[var(--card)] w-full max-w-2xl rounded-2xl p-5 shadow-sm overflow-y-auto max-h-full" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-4"><h1 className="text-3xl font-semibold text-black">발 주 서</h1><div className="text-right"><p className="text-sm font-bold">발행일: {new Date().toISOString().split('T')[0]}</p><p className="text-sm font-bold">발신: {new Date().toLocaleDateString('ko-KR')}</p></div></div>
        {lowStockItems.length > 0 ? (
          <table className="w-full text-sm border-collapse border border-black mb-5">
            <thead><tr className="bg-[var(--muted)]"><th className="border p-2">품목</th><th className="border p-2">현재고</th><th className="border p-2">최소유지</th><th className="border p-2">권장량</th><th className="border p-2">공급사</th></tr></thead>
            <tbody>{lowStockItems.map((item: any, idx: number) => (<tr key={idx} className="text-center"><td className="border p-2 text-left">{item.name}</td><td className="border p-2 font-bold text-red-600">{item.quantity}</td><td className="border p-2">{item.safety_stock}</td><td className="border p-2 font-bold">{item.safety_stock - item.quantity}</td><td className="border p-2">{item.supplier}</td></tr>))}</tbody>
          </table>
        ) : <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold">부족한 품목이 없습니다.</div>}
        <div className="flex justify-end gap-2 print:hidden"><button onClick={() => window.print()} className="px-4 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-bold">🖨️ 인쇄</button><button onClick={onClose} className="px-4 py-3 bg-[var(--toss-gray-2)] rounded-[var(--radius-md)] font-bold">닫기</button></div>
      </div>
    </div>
  );
}

// [모달 4] 거래명세서 (자동완성 기능 탑재!)
export function BillModal({ isOpen, onClose: _onClose, inventory: _inventory }: Record<string, unknown>) {
  const onClose = _onClose as ((e?: React.SyntheticEvent) => void);
  const inventory = (_inventory ?? []) as Record<string, unknown>[];
  const [billData, setBillData] = useState({ date: '', supplier: { ...PRESET_B }, receiver: { ...PRESET_A }, items: [] as any[] });
  const [customPresets, setCustomPresets] = useState<any[]>([]);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [newPartner, setNewPartner] = useState({ alias: '', reg_num: '', sangho: '', ceo: '', addr: '', phone: '' });

  // [NEW] 자동완성 관련 상태
  const [focusedRow, setFocusedRow] = useState<number | null>(null);

  useEffect(() => { const saved = localStorage.getItem('my_partners'); if (saved) setCustomPresets(JSON.parse(saved)); }, []);

  // 업체 등록 로직
  const handleSavePartner = () => {
    if (!newPartner.alias || !newPartner.sangho) return toast("별칭과 상호는 필수입니다.");
    const updated = [...customPresets, newPartner]; setCustomPresets(updated); localStorage.setItem('my_partners', JSON.stringify(updated));
    toast("등록되었습니다.", 'success'); setIsRegisterMode(false); setNewPartner({ alias: '', reg_num: '', sangho: '', ceo: '', addr: '', phone: '' });
  };
  const applyPreset = (role: string, data: any) => setBillData(prev => ({ ...prev, [role]: { ...data } }));
  const addRow = () => setBillData(prev => ({ ...prev, items: [...prev.items, { name: '', qty: 0, price: 0, supply_price: 0, tax: 0 }] }));

  // [NEW] 품목 선택 시 자동 입력 핸들러
  const selectItem = (index: number, item: any) => {
    const newItems = [...billData.items];
    // 선택된 품목 정보로 업데이트 (단가 포함)
    newItems[index] = {
      ...newItems[index],
      name: item.name,
      spec: item.spec || '', // 규격 자동입력
      price: item.price || 0, // 단가 자동입력
      qty: newItems[index].qty || 1 // 수량 기본 1
    };
    // 금액 재계산
    newItems[index].supply_price = newItems[index].qty * newItems[index].price;
    newItems[index].tax = Math.floor(newItems[index].supply_price * 0.1);

    setBillData({ ...billData, items: newItems });
    setFocusedRow(null); // 검색창 닫기
  };

  if (!isOpen) return null;
  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { onClose(); setFocusedRow(null); }}>
      <div className="bg-[var(--card)] w-full max-w-4xl rounded-2xl p-5 shadow-sm overflow-y-auto max-h-full relative" onClick={e => e.stopPropagation()}>

        {/* 업체 등록 오버레이 (기존 유지) */}
        {isRegisterMode && (
          <div className="absolute inset-0 bg-[var(--card)]/95 z-50 flex flex-col items-center justify-center p-5 backdrop-blur-md rounded-2xl">
            <div className="w-full max-w-md space-y-4">
              <h2 className="text-2xl font-semibold text-[var(--foreground)] border-b pb-4 mb-4">🏢 신규 업체 등록</h2>
              <div><label className="text-xs font-bold text-[var(--accent)] ml-1">별칭</label><input className="w-full p-3 bg-blue-500/10 border border-blue-100 rounded-[var(--radius-lg)] font-bold" placeholder="예: 거래처A" value={newPartner.alias} onChange={e => setNewPartner({ ...newPartner, alias: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">등록번호</label><input className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-lg)] text-sm" value={newPartner.reg_num} onChange={e => setNewPartner({ ...newPartner, reg_num: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">상호</label><input className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-lg)] text-sm" value={newPartner.sangho} onChange={e => setNewPartner({ ...newPartner, sangho: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">대표자</label><input className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-lg)] text-sm" value={newPartner.ceo} onChange={e => setNewPartner({ ...newPartner, ceo: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">전화번호</label><input className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-lg)] text-sm" value={newPartner.phone} onChange={e => setNewPartner({ ...newPartner, phone: e.target.value })} /></div>
              </div>
              <div><label className="text-xs font-bold text-[var(--toss-gray-3)] ml-1">주소</label><input className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-lg)] text-sm" value={newPartner.addr} onChange={e => setNewPartner({ ...newPartner, addr: e.target.value })} /></div>
              <div className="flex gap-2 mt-4 pt-4 border-t"><button onClick={() => setIsRegisterMode(false)} className="flex-1 py-4 bg-[var(--toss-gray-2)] text-[var(--toss-gray-4)] rounded-[var(--radius-lg)] font-bold">취소</button><button onClick={handleSavePartner} className="flex-1 py-4 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] font-bold shadow-sm">저장하기</button></div>
            </div>
          </div>
        )}

        {/* 거래명세서 본문 */}
        <div className="text-center mb-4 relative">
          <h1 className="text-3xl font-serif font-bold underline decoration-double">거 래 명 세 서</h1>
          <div className="absolute top-0 right-0 flex gap-2 no-print">
            <button onClick={() => setIsRegisterMode(true)} className="bg-orange-500/100 text-white px-3 py-2 rounded font-bold text-xs hover:bg-orange-600">+ 업체등록</button>
            <button onClick={() => window.print()} className="bg-[var(--accent)] text-white px-4 py-2 rounded font-bold text-sm">인쇄</button>
            <button onClick={onClose} className="bg-[var(--toss-gray-2)] text-[var(--foreground)] px-4 py-2 rounded font-bold text-sm">닫기</button>
          </div>
        </div>

        {/* 공급자/공급받는자 (기존 코드 유지) */}
        <div className="grid grid-cols-2 gap-0 border-2 border-red-500 mb-4">
          {['supplier', 'receiver'].map((role) => (
            <div key={role} className={`p-2 relative group ${role === 'supplier' ? 'border-r-2 border-red-500' : ''}`}>
              <div className="absolute top-2 right-2 flex flex-wrap gap-1 opacity-20 group-hover:opacity-100 transition-opacity no-print max-w-[200px] justify-end z-10">
                <button onClick={() => applyPreset(role, PRESET_A)} className="bg-[var(--muted)] text-[11px] px-2 py-1 border rounded hover:bg-[var(--toss-blue-light)]">본원</button>
                <button onClick={() => applyPreset(role, PRESET_B)} className="bg-[var(--muted)] text-[11px] px-2 py-1 border rounded hover:bg-[var(--toss-blue-light)]">기본</button>
                {customPresets.map((cp, idx) => (<button key={idx} onClick={() => applyPreset(role, cp)} className="bg-yellow-500/10 text-orange-700 text-[11px] px-2 py-1 border border-yellow-500/20 rounded hover:bg-yellow-500/20">{cp.alias}</button>))}
              </div>
              <div className="text-center text-red-500 font-bold mb-2">[{role === 'supplier' ? '공급자' : '공급받는자'}]</div>
              <div className="grid grid-cols-[60px_1fr] gap-1 text-sm">
                <div className="font-bold text-center border p-1 bg-red-500/10">등록번호</div><input className="border p-1 w-full" value={(billData as any)[role].reg_num || ''} onChange={e => setBillData({ ...billData, [role]: { ...(billData as any)[role], reg_num: e.target.value } })} />
                <div className="font-bold text-center border p-1 bg-red-500/10">상호</div><input className="border p-1 w-full" value={(billData as any)[role].sangho || ''} onChange={e => setBillData({ ...billData, [role]: { ...(billData as any)[role], sangho: e.target.value } })} />
                <div className="font-bold text-center border p-1 bg-red-500/10">대표자</div><input className="border p-1 w-full" value={(billData as any)[role].ceo || ''} onChange={e => setBillData({ ...billData, [role]: { ...(billData as any)[role], ceo: e.target.value } })} />
                <div className="font-bold text-center border p-1 bg-red-500/10">주소</div><input className="border p-1 w-full" value={(billData as any)[role].addr || ''} onChange={e => setBillData({ ...billData, [role]: { ...(billData as any)[role], addr: e.target.value } })} />
                <div className="font-bold text-center border p-1 bg-red-500/10">전화번호</div><input className="border p-1 w-full" value={(billData as any)[role].phone || ''} onChange={e => setBillData({ ...billData, [role]: { ...(billData as any)[role], phone: e.target.value } })} />
              </div>
            </div>
          ))}
        </div>

        {/* [핵심] 품목 테이블 (자동완성 적용) */}
        <table className="w-full border-collapse border border-black text-sm mb-4">
          <thead><tr className="bg-[var(--muted)] text-center"><th className="border p-1">품목</th><th className="border p-1 w-24">규격</th><th className="border p-1 w-16">수량</th><th className="border p-1 w-24">단가</th><th className="border p-1 w-24">공급가액</th><th className="border p-1 w-20">세액</th></tr></thead>
          <tbody>
            {[...Array(Math.max(5, billData.items.length))].map((_, i) => {
              const item = billData.items[i] || { name: '', spec: '', qty: 0, price: 0, supply_price: 0, tax: 0 };

              // [자동완성] 검색어 매칭 (현재 입력된 이름이 있고, DB에 매칭되는 게 있을 때)
              const suggestions = (focusedRow === i && item.name)
                ? inventory.filter((inv: any) => inv.name.toLowerCase().includes(item.name.toLowerCase()))
                : [];

              const update = (f: string, v: any) => {
                const n = [...billData.items]; if (!n[i]) for (let k = 0; k <= i; k++) if (!n[k]) n[k] = { name: '', spec: '', qty: 0, price: 0 }; n[i] = { ...n[i], [f]: v };
                if (f === 'qty' || f === 'price') { n[i].supply_price = (Number(n[i].qty) || 0) * (Number(n[i].price) || 0); n[i].tax = Math.floor(n[i].supply_price * 0.1); }
                setBillData({ ...billData, items: n });
              };

              return (
                <tr key={i} className="text-center h-8 relative">
                  {/* 품목명 입력 (자동완성 트리거) */}
                  <td className="border p-0 relative">
                    <input className="w-full h-full text-center px-1 outline-none"
                      value={item.name}
                      onFocus={() => setFocusedRow(i)}
                      onChange={e => update('name', e.target.value)}
                      placeholder="품목 검색"
                    />
                    {/* 자동완성 드롭다운 */}
                    {suggestions.length > 0 && (
                      <div className="absolute top-full left-0 w-full bg-[var(--card)] border border-[var(--border)] shadow-sm z-20 max-h-40 overflow-y-auto text-left">
                        {suggestions.map((s: Record<string, unknown>) => (
                          <div key={s.id as string} onClick={() => selectItem(i, s)}
                            className="p-2 hover:bg-blue-500/10 cursor-pointer border-b border-[var(--border)] last:border-0">
                            <div className="font-bold text-xs">{s.name as string}</div>
                            <div className="text-[11px] text-[var(--toss-gray-3)]">{s.spec as string} | ₩{(s.price as number)?.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="border p-0"><input className="w-full h-full text-center outline-none" value={item.spec || ''} onChange={e => update('spec', e.target.value)} /></td>
                  <td className="border p-0"><input type="number" className="w-full h-full text-center outline-none" value={item.qty || ''} onChange={e => update('qty', e.target.value)} /></td>
                  <td className="border p-0"><input type="number" className="w-full h-full text-right px-1 outline-none" value={item.price || ''} onChange={e => update('price', e.target.value)} /></td>
                  <td className="border p-0 bg-[var(--muted)] text-right px-1">{item.supply_price?.toLocaleString()}</td>
                  <td className="border p-0 bg-[var(--muted)] text-right px-1">{item.tax?.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr className="bg-[var(--muted)] font-bold"><td colSpan={4} className="border p-1 text-center">합 계</td><td colSpan={2} className="border p-1 text-right pr-2">₩ {billData.items.reduce((s, i) => s + (i.supply_price || 0) + (i.tax || 0), 0).toLocaleString()}</td></tr></tfoot>
        </table>
        <div className="text-center no-print"><button onClick={addRow} className="text-xs text-blue-500 font-bold p-2 hover:bg-blue-500/10 rounded">+ 품목 줄 추가</button></div>
      </div>
    </div>
  );
}

// [모달 5] 카메라/스캔 (기존 유지)
export function ScanModals({ isOpen, onClose: _onClose, onComplete: _onComplete, mode, inventory }: Record<string, unknown>) {
  const onClose = _onClose as ((e?: React.SyntheticEvent) => void);
  const onComplete = _onComplete as (items: unknown[]) => void;
  /* 이전 코드와 동일 (생략 없음) */
  const [isScanning, setIsScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  useEffect(() => { if (isOpen && mode === 'camera') { const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); if (!isMobile) { toast("📷 카메라는 모바일 기기(핸드폰)에서만 사용 가능합니다."); onClose(); } } }, [isOpen, mode, onClose]);
  const handleCapture = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      toast('AI 분석(OCR) 서비스 준비 중입니다. 현재는 수동 입력 기능을 이용해 주세요.', 'warning');
    }, 1500);
  };
  const confirm = async () => { onComplete(scannedItems); setScannedItems([]); };
  const updateItem = (idx: number, field: string, val: any) => { const n = [...scannedItems]; n[idx] = { ...n[idx], [field]: val }; setScannedItems(n); };
  if (!isOpen) return null;
  return (
    <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-[var(--card)] rounded-2xl overflow-hidden p-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">{mode === 'camera' ? '📷 카메라 촬영 (OCR)' : '📄 파일 등록 (사진/PDF/엑셀)'}</h3>
        {scannedItems.length === 0 ? (
          <div className="aspect-video bg-[var(--muted)] rounded-[var(--radius-lg)] flex items-center justify-center mb-4 relative">
            {isScanning ? <span className="animate-pulse font-bold text-blue-500">AI 분석 중...</span> :
              (mode === 'camera' ? <button onClick={handleCapture} className="bg-gray-800 text-white px-4 py-3 rounded-[var(--radius-lg)] font-bold">촬영하기</button> : <label className="bg-gray-800 text-white px-4 py-3 rounded-[var(--radius-lg)] font-bold cursor-pointer">파일 선택<input type="file" className="hidden" accept="image/*, application/pdf, .xls, .xlsx" onChange={handleCapture} /></label>)}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-3 mb-4 custom-scrollbar">
            {scannedItems.map((item, idx) => (<div key={idx} className="border p-4 rounded-[var(--radius-lg)] bg-[var(--muted)]"><p className="font-bold text-lg">{item.name}</p><div className="grid grid-cols-2 gap-2 mt-2"><div><label className="text-xs text-[var(--toss-gray-3)]">LOT</label><input className="w-full p-2 text-sm bg-[var(--card)] border rounded" value={item.detected_lot} onChange={e => updateItem(idx, 'detected_lot', e.target.value)} /></div><div><label className="text-xs text-[var(--toss-gray-3)]">유효기간</label><input type="text" placeholder="0000-00-00" className="w-full p-2 text-sm bg-[var(--card)] border rounded" value={item.detected_exp} onChange={e => updateItem(idx, 'detected_exp', e.target.value)} /></div><div className="col-span-2"><label className="text-xs text-[var(--toss-gray-3)]">입고수량</label><input type="number" className="w-full p-2 text-sm bg-[var(--card)] border rounded font-bold text-[var(--accent)]" value={item.scan_qty} onChange={e => updateItem(idx, 'scan_qty', Number(e.target.value))} /></div></div></div>))}
          </div>
        )}
        {scannedItems.length > 0 && <button onClick={confirm} className="w-full py-4 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] font-bold shadow-sm">입고 정보 저장</button>}
      </div>
    </div>
  );
}

// [모달 6] UDI 보고 (기존 유지)
export function UDIModal({ isOpen, onClose: _onClose, inventory: _inventory, user: _rawUser, onRefresh: _onRefresh }: Record<string, unknown>) {
  const onClose = _onClose as () => void;
  const onRefresh = _onRefresh as () => void;
  const inventory = (_inventory ?? []) as Record<string, unknown>[];
  const user = (_rawUser ?? {}) as Record<string, unknown>;
  /* 기존과 동일, 생략 없이 유지 */
  const [udiItems, setUdiItems] = useState<any[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { const f = inventory.find((i: Record<string, unknown>) => i.barcode === barcodeInput); if (f) setUdiItems(p => [{ ...f, report_qty: 1, lot_number: '', expiration_date: '' }, ...p]); setBarcodeInput(''); } };
  const submit = async () => { if (!confirm("전송하시겠습니까?")) return; await supabase.from('inventory_logs').insert(udiItems.map(i => ({ item_id: i.id, type: '출고', amount: i.report_qty, worker_id: user.id, lot_number: i.lot_number, expiration_date: i.expiration_date }))); toast("완료", 'success'); setUdiItems([]); onRefresh(); onClose(); };
  if (!isOpen) return null;
  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--card)] w-full max-w-4xl rounded-[var(--radius-lg)] p-5 shadow-sm h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b pb-4"><h2 className="text-2xl font-semibold text-purple-700">📡 공급내역보고</h2><p className="font-bold">대상: {udiItems.length}건</p></div>
        <div className="bg-[var(--muted)] p-4 rounded-[var(--radius-lg)] mt-4 flex gap-4 items-center"><span className="text-2xl">🔫</span><input ref={inputRef} value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} onKeyDown={handleScan} className="flex-1 p-3 rounded-[var(--radius-lg)] font-bold" placeholder="바코드 스캔..." autoFocus /></div>
        <div className="flex-1 overflow-y-auto mt-4 border rounded-[var(--radius-md)] p-4">{udiItems.map((item, i) => <div key={i} className="border-b p-2 flex justify-between"><span>{item.name}</span><span className="text-[var(--accent)]">{item.lot_number}</span><span className="font-bold">{item.report_qty}</span></div>)}</div>
        <div className="mt-4 pt-4 border-t flex justify-end gap-3"><button onClick={submit} className="px-5 py-4 bg-purple-600 text-white rounded-[var(--radius-md)] font-bold shadow-sm">NIDS 전송</button></div>
      </div>
    </div>
  );
}