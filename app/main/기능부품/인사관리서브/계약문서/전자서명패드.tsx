'use client';
import { useRef, useState, useEffect } from 'react';

interface SignaturePadProps {
    onSignComplete: (signatureDataUrl: string) => void;
    onCancel: () => void;
}

export default function SignaturePad({ onSignComplete, onCancel }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                // Handle High DPI displays
                const scale = window.devicePixelRatio;
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width * scale;
                canvas.height = rect.height * scale;
                ctx.scale(scale, scale);
            }
        }
    }, []);

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;

        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            setIsDrawing(true);
            setHasDrawn(true);
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        if (!isDrawing) return;
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.closePath();
        }
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasDrawn(false);
        }
    };

    const handleSave = () => {
        if (!hasDrawn) {
            alert('서명을 입력해주세요.');
            return;
        }
        const canvas = canvasRef.current;
        if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            onSignComplete(dataUrl);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-[var(--toss-border)] bg-[var(--toss-gray-1)]">
                    <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">전자 서명 (E-Signature)</h2>
                    <p className="text-sm font-medium text-[var(--toss-gray-4)] mt-1">
                        아래 네모칸 안에 본인의 서명을 마우스나 손가락으로 정자체로 그려주세요.
                    </p>
                </div>

                <div className="p-6 bg-[var(--page-bg)]">
                    <div className="border-2 border-dashed border-[var(--toss-blue)]/30 rounded-[16px] bg-white overflow-hidden relative touch-none">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-48 cursor-crosshair touch-none"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            onTouchCancel={stopDrawing}
                        />
                        {!hasDrawn && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                                <span className="text-xl font-bold text-[var(--toss-gray-4)]">여기에 서명하세요</span>
                            </div>
                        )}
                        <div className="absolute bottom-3 right-3 flex gap-2">
                            <button
                                onClick={clearCanvas}
                                className="px-3 py-1.5 bg-[var(--toss-gray-2)] text-[var(--toss-gray-5)] text-xs font-bold rounded-[8px] hover:bg-[var(--toss-gray-3)] transition-colors"
                                title="서명 지우고 다시 쓰기"
                            >
                                지우기 (Reset)
                            </button>
                        </div>
                    </div>
                    <p className="text-[11px] text-[var(--toss-gray-3)] mt-3 leading-relaxed text-center font-medium">
                        * 입력하신 서명 이미지는 암호화되어 분산 저장되며,<br />타임스탬프와 함께 법적 효력을 갖는 전자서명법에 의거하여 처리됩니다.
                    </p>
                </div>

                <div className="p-4 bg-[var(--toss-gray-1)] flex justify-end gap-3 border-t border-[var(--toss-border)]">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 text-sm font-bold text-[var(--toss-gray-4)] hover:text-[var(--foreground)] rounded-[12px] transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-[var(--toss-blue)] hover:bg-blue-600 rounded-[12px] shadow-md transition-colors"
                    >
                        서명 완료 및 계약 승인
                    </button>
                </div>
            </div>
        </div>
    );
}
