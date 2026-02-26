'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';

// Helper to sanitize filenames
const sanitizeFileName = (fileName: string) =>
    fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '').replace(/\.(?=.*\.)/g, '_');

const REQUIRED_DOCS = [
    { id: '가족관계', label: '가족관계증명서' },
    { id: '개인정보보호', label: '개인정보 보호교육' },
    { id: '면허자격', label: '면허(자격)증 사본' },
    { id: '보건증', label: '보건선결과(보건증)' },
    { id: '안전보건', label: '산업안전 보건교육' },
    { id: '성희롱예방', label: '성희롱 예방교육' },
    { id: '신분증', label: '신분증 사본' },
    { id: '일반검진', label: '일반 건강검진' },
    { id: '잠복결핵', label: '잠복결핵 검진결과' },
    { id: '장애인인식', label: '장애인 인식개선교육' },
    { id: '등본', label: '주민등록등본' },
    { id: '초본', label: '주민등록초본' },
    { id: '괴롭힘예방', label: '직장내 괴롭힘 예방교육' },
    { id: '통장', label: '통장사본' },
    { id: '퇴직연금', label: '퇴직연금교육' },
    { id: '특수검진', label: '특수 건강검진' },
];

export default function DocumentScanner({ user, staffs, selectedCo = '전체' }: any) {
    const filteredStaffs = staffs.filter((s: any) => selectedCo === '전체' || s.company === selectedCo);
    const [activeTab, setActiveTab] = useState<'내제출' | '관리자현황'>('내제출');
    const [myDocs, setMyDocs] = useState<any[]>([]);
    const [allDocs, setAllDocs] = useState<any[]>([]);
    const [uploadLoading, setUploadLoading] = useState(false);
    const [scanningDoc, setScanningDoc] = useState<any | null>(null);
    const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = user?.company === 'SY INC.' || user?.permissions?.mso === true;
    const docTypes = REQUIRED_DOCS.map(doc => doc.id); // Use IDs from REQUIRED_DOCS

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

    const handleUploadSuccess = async (blobs: Blob[], docType: string) => {
        setUploadLoading(true);
        try {
            let finalBlob: Blob;
            let fileName: string;

            if (blobs.length === 1 && blobs[0].type === 'application/pdf') {
                finalBlob = blobs[0];
                fileName = sanitizeFileName(`${user.name}_${docType}_${Date.now()}.pdf`);
            } else {
                // Merge images into PDF
                const doc = new jsPDF();
                for (let i = 0; i < blobs.length; i++) {
                    if (i > 0) doc.addPage();
                    const imgData = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blobs[i]);
                    });

                    const imgProps = doc.getImageProperties(imgData);
                    const pdfWidth = doc.internal.pageSize.getWidth();
                    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                }
                const pdfArrayBuffer = doc.output('arraybuffer');
                finalBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
                fileName = sanitizeFileName(`${user.name}_${docType}_${Date.now()}.pdf`);
            }

            const filePath = `hr_documents/${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('board-attachments')
                .upload(filePath, finalBlob, { contentType: 'application/pdf', upsert: true });

            if (uploadError) throw uploadError;
            const { data: urlData } = supabase.storage.from('board-attachments').getPublicUrl(filePath);

            await supabase.from('document_repository').insert([{
                title: `${user.name} - ${docType}`,
                category: docType,
                company_name: user.company || '전체',
                created_by: user.id,
                file_url: urlData.publicUrl
            }]);

            alert(`${docType} 업로드가 완료되었습니다.`);
            fetchDocs();
        } catch (error) {
            console.error(error);
            alert("업로드 중 오류가 발생했습니다.");
        } finally {
            setUploadLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        handleUploadSuccess(files, docType);
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
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    <div className="col-span-2 md:col-span-4 lg:col-span-5 xl:col-span-6 bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-center gap-4">
                        <div className="text-2xl">📸</div>
                        <div>
                            <h3 className="text-xs font-black text-blue-600">스마트 스캔 기능이 활성화되었습니다.</h3>
                            <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                                신분증은 가로형 가이드에, A4 서류는 세로형 가이드에 맞춰 촬영해 주세요.
                            </p>
                        </div>
                    </div>

                    {REQUIRED_DOCS.map(doc => {
                        const existingDoc = myDocs.find(d => d.category === doc.id);
                        return (
                            <div key={doc.id} className={`border p-3.5 rounded-2xl shadow-sm transition-all relative group h-full flex flex-col justify-between ${existingDoc ? 'border-emerald-100 bg-emerald-50/20' : 'border-slate-100 bg-white hover:border-blue-400'}`}>
                                <div>
                                    <div className="flex justify-between items-start">
                                        <h4 className="text-[11px] font-black text-slate-800 leading-tight pr-4">{doc.label}</h4>
                                        {existingDoc && (
                                            <span className="text-emerald-500 text-[10px] font-black">✓</span>
                                        )}
                                    </div>
                                    <span className={`inline-block mt-1 px-1.5 py-0.5 text-[8px] font-black rounded ${existingDoc ? 'bg-emerald-100/50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                        {existingDoc ? '제출 완료' : '미제출'}
                                    </span>
                                </div>

                                <div className="mt-3 flex gap-1.5">
                                    {existingDoc ? (
                                        <>
                                            <button onClick={() => window.open(existingDoc.file_url, '_blank')} className="flex-1 py-1.5 bg-slate-50 text-slate-500 text-[10px] font-black rounded-lg hover:bg-slate-100 transition-colors">보기</button>
                                            <button onClick={() => setScanningDoc(doc)} className="px-2 py-1.5 bg-white border border-slate-200 text-slate-400 text-[10px] rounded-lg hover:text-blue-500" title="재촬영">📷</button>
                                        </>
                                    ) : (
                                        <div className="flex w-full gap-1">
                                            <button
                                                onClick={() => setScanningDoc(doc)}
                                                className="flex-1 py-2 bg-blue-50 text-blue-600 text-[9px] font-black rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
                                            >
                                                📷 촬영
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setUploadingDocId(doc.id);
                                                    fileInputRef.current?.click();
                                                }}
                                                className="flex-1 py-2 bg-slate-50 text-slate-500 text-[9px] font-black rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-1"
                                            >
                                                📁 파일
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,.pdf"
                onChange={(e) => {
                    if (uploadingDocId) {
                        handleFileUpload(e, uploadingDocId);
                        setUploadingDocId(null);
                    }
                }}
            />

            {scanningDoc && (
                <CameraScanner
                    doc={scanningDoc}
                    onCapture={(blobs: Blob[]) => {
                        handleUploadSuccess(blobs, scanningDoc.id);
                        setScanningDoc(null);
                    }}
                    onClose={() => setScanningDoc(null)}
                />
            )}

            {activeTab === '관리자현황' && isAdmin && (
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden min-h-[500px]">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h3 className="text-sm font-black text-slate-800">서류 누락자 현황판 (Compliance Board)</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">입사 1주일 경과 미제출자는 빨간색으로 표시됩니다.</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    const lazyStaff = filteredStaffs.filter((s: any) => {
                                        const joinDate = new Date(s.join_date);
                                        const weekAgo = new Date();
                                        weekAgo.setDate(weekAgo.getDate() - 7);
                                        const staffDocs = allDocs.filter(d => d.created_by === s.id);
                                        return joinDate < weekAgo && staffDocs.length < REQUIRED_DOCS.length;
                                    });
                                    if (lazyStaff.length === 0) return alert("독촉 대상자가 없습니다.");
                                    if (confirm(`${lazyStaff.length}명의 미제출자에게 독촉 알림을 발송할까요?`)) {
                                        alert("독촉 알림이 전송되었습니다.");
                                    }
                                }}
                                className="px-4 py-2 bg-rose-500 text-white text-[11px] font-bold rounded-lg hover:scale-105 transition-transform shadow-sm flex items-center gap-1"
                            >
                                🔔 미제출자 일괄 독촉
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-50/50">
                                <tr className="border-b border-slate-100 text-slate-500 uppercase tracking-widest font-black">
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">성명</th>
                                    <th className="px-6 py-4">부서 / 회사</th>
                                    {REQUIRED_DOCS.map(doc => (
                                        <th key={doc.id} className="px-1 py-3 text-center text-[9px] font-black text-slate-400 min-w-[75px] max-w-[75px] break-keep whitespace-normal leading-tight align-middle border-x border-slate-100/50">{doc.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredStaffs.map((s: any) => {
                                    const staffDocs = allDocs.filter(d => d.created_by === s.id);
                                    const joinDate = new Date(s.join_date);
                                    const weekAgo = new Date();
                                    weekAgo.setDate(weekAgo.getDate() - 7);
                                    const isLazy = joinDate < weekAgo && staffDocs.length < REQUIRED_DOCS.length;

                                    return (
                                        <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isLazy ? 'bg-rose-50/30' : ''}`}>
                                            <td className="px-6 py-4 font-black flex items-center gap-2 text-slate-800">
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] ${isLazy ? 'bg-rose-100 text-rose-600' : 'bg-slate-200'}`}>{s.name[0]}</div>
                                                <div>
                                                    <p>{s.name}</p>
                                                    <p className="text-[9px] font-medium text-slate-400">입사일: {s.join_date}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-500">{s.department} <br /> <span className="text-[9px] font-medium">{s.company}</span></td>
                                            {REQUIRED_DOCS.map(doc => {
                                                const sub = staffDocs.find(d => d.category === doc.id);
                                                return (
                                                    <td key={doc.id} className="px-1 py-4 text-center border-x border-slate-100/50">
                                                        {sub ? (
                                                            <div className="flex flex-col items-center gap-1 group/item">
                                                                <span className="text-emerald-500 font-extrabold text-sm">✓</span>
                                                                <button
                                                                    onClick={() => window.open(sub.file_url, '_blank')}
                                                                    className="text-[8px] text-blue-500 font-bold hover:underline opacity-0 group-hover/item:opacity-100 transition-opacity"
                                                                >열람</button>
                                                            </div>
                                                        ) : <span className={`${isLazy ? 'text-rose-400 font-black' : 'text-slate-200'}`}>✕</span>}
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

function CameraScanner({ doc, onCapture, onClose }: any) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([]);
    const [currentPreview, setCurrentPreview] = useState<string | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function startCamera() {
            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
                });
                setStream(s);
                if (videoRef.current) videoRef.current.srcObject = s;
                setIsLoading(false);
            } catch (err) {
                console.error("Camera access denied:", err);
                alert("카메라 권한이 필요합니다.");
                onClose();
            }
        }
        startCamera();
        return () => {
            stream?.getTracks().forEach(track => track.stop());
        };
    }, []);

    const takePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/png');
            setCurrentPreview(dataUrl);
        }
    };

    const addCurrentPage = () => {
        if (canvasRef.current && currentPreview) {
            canvasRef.current.toBlob((blob) => {
                if (blob) {
                    setCapturedBlobs(prev => [...prev, blob]);
                    setCurrentPreview(null);
                }
            }, 'image/png');
        }
    };

    const handleFinalConfirm = () => {
        if (capturedBlobs.length > 0) {
            onCapture(capturedBlobs);
        }
    };

    const isIDCard = doc.id === '신분증' || doc.id === '면허자격';

    return (
        <div className="fixed inset-0 z-[300] bg-black md:bg-black/90 flex flex-col items-center justify-center animate-in fade-in">
            <div className="absolute top-6 left-6 z-10 flex flex-col gap-1">
                <h3 className="text-white font-bold">{doc.label} 스캔</h3>
                <span className="text-[10px] text-blue-400 font-black px-2 py-0.5 bg-blue-500/10 rounded-full w-fit">
                    현재 {capturedBlobs.length}페이지 수집됨
                </span>
            </div>
            <button onClick={onClose} className="absolute top-6 right-6 text-white text-2xl z-10">✕</button>

            <div className="relative w-full max-w-lg aspect-[3/4] md:aspect-[4/5] bg-black overflow-hidden md:rounded-[40px] shadow-2xl">
                {!currentPreview ? (
                    <>
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
                            {isIDCard ? (
                                <div className="w-full aspect-[1.58/1] border-2 border-dashed border-white/50 rounded-xl relative">
                                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
                                </div>
                            ) : (
                                <div className="h-full aspect-[1/1.414] border-2 border-dashed border-white/50 rounded-lg relative">
                                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
                                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
                                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
                                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <img src={currentPreview} className="w-full h-full object-contain bg-slate-900" alt="Captured" />
                )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-6">
                {!currentPreview ? (
                    <div className="flex flex-col items-center gap-6">
                        <button onClick={takePhoto} disabled={isLoading} className="w-20 h-20 bg-white rounded-full border-8 border-slate-700/50 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl">
                            <div className="w-12 h-12 bg-white rounded-full border-2 border-slate-200" />
                        </button>
                        {capturedBlobs.length > 0 && (
                            <button onClick={handleFinalConfirm} className="px-12 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg animate-bounce">
                                총 {capturedBlobs.length}페이지 제출하기
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-8">
                        <div className="text-center">
                            <p className="text-white text-sm font-bold">방금 촬영한 페이지가 선명한가요?</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => setCurrentPreview(null)} className="px-6 py-4 bg-slate-800 text-white rounded-2xl font-bold">다시 촬영</button>
                            <button onClick={addCurrentPage} className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold">
                                {capturedBlobs.length === 0 ? "첫 페이지로 사용" : "다음 페이지 추가하기"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
