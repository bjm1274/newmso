'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function MyDocuments({ user }: any) {
    const [documents, setDocuments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // 필수 제출 서류 목록
    const REQUIRED_DOCS = [
        { id: '등본', label: '주민등록등본', icon: '🏠' },
        { id: '초본', label: '주민등록초본', icon: '📄' },
        { id: '가족관계', label: '가족관계증명서', icon: '👨‍👩‍👧‍👦' },
        { id: '통장', label: '통장사본', icon: '🏦' },
        { id: '면허자격', label: '면허(자격)증 사본', icon: '📜' },
        { id: '보건증', label: '보건선결과(보건증)', icon: '🏥' },
        { id: '성희롱예방', label: '성희롱 예방교육', icon: '🛡️' },
        { id: '장애인인식', label: '장애인 인식개선교육', icon: '🤝' },
        { id: '개인정보보호', label: '개인정보 보호교육', icon: '🔐' },
        { id: '괴롭힘예방', label: '직장내 괴롭힘 예방교육', icon: '🚫' },
        { id: '안전보건', label: '산업안전 보건교육', icon: '👷' },
    ];

    useEffect(() => {
        fetchDocuments();
    }, [user?.id]);

    const fetchDocuments = async () => {
        if (!user?.id) return;
        setIsLoading(true);
        const { data } = await supabase
            .from('document_repository')
            .select('*')
            .eq('created_by', user.id)
            .order('created_at', { ascending: false });
        setDocuments(data || []);
        setIsLoading(false);
    };

    const handleUpload = async (docType: string, file: File) => {
        if (!file) return;
        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}_${docType}_${Date.now()}.${fileExt}`;
            const filePath = `staff_docs/${fileName}`;

            // 1. Storage 업로드 (board-attachments 버킷 사용 통일)
            const { error: uploadError } = await supabase.storage
                .from('board-attachments')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // 2. DB 기록 (document_repository 사용 통일)
            const { error: dbError } = await supabase.from('document_repository').insert({
                created_by: user.id,
                category: docType,
                title: `${user.name} - ${docType}`,
                company_name: user.company || '전체',
                file_url: (await supabase.storage.from('board-attachments').getPublicUrl(filePath)).data.publicUrl
            });

            if (dbError) throw dbError;

            alert(`${docType} 업로드가 완료되었습니다.`);
            fetchDocuments();
        } catch (error: any) {
            alert(`업로드 실패: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-[var(--foreground)]">내 서류 제출 현황</h3>
                    <p className="text-xs text-[var(--toss-gray-3)] mt-1">입사 시 필요한 필수 서류를 업로드해 주세요.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {REQUIRED_DOCS.map((doc) => {
                    const submitted = documents.find(d => d.category === doc.id);
                    return (
                        <div key={doc.id} className="bg-[var(--toss-card)] p-6 rounded-[24px] border border-[var(--toss-border)] shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{doc.icon}</span>
                                    <div>
                                        <h4 className="text-sm font-bold text-[var(--foreground)]">{doc.label}</h4>
                                        <p className="text-[10px] text-[var(--toss-gray-3)]">파일형식: PDF, JPG, PNG</p>
                                    </div>
                                </div>
                                {submitted ? (
                                    <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full">제출완료</span>
                                ) : (
                                    <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full">미제출</span>
                                )}
                            </div>

                            {submitted ? (
                                <div className="space-y-3">
                                    <div className="p-3 bg-[var(--page-bg)] rounded-[12px] flex justify-between items-center">
                                        <span className="text-[11px] font-medium text-[var(--toss-gray-4)] truncate max-w-[150px]">{submitted.title}</span>
                                        <a href={submitted.file_url} target="_blank" className="text-[10px] font-bold text-[var(--toss-blue)] hover:underline">보기</a>
                                    </div>
                                    <label className="block">
                                        <span className="sr-only">파일 선택</span>
                                        <input
                                            type="file"
                                            className="block w-full text-[10px] text-slate-500
                        file:mr-4 file:py-1.5 file:px-3
                        file:rounded-full file:border-0
                        file:text-[10px] file:font-semibold
                        file:bg-blue-50 file:text-blue-700
                        hover:file:bg-blue-100 cursor-pointer"
                                            onChange={(e) => e.target.files && handleUpload(doc.id, e.target.files[0])}
                                            disabled={uploading}
                                        />
                                        <p className="mt-1 text-[9px] text-gray-400">파일을 다시 선택하면 기존 서류가 교체됩니다.</p>
                                    </label>
                                </div>
                            ) : (
                                <label className="block mt-2">
                                    <span className="sr-only">파일 선택</span>
                                    <input
                                        type="file"
                                        className="block w-full text-xs text-slate-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-xs file:font-semibold
                      file:bg-[var(--toss-blue)] file:text-white
                      hover:file:opacity-90 cursor-pointer"
                                        onChange={(e) => e.target.files && handleUpload(doc.id, e.target.files[0])}
                                        disabled={uploading}
                                    />
                                </label>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="bg-blue-50/50 p-5 rounded-[16px] border border-blue-100">
                <h4 className="text-[11px] font-bold text-blue-800 mb-2 font-black">📢 제출 시 주의사항</h4>
                <ul className="text-[10px] text-blue-700 space-y-1 font-medium list-disc ml-4">
                    <li>주민등록번호 뒷자리는 마스킹(별표) 처리 후 제출해 주시기 바랍니다.</li>
                    <li>촬영된 이미지는 글자가 명확하게 보여야 합니다.</li>
                    <li>업로드된 서류는 인사 담당자만 열람할 수 있으며, 안전하게 관리됩니다.</li>
                </ul>
            </div>
        </div>
    );
}
