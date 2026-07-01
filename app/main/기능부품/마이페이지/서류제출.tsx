'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db-client';
import {
  REQUIRED_DOC_CATEGORIES,
  validateDocUpload } from '@/lib/document-submission-shared';
import LicenseCESubmit from './면허보수교육제출';
import { escapeHtml } from '@/lib/escape-html';
// jsPDF: dynamic import로 전환 (번들 사이즈 최적화)

type ContractRecord = {
    id: string;
    contract_type?: string | null;
    status?: string | null;
    requested_at?: string | null;
    signed_at?: string | null;
    signature_data?: string | null;
};

type MyDocumentsProps = {
    user?: { id?: string; name?: string; company?: string } | null;
    latestContract?: ContractRecord | null;
    pendingContract?: ContractRecord | null;
    onOpenContractSignature?: (contract: ContractRecord) => void;
};

import { formatDateLabel } from '@/lib/date-formatter';

function formatDate(value?: string | null) {
    return formatDateLabel(value) || '-';
}

// SEC: 미리보기 창에 document.write 로 주입되는 사용자 제어 값(title/content)을
// 이스케이프해 저장형 XSS 를 차단한다. 공용 유틸 escapeHtml을 사용합니다.

export default function MyDocuments(props: MyDocumentsProps) {
    const user = props.user as { id?: string; name?: string; company?: string } | undefined;
    const [documents, setDocuments] = useState<any[]>([]);
    const [contracts, setContracts] = useState<ContractRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [scanningDoc, setScanningDoc] = useState<any | null>(null);
    const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 필수 제출 서류 목록 (공통 모듈에서 공유 — 데스크톱 16종)
    const REQUIRED_DOCS = REQUIRED_DOC_CATEGORIES;

    useEffect(() => {
        fetchDocuments();
    }, [user?.id]);

    const fetchDocuments = async () => {
        if (!user?.id) return;
        setIsLoading(true);
        try {
            const [docResult, contractResult] = await Promise.all([
                db
                    .from('document_repository')
                    .select('*')
                    .eq('created_by', user.id)
                    .order('created_at', { ascending: false }),
                db
                    .from('employment_contracts')
                    .select('id, contract_type, status, requested_at, signed_at, signature_data')
                    .eq('staff_id', user.id)
                    .order('created_at', { ascending: false }),
            ]);
            if (docResult.error) throw docResult.error;
            if (contractResult.error) throw contractResult.error;
            setDocuments(docResult.data || []);
            setContracts((contractResult.data as ContractRecord[]) || []);
        } catch (error) {
            console.error('[서류제출] 문서/계약서 조회 실패:', error);
            toast('서류 정보를 불러오지 못했습니다.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // JM2: 부모에서 매번 새 객체 참조로 latestContract를 내려보내도 실질적인 값이
    // 같으면 setContracts를 호출하지 않도록 primitive deps로 좁힌다. 또한 prev와
    // 비교해서 동일하면 같은 배열 참조를 그대로 반환해 자식 자체의 불필요한 리렌더도 차단.
    const latestContractId = props.latestContract?.id;
    const latestContractStatus = props.latestContract?.status;
    const latestContractSignedAt = props.latestContract?.signed_at;
    const latestContractRequestedAt = props.latestContract?.requested_at;
    useEffect(() => {
        const next = props.latestContract;
        if (!next) return;
        setContracts((prev) => {
            const existing = prev.find((contract) => String(contract.id) === String(next.id));
            // 이미 같은 id의 동일 상태 항목이 prev 맨 앞에 있으면 변경 불필요.
            if (
                existing &&
                prev[0] &&
                String(prev[0].id) === String(next.id) &&
                prev[0].status === next.status &&
                prev[0].signed_at === next.signed_at &&
                prev[0].requested_at === next.requested_at
            ) {
                return prev;
            }
            const filtered = prev.filter((contract) => String(contract.id) !== String(next.id));
            return [next, ...filtered];
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latestContractId, latestContractStatus, latestContractSignedAt, latestContractRequestedAt]);

    useEffect(() => {
        const handleContractSigned = () => {
            void fetchDocuments();
        };
        window.addEventListener('erp-contract-signed', handleContractSigned);
        return () => {
            window.removeEventListener('erp-contract-signed', handleContractSigned);
        };
    }, [user?.id]);

    const openRepositoryDocument = async (document: any) => {
        if (document?.file_url) {
            window.open(document.file_url, '_blank');
            return;
        }
        if (typeof document?.content === 'string' && document.content.trim()) {
            const preview = window.open('', '_blank');
            if (!preview) return;
            
            const { decryptContract } = await import('@/lib/contract-crypto');
            const decryptedContent = await decryptContract(document.content);

            preview.document.write(`
              <html>
                <head>
                  <title>${escapeHtml(document.title || '문서 보기')}</title>
                  <style>body{font-family:'Noto Sans KR',sans-serif;line-height:1.6;padding:24px;color:#111827;} img{max-width:100%;height:auto}</style>
                </head>
                <body>${decryptedContent}</body>
              </html>
            `);
            preview.document.close();
        }
    };

    const pendingContract = props.pendingContract || contracts.find((contract) => contract.status === '서명대기') || null;
    const latestContract = props.latestContract || contracts[0] || null;
    const latestContractDocument = documents.find((document) => ['계약서', '근로계약서'].includes(document.category));

    const handleUploadSuccess = async (blobs: Blob[], docType: string) => {
        setUploading(true);
        try {
            let finalBlob: Blob;
            let fileName: string;

            if (blobs.length === 1 && blobs[0].type === 'application/pdf') {
                finalBlob = blobs[0];
                fileName = `${user!.id}_${docType}_${Date.now()}.pdf`;
            } else {
                const { jsPDF } = await import('jspdf');
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

            const uploadForm = new FormData();
            uploadForm.append('file', new File([finalBlob], fileName, { type: 'application/pdf' }));

            const uploadRes = await fetch('/api/approvals/upload', {
                method: 'POST',
                body: uploadForm });
            if (!uploadRes.ok) {
                const errJson = (await uploadRes.json().catch(() => ({}))) as { error?: string };
                throw new Error(errJson.error || '파일 업로드에 실패했습니다.');
            }
            const uploadData = (await uploadRes.json()) as { url: string };
            const fileUrl = uploadData.url;

            const { error: dbError } = await db.from('document_repository').insert({
                created_by: user!.id,
                category: docType,
                title: `${user!.name} - ${docType}`,
                company_name: user!.company || '전체',
                file_url: fileUrl,
                version: 1,
                content: null });

            if (dbError) throw dbError;

            toast(`${docType} 업로드가 완료되었습니다.`, 'success');
            fetchDocuments();
        } catch (error: unknown) {
            toast(`업로드 실패: ${((error as Error)?.message ?? String(error))}`, 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        // 공통 단일 업로드 정책(MIME 화이트리스트 + 크기 한도)으로 사용자 선택 파일 검증.
        // 카메라 촬영본(로컬 생성 JPEG)은 항상 정책 내라 검증 흐름에 회귀 없음.
        for (const file of files) {
            const validation = validateDocUpload(file);
            if (!validation.ok) {
                toast(validation.message, 'error');
                return;
            }
        }
        handleUploadSuccess(files, docType);
    };

    return (
        <div data-testid="mypage-documents-panel" className="space-y-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-end border-b border-[var(--border)] pb-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-[var(--foreground)] tracking-tight">스마트 서류 제출</h2>
                </div>
            </div>

            <div
                className="rounded-[var(--radius-xl)] border border-violet-200 p-4"
                style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 40%, #ddd6fe 100%)' }}
            >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                            <svg className="w-3.5 h-3.5 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
                            </svg>
                            <p className="text-[11px] font-black tracking-wide text-violet-700">직원 문서 전자서명</p>
                        </div>
                        <h3 className="text-sm font-bold text-violet-900">
                            {latestContract?.contract_type || '근로계약 전자서명 대기 없음'}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-violet-700">
                            <span className="rounded-full bg-white/70 px-2 py-1 font-semibold border border-violet-100">
                                상태 {pendingContract ? '서명대기' : latestContract?.status || '미등록'}
                            </span>
                            {latestContract?.requested_at ? (
                                <span className="rounded-full bg-white/70 px-2 py-1 font-semibold border border-violet-100">
                                    요청일 {formatDate(latestContract.requested_at)}
                                </span>
                            ) : null}
                            {latestContract?.signed_at ? (
                                <span className="rounded-full bg-white/70 px-2 py-1 font-semibold border border-violet-100">
                                    서명일 {formatDate(latestContract.signed_at)}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-violet-600">
                            {pendingContract
                                ? '전자서명이 필요한 근로계약서가 있습니다. 아래 버튼으로 다시 열 수 있습니다.'
                                : latestContract?.status === '서명완료'
                                    ? '최근 전자서명 완료 계약 상태를 여기에서 확인할 수 있습니다.'
                                    : '계약서 발송 후 이 영역에서 서명 상태를 확인할 수 있습니다.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {pendingContract && props.onOpenContractSignature ? (
                            <button
                                type="button"
                                data-testid="contract-sign-open-button"
                                onClick={() => props.onOpenContractSignature?.(pendingContract)}
                                className="rounded-full bg-violet-600 px-4 py-2 text-[11px] font-black text-white shadow-sm hover:bg-violet-700 transition-colors"
                            >
                                전자서명 진행
                            </button>
                        ) : null}
                        {latestContractDocument ? (
                            <button
                                type="button"
                                data-testid="contract-document-view-button"
                                onClick={() => openRepositoryDocument(latestContractDocument)}
                                className="rounded-full border border-violet-300 bg-white/80 px-4 py-2 text-[11px] font-black text-violet-700 hover:bg-white transition-colors"
                            >
                                서명본 보기
                            </button>
                        ) : null}
                    </div>
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

            {/* §3-5, §13.5 결정사항: 진행률 카드/스마트 스캔 배너 제거. 1366에서는 4-col 그리드. */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {REQUIRED_DOCS.map((doc, index) => {
                    const existingDoc = documents.find(d => d.category === doc.id);
                    // 서류 종류별 아이콘 색상 배정 (반복 없이 순환)
                    const iconColors = [
                        { bg: 'bg-blue-100', text: 'text-blue-600' },
                        { bg: 'bg-emerald-100', text: 'text-emerald-600' },
                        { bg: 'bg-orange-100', text: 'text-orange-600' },
                        { bg: 'bg-purple-100', text: 'text-purple-600' },
                        { bg: 'bg-rose-100', text: 'text-rose-600' },
                        { bg: 'bg-sky-100', text: 'text-sky-600' },
                        { bg: 'bg-amber-100', text: 'text-amber-600' },
                        { bg: 'bg-teal-100', text: 'text-teal-600' },
                    ] as const;
                    const iconColor = iconColors[index % iconColors.length];
                    return (
                        <div data-testid={`document-card-${index}`} key={doc.id} className={`border p-3 rounded-2xl shadow-sm transition-all relative group h-full flex flex-col justify-between ${existingDoc ? 'border-emerald-100 bg-emerald-50/20' : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]'}`}>
                            <div>
                                {/* 아이콘 박스 */}
                                <div className={`inline-flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] mb-2 ${iconColor.bg}`}>
                                    <svg className={`w-4 h-4 ${iconColor.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div className="flex justify-between items-start">
                                    <h4 className="pr-4 text-[11px] font-black leading-tight text-[var(--foreground)]">{doc.label}</h4>
                                    {existingDoc && (
                                        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                                <span data-testid={`document-status-${index}`} className={`inline-block mt-1 rounded px-1.5 py-0.5 text-[8px] font-black ${existingDoc ? 'bg-emerald-100/50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-[var(--muted)] text-[var(--toss-gray-5)]'}`}>
                                    {existingDoc ? '제출 완료' : '미제출'}
                                </span>
                                {/* 메타: 제출일 또는 제출 필요 */}
                                <p className={`mt-1 text-[9px] font-semibold ${existingDoc ? 'text-emerald-500' : 'text-[var(--toss-gray-4)]'}`}>
                                    {existingDoc
                                        ? existingDoc.created_at
                                            ? formatDate(existingDoc.created_at)
                                            : '제출 완료'
                                        : '제출 필요'}
                                </p>
                            </div>

                            <div className="mt-2.5 flex gap-1.5">
                                {existingDoc ? (
                                    <>
                                        <button
                                            type="button"
                                            data-testid={`document-view-${index}`}
                                            onClick={() => window.open(existingDoc.file_url, '_blank')}
                                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--muted)] py-1.5 text-[10px] font-black text-[var(--foreground)] transition-colors hover:bg-[var(--toss-gray-2)]"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            보기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setScanningDoc(doc)}
                                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[var(--toss-gray-4)] transition-colors hover:text-[var(--accent)] hover:border-[var(--accent)]"
                                            title="재촬영"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </button>
                                    </>
                                ) : (
                                    <div className="flex w-full gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setScanningDoc(doc)}
                                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-blue-50 py-2 text-[9px] font-black text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            촬영
                                        </button>
                                        <button
                                            type="button"
                                            data-testid={`document-upload-file-${index}`}
                                            onClick={() => {
                                                setUploadingDocId(doc.id);
                                                fileInputRef.current?.click();
                                            }}
                                            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--muted)] py-2 text-[9px] font-black text-[var(--foreground)] transition-colors hover:bg-[var(--toss-gray-2)]"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                            </svg>
                                            파일
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 면허·자격 보수교육 이수증 제출 섹션 */}
            <LicenseCESubmit user={user as { id?: string; name?: string } | null | undefined} />

            <div className="bg-blue-50 p-4 rounded-[var(--radius-xl)] border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/50">
                <h4 className="text-[13px] font-black text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                    제출 및 촬영 가이드
                </h4>
                <ul className="text-[11px] text-blue-700 dark:text-blue-300 space-y-2 font-medium list-disc ml-5">
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
        if (typeof window === 'undefined') return;
        const tabbar = document.querySelector('.mobile-bottom-tabbar') || document.querySelector('.m-bottom-tab');
        const shell = document.querySelector('.main-content-mobile-shell');

        tabbar?.classList.add('hidden');
        shell?.classList.remove('pb-[88px]');
        shell?.classList.add('pb-0');

        return () => {
            tabbar?.classList.remove('hidden');
            shell?.classList.remove('pb-0');
            shell?.classList.add('pb-[88px]');
        };
    }, []);

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
                toast("카메라 권한이 필요합니다. 모바일 브라우저 설정을 확인해 주세요.", 'warning');
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
                <span className="text-[10px] text-blue-400 font-black px-2 py-0.5 bg-blue-500/20 rounded-[var(--radius-md)] w-fit">
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
