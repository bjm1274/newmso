'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface ConsultationResult {
  transcript_summary?: string;
  chief_complaint?: string;
  diagnosis?: string;
  surgery_plan?: string;
  risks_and_complications?: string[];
  patient_questions?: string[];
  doctor_answers?: string[];
  precautions?: string[];
  post_op_instructions?: string[];
  consent_required?: string[];
  medications?: string[];
  next_schedule?: string;
  special_notes?: string;
  consultation_date?: string;
}

interface SavedRecord {
  id: string;
  created_at: string;
  filename: string;
  result: ConsultationResult;
}

// ─── 섹션 설정 ─────────────────────────────────────────────────────────────────
const SECTIONS: { key: keyof ConsultationResult; label: string; icon: string; color: string; isArray?: boolean }[] = [
  { key: 'transcript_summary',      label: '상담 요약',           icon: '📋', color: 'blue',   isArray: false },
  { key: 'chief_complaint',         label: '주요 증상 / 주호소',   icon: '🩺', color: 'rose',   isArray: false },
  { key: 'diagnosis',               label: '진단명',               icon: '🔬', color: 'violet', isArray: false },
  { key: 'surgery_plan',            label: '수술 계획 및 방법',    icon: '🏥', color: 'teal',   isArray: false },
  { key: 'risks_and_complications', label: '합병증 / 위험사항',    icon: '⚠️', color: 'amber',  isArray: true  },
  { key: 'patient_questions',       label: '환자 / 보호자 질문',   icon: '❓', color: 'sky',    isArray: true  },
  { key: 'doctor_answers',          label: '의사 안내 / 답변',     icon: '💬', color: 'green',  isArray: true  },
  { key: 'precautions',             label: '수술 전 주의사항',     icon: '📌', color: 'orange', isArray: true  },
  { key: 'post_op_instructions',    label: '수술 후 주의사항',     icon: '🛡️', color: 'indigo', isArray: true  },
  { key: 'consent_required',        label: '동의 필요 항목',       icon: '✍️', color: 'pink',   isArray: true  },
  { key: 'medications',             label: '처방 / 복약 안내',     icon: '💊', color: 'cyan',   isArray: true  },
  { key: 'next_schedule',           label: '다음 예약 / 일정',     icon: '📅', color: 'lime',   isArray: false },
  { key: 'special_notes',           label: '특이사항 / 메모',      icon: '📝', color: 'slate',  isArray: false },
];

const COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-500/10 border-blue-500/20 text-blue-900',
  rose:   'bg-rose-50 border-rose-200 text-rose-900',
  violet: 'bg-violet-50 border-violet-200 text-violet-900',
  teal:   'bg-teal-50 border-teal-200 text-teal-900',
  amber:  'bg-amber-50 border-amber-200 text-amber-900',
  sky:    'bg-sky-50 border-sky-200 text-sky-900',
  green:  'bg-green-500/10 border-green-500/20 text-green-900',
  orange: 'bg-orange-500/10 border-orange-500/20 text-orange-900',
  indigo: 'bg-indigo-500/10 border-indigo-200 text-indigo-900',
  pink:   'bg-pink-500/10 border-pink-500/20 text-pink-900',
  cyan:   'bg-cyan-50 border-cyan-200 text-cyan-900',
  lime:   'bg-lime-50 border-lime-200 text-lime-900',
  slate:  'bg-[var(--muted)] border-slate-200 text-slate-900',
};

const BADGE_MAP: Record<string, string> = {
  blue:   'bg-blue-500/20 text-blue-700',
  rose:   'bg-rose-100 text-rose-700',
  violet: 'bg-violet-100 text-violet-700',
  teal:   'bg-teal-100 text-teal-700',
  amber:  'bg-amber-100 text-amber-700',
  sky:    'bg-sky-100 text-sky-700',
  green:  'bg-green-500/20 text-green-700',
  orange: 'bg-orange-500/20 text-orange-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  pink:   'bg-pink-500/20 text-pink-700',
  cyan:   'bg-cyan-100 text-cyan-700',
  lime:   'bg-lime-100 text-lime-700',
  slate:  'bg-slate-100 text-slate-700',
};

const SUPPORTED_MIME: Record<string, string> = {
  'audio/webm': 'audio/webm',
  'audio/mp4':  'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
  'audio/wav':  'audio/wav',
  'audio/ogg':  'audio/ogg',
  'video/webm': 'video/webm',
  'video/mp4':  'video/mp4',
};

const LS_KEY = 'erp_consultation_records';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function buildPlainText(result: ConsultationResult): string {
  const lines: string[] = ['[수술상담 분석 결과]', ''];
  for (const sec of SECTIONS) {
    const val = result[sec.key];
    if (!val || (Array.isArray(val) && val.length === 0)) continue;
    lines.push(`■ ${sec.label}`);
    if (Array.isArray(val)) {
      val.forEach((v, i) => lines.push(`  ${i + 1}. ${v}`));
    } else {
      lines.push(`  ${val}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function SurgeryConsultationView({ user }: { user?: any }) {
  const [tab, setTab] = useState<'record' | 'upload' | 'history'>('record');

  // 녹음 관련
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 업로드
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 분석
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ConsultationResult | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');

  // 저장 이력
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<SavedRecord | null>(null);

  // 로컬스토리지에서 이력 불러오기
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setRecords(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const saveRecord = useCallback((filename: string, res: ConsultationResult) => {
    const rec: SavedRecord = {
      id: Date.now().toString(36),
      created_at: new Date().toISOString(),
      filename,
      result: res,
    };
    setRecords((prev) => {
      const next = [rec, ...prev].slice(0, 30); // 최대 30건
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    if (selectedRecord?.id === id) setSelectedRecord(null);
  }, [selectedRecord]);

  // 타이머 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // ─── 녹음 시작 ──────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      // 브라우저 지원 코덱 선택
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start(500);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setElapsed(0);
      setAudioBlob(null);
      setAudioUrl(null);
      setResult(null);

      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') {
        toast('마이크 권한이 없습니다. 브라우저에서 마이크 접근을 허용해주세요.', 'error');
      } else {
        toast('마이크를 사용할 수 없습니다.', 'error');
      }
    }
  };

  // ─── 녹음 중지 ──────────────────────────────────────────────────────────────
  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  // ─── 파일 업로드 처리 ───────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    const baseMime = file.type.split(';')[0];
    if (!SUPPORTED_MIME[baseMime] && !file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      toast('지원하지 않는 파일 형식입니다. (mp3, mp4, wav, webm, ogg, m4a)', 'error');
      return;
    }
    setUploadFile(file);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // ─── 분석 실행 ──────────────────────────────────────────────────────────────
  const analyze = useCallback(async (blob: Blob, filename: string) => {
    setAnalyzing(true);
    setResult(null);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const mimeType = SUPPORTED_MIME[blob.type.split(';')[0]] || blob.type.split(';')[0] || 'audio/webm';

      const res = await fetch('/api/consultation/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '분석 실패');

      setResult(data.result);
      setSourceLabel(filename);
      saveRecord(filename, data.result);
      toast('상담 내용 분석이 완료되었습니다.', 'success');
    } catch (e: any) {
      toast(e.message || '분석 중 오류가 발생했습니다.', 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [saveRecord]);

  const handleAnalyzeRecord = () => {
    if (!audioBlob) return toast('먼저 음성을 녹음해주세요.', 'warning');
    analyze(audioBlob, `녹음_${new Date().toLocaleString('ko-KR').replace(/[/:]/g, '-')}.webm`);
  };

  const handleAnalyzeUpload = () => {
    if (!uploadFile) return toast('파일을 먼저 선택해주세요.', 'warning');
    analyze(uploadFile, uploadFile.name);
  };

  // ─── 결과 복사 ──────────────────────────────────────────────────────────────
  const copyResult = (res: ConsultationResult) => {
    navigator.clipboard.writeText(buildPlainText(res))
      .then(() => toast('클립보드에 복사되었습니다.', 'success'))
      .catch(() => toast('복사 실패', 'error'));
  };

  // ─── 결과 패널 ──────────────────────────────────────────────────────────────
  const ResultPanel = ({ res, label }: { res: ConsultationResult; label: string }) => (
    <div className="space-y-3 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-green-500 text-lg">✅</span>
          <span className="text-[13px] font-bold text-[var(--foreground)]">분석 완료</span>
          <span className="text-[11px] text-[var(--toss-gray-3)] font-medium truncate max-w-[200px]">{label}</span>
        </div>
        <button
          type="button"
          onClick={() => copyResult(res)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--muted)] text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--accent)] hover:text-white transition-colors"
        >
          📋 전체 복사
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map((sec) => {
          const val = res[sec.key];
          const hasValue = val && (Array.isArray(val) ? val.length > 0 : String(val).trim());
          if (!hasValue) return null;
          const colorCls = COLOR_MAP[sec.color] || COLOR_MAP.slate;
          const badgeCls = BADGE_MAP[sec.color] || BADGE_MAP.slate;
          const isFullWidth = !sec.isArray && (sec.key === 'transcript_summary' || sec.key === 'surgery_plan');
          return (
            <div
              key={sec.key}
              className={`rounded-xl border p-3.5 ${colorCls} ${isFullWidth ? 'md:col-span-2' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span>{sec.icon}</span>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${badgeCls}`}>{sec.label}</span>
              </div>
              {sec.isArray ? (
                <ul className="space-y-1.5">
                  {(val as string[]).map((item, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-relaxed">
                      <span className="shrink-0 font-bold opacity-50">{i + 1}.</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">{val as string}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-in fade-in duration-500 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-xl">🎙️</div>
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">수술상담 AI 분석</h2>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-medium mt-0.5">
            음성 녹음 또는 파일 업로드 → Gemini AI가 상담 내용을 자동 분석합니다
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[var(--muted)] rounded-xl p-1 w-fit">
        {[
          { id: 'record' as const, icon: '🎤', label: '마이크 녹음' },
          { id: 'upload' as const, icon: '📂', label: '파일 업로드' },
          { id: 'history' as const, icon: '🗂️', label: `분석 이력 ${records.length > 0 ? `(${records.length})` : ''}` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setSelectedRecord(null); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold transition-all ${
              tab === t.id
                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── 마이크 녹음 탭 ─────────────────────────────────────────────── */}
      {tab === 'record' && (
        <div className="space-y-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 flex flex-col items-center gap-5">
            {/* 녹음 시간 */}
            <div className={`text-5xl font-black font-mono tabular-nums transition-colors ${isRecording ? 'text-red-500' : 'text-[var(--toss-gray-3)]'}`}>
              {formatDuration(elapsed)}
            </div>

            {/* 파형 애니메이션 */}
            {isRecording && (
              <div className="flex items-end gap-1 h-10">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 bg-red-400 rounded-full animate-bounce"
                    style={{
                      height: `${Math.random() * 24 + 8}px`,
                      animationDelay: `${i * 0.08}s`,
                      animationDuration: '0.6s',
                    }}
                  />
                ))}
              </div>
            )}

            {/* 버튼 */}
            <div className="flex items-center gap-3">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-2 px-8 py-4 bg-red-500/100 hover:bg-red-600 text-white font-black text-sm rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-md"
                >
                  <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
                  녹음 시작
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-sm rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-md"
                >
                  <span className="w-3 h-3 bg-white rounded-sm" />
                  녹음 중지
                </button>
              )}
            </div>

            {/* 녹음 완료 미리듣기 */}
            {audioUrl && !isRecording && (
              <div className="w-full space-y-3">
                <div className="bg-[var(--muted)] rounded-xl p-3">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-2">녹음 미리듣기</p>
                  <audio controls src={audioUrl} className="w-full h-10" />
                </div>
                <button
                  type="button"
                  onClick={handleAnalyzeRecord}
                  disabled={analyzing}
                  className="w-full py-3.5 bg-[var(--accent)] hover:bg-blue-700 text-white font-black text-sm rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {analyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      AI 분석 중... (30초~1분 소요)
                    </>
                  ) : (
                    <>✨ AI로 상담 내용 분석하기</>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 결과 */}
          {result && <ResultPanel res={result} label={sourceLabel} />}
        </div>
      )}

      {/* ─── 파일 업로드 탭 ─────────────────────────────────────────────── */}
      {tab === 'upload' && (
        <div className="space-y-4">
          {/* 드래그앤드롭 영역 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
              isDragging
                ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/30'
                : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 hover:bg-[var(--muted)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4,video/webm"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
            <span className="text-4xl">🎵</span>
            <p className="text-sm font-bold text-[var(--foreground)]">
              {uploadFile ? uploadFile.name : '음성 파일을 여기에 드래그하거나 클릭해서 선택'}
            </p>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-medium">
              지원 형식: MP3, MP4, WAV, WebM, OGG, M4A · 최대 20MB
            </p>
            {uploadFile && (
              <span className="px-3 py-1 bg-green-500/20 text-green-700 text-[11px] font-bold rounded-full">
                {(uploadFile.size / (1024 * 1024)).toFixed(1)}MB 선택됨
              </span>
            )}
          </div>

          {uploadFile && (
            <button
              type="button"
              onClick={handleAnalyzeUpload}
              disabled={analyzing}
              className="w-full py-3.5 bg-[var(--accent)] hover:bg-blue-700 text-white font-black text-sm rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  AI 분석 중... (30초~1분 소요)
                </>
              ) : (
                <>✨ AI로 상담 내용 분석하기</>
              )}
            </button>
          )}

          {/* 결과 */}
          {result && <ResultPanel res={result} label={sourceLabel} />}
        </div>
      )}

      {/* ─── 이력 탭 ────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-3">
          {records.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-4xl mb-3 opacity-30">🗂️</p>
              <p className="text-sm font-bold text-[var(--toss-gray-3)]">저장된 분석 이력이 없습니다.</p>
            </div>
          ) : selectedRecord ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  ← 이력 목록으로
                </button>
                <span className="text-[11px] text-[var(--toss-gray-3)]">
                  {new Date(selectedRecord.created_at).toLocaleString('ko-KR')} · {selectedRecord.filename}
                </span>
              </div>
              <ResultPanel res={selectedRecord.result} label={selectedRecord.filename} />
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center gap-3 p-3.5 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)]/40 transition-colors group"
                >
                  <button
                    type="button"
                    className="flex-1 text-left flex items-center gap-3 min-w-0"
                    onClick={() => setSelectedRecord(rec)}
                  >
                    <span className="text-xl shrink-0">📋</span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-[var(--foreground)] truncate">{rec.filename}</p>
                      <p className="text-[10px] text-[var(--toss-gray-3)] font-medium">
                        {new Date(rec.created_at).toLocaleString('ko-KR')}
                      </p>
                      {rec.result.chief_complaint && (
                        <p className="text-[11px] text-[var(--toss-gray-4)] truncate mt-0.5">{rec.result.chief_complaint}</p>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyResult(rec.result)}
                      className="p-1.5 rounded-lg text-[var(--toss-gray-3)] hover:bg-[var(--muted)] hover:text-[var(--accent)] transition-colors text-sm"
                      title="복사"
                    >📋</button>
                    <button
                      type="button"
                      onClick={() => { if (confirm('이 기록을 삭제하시겠습니까?')) deleteRecord(rec.id); }}
                      className="p-1.5 rounded-lg text-[var(--toss-gray-3)] hover:bg-red-500/10 hover:text-red-500 transition-colors text-sm"
                      title="삭제"
                    >🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
