'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';

export default function MyDocuments(props: Record<string, unknown>) {
    const user = props.user as { id?: string; name?: string; company?: string } | undefined;
    const [documents, setDocuments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [scanningDoc, setScanningDoc] = useState<any | null>(null);
    const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 필수 제출 서류 목록
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

    const handleUploadSuccess = async (blobs: Blob[], docType: string) => {
        setUploading(true);
        try {
            let finalBlob: Blob;
            let fileName: string;

            if (blobs.length === 1 && blobs[0].type === 'application/pdf') {
                finalBlob = blobs[0];
                fileName = `${user!.id}_${docType}_${Date.now()}.pdf`;
            } else {
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();

                for (let i = 0; i < blobs.length; i++) {
                    if (i > 0) pdf.addPage();
                    const imgData = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blobs[i]);
                    });

                    // 이미지 포맷 자동 감지
                    let fmt: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG';
                    if (imgData.startsWith('data:image/png')) fmt = 'PNG';
                    else if (imgData.startsWith('data:image/webp')) fmt = 'WEBP';

                    const imgProps = pdf.getImageProperties(imgData);
                    const imgAR = imgProps.width / imgProps.height;
                    const pageAR = pdfWidth / pdfHeight;

                    let drawW = pdfWidth;
                    let drawH = pdfHeight;
                    if (imgAR > pageAR) {
                        drawH = pdfWidth / imgAR;
                    } else {
                        drawW = pdfHeight * imgAR;
                    }
                    const offsetX = (pdfWidth - drawW) / 2;
                    const offsetY = (pdfHeight - drawH) / 2;
                    pdf.addImage(imgData, fmt, offsetX, offsetY, drawW, drawH);
                }
                const pdfArrayBuffer = pdf.output('arraybuffer');
                finalBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
                fileName = `${user!.id}_${docType}_${Date.now()}.pdf`;
            }

            const filePath = `hr_documents/${user!.id}/${fileName}`;
            const { error: uploadError } = await supabase.storage
                .from('board-attachments')
                .upload(filePath, finalBlob, { contentType: 'application/pdf', upsert: true });

            if (uploadError) throw uploadError;
            const { data: urlData } = supabase.storage.from('board-attachments').getPublicUrl(filePath);

            const { error: dbError } = await supabase.from('document_repository').insert({
                created_by: user!.id,
                category: docType,
                title: `${user!.name} - ${docType}`,
                company_name: user!.company || '전체',
                file_url: urlData.publicUrl,
                version: 1,
                content: null,
            });

            if (dbError) throw dbError;

            alert(`${docType} 업로드가 완료되었습니다.`);
            fetchDocuments();
        } catch (error: unknown) {
            alert(`업로드 실패: ${((error as Error)?.message ?? String(error))}`);
        } finally {
            setUploading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        handleUploadSuccess(files, docType);
    };

    return (
        <div data-testid="mypage-documents-panel" className="space-y-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-end border-b border-[var(--border)] pb-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-[var(--foreground)] tracking-tight">스마트 서류 제출</h2>
                </div>
            </div>

            {uploading && (
                <div className="fixed inset-0 z-[600] bg-black/50 flex items-center justify-center">
                    <div className="bg-[var(--card)] rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl">
                        <div className="w-8 h-8 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                        <p className="text-sm font-bold text-[var(--foreground)]">PDF 변환 및 업로드 중...</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                <div className="col-span-2 md:col-span-4 lg:col-span-5 xl:col-span-6 bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-center gap-4">
                    <div className="text-2xl">📸</div>
                    <div>
                        <h3 className="text-xs font-black text-blue-600">스마트 스캔 기능이 활성화되었습니다.</h3>
                        <p className="text-[10px] font-medium text-[var(--toss-gray-4)] mt-0.5">
                            신분증은 가로형 가이드에, A4 서류는 세로형 가이드에 맞춰 촬영해 주세요.
                        </p>
                    </div>
                </div>

                {REQUIRED_DOCS.map((doc, index) => {
                    const existingDoc = documents.find(d => d.category === doc.id);
                    return (
                        <div data-testid={`document-card-${index}`} key={doc.id} className={`border p-3.5 rounded-2xl shadow-sm transition-all relative group h-full flex flex-col justify-between ${existingDoc ? 'border-emerald-100 bg-emerald-50/20' : 'border-[var(--border-subtle)] bg-[var(--card)] hover:border-blue-400'}`}>
                            <div>
                                <div className="flex justify-between items-start">
                                    <h4 className="pr-4 text-[11px] font-black leading-tight text-[var(--foreground)]">{doc.label}</h4>
                                    {existingDoc && (
                                        <span className="text-emerald-500 text-[10px] font-black">✓</span>
                                    )}
                                </div>
                                <span data-testid={`document-status-${index}`} className={`inline-block mt-1 rounded px-1.5 py-0.5 text-[8px] font-black ${existingDoc ? 'bg-emerald-100/50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-[var(--muted)] text-[var(--toss-gray-5)]'}`}>
                                    {existingDoc ? '제출 완료' : '미제출'}
                                </span>
                            </div>

                            <div className="mt-3 flex gap-1.5">
                                {existingDoc ? (
                                    <>
                                        <button data-testid={`document-view-${index}`} onClick={() => window.open(existingDoc.file_url, '_blank')} className="flex-1 rounded-lg bg-[var(--muted)] py-1.5 text-[10px] font-black text-[var(--foreground)] transition-colors hover:bg-[var(--toss-gray-2)]">보기</button>
                                        <button onClick={() => setScanningDoc(doc)} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[10px] text-[var(--toss-gray-5)] transition-colors hover:text-[var(--accent)]" title="재촬영">📷</button>
                                    </>
                                ) : (
                                    <div className="flex w-full gap-1">
                                        <button
                                            onClick={() => setScanningDoc(doc)}
                                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-blue-50 py-2 text-[9px] font-black text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                                        >
                                            📷 촬영
                                        </button>
                                        <button
                                            data-testid={`document-upload-file-${index}`}
                                            onClick={() => {
                                                setUploadingDocId(doc.id);
                                                fileInputRef.current?.click();
                                            }}
                                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--muted)] py-2 text-[9px] font-black text-[var(--foreground)] transition-colors hover:bg-[var(--toss-gray-2)]"
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

            <div className="bg-blue-50/50 p-4 rounded-[var(--radius-xl)] border border-blue-100">
                <h4 className="text-[13px] font-black text-blue-800 mb-2">📢 제출 및 촬영 가이드</h4>
                <ul className="text-[11px] text-blue-700 space-y-2 font-medium list-disc ml-5">
                    <li><strong className="font-black underline decoration-2">모바일 촬영 시</strong>: 글자가 선명하게 보이도록 밝은 곳에서 촬영해 주세요.</li>
                    <li><strong className="font-black underline decoration-2">다중 페이지</strong>: 여러 장의 서류는 촬영 후 &apos;다음 페이지 추가&apos;를 통해 하나의 PDF로 제출 가능합니다.</li>
                </ul>
            </div>

            <input
                type="file"
                ref={fileInputRef}
                data-testid="document-file-input"
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
        </div>
    );
}

function CameraScanner(scannerProps: Record<string, unknown>) {
    const doc = scannerProps.doc as { id: string; label: string };
    const onCapture = scannerProps.onCapture as (blobs: Blob[]) => void;
    const onClose = scannerProps.onClose as () => void;
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const guideRef = useRef<HTMLDivElement>(null);
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
                alert("카메라 권한이 필요합니다. 모바일 브라우저 설정을 확인해 주세요.");
                onClose();
            }
        }
        startCamera();
        return () => {
            stream?.getTracks().forEach(track => track.stop());
        };
    }, []);

    const takePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const vW = video.videoWidth;
        const vH = video.videoHeight;

        if (!vW || !vH) return;

        // 가이드 영역을 기준으로 크롭
        if (guideRef.current && video.getBoundingClientRect) {
            const videoRect = video.getBoundingClientRect();
            const guideRect = guideRef.current.getBoundingClientRect();

            // object-cover 스케일 계산
            const videoAR = vW / vH;
            const containerAR = videoRect.width / videoRect.height;

            let scale: number;
            let offsetX = 0;
            let offsetY = 0;

            if (videoAR > containerAR) {
                // 비디오가 더 넓음 → 높이 기준 스케일, 좌우 크롭
                scale = vH / videoRect.height;
                offsetX = (vW - videoRect.width * scale) / 2;
            } else {
                // 비디오가 더 좁음 → 너비 기준 스케일, 상하 크롭
                scale = vW / videoRect.width;
                offsetY = (vH - videoRect.height * scale) / 2;
            }

            // 가이드 박스를 비디오 픽셀 좌표로 변환
            const gx = offsetX + (guideRect.left - videoRect.left) * scale;
            const gy = offsetY + (guideRect.top - videoRect.top) * scale;
            const gw = guideRect.width * scale;
            const gh = guideRect.height * scale;

            // 안전 범위 클리핑
            const sx = Math.max(0, Math.round(gx));
            const sy = Math.max(0, Math.round(gy));
            const sw = Math.min(Math.round(gw), vW - sx);
            const sh = Math.min(Math.round(gh), vH - sy);

            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
        } else {
            // 폴백: 전체 프레임
            canvas.width = vW;
            canvas.height = vH;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, vW, vH);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setCurrentPreview(dataUrl);
    };

    const addCurrentPage = () => {
        if (canvasRef.current && currentPreview) {
            canvasRef.current.toBlob((blob) => {
                if (blob) {
                    setCapturedBlobs(prev => [...prev, blob]);
                    setCurrentPreview(null);
                }
            }, 'image/jpeg', 0.92);
        }
    };

    const handleFinalConfirm = () => {
        if (capturedBlobs.length > 0) {
            onCapture(capturedBlobs);
        }
    };

    const isIDCard = doc.id === '신분증' || doc.id === '면허자격';

    return (
        <div className="fixed inset-0 z-[500] bg-black md:bg-black/90 flex flex-col items-center justify-center animate-in fade-in">
            <div className="absolute top-6 left-6 z-10 flex flex-col gap-1">
                <h3 className="text-white font-bold">{doc.label} 스캔</h3>
                <span className="text-[10px] text-blue-400 font-black px-2 py-0.5 bg-blue-500/10 rounded-[var(--radius-md)] w-fit">
                    현재 {capturedBlobs.length}페이지 수집됨
                </span>
            </div>
            <button onClick={onClose} className="absolute top-6 right-6 text-white text-2xl z-10">✕</button>

            <div className="relative w-full max-w-lg aspect-[3/4] md:aspect-[4/5] bg-black overflow-hidden md:rounded-2xl shadow-sm">
                {!currentPreview ? (
                    <>
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-5">
                            {isIDCard ? (
                                <div ref={guideRef} className="w-full aspect-[1.58/1] border-2 border-dashed border-white/50 rounded-xl relative">
                                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
                                </div>
                            ) : (
                                <div ref={guideRef} className="h-full aspect-[1/1.414] border-2 border-dashed border-white/50 rounded-lg relative">
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

            <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-4">
                {!currentPreview ? (
                    <div className="flex flex-col items-center gap-4">
                        <button onClick={takePhoto} disabled={isLoading} className="w-20 h-20 bg-[var(--card)] rounded-full border-8 border-slate-700/50 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-sm">
                            <div className="w-12 h-12 bg-[var(--card)] rounded-full border-2 border-[var(--border)]" />
                        </button>
                        {capturedBlobs.length > 0 && (
                            <button onClick={handleFinalConfirm} className="px-12 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-sm animate-bounce">
                                총 {capturedBlobs.length}페이지 제출하기
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-5">
                        <div className="text-center">
                            <p className="text-white text-sm font-bold">방금 촬영한 페이지가 선명한가요?</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => setCurrentPreview(null)} className="px-4 py-4 bg-slate-800 text-white rounded-2xl font-bold">다시 촬영</button>
                            <button onClick={addCurrentPage} className="px-5 py-4 bg-blue-600 text-white rounded-2xl font-bold">
                                {capturedBlobs.length === 0 ? "첫 페이지로 사용" : "다음 페이지 추가하기"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
