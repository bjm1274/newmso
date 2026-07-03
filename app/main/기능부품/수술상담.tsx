'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';

import type { ConsultationResult, SavedRecord, PatientGroup } from './수술상담-types';
import { SUPPORTED_MIME, LS_KEY } from './수술상담-types';
import { formatDuration, groupByPatient, deriveKpi } from './수술상담-utils';
import { KpiGrid, ResultPanel } from './수술상담-components';

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function SurgeryConsultationView({ user }: { user?: unknown }) {
  const { dialog, openConfirm } = useActionDialog();

  // 녹음 관련
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 업로드
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 환자명 및 차트번호
  const [patientName, setPatientName] = useState('');
  const [chartNumber, setChartNumber] = useState('');

  // 분석
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<ConsultationResult | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');

  // 저장 이력
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<SavedRecord | null>(null);

  // 선택된 환자 그룹 키 (좌측 리스트에서 선택)
  const [selectedPatientKey, setSelectedPatientKey] = useState<string | null>(null);
  // 우측 입력 모드
  const [inputMode, setInputMode] = useState<'record' | 'upload'>('record');

  // ─── localStorage 로드 ──────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setRecords(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const saveRecord = useCallback((filename: string, res: ConsultationResult, name: string, chartNo: string) => {
    const rec: SavedRecord & { chartNumber?: string } = {
      id: Date.now().toString(36),
      created_at: new Date().toISOString(),
      filename,
      patientName: name.trim() || '미지정',
      chartNumber: chartNo.trim() || '미지정',
      result: res };
    setRecords((prev) => {
      const next = [rec, ...prev].slice(0, 30);
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

  // ─── 타이머 정리 ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // ─── 녹음 시작 ──────────────────────────────────────────────────────────────
  const startRecording = async () => {
    // 1. 모바일 기기 여부 판별
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // 2. PC 환경일 때만 물리 마이크 장치 탑재 여부 체크
    if (!isMobile) {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          toast('마이크 장치 탐색을 지원하지 않는 브라우저이거나 보안 연결(HTTPS) 환경이 아닙니다.', 'error');
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasMicrophone = devices.some((device) => device.kind === 'audioinput');
        if (!hasMicrophone) {
          toast('연결된 마이크 장치를 찾을 수 없습니다. PC에 마이크가 올바르게 연결되어 있는지 확인해주세요.', 'error');
          return;
        }
      } catch (err) {
        console.error('마이크 장치 탐색 실패:', err);
      }
    }

    // 3. 실제 녹음 기동
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

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
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mr.start(500);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setElapsed(0);
      setAudioBlob(null);
      setAudioUrl(null);
      setResult(null);
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err?.name === 'NotAllowedError') {
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
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 100) {
      toast('파일 크기가 너무 큽니다. 100MB 이하로 업로드해주세요.', 'error');
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

  // ─── 분석 실행 (서버 프록시 경유) ───────────────────────────────────────────
  const analyze = useCallback(async (blob: Blob, filename: string, name: string, chartNo: string) => {
    setAnalyzing(true);
    setProgress(0);
    setResult(null);
    try {
      let mimeType = SUPPORTED_MIME[blob.type.split(';')[0]] || blob.type.split(';')[0] || 'audio/webm';
      if (mimeType === 'audio/x-m4a' || mimeType === 'audio/m4a') {
        mimeType = 'audio/mp4';
      } else if (mimeType === 'audio/mp3') {
        mimeType = 'audio/mpeg';
      }

      // FormData 구성 — 서버 프록시로 전송
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('mimeType', mimeType);
      formData.append('displayName', `consultation_${Date.now()}`);

      // XHR로 업로드 진행률 추적하면서 서버 프록시 호출
      const responseData = await new Promise<{ ok: boolean; result?: any; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/consultation/analyze', true);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setProgress(percent);
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.error || '서버 분석 요청 실패'));
            }
          } catch {
            reject(new Error('서버 응답 파싱 실패'));
          }
        };

        xhr.onerror = () => reject(new Error('서버 연결 오류'));
        xhr.send(formData);
      });

      if (!responseData.ok || !responseData.result) {
        throw new Error(responseData.error || '분석 결과를 받지 못했습니다.');
      }

      setResult(responseData.result);
      setSourceLabel(filename);
      saveRecord(filename, responseData.result, name, chartNo);
      toast('상담 내용 분석이 완료되었습니다.', 'success');

    } catch (e: unknown) {
      const err = e as { message?: string };
      toast(err.message || '분석 중 오류가 발생했습니다.', 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [saveRecord]);

  /** YYYYMMDD_HHMM 형식 타임스탬프 */
  const buildTimestamp = () => {
    const now = new Date();
    const ymd = formatKoreanDateKey(now).replace(/-/g, '');
    const hm = now.toTimeString().slice(0, 5).replace(':', '');
    return `${ymd}_${hm}`;
  };

  const handleAnalyzeRecord = () => {
    if (!audioBlob) return toast('먼저 음성을 녹음해주세요.', 'warning');
    const nameLabel = patientName.trim() || '미지정';
    const filename = `상담_${nameLabel}_${buildTimestamp()}.webm`;
    analyze(audioBlob, filename, patientName, chartNumber);
  };

  const handleAnalyzeUpload = () => {
    if (!uploadFile) return toast('파일을 먼저 선택해주세요.', 'warning');
    analyze(uploadFile, uploadFile.name, patientName, chartNumber);
  };

  // ─── "새 상담" 초기화 ────────────────────────────────────────────────────────
  const handleNewConsult = () => {
    setSelectedPatientKey('__new__');
    setSelectedRecord(null);
    setResult(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setUploadFile(null);
    setElapsed(0);
    setInputMode('record');
    setPatientName('');
    setChartNumber('');
  };

  // ─── 파생 데이터 ─────────────────────────────────────────────────────────────
  const patientGroups = groupByPatient(records);
  const kpi = deriveKpi(records);
  const selectedGroup: PatientGroup | undefined = selectedPatientKey
    ? patientGroups.find((g) => g.key === selectedPatientKey)
    : undefined;
  const displayResult = selectedRecord ? selectedRecord.result : result;
  const displayLabel = selectedRecord ? selectedRecord.filename : sourceLabel;

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-in fade-in duration-500" data-testid="surgery-consultation-view">
      {dialog}

      {/* ── KPI 4개 ── */}
      <KpiGrid kpi={kpi} />

      {/* ── 2-col split 레이아웃 ── */}
      <div className="flex gap-4 min-h-[560px]" data-testid="split-layout">

        {/* ── 좌측: 환자 리스트 ── */}
        <aside className="w-[220px] shrink-0 flex flex-col gap-2" data-testid="patient-list-panel">
          <div className="flex items-center px-0.5 mb-1">
            <span className="text-[11px] font-black text-[var(--toss-gray-3)] uppercase tracking-wide">
              상담 이력 ({patientGroups.length})
            </span>
          </div>

          {/* 새 상담 버튼 */}
          <button
            type="button"
            onClick={handleNewConsult}
            className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--accent)]/40 bg-[var(--accent)]/5 hover:bg-[var(--accent)]/10 text-[12px] font-bold text-[var(--accent)] transition-colors w-full"
            data-testid="new-consult-btn"
          >
            <span className="text-base leading-none">＋</span>
            <span>새 상담</span>
          </button>

          {/* 환자 목록 */}
          {patientGroups.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-2xl mb-1 opacity-20">🗂️</p>
              <p className="text-[11px] text-[var(--toss-gray-3)]">이력 없음</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 overflow-y-auto">
              {patientGroups.map((group) => {
                const isActive = selectedPatientKey === group.key;
                const latestDate = new Date(group.latestAt).toLocaleDateString('ko-KR', {
                  timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' });
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => {
                      setSelectedPatientKey(group.key);
                      setSelectedRecord(group.records[0]);
                      setResult(null);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-md)] border transition-colors ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent)]/8 text-[var(--foreground)]'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/30 text-[var(--foreground)]'
                    }`}
                    data-testid={`patient-row-${group.key}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[12px] font-bold leading-snug truncate flex-1">{group.key}</span>
                      {group.hasConsent ? (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--success,#16a34a)]/15 text-[var(--success,#16a34a)] font-bold">
                          동의
                        </span>
                      ) : (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--warning,#d97706)]/15 text-[var(--warning,#d97706)] font-bold">
                          미확인
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-[var(--toss-gray-3)]">{latestDate}</span>
                      {group.records.length > 1 && (
                        <span className="text-[9px] text-[var(--toss-gray-3)]">{group.records.length}건</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* ── 우측: 상담 상세 ── */}
        <section
          className="flex-1 min-w-0 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] flex flex-col overflow-hidden"
          data-testid="detail-panel"
        >
          {/* 헤더 */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
            {selectedPatientKey && selectedPatientKey !== '__new__' ? (
              <>
                <span className="text-[13px] font-black text-[var(--foreground)] truncate">
                  {selectedPatientKey}
                </span>
                {selectedGroup && (
                  <span className="text-[10px] text-[var(--toss-gray-3)] shrink-0">
                    {selectedGroup.records.length}건의 상담
                  </span>
                )}
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={handleNewConsult}
                    className="px-2.5 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold bg-[var(--accent)] text-white hover:bg-blue-700 transition-colors"
                    data-testid="new-consult-from-detail-btn"
                  >
                    ＋ 새 상담
                  </button>
                </div>
              </>
            ) : (
              <span className="text-[13px] font-bold text-[var(--toss-gray-3)]">새 상담 입력</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* A. 초기 빈 상태 (아무것도 선택 안 함) */}
            {selectedPatientKey === null && (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-center">
                <span className="text-5xl opacity-20">🎤</span>
                {records.length === 0 ? (
                  <>
                    <p className="text-sm font-bold text-[var(--toss-gray-3)]">
                      좌측 &quot;새 상담&quot;을 눌러 음성을 녹음하거나
                    </p>
                    <p className="text-sm text-[var(--toss-gray-3)]">파일을 업로드해 AI 분석을 시작하세요.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-[var(--toss-gray-3)]">
                      상담 이력에서 환자를 선택하거나
                    </p>
                    <p className="text-sm text-[var(--toss-gray-3)]">좌측 상단의 &quot;새 상담&quot; 버튼을 눌러 새로운 상담을 시작하세요.</p>
                  </>
                )}
              </div>
            )}

            {/* B. 환자 선택됨: 이력 목록 */}
            {selectedPatientKey && selectedPatientKey !== '__new__' && selectedGroup && !selectedRecord && (
              <div className="space-y-2" data-testid="patient-history-list">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">상담 이력</p>
                {selectedGroup.records.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center gap-3 p-3 bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-md)] hover:border-[var(--accent)]/40 transition-colors"
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
                          {new Date(rec.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                        </p>
                        {rec.result.chief_complaint && (
                          <p className="text-[11px] text-[var(--toss-gray-4)] truncate mt-0.5">{rec.result.chief_complaint}</p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(rec.result))
                            .then(() => toast('복사되었습니다.', 'success'))
                            .catch(() => toast('복사 실패', 'error'));
                        }}
                        className="p-1.5 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] hover:text-[var(--accent)] transition-colors text-sm"
                        title="복사"
                        data-testid={`copy-rec-${rec.id}`}
                      >📋</button>
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmed = await openConfirm({
                            title: '수술상담 기록 삭제',
                            description: '선택한 수술상담 기록을 삭제합니다.\n녹취 요약과 분석 결과가 함께 제거됩니다.',
                            confirmText: '삭제',
                            tone: 'danger' });
                          if (confirmed) deleteRecord(rec.id);
                        }}
                        className="p-1.5 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-red-500/10 hover:text-red-500 transition-colors text-sm"
                        title="삭제"
                        data-testid={`delete-rec-${rec.id}`}
                      >🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 이력 상세 결과 보기 */}
            {selectedRecord && displayResult && (
              <div className="space-y-3" data-testid="record-detail-view">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(null)}
                    className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                    data-testid="back-to-history-btn"
                  >
                    ← 이력 목록으로
                  </button>
                  <span className="text-[11px] text-[var(--toss-gray-3)]">
                    {new Date(selectedRecord.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {selectedRecord.filename}
                  </span>
                </div>
                <ResultPanel res={displayResult} label={displayLabel} />
              </div>
            )}

            {/* 새 상담 입력 영역 */}
            {selectedPatientKey === '__new__' && !selectedRecord && (
              <div className="space-y-4" data-testid="new-consult-panel">

                {/* 환자명 및 차트번호 입력 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="patient-info-fields">
                  {/* 환자명 */}
                  <div className="space-y-1">
                    <label
                      htmlFor="patient-name-input"
                      className="block text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide"
                    >
                      환자명
                    </label>
                    <input
                      id="patient-name-input"
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="홍길동 (비워두면 미지정으로 저장)"
                      maxLength={30}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[13px] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)] transition-colors"
                      data-testid="patient-name-input"
                    />
                  </div>

                  {/* 차트번호 */}
                  <div className="space-y-1">
                    <label
                      htmlFor="chart-number-input"
                      className="block text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide"
                    >
                      차트번호
                    </label>
                    <input
                      id="chart-number-input"
                      type="text"
                      value={chartNumber}
                      onChange={(e) => setChartNumber(e.target.value)}
                      placeholder="차트번호 입력 (예: 123456)"
                      maxLength={20}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[13px] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)] transition-colors"
                      data-testid="chart-number-input"
                    />
                  </div>
                </div>
                {!patientName.trim() && !chartNumber.trim() && (
                  <p className="text-[10px] text-[var(--toss-gray-3)]" role="note">
                    환자명과 차트번호를 입력하면 상담 이력을 체계적으로 관리하고 환자별로 묶어 볼 수 있습니다.
                  </p>
                )}

                {/* 입력 모드 탭 */}
                <div className="flex gap-1 bg-[var(--muted)] rounded-[var(--radius-lg)] p-1 w-fit">
                  {([
                    { id: 'record' as const, icon: '🎤', label: '마이크 녹음' },
                    { id: 'upload' as const, icon: '📂', label: '파일 업로드' },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInputMode(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] text-[12px] font-bold transition-all ${
                        inputMode === t.id
                          ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                          : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
                      }`}
                      data-testid={`input-mode-tab-${t.id}`}
                    >
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* 마이크 녹음 패널 */}
                {inputMode === 'record' && (
                  <div
                    className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5 flex flex-col items-center gap-4"
                    data-testid="record-panel"
                  >
                    <div className={`text-5xl font-black font-mono tabular-nums transition-colors ${isRecording ? 'text-red-500' : 'text-[var(--toss-gray-3)]'}`}>
                      {formatDuration(elapsed)}
                    </div>

                    {isRecording && (
                      <div className="flex items-end gap-1 h-10" data-testid="waveform">
                        {[...Array(12)].map((_, i) => (
                          <div
                            key={i}
                            className="w-1.5 bg-red-400 rounded-full animate-bounce"
                            style={{
                              height: `${Math.random() * 24 + 8}px`,
                              animationDelay: `${i * 0.08}s`,
                              animationDuration: '0.6s' }}
                          />
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      {!isRecording ? (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="flex items-center gap-2 px-8 py-4 bg-red-500 hover:bg-red-600 text-white font-black text-sm rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-md"
                          data-testid="start-recording-btn"
                        >
                          <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
                          녹음 시작
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="flex items-center gap-2 px-8 py-4 bg-[var(--foreground)] hover:opacity-90 text-[var(--card)] font-black text-sm rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-md"
                          data-testid="stop-recording-btn"
                        >
                          <span className="w-3 h-3 bg-white rounded-sm" />
                          녹음 중지
                        </button>
                      )}
                    </div>

                    {audioUrl && !isRecording && (
                      <div className="w-full space-y-3" data-testid="audio-preview">
                        <div className="bg-[var(--card)] rounded-[var(--radius-md)] p-3">
                          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-2">녹음 미리듣기</p>
                          <audio controls src={audioUrl} className="w-full h-10" />
                        </div>
                        <button
                          type="button"
                          onClick={handleAnalyzeRecord}
                          disabled={analyzing}
                          className="w-full py-3.5 bg-[var(--accent)] hover:bg-blue-700 text-white font-black text-sm rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          data-testid="analyze-record-btn"
                        >
                          {analyzing ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              {progress < 100 ? (
                                `음성 업로드 중... (${progress}%)`
                              ) : (
                                '업로드 완료, AI 분석 중...'
                              )}
                            </>
                          ) : (
                            <>✨ AI로 상담 내용 분석하기</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 파일 업로드 패널 */}
                {inputMode === 'upload' && (
                  <div className="space-y-3" data-testid="upload-panel">
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-[var(--radius-lg)] p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                        isDragging
                          ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                          : 'border-[var(--border)] bg-[var(--muted)] hover:border-[var(--accent)]/50 hover:bg-[var(--card)]'
                      }`}
                      data-testid="drop-zone"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*,video/mp4,video/webm"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                      />
                      <span className="text-4xl">🎵</span>
                      <p className="text-sm font-bold text-[var(--foreground)] text-center">
                        {uploadFile ? uploadFile.name : '음성 파일을 드래그하거나 클릭해서 선택'}
                      </p>
                      <p className="text-[11px] text-[var(--toss-gray-3)] font-medium">
                        지원 형식: MP3, MP4, WAV, WebM, OGG, M4A · 최대 100MB
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
                        data-testid="analyze-upload-btn"
                      >
                        {analyzing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            {progress < 100 ? (
                              `음성 업로드 중... (${progress}%)`
                            ) : (
                              '업로드 완료, AI 분석 중...'
                            )}
                          </>
                        ) : (
                          <>✨ AI로 상담 내용 분석하기</>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* 새 분석 직후 결과 */}
                {result && !selectedRecord && (
                  <ResultPanel res={result} label={sourceLabel} />
                )}
              </div>
            )}

          </div>
        </section>
      </div>
    </div>
  );
}
