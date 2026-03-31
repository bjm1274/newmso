import { toast } from '@/lib/toast';
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import SmartDatePicker from '../공통/SmartDatePicker';

export default function InvoiceAutoExtraction({ onRefresh, user }: Record<string, unknown>) {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [extractedItems, setExtractedItems] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0];
            setFile(selected);
            // Create preview if image
            if (selected.type.startsWith('image/')) {
                setPreviewUrl(URL.createObjectURL(selected));
            } else {
                setPreviewUrl(null);
            }
            setExtractedItems([]);
        }
    };

    const clearFile = () => {
        setFile(null);
        setPreviewUrl(null);
        setExtractedItems([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExtract = async () => {
        if (!file) {
            toast('추출할 명세서/PDF 파일을 먼저 선택해주세요.', 'warning');
            return;
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/extract-invoice', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || '추출 요청 중 서버 오류가 발생했습니다.');
            }

            if (data.success && data.data && Array.isArray(data.data)) {
                // 배열을 순회하며 초기 편집 상태값 부여
                const defaultItems = data.data.map((item: any) => ({
                    ...item,
                    edited: false,
                    is_udi: false,
                }));
                setExtractedItems(defaultItems);
                toast('추출이 완료되었습니다. 내용을 확인 후 등록해주세요.', 'success');
            } else {
                toast('추출된 데이터 형식이 올바르지 않습니다.', 'warning');
            }
        } catch (error: unknown) {
            console.error(error);
            toast(((error as Error)?.message ?? String(error)) || '추출에 실패했습니다. API 키 설정 등을 확인해보세요.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const nextList = [...extractedItems];
        nextList[index] = { ...nextList[index], [field]: value, edited: true };
        setExtractedItems(nextList);
    };

    const handleDeleteItem = (index: number) => {
        setExtractedItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleRegisterAll = async () => {
        if (extractedItems.length === 0) return;
        if (!confirm(`총 ${extractedItems.length}개의 품목을 재고 자산으로 일괄 등록하시겠습니까?`)) return;

        setIsLoading(true);
        let successCount = 0;

        try {
            const payloads = extractedItems.map(item => ({
                item_name: item.item_name || '미상',
                category: item.category || '소모품',
                stock: parseInt(item.quantity) || 0,
                min_quantity: 0,
                unit_price: parseInt(item.unit_price) || 0,
                supplier_name: item.supplier_name || '',
                expiry_date: item.expiry_date || null,
                lot_number: item.lot_number || null,
                is_udi: !!item.is_udi,
                company: (user as Record<string, unknown>)?.['company'] as string || '전체',
                department: (user as Record<string, unknown>)?.['department'] as string || '',
            }));

            const { error } = await withMissingColumnsFallback(
                (omittedColumns) =>
                    supabase.from('inventory').insert(
                        payloads.map((payload: Record<string, any>) => {
                            if (!omittedColumns.has('department')) {
                                return payload;
                            }

                            const { department, ...legacyPayload } = payload;
                            return legacyPayload;
                        }),
                    ),
                ['department'],
            );
            if (error) throw error;

            successCount = payloads.length;
            toast(`${successCount}개의 품목이 성공적으로 입고(등록)되었습니다.`, 'success');
            clearFile();
            if (onRefresh) (onRefresh as () => void)();
        } catch (err: unknown) {
            console.error('일괄 등록 에러:', err);
            toast('일부 품목 파싱 중 오류가 발생했거나, DB 등록에 실패했습니다.\n\n' + ((err as Error)?.message ?? String(err)), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-[var(--card)] p-4 md:p-5 border border-[var(--border)] shadow-sm rounded-2xl animate-in fade-in duration-500">
            <div className="mb-4">
                <h3 className="text-xl font-bold text-[var(--foreground)] tracking-tight">📄 명세서 추출 자동 입고</h3>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-1/3 space-y-4 shrink-0">
                    <div
                        className="border-2 border-dashed border-[var(--border)] rounded-[var(--radius-xl)] p-4 text-center hover:bg-[var(--muted)] transition-colors cursor-pointer group"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                        />
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <span className="text-4xl group-hover:scale-110 transition-transform">📤</span>
                            <p className="text-sm font-bold text-[var(--accent)]">파일 선택 (클릭)</p>
                            <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">JPG, PNG, PDF</p>
                        </div>
                    </div>

                    {file && (
                        <div className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex flex-col items-center gap-3">
                            {previewUrl ? (
                                <img src={previewUrl} alt="preview" className="max-h-48 rounded-[var(--radius-md)] object-contain" />
                            ) : (
                                <div className="w-20 h-24 bg-[var(--card)] rounded-[var(--radius-md)] flex items-center justify-center shadow-sm">
                                    <span className="text-2xl">📄</span>
                                </div>
                            )}
                            <div className="text-center w-full">
                                <p className="text-xs font-bold text-[var(--foreground)] truncate">{file.name}</p>
                                <p className="text-[10px] text-[var(--toss-gray-3)] font-semibold mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                            <div className="flex gap-2 w-full mt-2">
                                <button onClick={clearFile} className="flex-1 py-2 rounded-xl bg-[var(--page-bg)] border border-[var(--border)] text-xs font-bold text-[var(--toss-gray-4)] hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-colors">지우기</button>
                                <button
                                    onClick={handleExtract}
                                    disabled={isLoading}
                                    className="flex-1 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    {isLoading ? '추출 중...' : '데이터 추출'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1">
                    {extractedItems.length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    총 {extractedItems.length}개의 품목 추출 완료
                                </h4>
                                <button
                                    onClick={handleRegisterAll}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-[var(--radius-md)] text-[11px] font-bold shadow hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    위 내역으로 일괄 등록
                                </button>
                            </div>

                            <div className="max-h-[500px] overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                {extractedItems.map((item, idx) => (
                                    <div key={idx} className={`bg-[var(--page-bg)] border ${item.edited ? 'border-[var(--accent)]' : 'border-[var(--border)]'} rounded-[var(--radius-lg)] p-4 relative group transition-all`}>
                                        <button
                                            onClick={() => handleDeleteItem(idx)}
                                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--muted)] text-[var(--toss-gray-4)] flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-500"
                                        >
                                            ×
                                        </button>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="col-span-2">
                                                <label className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">품목명 / 제품명 *</label>
                                                <input value={item.item_name || ''} onChange={(e) => handleItemChange(idx, 'item_name', e.target.value)} className="w-full mt-1 p-2 bg-[var(--input-bg)] rounded-[var(--radius-md)] text-xs font-bold outline-none border border-transparent focus:border-[var(--accent)]/50" />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">분류 *</label>
                                                <select value={item.category || ''} onChange={(e) => handleItemChange(idx, 'category', e.target.value)} className="w-full mt-1 p-2 bg-[var(--input-bg)] rounded-[var(--radius-md)] text-xs font-bold outline-none border border-transparent focus:border-[var(--accent)]/50">
                                                    <option value="의료기기">의료기기</option>
                                                    <option value="소모품">소모품</option>
                                                    <option value="약품">약품</option>
                                                    <option value="사무용품">사무용품</option>
                                                </select>
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">수량 *</label>
                                                <input type="number" value={item.quantity || 0} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} className="w-full mt-1 p-2 bg-[var(--input-bg)] rounded-[var(--radius-md)] text-xs font-bold outline-none border border-transparent focus:border-[var(--accent)]/50 text-right" />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">단가 (원)</label>
                                                <input type="number" value={item.unit_price || 0} onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)} className="w-full mt-1 p-2 bg-[var(--input-bg)] rounded-[var(--radius-md)] text-xs font-bold outline-none border border-transparent focus:border-[var(--accent)]/50 text-right" />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">거래처명</label>
                                                <input value={item.supplier_name || ''} onChange={(e) => handleItemChange(idx, 'supplier_name', e.target.value)} className="w-full mt-1 p-2 bg-[var(--input-bg)] rounded-[var(--radius-md)] text-xs font-bold outline-none border border-transparent focus:border-[var(--accent)]/50" />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">유효/만료일</label>
                                                <SmartDatePicker value={item.expiry_date || ''} onChange={val => handleItemChange(idx, 'expiry_date', val)} placeholder="0000-00-00" />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase">LOT 번호</label>
                                                <input value={item.lot_number || ''} onChange={(e) => handleItemChange(idx, 'lot_number', e.target.value)} className="w-full mt-1 p-2 bg-[var(--input-bg)] rounded-[var(--radius-md)] text-[11px] font-bold outline-none border border-transparent focus:border-[var(--accent)]/50" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-5 border-2 border-[var(--border)] border-dashed rounded-[var(--radius-xl)] bg-[var(--muted)]/50">
                            <span className="text-5xl opacity-30 mb-4">🪄</span>
                            <p className="text-sm font-bold text-[var(--toss-gray-4)]">AI 파싱 대기 중</p>
                            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mt-2 text-center max-w-xs">
                                왼쪽에서 명세서 이미 지나 PDF 파일을 선택한 후<br />데이터 추출을 시작하세요.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
