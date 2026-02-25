'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ExpenseReportForm({ setExtraData, setFormTitle }: any) {
    const [items, setItems] = useState([{ date: '', category: '식대', amount: 0, remarks: '' }]);
    const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const categories = ['식대', '교통비', '소모품비', '도서/교육비', '접대비', '기타'];

    useEffect(() => {
        const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        setExtraData({ expense_items: items, receipt_url: receiptUrl, total_amount: totalAmount });
        if (totalAmount > 0) {
            setFormTitle(`지출결의서 - 총 ₩${totalAmount.toLocaleString()}원 청구의 건`);
        } else {
            setFormTitle('');
        }
    }, [items, receiptUrl]);

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, { date: '', category: '식대', amount: 0, remarks: '' }]);
    };

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        setItems(items.filter((_, i) => i !== index));
    };

    const uploadReceipt = async (event: any) => {
        try {
            setUploading(true);
            if (!event.target.files || event.target.files.length === 0) return;

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `receipt_${Date.now()}.${fileExt}`;
            const filePath = `expenses/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profiles') // 재사용: 또는 'documents' 버킷
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
            setReceiptUrl(data.publicUrl);
            alert('영수증 업로드가 완료되었습니다.');
        } catch (e: any) {
            alert('영수증 업로드 실패. 버킷을 확인해주세요.\n(테스트 환경에서는 이미지 URL을 수동으로 넣을 수도 있습니다.)');
            // Fallback for demo
            setReceiptUrl('https://via.placeholder.com/400x600.png?text=Receipt+Demo');
        } finally {
            setUploading(false);
        }
    };

    const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return (
        <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-6">
                {/* 영수증 캡쳐본 첨부 영역 */}
                <div className="w-full md:w-1/3 flex flex-col gap-3">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">영수증 첨부 (선택)</p>
                    <div className="flex-1 min-h-[160px] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden bg-white group hover:border-primary/30 transition-colors">
                        {receiptUrl ? (
                            <>
                                <img src={receiptUrl} alt="Receipt" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <label className="px-4 py-2 bg-white text-slate-800 text-xs font-bold rounded-lg cursor-pointer">
                                        변경하기
                                        <input type="file" className="hidden" accept="image/*" onChange={uploadReceipt} />
                                    </label>
                                </div>
                            </>
                        ) : (
                            <label className="flex flex-col items-center justify-center cursor-pointer w-full h-full p-4 text-center">
                                <span className="text-3xl mb-2 opacity-50">🧾</span>
                                <span className="text-[11px] font-bold text-slate-500">클릭하여 영수증 업로드</span>
                                <span className="text-[9px] text-slate-400 mt-1">(JPG, PNG 등 이미지)</span>
                                {uploading && <span className="text-[10px] font-bold text-primary mt-2">Uploading...</span>}
                                <input type="file" className="hidden" accept="image/*" onChange={uploadReceipt} disabled={uploading} />
                            </label>
                        )}
                    </div>
                </div>

                {/* 지출 내역 입력 영역 */}
                <div className="w-full md:w-2/3 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">지출 상세 내역</p>
                        <button type="button" onClick={addItem} className="text-[10px] font-black text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors">
                            + 항목 추가
                        </button>
                    </div>

                    <div className="space-y-3">
                        {items.map((item, idx) => (
                            <div key={idx} className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-100">
                                <input
                                    type="date"
                                    value={item.date}
                                    onChange={e => handleItemChange(idx, 'date', e.target.value)}
                                    className="p-2 bg-slate-50 rounded-lg text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-primary/20 w-full md:w-[130px]"
                                />
                                <select
                                    value={item.category}
                                    onChange={e => handleItemChange(idx, 'category', e.target.value)}
                                    className="p-2 bg-slate-50 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 border-r-[8px] border-transparent"
                                >
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input
                                    type="text"
                                    placeholder="적요 (사용 내역)"
                                    value={item.remarks}
                                    onChange={e => handleItemChange(idx, 'remarks', e.target.value)}
                                    className="flex-1 p-2 bg-slate-50 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 min-w-[100px]"
                                />
                                <input
                                    type="number"
                                    placeholder="금액(원)"
                                    value={item.amount || ''}
                                    onChange={e => handleItemChange(idx, 'amount', e.target.value)}
                                    className="p-2 bg-slate-50 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 w-full md:w-[120px] text-right font-mono"
                                />
                                <button type="button" onClick={() => removeItem(idx)} className="p-2 text-slate-300 hover:text-danger rounded-lg transition-colors">
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 p-4 bg-primary/5 rounded-xl flex justify-between items-center border border-primary/10">
                        <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">총 청구 금액</span>
                        <span className="text-lg font-black text-primary font-mono tracking-tighter">₩ {total.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
