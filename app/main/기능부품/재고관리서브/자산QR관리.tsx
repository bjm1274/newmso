'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// Mock Component for QR Asset Manager
export default function QRAssetManager({ user, inventory, fetchInventory }: any) {
    const [scannerActive, setScannerActive] = useState(false);
    const [scanResult, setScanResult] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'대시보드' | '내대여'>('대시보드');

    // Filter only asset-type inventory (e.g. laptops, cards, monitors)
    const assets = inventory.filter((item: any) =>
        item.category === '전자기기' ||
        item.category === '법인카드' ||
        item.category === '사무용품' ||
        item.item_name.includes('노트북') ||
        item.item_name.includes('모니터')
    );

    const mockScan = () => {
        if (assets.length === 0) return alert('등록된 자산(전자기기 등)이 없습니다.');
        const randomAsset = assets[Math.floor(Math.random() * assets.length)];
        setScanResult(randomAsset);
        setScannerActive(false);
    };

    const handleBorrow = async () => {
        if (!scanResult) return;
        try {
            // Mocking the borrow logistics: deduct 1 from stock and log it
            const newStock = (scanResult.quantity ?? scanResult.stock ?? 0) - 1;
            if (newStock < 0) return alert('이미 대여중이거나 재고가 없습니다.');

            await supabase.from('inventory').update({ quantity: newStock, stock: newStock }).eq('id', scanResult.id);
            await supabase.from('inventory_logs').insert([{
                item_id: scanResult.id,
                inventory_id: scanResult.id,
                type: '대여',
                change_type: '자산 대여',
                quantity: 1,
                actor_name: user?.name,
                company: scanResult.company
            }]);

            alert(`[${scanResult.item_name}] 대여 처리가 완료되었습니다.`);
            setScanResult(null);
            fetchInventory();
        } catch (e) {
            console.error(e);
            alert('대여 처리 중 오류가 발생했습니다.');
        }
    };

    const handleReturn = async (item: any) => {
        try {
            const newStock = (item.quantity ?? item.stock ?? 0) + 1;
            await supabase.from('inventory').update({ quantity: newStock, stock: newStock }).eq('id', item.id);
            await supabase.from('inventory_logs').insert([{
                item_id: item.id,
                inventory_id: item.id,
                type: '반납',
                change_type: '자산 반납',
                quantity: 1,
                actor_name: user?.name,
                company: item.company
            }]);

            alert(`[${item.item_name}] 반납 처리가 완료되었습니다.`);
            fetchInventory();
        } catch (e) {
            console.error(e);
            alert('반납 처리 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-end border-b border-[var(--toss-border)] pb-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-[var(--foreground)] tracking-tight">QR 스마트 자산 관리</h2>
                    <p className="text-[11px] md:text-xs text-[var(--toss-gray-3)] font-bold uppercase mt-1">Asset Tracking & Check-out System</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setActiveTab('대시보드')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${activeTab === '대시보드' ? 'bg-[var(--toss-blue)] text-white' : 'bg-slate-100 text-slate-500'}`}>사내 자산 보드</button>
                    <button onClick={() => setActiveTab('내대여')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${activeTab === '내대여' ? 'bg-[var(--toss-blue)] text-white' : 'bg-slate-100 text-slate-500'}`}>내 대여 현황</button>
                </div>
            </div>

            {activeTab === '대시보드' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 border border-slate-200 bg-white rounded-3xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-6">
                        <div className="w-48 h-48 bg-slate-100 rounded-3xl border-2 border-dashed border-slate-300 flex items-center justify-center relative overflow-hidden">
                            {scannerActive ? (
                                <div className="absolute inset-0 bg-black flex flex-col items-center justify-center">
                                    <div className="w-32 h-32 border-2 border-[var(--toss-blue)] relative">
                                        <div className="absolute top-0 w-full h-1 bg-[var(--toss-blue)] shadow-[0_0_10px_#3182f6] animate-[scan_2s_ease-in-out_infinite]"></div>
                                    </div>
                                    <p className="text-white text-[10px] mt-4 font-bold animate-pulse">카메라 로딩 중...</p>
                                    <button onClick={mockScan} className="mt-4 px-3 py-1 bg-slate-800 text-white text-[10px] rounded hover:bg-slate-700">모의 스캔(Mock)</button>
                                </div>
                            ) : (
                                <div className="text-6xl opacity-20">📱</div>
                            )}
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800">기기 QR 스캔</h3>
                            <p className="text-xs font-medium text-slate-400 mt-1">노트북, 법인카드 등에 부착된<br />QR이나 바코드를 스캔하세요.</p>
                        </div>
                        <button
                            onClick={() => setScannerActive(!scannerActive)}
                            className={`w-full py-4 rounded-xl font-bold text-sm transition-all shadow-sm ${scannerActive ? 'bg-slate-100 text-slate-600' : 'bg-[var(--toss-blue)] text-white hover:scale-[1.02]'}`}
                        >
                            {scannerActive ? '스캐너 종료' : '📷 스캐너 실행'}
                        </button>
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        {scanResult ? (
                            <div className="bg-[var(--toss-blue-light)]/30 border border-[var(--toss-blue)]/50 p-6 md:p-8 rounded-3xl shadow-sm animate-in slide-in-from-right relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 text-4xl opacity-10">🔍</div>
                                <span className="px-3 py-1 bg-[var(--toss-blue)] text-white text-[10px] font-black rounded-lg uppercase tracking-widest">스캔 성공</span>
                                <h3 className="text-2xl font-black text-slate-800 mt-4">{scanResult.item_name}</h3>
                                <p className="text-xs font-bold text-slate-500 mt-1">자산 분류: {scanResult.category || '미분류'} | 잔여 재고: {scanResult.quantity ?? scanResult.stock ?? 0}개</p>

                                <div className="mt-8 flex gap-3">
                                    <button onClick={handleBorrow} className="px-6 py-3 bg-[var(--toss-blue)] text-white text-sm font-bold rounded-xl shadow-md hover:scale-105 transition-all">대여하기 (승인 요청)</button>
                                    <button onClick={() => setScanResult(null)} className="px-6 py-3 bg-white border border-slate-200 text-slate-500 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all">취소</button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-500 flex items-center justify-center text-xl mb-4">💻</div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">운영 중인 전자기기</p>
                                    <p className="text-2xl font-black text-slate-800 mt-1">{assets.filter((a: any) => a.category === '전자기기' || a.item_name.includes('노트북')).length}대</p>
                                </div>
                                <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-500 flex items-center justify-center text-xl mb-4">💳</div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">사내 법인카드</p>
                                    <p className="text-2xl font-black text-slate-800 mt-1">{assets.filter((a: any) => a.category === '법인카드').length}장</p>
                                </div>
                            </div>
                        )}

                        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-sm font-black text-slate-800">전체 자산 목록 (QR 생성 대상)</h3>
                            </div>
                            <div className="overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-white/90 backdrop-blur">
                                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <th className="px-6 py-4">분류</th>
                                            <th className="px-6 py-4">자산명</th>
                                            <th className="px-6 py-4">잔여 수량</th>
                                            <th className="px-6 py-4 text-right">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {assets.length === 0 && (
                                            <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400 text-xs font-bold">자산이 없습니다.</td></tr>
                                        )}
                                        {assets.map((item: any) => (
                                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 text-[11px] font-bold text-[var(--toss-blue)]">{item.category}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-800">{item.item_name}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-600">{item.quantity ?? item.stock ?? 0}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <button className="px-3 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded hover:bg-slate-200">QR 출력</button>
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
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden min-h-[400px] flex flex-col">
                    <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[var(--toss-blue)] text-white flex items-center justify-center text-xl font-bold shadow-md">{user?.name?.[0] || 'U'}</div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800">{user?.name} 님의 대여 현황</h3>
                            <p className="text-[11px] font-bold text-slate-500 mt-1">대여 중인 기기는 퇴사 시 반드시 반납해야 합니다.</p>
                        </div>
                    </div>
                    <div className="p-6 flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-6xl mb-4 opacity-30">📦</div>
                            <p className="text-sm font-bold text-slate-500">현재 대여 중인 자산이 없습니다.</p>
                            <button onClick={() => setActiveTab('대시보드')} className="mt-6 px-6 py-3 bg-[var(--toss-blue)] text-white text-xs font-bold rounded-xl shadow-md hover:scale-105 transition-transform">스캐너로 이동</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
