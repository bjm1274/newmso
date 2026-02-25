'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// Helper to sanitize filenames
const sanitizeFileName = (fileName: string) =>
    fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '').replace(/\.(?=.*\.)/g, '_');

export default function DocumentScanner({ user, staffs }: any) {
    const [activeTab, setActiveTab] = useState<'내제출' | '관리자현황'>('내제출');
    const [myDocs, setMyDocs] = useState<any[]>([]);
    const [allDocs, setAllDocs] = useState<any[]>([]);
    const [uploadLoading, setUploadLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = user?.company === 'SY INC.' || user?.permissions?.mso === true;
    const docTypes = ['통장사본', '신분증사본', '보건증', '가족관계증명서', '경력증명서'];

    const fetchDocs = async () => {
        // 1) My Docs
        const { data: my } = await supabase
            .from('employment_contracts') // reusing contracts/docs concept or we can use a dedicated table, for now let's use document_repository
            .select('*') // actually it's better to read from a unified table
            .limit(0);

        // Let's use document_repository for HR docs as well
        const { data: repositoryDocs } = await supabase
            .from('document_repository')
            .select('*')
            .in('category', docTypes)
            .order('created_at', { ascending: false });

        if (repositoryDocs) {
            setMyDocs(repositoryDocs.filter(d => d.created_by === user.id));
            if (isAdmin) setAllDocs(repositoryDocs);
        }
    };

    useEffect(() => {
        fetchDocs();
    }, [user]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return alert("파일은 5MB 이내로 업로드 해주세요.");

        setUploadLoading(true);
        try {
            const ext = file.name.split('.').pop();
            const safeName = sanitizeFileName(`${user.name}_${docType}_${Date.now()}.${ext}`);
            const filePath = `hr_documents/${user.id}/${safeName}`;

            const { error: uploadError } = await supabase.storage
                .from('board-attachments') // reusing existing bucket
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('board-attachments').getPublicUrl(filePath);

            // Insert into document_repository
            const { error: insertError } = await supabase.from('document_repository').insert([{
                title: `${user.name} - ${docType}`,
                category: docType,
                company_name: user.company || '전체',
                created_by: user.id,
                file_url: urlData.publicUrl
            }]);

            if (insertError) throw insertError;

            alert(`${docType} 업로드가 완료되었습니다.`);
            fetchDocs();
        } catch (error) {
            console.error(error);
            alert("업로드 중 오류가 발생했습니다.");
        } finally {
            setUploadLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-end border-b border-[var(--toss-border)] pb-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-[var(--foreground)] tracking-tight">스마트 서류 제출</h2>
                    <p className="text-[11px] md:text-xs text-[var(--toss-gray-3)] font-bold uppercase mt-1">HR Document Scanner</p>
                </div>
                {isAdmin && (
                    <div className="flex gap-2">
                        <button onClick={() => setActiveTab('내제출')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${activeTab === '내제출' ? 'bg-[var(--toss-blue)] text-white' : 'bg-slate-100 text-slate-500'}`}>내 서류</button>
                        <button onClick={() => setActiveTab('관리자현황')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${activeTab === '관리자현황' ? 'bg-[var(--toss-blue)] text-white' : 'bg-slate-100 text-slate-500'}`}>전사 수집 현황</button>
                    </div>
                )}
            </div>

            {activeTab === '내제출' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-3 bg-[var(--toss-blue-light)]/40 p-6 rounded-3xl border border-[var(--toss-blue)]/30 flex items-center gap-4">
                        <div className="text-3xl">📸</div>
                        <div>
                            <h3 className="text-sm font-black text-[var(--toss-blue)]">스마트폰으로 간편하게 제출하세요.</h3>
                            <p className="text-xs font-medium text-slate-600 mt-1">
                                PC에서는 파일을 드래그앤드랍 하거나 클릭하여 업로드할 수 있으며, 모바일에서는 즉시 <b>카메라 앱</b>이 켜져 서류를 스캔할 수 있습니다.
                            </p>
                        </div>
                    </div>

                    {docTypes.map(docType => {
                        const existingDoc = myDocs.find(d => d.category === docType);
                        return (
                            <div key={docType} className={`border p-6 rounded-3xl shadow-sm transition-all relative overflow-hidden ${existingDoc ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white hover:border-[var(--toss-blue)]'}`}>
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h4 className="text-sm font-black text-slate-800">{docType}</h4>
                                        <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] font-black rounded ${existingDoc ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                                            {existingDoc ? '제출 완료' : '미제출'}
                                        </span>
                                    </div>
                                    {existingDoc && (
                                        <a href={existingDoc.file_url} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-slate-400 hover:text-[var(--toss-blue)] transition-colors">
                                            👁️
                                        </a>
                                    )}
                                </div>

                                {existingDoc ? (
                                    <div className="mt-4 p-4 bg-white/60 rounded-xl">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">제출 일시</p>
                                        <p className="text-xs font-bold text-slate-700 mt-1">{new Date(existingDoc.created_at).toLocaleString()}</p>
                                        <button onClick={() => {
                                            const conf = confirm('기존 문서를 삭제하고 재업로드 하시겠습니까?');
                                            // Simple delete & refresh logic can be added here
                                        }} className="w-full mt-4 py-2 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-lg hover:bg-slate-200 transition-colors">다시 올리기</button>
                                    </div>
                                ) : (
                                    <label className={`mt-4 w-full py-4 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors ${uploadLoading ? 'bg-slate-50 border-slate-200 cursor-not-allowed' : 'bg-slate-50 border-slate-300 hover:bg-[var(--toss-blue-light)] hover:border-[var(--toss-blue)]/50'}`}>
                                        <span className="text-2xl mb-2">📥</span>
                                        <span className="text-[11px] font-bold text-slate-500">{uploadLoading ? '업로드 중...' : '클릭하여 사진 촬영 또는 파일 첨부'}</span>
                                        <input
                                            type="file"
                                            accept="image/*,.pdf"
                                            capture="environment" // Triggers camera on mobile
                                            className="hidden"
                                            disabled={uploadLoading}
                                            onChange={(e) => handleFileUpload(e, docType)}
                                        />
                                    </label>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {activeTab === '관리자현황' && isAdmin && (
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden min-h-[500px]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="text-sm font-black text-slate-800">서류 누락자 현황판 (Compliance Board)</h3>
                        <button className="px-4 py-2 bg-[var(--toss-blue)] text-white text-[11px] font-bold rounded-lg hover:scale-105 transition-transform shadow-sm">
                            전체 독촉 알림 발송 ✉️
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-50/50">
                                <tr className="border-b border-slate-100 text-slate-500 uppercase tracking-widest font-black">
                                    <th className="px-6 py-4">직원명</th>
                                    <th className="px-6 py-4">부서 / 회사</th>
                                    {docTypes.map(d => <th key={d} className="px-6 py-4 text-center">{d}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {staffs.map((s: any) => {
                                    return (
                                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-black flex items-center gap-2 text-slate-800">
                                                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[8px]">{s.name[0]}</div>
                                                {s.name}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-500">{s.department} <br /> <span className="text-[9px] font-medium">{s.company}</span></td>
                                            {docTypes.map(d => {
                                                const doc = allDocs.find(x => x.created_by === s.id && x.category === d);
                                                return (
                                                    <td key={d} className="px-6 py-4 text-center">
                                                        {doc ? (
                                                            <a href={doc.file_url} target="_blank" rel="noreferrer" className="inline-flex w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 items-center justify-center hover:scale-110 transition-transform shadow-sm" title="문서 보기">✓</a>
                                                        ) : (
                                                            <span className="inline-flex w-8 h-8 rounded-full bg-slate-100 text-slate-300 items-center justify-center font-bold font-mono">X</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
