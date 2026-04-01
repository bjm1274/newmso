'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  normalizeHandoverNote,
  parseRoomConfigsFromNote,
  type HandoverNoteRow,
  type HandoverRoomConfig,
} from '@/lib/handover-notes';
import type { StaffMember } from '@/types';
type RoomBoardPatientSlot = {
  bedNumber: number;
  patientName: string;
  age: string;
  gender: string;
};
type RoomBoardDraft = {
  roomNumber: string;
  deviceId: string;
  updatedAt: string | null;
  patientSlots: RoomBoardPatientSlot[];
};
type HandoverSnapshot = { dateKey: string; createdAt: string | null; rooms: HandoverRoomConfig[] };
type ScannerControlsLike = { stop: () => void };
type Props = { user?: StaffMember | null; selectedCo?: string | null; selectedCompanyId?: string | null };
type MobileBleTaskAttempt = {
  label: string;
  query: string;
  ok: boolean;
  upstream: unknown;
};
type BoundBleDeviceSummary = {
  id?: number | null;
  eslCode?: string;
  productCode?: string;
  templateId?: number | null;
  typeCode?: string;
  deviceArea?: number | null;
  actionFrom?: string;
  pid?: string;
  eslVersion?: string;
};
type MobileBlePreflightResult = {
  ok: boolean;
  normalizedBaseUrl?: string;
  deviceId?: string;
  license?: unknown;
  trigger?: unknown;
  bleQuery?: unknown;
  deviceLookup?: unknown;
  boundDevice?: BoundBleDeviceSummary | null;
  waitingCount?: number | null;
  errorTaskCount?: number | null;
  queryBleCount?: number;
  taskList?: unknown;
  taskState?: 'ready' | 'idle' | 'missing' | 'unknown';
  statusSummary?: string;
  taskReady?: boolean;
  task?: unknown;
  taskAttempts?: MobileBleTaskAttempt[];
  browserBle?: {
    primaryServiceUuid?: string;
    characteristicUuids?: string[];
  };
  error?: string;
};

const ROOM_DRAFT_STORAGE_KEY = 'erp-zhsunyco-room-board-drafts';
const MOBILE_USERNAME_STORAGE_KEY = 'erp-zhsunyco-mobile-user-name';
const CAMERA_BARCODE_HINT = '카메라를 바코드에 가까이 대고 잠시 멈추면 자동 등록됩니다.';
const ROOM_BOARD_PREVIEW_SLOT_COUNT = 4;
const ZHSUNYCO_MOBILE_BASE_URL = 'http://www.zhsunyco.com.cn';

function compareDateKeys(left?: string | null, right?: string | null) {
  return String(left || '').localeCompare(String(right || ''), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function buildRoomDraft(room: HandoverRoomConfig, previous?: RoomBoardDraft | null): RoomBoardDraft {
  const previousSlots = new Map((previous?.patientSlots || []).map((slot) => [slot.bedNumber, slot]));
  return {
    roomNumber: room.roomNumber,
    deviceId: previous?.deviceId || '',
    updatedAt: previous?.updatedAt || null,
    patientSlots: room.beds.map((bed) => {
      const existing = previousSlots.get(bed.bedNumber);
      return {
        bedNumber: bed.bedNumber,
        patientName: String(bed.patientName || '').trim(),
        age: existing?.age || '',
        gender: existing?.gender || '',
      };
    }),
  };
}

function buildRoomSummaryText(draft: RoomBoardDraft) {
  const lines = [
    '[병실 안내판 전송 메모]',
    `병실: ${draft.roomNumber}호`,
    `기기 바코드: ${draft.deviceId || '-'}`,
    '',
    ...draft.patientSlots.map((slot) => {
      const parts = [
        `${slot.bedNumber}번`,
        slot.patientName || '미기입',
        slot.age ? `나이 ${slot.age}` : '',
        slot.gender ? `성별 ${slot.gender}` : '',
      ].filter(Boolean);
      return `- ${parts.join(' / ')}`;
    }),
  ];
  return lines.filter(Boolean).join('\n');
}

function buildRoomJson(draft: RoomBoardDraft) {
  return JSON.stringify(
    {
      roomNumber: draft.roomNumber,
      deviceId: draft.deviceId,
      updatedAt: draft.updatedAt,
      patients: draft.patientSlots,
    },
    null,
    2,
  );
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, 'success');
  } catch {
    toast('클립보드 복사에 실패했습니다.', 'error');
  }
}

function getBoardPreviewSlots(draft: RoomBoardDraft) {
  const normalized = Array.from({ length: ROOM_BOARD_PREVIEW_SLOT_COUNT }, (_, index) => {
    const slot = draft.patientSlots[index];
    return {
      bedNumber: slot?.bedNumber ?? index + 1,
      patientName: String(slot?.patientName || '').trim(),
      age: String(slot?.age || '').trim(),
      gender: String(slot?.gender || '').trim(),
    };
  });

  return normalized;
}

function formatPreviewPatientMeta(slot: RoomBoardPatientSlot) {
  const values = [slot.age ? `${slot.age}세` : '', slot.gender].filter(Boolean);
  return values.length > 0 ? values.join(' / ') : '나이 · 성별 미입력';
}

function stringifyDiagnosticValue(value: unknown) {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractDiagnosticMessage(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const error = typeof record.error === 'string' ? record.error : '';
    const message = typeof record.message === 'string' ? record.message : '';
    if (error) return error;
    if (message) return message;
    if (record.error_code === 0) return '정상';
  }
  return '응답 확인 필요';
}

function RoomBoardPreview({ draft }: { draft: RoomBoardDraft }) {
  const slots = getBoardPreviewSlots(draft);

  return (
    <div className="overflow-hidden rounded-[28px] border-[10px] border-neutral-200 bg-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_48px_rgba(15,23,42,0.12)]">
      <div className="aspect-[5/3] bg-neutral-50 text-neutral-900">
        <div className="grid h-full grid-rows-[auto_1fr]">
          <div className="flex items-center justify-between border-b border-neutral-300 bg-neutral-200 px-5 py-3">
            <div className="text-2xl font-black tracking-tight">{draft.roomNumber}호</div>
            <div className="text-sm font-semibold text-neutral-600">입원환자 정보</div>
          </div>

          <div className="grid h-full grid-cols-2 grid-rows-2">
            {slots.map((slot, index) => {
              const borderClass = [
                index % 2 === 0 ? 'border-r' : '',
                index < 2 ? 'border-b' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={`${draft.roomNumber}-${slot.bedNumber}-${index}`}
                  className={`flex flex-col justify-between border-neutral-300 p-4 ${borderClass}`}
                >
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.16em] text-neutral-500">{slot.bedNumber}번 환자</div>
                    <div className="mt-3 text-3xl font-black tracking-tight text-neutral-900">
                      {slot.patientName || '공란'}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    <div className="rounded-2xl border border-neutral-300 bg-white px-3 py-2">
                      <div className="text-[10px] font-bold tracking-[0.14em] text-neutral-500">나이 / 성별</div>
                      <div className="mt-1 text-base font-semibold text-neutral-800">{formatPreviewPatientMeta(slot)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ZhsunycoEslSync(_props: Props) {
  const permissionMap = (_props.user?.permissions as Record<string, unknown> | undefined) || undefined;
  const canManageDeviceRegistration = Boolean(_props.user?.role === 'admin' || permissionMap?.admin === true || permissionMap?.mso === true);
  const [rooms, setRooms] = useState<HandoverRoomConfig[]>([]);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomBoardDraft>>({});
  const [selectedRoomNumber, setSelectedRoomNumber] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [deviceRegistrationOpen, setDeviceRegistrationOpen] = useState(false);
  const [deviceRegistrationValue, setDeviceRegistrationValue] = useState('');
  const [cameraScanOpen, setCameraScanOpen] = useState(false);
  const [cameraScanBusy, setCameraScanBusy] = useState(false);
  const [cameraScanStatus, setCameraScanStatus] = useState(CAMERA_BARCODE_HINT);
  const [previewRoomNumber, setPreviewRoomNumber] = useState('');
  const [mobileUserName, setMobileUserName] = useState('');
  const [mobilePassword, setMobilePassword] = useState('');
  const [mobileBleChecking, setMobileBleChecking] = useState(false);
  const [mobileBlePreflight, setMobileBlePreflight] = useState<MobileBlePreflightResult | null>(null);
  const deviceRegistrationInputRef = useRef<HTMLInputElement | null>(null);
  const deviceRegistrationVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraScanControlsRef = useRef<ScannerControlsLike | null>(null);

  useEffect(() => {
    try {
      const rawDrafts = localStorage.getItem(ROOM_DRAFT_STORAGE_KEY);
      if (rawDrafts) {
        setRoomDrafts(JSON.parse(rawDrafts) as Record<string, RoomBoardDraft>);
      }

      const savedMobileUserName = localStorage.getItem(MOBILE_USERNAME_STORAGE_KEY);
      if (savedMobileUserName) {
        setMobileUserName(savedMobileUserName);
      }
    } catch {
      // ignore local storage failures
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ROOM_DRAFT_STORAGE_KEY, JSON.stringify(roomDrafts));
    } catch {
      // ignore local storage failures
    }
  }, [roomDrafts]);

  useEffect(() => {
    try {
      const nextValue = mobileUserName.trim();
      if (nextValue) {
        localStorage.setItem(MOBILE_USERNAME_STORAGE_KEY, nextValue);
      } else {
        localStorage.removeItem(MOBILE_USERNAME_STORAGE_KEY);
      }
    } catch {
      // ignore local storage failures
    }
  }, [mobileUserName]);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const { data, error } = await supabase.from('handover_notes').select('*').order('created_at', { ascending: false }).limit(1500);
      if (error) throw error;

      const notes = ((data || []) as HandoverNoteRow[]).map(normalizeHandoverNote);
      const latestByDate = new Map<string, HandoverSnapshot>();
      notes.forEach((note) => {
        if (note.handover_kind !== 'room_config' || !note.handover_date) return;
        const snapshot: HandoverSnapshot = {
          dateKey: note.handover_date,
          createdAt: note.created_at || null,
          rooms: parseRoomConfigsFromNote(note),
        };
        const current = latestByDate.get(note.handover_date);
        const currentTime = current ? new Date(current.createdAt || 0).getTime() : -1;
        const nextTime = new Date(note.created_at || 0).getTime();
        if (!current || nextTime >= currentTime) latestByDate.set(note.handover_date, snapshot);
      });

      const matched = Array.from(latestByDate.values())
        .sort((left, right) => compareDateKeys(right.dateKey, left.dateKey))[0];

      const nextRooms = matched?.rooms || [];
      setRooms(nextRooms);
      setRoomDrafts((prev) => {
        const next: Record<string, RoomBoardDraft> = {};
        nextRooms.forEach((room) => {
          next[room.roomNumber] = buildRoomDraft(room, prev[room.roomNumber]);
        });
        return next;
      });
    } catch (error) {
      console.error('Failed to load handover room configs:', error);
      setRooms([]);
      toast('병실 설정을 불러오지 못했습니다.', 'error');
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!selectedRoomNumber && rooms.length > 0) {
      setSelectedRoomNumber(rooms[0].roomNumber);
    } else if (selectedRoomNumber && !rooms.some((room) => room.roomNumber === selectedRoomNumber)) {
      setSelectedRoomNumber(rooms[0]?.roomNumber || '');
    }
  }, [rooms, selectedRoomNumber]);

  useEffect(() => {
    if (!deviceRegistrationOpen) return;
    const timer = window.setTimeout(() => {
      deviceRegistrationInputRef.current?.focus();
      deviceRegistrationInputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [deviceRegistrationOpen]);

  useEffect(() => {
    return () => {
      cameraScanControlsRef.current?.stop();
      cameraScanControlsRef.current = null;
    };
  }, []);

  const selectedRoom = useMemo(() => rooms.find((room) => room.roomNumber === selectedRoomNumber) || null, [rooms, selectedRoomNumber]);
  const selectedDraft = useMemo(() => (selectedRoomNumber ? roomDrafts[selectedRoomNumber] || null : null), [roomDrafts, selectedRoomNumber]);
  const previewDraft = useMemo(() => (previewRoomNumber ? roomDrafts[previewRoomNumber] || null : null), [previewRoomNumber, roomDrafts]);
  const preparedRooms = useMemo(
    () => rooms.map((room) => roomDrafts[room.roomNumber]).filter((draft): draft is RoomBoardDraft => Boolean(draft)).filter((draft) => Boolean(draft.updatedAt)),
    [roomDrafts, rooms],
  );

  const updateSelectedDraft = useCallback((updater: (draft: RoomBoardDraft) => RoomBoardDraft) => {
    if (!selectedRoomNumber) return;
    setRoomDrafts((prev) => {
      const current = prev[selectedRoomNumber];
      if (!current) return prev;
      return { ...prev, [selectedRoomNumber]: updater(current) };
    });
  }, [selectedRoomNumber]);

  const updateSelectedPatientSlot = useCallback((index: number, patch: Partial<RoomBoardPatientSlot>) => {
    updateSelectedDraft((draft) => ({
      ...draft,
      patientSlots: draft.patientSlots.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)),
    }));
  }, [updateSelectedDraft]);

  const resetSelectedRoomFromSource = useCallback(() => {
    if (!selectedRoom) return;
    setRoomDrafts((prev) => ({
      ...prev,
      [selectedRoom.roomNumber]: buildRoomDraft(selectedRoom, prev[selectedRoom.roomNumber]),
    }));
    toast('인계노트 기준 환자 정보를 다시 채웠습니다.', 'success');
  }, [selectedRoom]);

  const stopCameraBarcodeScan = useCallback(() => {
    cameraScanControlsRef.current?.stop();
    cameraScanControlsRef.current = null;

    const video = deviceRegistrationVideoRef.current;
    const stream = video?.srcObject;
    if (stream && 'getTracks' in stream) {
      (stream as MediaStream).getTracks().forEach((track) => track.stop());
    }
    if (video) {
      video.srcObject = null;
    }

    setCameraScanOpen(false);
    setCameraScanBusy(false);
    setCameraScanStatus(CAMERA_BARCODE_HINT);
  }, []);

  const closeDeviceRegistration = useCallback(() => {
    stopCameraBarcodeScan();
    setDeviceRegistrationOpen(false);
    setDeviceRegistrationValue('');
  }, [stopCameraBarcodeScan]);

  const saveSelectedRoomDevice = useCallback((deviceCode: string) => {
    if (!selectedDraft) return false;
    if (!canManageDeviceRegistration) {
      toast('기기 바코드는 관리자만 등록할 수 있습니다.', 'error');
      return false;
    }

    const nextValue = deviceCode.trim();
    if (!nextValue) {
      toast('기기 바코드를 스캔하거나 입력해 주세요.', 'error');
      return false;
    }

    updateSelectedDraft((draft) => ({ ...draft, deviceId: nextValue }));
    closeDeviceRegistration();
    toast(`${selectedDraft.roomNumber}호 기기 바코드를 등록했습니다.`, 'success');
    return true;
  }, [canManageDeviceRegistration, closeDeviceRegistration, selectedDraft, updateSelectedDraft]);

  const submitSelectedRoomDeviceRegistration = useCallback(() => {
    void saveSelectedRoomDevice(deviceRegistrationValue);
  }, [deviceRegistrationValue, saveSelectedRoomDevice]);

  const startCameraBarcodeScan = useCallback(async () => {
    if (!selectedDraft) return;
    if (!canManageDeviceRegistration) {
      toast('기기 바코드는 관리자만 등록할 수 있습니다.', 'error');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('이 브라우저는 카메라 스캔을 지원하지 않습니다.', 'error');
      return;
    }
    stopCameraBarcodeScan();
    setCameraScanOpen(true);
    setCameraScanBusy(true);
    setCameraScanStatus('카메라 여는 중...');

    try {
      const previewElement = deviceRegistrationVideoRef.current;
      if (!previewElement) {
        throw new Error('preview-not-ready');
      }

      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.CODABAR,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ];

      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        previewElement,
        (result, error, nextControls) => {
          cameraScanControlsRef.current = nextControls;
          if (result) {
            const scannedText = String(result.getText() || '').trim();
            if (!scannedText) return;
            nextControls.stop();
            cameraScanControlsRef.current = null;
            setDeviceRegistrationValue(scannedText);
            setCameraScanStatus(`인식 완료: ${scannedText}`);
            saveSelectedRoomDevice(scannedText);
            return;
          }

          const errorName = String((error as { name?: string } | undefined)?.name || '');
          if (errorName && errorName !== 'NotFoundException' && errorName !== 'ChecksumException' && errorName !== 'FormatException') {
            setCameraScanStatus('바코드 인식 중 오류가 발생했습니다. 다시 시도해 주세요.');
          }
        }
      );

      cameraScanControlsRef.current = controls;
      setCameraScanStatus(CAMERA_BARCODE_HINT);
    } catch (error) {
      console.error('Failed to start barcode camera scan:', error);
      stopCameraBarcodeScan();
      const message =
        error instanceof Error && error.message === 'preview-not-ready'
          ? '카메라 화면을 준비하는 중입니다. 다시 한 번 눌러 주세요.'
          : '카메라 권한을 허용한 뒤 다시 시도해 주세요.';
      toast(message, 'error');
      setCameraScanStatus(message);
    } finally {
      setCameraScanBusy(false);
    }
  }, [canManageDeviceRegistration, saveSelectedRoomDevice, selectedDraft, stopCameraBarcodeScan]);

  const registerSelectedRoomDevice = useCallback(() => {
    if (!selectedDraft) return;
    if (!canManageDeviceRegistration) {
      toast('기기 바코드는 관리자만 등록할 수 있습니다.', 'error');
      return;
    }

    const suggestedValue = String(selectedDraft.deviceId || '').trim();
    setDeviceRegistrationValue(suggestedValue);
    setDeviceRegistrationOpen(true);
  }, [canManageDeviceRegistration, selectedDraft]);

  const clearSelectedRoomDevice = useCallback(() => {
    if (!selectedDraft) return;
    if (!canManageDeviceRegistration) {
      toast('기기 바코드는 관리자만 삭제할 수 있습니다.', 'error');
      return;
    }
    if (!selectedDraft.deviceId.trim()) return;
    if (!window.confirm(`${selectedDraft.roomNumber}호에 등록된 기기 바코드를 삭제할까요?`)) return;

    updateSelectedDraft((draft) => ({ ...draft, deviceId: '' }));
    toast(`${selectedDraft.roomNumber}호 기기 바코드를 삭제했습니다.`, 'success');
  }, [canManageDeviceRegistration, selectedDraft, updateSelectedDraft]);

  const markSelectedRoomPrepared = useCallback(() => {
    if (!selectedDraft) return;
    if (!selectedDraft.deviceId.trim()) {
      toast('기기 바코드를 먼저 등록해 주세요.', 'error');
      return;
    }
    updateSelectedDraft((draft) => ({ ...draft, updatedAt: new Date().toISOString() }));
    toast('전송 준비 목록에 올렸습니다.', 'success');
  }, [selectedDraft, updateSelectedDraft]);

  const clearPreparedState = useCallback((roomNumber: string) => {
    setRoomDrafts((prev) => {
      const current = prev[roomNumber];
      if (!current) return prev;
      return {
        ...prev,
        [roomNumber]: {
          ...current,
          updatedAt: null,
        },
      };
    });
    toast(`${roomNumber}호 전송 준비를 해제했습니다.`, 'success');
  }, []);

  const openPreview = useCallback((roomNumber?: string) => {
    const nextRoomNumber = String(roomNumber || selectedRoomNumber || '').trim();
    if (!nextRoomNumber) return;
    setPreviewRoomNumber(nextRoomNumber);
    setMobileBlePreflight(null);
  }, [selectedRoomNumber]);

  const closePreview = useCallback(() => {
    setPreviewRoomNumber('');
    setMobileBlePreflight(null);
  }, []);

  const runMobileBlePreflight = useCallback(async (draft: RoomBoardDraft) => {
    if (!draft.deviceId.trim()) {
      toast('기기 바코드를 먼저 등록해 주세요.', 'error');
      return;
    }

    if (!mobileUserName.trim() || !mobilePassword.trim()) {
      toast('제조사 모바일 계정과 비밀번호를 입력해 주세요.', 'error');
      return;
    }

    setMobileBleChecking(true);
    setMobileBlePreflight(null);

    try {
      const response = await fetch('/api/esl/zhsunyco', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'mobileBlePreflight',
          config: {
            baseUrl: ZHSUNYCO_MOBILE_BASE_URL,
            userName: mobileUserName.trim(),
            password: mobilePassword,
          },
          payload: {
            deviceId: draft.deviceId.trim(),
          },
        }),
      });

      const parsed = (await response.json().catch(() => null)) as MobileBlePreflightResult | null;
      if (!response.ok || !parsed?.ok) {
        const errorMessage = parsed?.error || '제조사 전송 상태를 확인하지 못했습니다.';
        throw new Error(errorMessage);
      }

      setMobileBlePreflight(parsed);

      if (parsed.taskReady) {
        toast('제조사 서버에서 BLE 작업을 확인했습니다.', 'success');
      } else if (parsed.boundDevice?.eslCode) {
        toast('제조사 서버에는 등록된 기기지만 현재 대기 BLE 작업은 없습니다.', 'error');
      } else {
        toast('제조사 서버에서 이 기기 바코드를 찾지 못했습니다.', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '제조사 전송 상태 확인에 실패했습니다.';
      setMobileBlePreflight({ ok: false, error: message });
      toast(message, 'error');
    } finally {
      setMobileBleChecking(false);
    }
  }, [mobilePassword, mobileUserName]);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-5 py-4 shadow-sm">
        <h2 className="text-lg font-bold text-[var(--foreground)]">입원실 안내판 ESL 준비</h2>
      </section>

      <section className="space-y-4">
          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">병실 데이터 편집</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManageDeviceRegistration ? (
                  <button
                    type="button"
                    onClick={registerSelectedRoomDevice}
                    disabled={!selectedDraft}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                  >
                    기기바코드 등록
                  </button>
                ) : null}
                {canManageDeviceRegistration && selectedDraft?.deviceId ? (
                  <button
                    type="button"
                    onClick={clearSelectedRoomDevice}
                    className="rounded-[var(--radius-md)] border border-red-200 bg-red-500/5 px-3 py-2 text-[12px] font-semibold text-red-600"
                  >
                    기기바코드 삭제
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openPreview()}
                  disabled={!selectedDraft}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                >
                  4분할 미리보기
                </button>
                <button
                  type="button"
                  onClick={resetSelectedRoomFromSource}
                  disabled={!selectedRoom}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                >
                  다시 채우기
                </button>
                <button
                  type="button"
                  onClick={markSelectedRoomPrepared}
                  disabled={!selectedDraft}
                  className="rounded-[var(--radius-md)] bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                >
                  전송 준비
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">병실 선택</span>
                <select
                  value={selectedRoomNumber}
                  onChange={(event) => setSelectedRoomNumber(event.target.value)}
                  disabled={loadingRooms || rooms.length === 0}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                >
                  {loadingRooms ? <option value="">병실 불러오는 중...</option> : null}
                  {!loadingRooms && rooms.length === 0 ? <option value="">등록된 병실 없음</option> : null}
                  {!loadingRooms &&
                    rooms.map((room) => (
                      <option key={room.roomNumber} value={room.roomNumber}>
                        {room.roomNumber}호 · {room.capacity}병상
                      </option>
                    ))}
                </select>
              </label>

              {selectedRoom ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/15 px-3 py-2 text-[12px] text-[var(--toss-gray-3)]">
                  <div className="font-semibold text-[var(--foreground)]">{selectedRoom.roomNumber}호</div>
                  <div className="mt-1">
                    환자 {selectedRoom.beds.filter((bed) => String(bed.patientName || '').trim()).length}/{selectedRoom.capacity}
                    명
                  </div>
                  <div className="mt-1 break-all">기기 바코드 {selectedDraft?.deviceId || '미등록'}</div>
                </div>
              ) : null}
            </div>

            {!selectedDraft ? (
              <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--toss-gray-3)]">
                {loadingRooms ? '병실 데이터를 불러오는 중입니다.' : '편집할 병실을 선택해 주세요.'}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  {selectedDraft.patientSlots.map((slot, index) => (
                    <div
                      key={`${selectedDraft.roomNumber}-${slot.bedNumber}`}
                      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4"
                    >
                      <div className="text-sm font-bold text-[var(--foreground)]">{slot.bedNumber}번 환자</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <input
                          value={slot.patientName}
                          onChange={(event) => updateSelectedPatientSlot(index, { patientName: event.target.value })}
                          placeholder="환자명"
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                        <input
                          value={slot.age}
                          onChange={(event) => updateSelectedPatientSlot(index, { age: event.target.value })}
                          placeholder="나이"
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                        <select
                          value={slot.gender}
                          onChange={(event) => updateSelectedPatientSlot(index, { gender: event.target.value })}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        >
                          <option value="">성별</option>
                          <option value="남">남</option>
                          <option value="여">여</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyText(buildRoomSummaryText(selectedDraft), `${selectedDraft.roomNumber}호 전송 메모를 복사했습니다.`)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)]"
                  >
                    전송 메모 복사
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(buildRoomJson(selectedDraft), `${selectedDraft.roomNumber}호 JSON을 복사했습니다.`)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)]"
                  >
                    JSON 복사
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[var(--foreground)]">전송 준비 목록</h3>
              <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                {preparedRooms.length}건
              </span>
            </div>

            {preparedRooms.length === 0 ? (
              <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
                아직 전송 준비한 병실이 없습니다.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {preparedRooms.map((draft) => (
                  <div key={draft.roomNumber} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[var(--foreground)]">{draft.roomNumber}호</div>
                        <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          기기 {draft.deviceId || '-'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRoomNumber(draft.roomNumber)}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                        >
                          편집
                        </button>
                        <button
                          type="button"
                          onClick={() => openPreview(draft.roomNumber)}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                        >
                          미리보기
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyText(buildRoomSummaryText(draft), `${draft.roomNumber}호 전송 메모를 복사했습니다.`)}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                        >
                          메모 복사
                        </button>
                        <button
                          type="button"
                          onClick={() => clearPreparedState(draft.roomNumber)}
                          className="rounded-[var(--radius-md)] bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-600"
                        >
                          대기 해제
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {draft.patientSlots.map((slot) => (
                        <div
                          key={`${draft.roomNumber}-${slot.bedNumber}`}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                        >
                          <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">{slot.bedNumber}번 환자</div>
                          <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                            {slot.patientName || '미기입'}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                            {[slot.age ? `${slot.age}세` : '', slot.gender].filter(Boolean).join(' / ') || '나이 · 성별 미입력'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
      </section>

      {previewDraft ? (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center bg-black/45 p-4"
          onClick={closePreview}
        >
          <div
            className="w-full max-w-6xl rounded-[var(--radius-xl)] bg-[var(--card)] p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-[var(--foreground)]">{previewDraft.roomNumber}호 7.5인치 최종 미리보기</div>
                <div className="mt-1 text-sm text-[var(--toss-gray-3)]">4인실 기준 4분할 화면과 제조사 BLE 작업 상태를 함께 확인합니다.</div>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
              <div className="space-y-3">
                <RoomBoardPreview draft={previewDraft} />
                <div className="flex flex-wrap gap-2 text-[12px] text-[var(--toss-gray-3)]">
                  <div className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1">기기 바코드 {previewDraft.deviceId || '미등록'}</div>
                  <div className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1">
                    {previewDraft.updatedAt ? `전송 준비 ${new Date(previewDraft.updatedAt).toLocaleString('ko-KR')}` : '전송 준비 전'}
                  </div>
                </div>
              </div>

              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--muted)]/20 p-4">
                <div className="text-base font-bold text-[var(--foreground)]">제조사 BLE 전송 상태</div>
                <div className="mt-2 text-sm text-[var(--toss-gray-3)]">
                  현재 제조사 앱은 클라우드 태스크를 받아 BLE로 쓰는 구조라서, 먼저 서버가 이 기기의 전송 작업을 만들 수 있는지 확인합니다.
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">제조사 계정</span>
                    <input
                      value={mobileUserName}
                      onChange={(event) => setMobileUserName(event.target.value)}
                      placeholder="WoPda / Zhsunyco 로그인 계정"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">제조사 비밀번호</span>
                    <input
                      type="password"
                      value={mobilePassword}
                      onChange={(event) => setMobilePassword(event.target.value)}
                      placeholder="계정 비밀번호"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void runMobileBlePreflight(previewDraft)}
                    disabled={mobileBleChecking}
                    className="rounded-[var(--radius-md)] bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {mobileBleChecking ? '전송 상태 확인 중...' : '전송 상태 확인'}
                  </button>
                </div>

                {mobileBlePreflight ? (
                  <div className="mt-4 space-y-3">
                    <div
                      className={`rounded-[var(--radius-lg)] border px-3 py-3 text-sm ${
                        mobileBlePreflight.taskReady
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : mobileBlePreflight.boundDevice?.eslCode
                            ? 'border-amber-200 bg-amber-50 text-amber-900'
                            : 'border-rose-200 bg-rose-50 text-rose-800'
                      }`}
                    >
                      {mobileBlePreflight.taskReady
                        ? '제조사 서버가 BLE 작업을 반환했습니다. 다만 실제 브라우저 write 프로토콜은 아직 별도 확인이 필요합니다.'
                        : mobileBlePreflight.statusSummary ||
                          mobileBlePreflight.error ||
                          '제조사 서버 상태를 더 확인해 주세요.'}
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-2">
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">라이선스</div>
                        <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                          {extractDiagnosticMessage(mobileBlePreflight.license)}
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">트리거</div>
                        <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                          {extractDiagnosticMessage(mobileBlePreflight.trigger)}
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">기기 등록 상태</div>
                        <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                          {mobileBlePreflight.boundDevice?.eslCode ? '제조사 서버 등록됨' : '제조사 서버 미확인'}
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">대기 작업</div>
                        <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                          {mobileBlePreflight.taskReady
                            ? 'BLE 작업 준비됨'
                            : mobileBlePreflight.boundDevice?.eslCode
                              ? `대기 ${mobileBlePreflight.waitingCount ?? 0}건`
                              : '작업 없음'}
                        </div>
                      </div>
                    </div>

                    {mobileBlePreflight.boundDevice ? (
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">제조사 서버에 저장된 기기 정보</div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">ESL 코드</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.eslCode || '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">상품 코드</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.productCode || '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">템플릿 ID</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.templateId ?? '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">기기 종류</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.typeCode || '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">바인딩 출처</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {mobileBlePreflight.boundDevice.actionFrom || '-'}
                            </div>
                          </div>
                          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2">
                            <div className="text-[10px] font-bold text-[var(--toss-gray-3)]">펌웨어 / PID</div>
                            <div className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
                              {[mobileBlePreflight.boundDevice.eslVersion, mobileBlePreflight.boundDevice.pid].filter(Boolean).join(' / ') || '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {mobileBlePreflight.taskAttempts?.length ? (
                      <div className="space-y-2">
                        {mobileBlePreflight.taskAttempts.map((attempt) => (
                          <div key={`${attempt.label}-${attempt.query}`} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[12px] font-bold text-[var(--foreground)]">{attempt.label}</div>
                              <div
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  attempt.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {attempt.ok ? 'TASK READY' : extractDiagnosticMessage(attempt.upstream)}
                              </div>
                            </div>
                            {attempt.query ? (
                              <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{attempt.query}</div>
                            ) : null}
                            <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                              {stringifyDiagnosticValue(attempt.upstream)}
                            </pre>
                          </div>
                        ))}
                        </div>
                      ) : null}

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">BLE 조회 응답</div>
                        <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(mobileBlePreflight.bleQuery)}
                        </pre>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">기기 상세 응답</div>
                        <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(mobileBlePreflight.deviceLookup)}
                        </pre>
                      </div>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">대기 작업 목록 응답</div>
                        <pre className="mt-2 max-h-32 overflow-auto rounded-[var(--radius-md)] bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {stringifyDiagnosticValue(mobileBlePreflight.taskList)}
                        </pre>
                      </div>
                    </div>

                    {mobileBlePreflight.browserBle ? (
                      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">APK에서 확인한 BLE 식별자</div>
                        <div className="mt-2 text-[11px] text-[var(--foreground)]">
                          서비스 {mobileBlePreflight.browserBle.primaryServiceUuid || '-'}
                        </div>
                        <div className="mt-1 break-all text-[11px] text-[var(--toss-gray-3)]">
                          {(mobileBlePreflight.browserBle.characteristicUuids || []).join(', ') || '-'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deviceRegistrationOpen && selectedDraft ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4"
          onClick={closeDeviceRegistration}
        >
          <div
            className="w-full max-w-md rounded-[var(--radius-xl)] bg-[var(--card)] p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-base font-bold text-[var(--foreground)]">{selectedDraft.roomNumber}호 기기바코드 등록</div>
            <div className="mt-2 text-sm text-[var(--toss-gray-3)]">카메라 스캔 또는 외부 스캐너 입력을 사용할 수 있습니다.</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startCameraBarcodeScan()}
                disabled={cameraScanBusy}
                className="rounded-[var(--radius-md)] bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {cameraScanBusy ? '카메라 여는 중...' : cameraScanOpen ? '카메라 다시 시작' : '카메라로 스캔'}
              </button>
              {cameraScanOpen ? (
                <button
                  type="button"
                  onClick={stopCameraBarcodeScan}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
                >
                  카메라 닫기
                </button>
              ) : null}
            </div>

            <div
              className={`mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-black ${
                cameraScanOpen ? 'block' : 'hidden'
              }`}
            >
              <video
                ref={deviceRegistrationVideoRef}
                autoPlay
                playsInline
                muted
                className="aspect-[4/3] w-full object-cover"
              />
            </div>

            <div className="mt-2 text-[12px] text-[var(--toss-gray-3)]">{cameraScanStatus}</div>
            <input
              ref={deviceRegistrationInputRef}
              value={deviceRegistrationValue}
              onChange={(event) => setDeviceRegistrationValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitSelectedRoomDeviceRegistration();
                }
              }}
              placeholder="바코드 스캔 대기 중"
              className="mt-4 w-full rounded-[var(--radius-lg)] border-2 border-teal-700/80 px-4 py-3 text-base outline-none transition focus:border-teal-700"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeviceRegistration}
                className="rounded-[var(--radius-md)] bg-cyan-100 px-4 py-2 text-sm font-semibold text-teal-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitSelectedRoomDeviceRegistration}
                className="rounded-[var(--radius-md)] bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
