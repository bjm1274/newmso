'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  type HandoverRoomConfig,
  type HandoverNoteRow,
  normalizeHandoverNote,
  parseRoomConfigsFromNote,
} from '@/lib/handover-notes';
import {
  type EslBinding,
  type EslTransferProgress,
  type PatientDisplayData,
  isBleSupported,
  scanEslDevice,
  sendImageToEsl,
  clearEslScreen,
  loadBindings,
  saveBindings,
  updateBinding,
  renderPatientBitmap,
  renderPatientPreview,
} from '@/lib/esl-ble';

// ─── 타입 ───

type RoomEslState = {
  room: HandoverRoomConfig;
  binding: EslBinding | null;
  progress: EslTransferProgress | null;
};

// ─── 기본 ESL 해상도 (추후 기기 모델별 설정 가능) ───
const DEFAULT_WIDTH = 296;
const DEFAULT_HEIGHT = 128;

const ESL_RESOLUTION_KEY = 'erp-esl-resolution';

function loadResolution(): { width: number; height: number } {
  try {
    const raw = localStorage.getItem(ESL_RESOLUTION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.width > 0 && parsed.height > 0) return parsed;
    }
  } catch { /* ignore */ }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

// ─── 컴포넌트 ───

export default function EslManager({ user }: { user?: any }) {
  const [rooms, setRooms] = useState<HandoverRoomConfig[]>([]);
  const [bindings, setBindings] = useState<EslBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [bleSupported, setBleSupported] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<string, EslTransferProgress>>({});
  const [previewRoom, setPreviewRoom] = useState<string | null>(null);
  const [resolution, setResolution] = useState(loadResolution);
  const [showSettings, setShowSettings] = useState(false);
  const [editDoctor, setEditDoctor] = useState<Record<string, string>>({});
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deviceCacheRef = useRef<Map<string, any>>(new Map());

  // BLE 지원 확인 + 바인딩 로드
  useEffect(() => {
    setBleSupported(isBleSupported());
    setBindings(loadBindings());
  }, []);

  // 인계노트에서 최신 병실 구성 가져오기
  useEffect(() => {
    void loadRoomConfigs();
  }, []);

  async function loadRoomConfigs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('handover_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('인계노트 조회 실패:', error);
        return;
      }

      const notes = ((data || []) as HandoverNoteRow[]).map(normalizeHandoverNote);

      // 가장 최근 날짜의 room_config 찾기
      const latestByDate = new Map<string, { date: string; createdAt: string; rooms: HandoverRoomConfig[] }>();

      for (const note of notes) {
        if (note.handover_kind !== 'room_config' || !note.handover_date) continue;
        const parsed = parseRoomConfigsFromNote(note);
        const existing = latestByDate.get(note.handover_date);
        if (!existing || new Date(note.created_at) > new Date(existing.createdAt)) {
          latestByDate.set(note.handover_date, {
            date: note.handover_date,
            createdAt: note.created_at,
            rooms: parsed,
          });
        }
      }

      // 가장 최근 날짜의 구성을 사용
      const sortedDates = Array.from(latestByDate.keys()).sort().reverse();
      if (sortedDates.length > 0) {
        const latest = latestByDate.get(sortedDates[0]);
        if (latest) setRooms(latest.rooms);
      }
    } catch (err) {
      console.error('병실 구성 로드 오류:', err);
    } finally {
      setLoading(false);
    }
  }

  // 병실의 환자 데이터를 PatientDisplayData로 변환
  const getPatientData = useCallback((room: HandoverRoomConfig): PatientDisplayData[] => {
    return room.beds
      .filter((bed) => bed.patientName.trim())
      .map((bed) => ({
        roomNumber: room.roomNumber,
        bedNumber: bed.bedNumber,
        patientName: bed.patientName,
        age: '',
        gender: '',
        doctor: editDoctor[`${room.roomNumber}-${bed.bedNumber}`] || '',
        admissionDate: bed.admissionDate || '',
      }));
  }, [editDoctor]);

  // ESL 기기 스캔 + 바인딩
  async function handleScanDevice(roomNumber: string) {
    // Web Bluetooth 사전 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.bluetooth) {
      alert('이 브라우저에서 Web Bluetooth를 사용할 수 없습니다.\n\nChrome 주소창에 chrome://flags/#enable-web-bluetooth 를 입력하고 Enabled로 변경한 뒤 브라우저를 재시작해 주세요.');
      return;
    }

    try {
      const device = await scanEslDevice();
      deviceCacheRef.current.set(roomNumber, device);

      const nextBindings = updateBinding(bindings, roomNumber, {
        deviceId: device.id || device.name || '',
        deviceName: device.name || '알 수 없는 기기',
      });
      setBindings(nextBindings);
      saveBindings(nextBindings);
    } catch (err: any) {
      console.error('BLE 스캔 오류:', err);
      if (err.name === 'NotFoundError') {
        // 사용자가 기기 선택 팝업에서 취소함
      } else if (err.name === 'SecurityError') {
        alert('Web Bluetooth가 차단되었습니다.\nHTTPS 또는 localhost에서만 사용 가능합니다.');
      } else if (err.name === 'NotSupportedError') {
        alert('이 PC에 블루투스 어댑터가 없거나 비활성화되어 있습니다.\n\n1. PC에 블루투스가 있는지 확인\n2. Windows 설정 → 블루투스 켜기\n3. Chrome 재시작');
      } else {
        alert(`스캔 실패: ${err.name}\n${err.message}`);
      }
    }
  }

  // 바인딩 해제
  function handleUnbind(roomNumber: string) {
    const next = bindings.filter((b) => b.roomNumber !== roomNumber);
    setBindings(next);
    saveBindings(next);
    deviceCacheRef.current.delete(roomNumber);
  }

  // ESL 전송
  async function handleSendToEsl(room: HandoverRoomConfig) {
    const binding = bindings.find((b) => b.roomNumber === room.roomNumber);
    if (!binding?.deviceId) {
      alert('먼저 ESL 기기를 연결해 주세요.');
      return;
    }

    const patients = getPatientData(room);

    // 캐시된 BluetoothDevice 사용 또는 재스캔
    let device = deviceCacheRef.current.get(room.roomNumber);
    if (!device) {
      try {
        device = await scanEslDevice();
        deviceCacheRef.current.set(room.roomNumber, device);
      } catch (err: any) {
        if (err.name !== 'NotFoundError') {
          alert(`기기 연결 실패: ${err.message}`);
        }
        return;
      }
    }

    try {
      const bitmap = renderPatientBitmap(patients, resolution.width, resolution.height);

      await sendImageToEsl(device, bitmap, (progress) => {
        setProgressMap((prev) => ({ ...prev, [room.roomNumber]: progress }));
      });

      // 전송 완료 후 바인딩 업데이트
      const nextBindings = updateBinding(bindings, room.roomNumber, {
        lastUpdated: new Date().toISOString(),
      });
      setBindings(nextBindings);
      saveBindings(nextBindings);

      // 3초 후 진행 상태 제거
      setTimeout(() => {
        setProgressMap((prev) => {
          const next = { ...prev };
          delete next[room.roomNumber];
          return next;
        });
      }, 3000);
    } catch (err: any) {
      setProgressMap((prev) => ({
        ...prev,
        [room.roomNumber]: { stage: 'error', percent: 0, message: `오류: ${err.message}` },
      }));
    }
  }

  // ESL 화면 초기화
  async function handleClearEsl(room: HandoverRoomConfig) {
    let device = deviceCacheRef.current.get(room.roomNumber);
    if (!device) {
      try {
        device = await scanEslDevice();
        deviceCacheRef.current.set(room.roomNumber, device);
      } catch (err: any) {
        if (err.name !== 'NotFoundError') alert(`기기 연결 실패: ${err.message}`);
        return;
      }
    }

    try {
      await clearEslScreen(device, (progress) => {
        setProgressMap((prev) => ({ ...prev, [room.roomNumber]: progress }));
      });

      setTimeout(() => {
        setProgressMap((prev) => {
          const next = { ...prev };
          delete next[room.roomNumber];
          return next;
        });
      }, 3000);
    } catch (err: any) {
      setProgressMap((prev) => ({
        ...prev,
        [room.roomNumber]: { stage: 'error', percent: 0, message: `오류: ${err.message}` },
      }));
    }
  }

  // 미리보기 렌더링
  useEffect(() => {
    if (!previewRoom || !previewCanvasRef.current) return;
    const room = rooms.find((r) => r.roomNumber === previewRoom);
    if (!room) return;

    const patients = getPatientData(room);
    const canvas = renderPatientPreview(patients, resolution.width, resolution.height);

    const container = previewCanvasRef.current;
    container.innerHTML = '';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.border = '1px solid var(--border)';
    canvas.style.borderRadius = 'var(--radius-md)';
    canvas.style.imageRendering = 'pixelated';
    container.appendChild(canvas);
  }, [previewRoom, rooms, resolution, getPatientData]);

  // 해상도 변경
  function handleResolutionChange(w: number, h: number) {
    const next = { width: w, height: h };
    setResolution(next);
    localStorage.setItem(ESL_RESOLUTION_KEY, JSON.stringify(next));
  }

  // ─── 렌더링 ───

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
          <p className="text-xs text-[var(--toss-gray-3)]">병실 구성 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!bleSupported) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        <p className="text-lg font-bold text-[var(--foreground)]">Web Bluetooth 미지원</p>
        <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
          ESL 기기 연결을 위해 Chrome 브라우저를 사용해 주세요.
          <br />또한 PC에 블루투스 어댑터가 필요합니다.
        </p>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        <p className="text-lg font-bold text-[var(--foreground)]">병실 구성 없음</p>
        <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
          인계노트에서 병실/침대 구성을 먼저 설정해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">ESL 병실 표시 관리</h2>
          <p className="text-xs text-[var(--toss-gray-3)]">
            인계노트 병실 데이터를 ESL 기기에 전송합니다 ({rooms.length}개 병실)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
        >
          {showSettings ? '설정 닫기' : '설정'}
        </button>
      </div>

      {/* 설정 패널 */}
      {showSettings && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-bold text-[var(--foreground)]">ESL 디스플레이 해상도</h3>
          <p className="mb-3 text-xs text-[var(--toss-gray-3)]">사용 중인 ESL 기기의 해상도를 선택하세요.</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: '2.13"', w: 250, h: 122 },
              { label: '2.66"', w: 296, h: 152 },
              { label: '2.9"', w: 296, h: 128 },
              { label: '4.2"', w: 400, h: 300 },
              { label: '7.5"', w: 800, h: 480 },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => handleResolutionChange(opt.w, opt.h)}
                className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium transition-all ${
                  resolution.width === opt.w && resolution.height === opt.h
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                {opt.label} ({opt.w}x{opt.h})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 병실 목록 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => {
          const binding = bindings.find((b) => b.roomNumber === room.roomNumber) || null;
          const progress = progressMap[room.roomNumber] || null;
          const occupiedBeds = room.beds.filter((b) => b.patientName.trim());

          return (
            <div
              key={room.id}
              className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm"
            >
              {/* 병실 헤더 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[var(--foreground)]">{room.roomNumber}호</span>
                  <span className="text-[10px] text-[var(--toss-gray-3)]">
                    {occupiedBeds.length}/{room.capacity}명
                  </span>
                </div>
                {binding?.deviceId ? (
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-[10px] text-[var(--toss-gray-3)]">{binding.deviceName}</span>
                    <button
                      type="button"
                      onClick={() => handleUnbind(room.roomNumber)}
                      className="ml-1 text-[10px] text-red-400 hover:text-red-600"
                    >
                      해제
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleScanDevice(room.roomNumber)}
                    className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2 py-1 text-[10px] font-medium text-white hover:opacity-90"
                  >
                    기기 연결
                  </button>
                )}
              </div>

              {/* 환자 목록 */}
              <div className="flex flex-col gap-1">
                {room.beds.map((bed) => (
                  <div
                    key={bed.bedNumber}
                    className={`flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1 text-xs ${
                      bed.patientName.trim()
                        ? 'bg-[var(--muted)] text-[var(--foreground)]'
                        : 'text-[var(--toss-gray-3)]'
                    }`}
                  >
                    <span className="font-medium">{bed.bedNumber}번</span>
                    <span className="flex-1">{bed.patientName.trim() || '(빈 침대)'}</span>
                    {bed.patientName.trim() && (
                      <input
                        type="text"
                        placeholder="담당의"
                        value={editDoctor[`${room.roomNumber}-${bed.bedNumber}`] || ''}
                        onChange={(e) =>
                          setEditDoctor((prev) => ({
                            ...prev,
                            [`${room.roomNumber}-${bed.bedNumber}`]: e.target.value,
                          }))
                        }
                        className="w-16 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-[10px] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)]"
                      />
                    )}
                    {bed.admissionDate && (
                      <span className="text-[10px] text-[var(--toss-gray-3)]">{bed.admissionDate}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* 진행 상태 */}
              {progress && (
                <div className="flex flex-col gap-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        progress.stage === 'error' ? 'bg-red-500' : progress.stage === 'done' ? 'bg-green-500' : 'bg-[var(--accent)]'
                      }`}
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <p className={`text-[10px] ${progress.stage === 'error' ? 'text-red-500' : 'text-[var(--toss-gray-3)]'}`}>
                    {progress.message}
                  </p>
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewRoom(previewRoom === room.roomNumber ? null : room.roomNumber)}
                  className="flex-1 rounded-[var(--radius-md)] border border-[var(--border)] py-1 text-[10px] font-medium text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  {previewRoom === room.roomNumber ? '미리보기 닫기' : '미리보기'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSendToEsl(room)}
                  disabled={!binding?.deviceId || !!progress}
                  className="flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  전송
                </button>
                <button
                  type="button"
                  onClick={() => handleClearEsl(room)}
                  disabled={!binding?.deviceId || !!progress}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-50 disabled:opacity-40"
                >
                  초기화
                </button>
              </div>

              {/* 마지막 업데이트 */}
              {binding?.lastUpdated && (
                <p className="text-[10px] text-[var(--toss-gray-3)]">
                  마지막 전송: {new Date(binding.lastUpdated).toLocaleString('ko-KR')}
                </p>
              )}

              {/* 미리보기 */}
              {previewRoom === room.roomNumber && (
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-2">
                  <p className="mb-1 text-[10px] font-medium text-[var(--toss-gray-3)]">
                    ESL 미리보기 ({resolution.width}x{resolution.height})
                  </p>
                  <div ref={previewRoom === room.roomNumber ? previewCanvasRef : undefined} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
