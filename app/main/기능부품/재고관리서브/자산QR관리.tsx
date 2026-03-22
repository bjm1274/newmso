'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type AnyRecord = Record<string, unknown>;

// Mock Component for QR Asset Manager
export default function QRAssetManager({ user, inventory, fetchInventory }: AnyRecord) {
    const [scannerActive, setScannerActive] = useState(false);
    const [scanResult, setScanResult] = useState<AnyRecord | null>(null);
    const [activeTab, setActiveTab] = useState<'대시보드' | '내대여'>('대시보드');

    // Filter only asset-type inventory (e.g. laptops, cards, monitors)
    const _inventory = (inventory ?? []) as AnyRecord[];
    const assets = _inventory.filter((item: AnyRecord) =>
        item.category === '전자기기' ||
        item.category === '법인카드' ||
        item.category === '사무용품' ||
        String(item.item_name ?? '').includes('노트북') ||
        String(item.item_name ?? '').includes('모니터')
    );

    const _user = (user ?? {}) as AnyRecord;
    const _fetchInventory = fetchInventory as (() => void) | undefined;

    const handleBorrow = async () => {
        if (!scanResult) return;
        try {
            // Mocking the borrow logistics: deduct 1 from stock and log it
            const newStock = (Number(scanResult.quantity ?? scanResult.stock ?? 0)) - 1;
            if (newStock < 0) return toast('이미 대여중이거나 재고가 없습니다.', 'warning');

            await supabase.from('inventory').update({ quantity: newStock, stock: newStock }).eq('id', scanResult.id);
            await supabase.from('inventory_logs').insert([{
                item_id: scanResult.id,
                inventory_id: scanResult.id,
                type: '대여',
                change_type: '자산 대여',
                quantity: 1,
                actor_name: _user.name,
                company: scanResult.company
            }]);

            toast(`[${scanResult.item_name as string}] 대여 처리가 완료되었습니다.`, 'success');
            setScanResult(null);
            _fetchInventory?.();
        } catch (e) {
            console.error(e);
            toast('대여 처리 중 오류가 발생했습니다.', 'error');
        }
    };

    const handleReturn = async (item: AnyRecord) => {
        try {
            const newStock = (Number(item.quantity ?? item.stock ?? 0)) + 1;
            await supabase.from('inventory').update({ quantity: newStock, stock: newStock }).eq('id', item.id);
            await supabase.from('inventory_logs').insert([{
                item_id: item.id,
                inventory_id: item.id,
                type: '반납',
                change_type: '자산 반납',
                quantity: 1,
                actor_name: _user.name,
                company: item.company
            }]);

            toast(`[${item.item_name as string}] 반납 처리가 완료되었습니다.`, 'success');
            _fetchInventory?.();
        } catch (e) {
            console.error(e);
            toast('반납 처리 중 오류가 발생했습니다.', 'error');
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                <div>
                    <h2 className="text-base font-bold text-[var(--foreground)]">QR 스마트 자산 관리</h2>
                </div>
                <div className="flex gap-1 bg-[var(--muted)] rounded-[var(--radius-md)] p-1">
                    <button onClick={() => setActiveTab('대시보드')} className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] transition-colors ${activeTab === '대시보드' ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-3)]'}`}>사내 자산 보드</button>
                    <button onClick={() => setActiveTab('내대여')} className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] transition-colors ${activeTab === '내대여' ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-3)]'}`}>내 대여 현황</button>
                </div>
            </div>

            {activeTab === '대시보드' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-1 border border-[var(--border)] bg-[var(--card)] rounded-[var(--radius-lg)] p-4 shadow-sm flex flex-col items-center justify-center text-center space-y-3">
                        <div className="w-48 h-48 bg-[var(--tab-bg)] rounded-2xl border-2 border-dashed border-[var(--border)] flex items-center justify-center relative overflow-hidden">
                            {scannerActive ? (
                                <div className="absolute inset-0 bg-black flex flex-col items-center justify-center">
                                    <div className="w-32 h-32 border-2 border-[var(--accent)] relative">
                                        <div className="absolute top-0 w-full h-1 bg-[var(--accent)] shadow-[0_0_10px_#3182f6] animate-[scan_2s_ease-in-out_infinite]"></div>
                                    </div>
                                    <p className="text-white text-[10px] mt-4 font-bold animate-pulse">카메라 로딩 중...</p>
                                </div>
                            ) : (
                                <div className="text-6xl opacity-20">📱</div>
                            )}
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-[var(--foreground)]">기기 QR 스캔</h3>
                            <p className="text-xs font-medium text-[var(--toss-gray-3)] mt-1">노트북, 법인카드 등에 부착된<br />QR이나 바코드를 스캔하세요.</p>
                        </div>
                        <button
                            onClick={() => setScannerActive(!scannerActive)}
                            className={`w-full py-2 rounded-[var(--radius-md)] font-bold text-sm transition-all shadow-sm ${scannerActive ? 'bg-[var(--muted)] text-[var(--toss-gray-4)]' : 'bg-[var(--accent)] text-white hover:opacity-90'}`}
                        >
                            {scannerActive ? '스캐너 종료' : '📷 스캐너 실행'}
                        </button>
                    </div>

                    <div className="lg:col-span-2 space-y-3">
                        {scanResult ? (
                            <div className="bg-[var(--toss-blue-light)]/30 border border-[var(--accent)]/50 p-4 rounded-[var(--radius-lg)] shadow-sm animate-in slide-in-from-right relative overflow-hidden">
                                <span className="px-2 py-0.5 bg-[var(--accent)] text-white text-[10px] font-bold rounded-[var(--radius-md)] uppercase tracking-widest">스캔 성공</span>
                                <h3 className="text-base font-bold text-[var(--foreground)] mt-3">{scanResult.item_name as string}</h3>
                                <p className="text-xs font-bold text-[var(--toss-gray-3)] mt-0.5">자산 분류: {(scanResult.category as string) || '미분류'} | 잔여 재고: {Number(scanResult.quantity ?? scanResult.stock ?? 0)}개</p>

                                <div className="mt-3 flex gap-2">
                                    <button onClick={handleBorrow} className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-bold rounded-[var(--radius-md)] shadow-sm hover:opacity-90 transition-all">대여하기</button>
                                    <button onClick={() => setScanResult(null)} className="px-4 py-2 bg-[var(--muted)] border border-[var(--border)] text-[var(--toss-gray-4)] text-sm font-bold rounded-[var(--radius-md)] hover:opacity-90 transition-all">취소</button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-[var(--radius-md)] shadow-sm">
                                    <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest mb-0.5">전자기기</p>
                                    <p className="text-lg font-bold text-[var(--foreground)]">{assets.filter((a: AnyRecord) => a.category === '전자기기' || String(a.item_name ?? '').includes('노트북')).length}대</p>
                                </div>
                                <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-[var(--radius-md)] shadow-sm">
                                    <p className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest mb-0.5">법인카드</p>
                                    <p className="text-lg font-bold text-[var(--foreground)]">{assets.filter((a: AnyRecord) => a.category === '법인카드').length}장</p>
                                </div>
                            </div>
                        )}

                        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
                                <h3 className="text-sm font-bold text-[var(--foreground)]">전체 자산 목록 (QR 생성 대상)</h3>
                            </div>
                            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-[var(--card)]">
                                        <tr className="border-b border-[var(--border)] text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
                                            <th className="px-4 py-2">분류</th>
                                            <th className="px-4 py-2">자산명</th>
                                            <th className="px-4 py-2">잔여 수량</th>
                                            <th className="px-4 py-2 text-right">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {assets.length === 0 && (
                                            <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--toss-gray-3)] text-xs font-bold">자산이 없습니다.</td></tr>
                                        )}
                                        {assets.map((item: AnyRecord) => (
                                            <tr key={item.id as string} className="hover:bg-[var(--muted)]/50 transition-colors">
                                                <td className="px-4 py-2 text-[11px] font-bold text-[var(--accent)]">{item.category as string}</td>
                                                <td className="px-4 py-2 text-xs font-bold text-[var(--foreground)]">{item.item_name as string}</td>
                                                <td className="px-4 py-2 text-xs font-bold text-[var(--toss-gray-4)]">{Number(item.quantity ?? item.stock ?? 0)}</td>
                                                <td className="px-4 py-2 text-right">
                                                    <button className="px-2 py-1 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[10px] font-bold rounded hover:bg-[var(--border)]">QR 출력</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === '내대여' && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden min-h-[300px] flex flex-col">
                    <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/50 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-base font-bold shadow-sm">{String(_user.name ?? 'U')[0]}</div>
                        <div>
                            <h3 className="text-sm font-bold text-[var(--foreground)]">{_user.name as string} 님의 대여 현황</h3>
                            <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mt-0.5">대여 중인 기기는 퇴사 시 반드시 반납해야 합니다.</p>
                        </div>
                    </div>
                    <div className="p-4 flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-4xl mb-3 opacity-30">📦</div>
                            <p className="text-sm font-bold text-[var(--toss-gray-3)]">현재 대여 중인 자산이 없습니다.</p>
                            <button onClick={() => setActiveTab('대시보드')} className="mt-3 px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] shadow-sm hover:opacity-90 transition-all">스캐너로 이동</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
