'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  roomTitle: string;
  wardLabel: string;
  headerNote: string;
  templateName: string;
  deviceId: string;
  updatedAt: string | null;
  patientSlots: RoomBoardPatientSlot[];
};
type HandoverSnapshot = { dateKey: string; createdAt: string | null; rooms: HandoverRoomConfig[] };
type BleCharacteristicSnapshot = { uuid: string; properties: string[] };
type BleServiceSnapshot = { uuid: string; characteristics: BleCharacteristicSnapshot[] };
type BleCharacteristicLike = { uuid: string; properties: Record<string, boolean | undefined> };
type BleServiceLike = { uuid: string; getCharacteristics: () => Promise<BleCharacteristicLike[]> };
type BleServerLike = { getPrimaryServices: () => Promise<BleServiceLike[]> };
type BleGattLike = { connect: () => Promise<BleServerLike>; disconnect: () => void };
type BleDeviceLike = { name?: string; id?: string; gatt?: BleGattLike | null };
type NavigatorWithBluetooth = Navigator & {
  bluetooth: {
    requestDevice: (options: { acceptAllDevices: boolean; optionalServices?: string[] }) => Promise<BleDeviceLike>;
  };
};
type Props = { user?: StaffMember | null; selectedCo?: string | null; selectedCompanyId?: string | null };

const ROOM_DRAFT_STORAGE_KEY = 'erp-zhsunyco-room-board-drafts';
const WOLINK_OPTIONAL_SERVICE_UUIDS = [
  '30323032-4c53-4545-4c42-4b4e494c4f57',
  '31323032-4c53-4545-4c42-4b4e494c4f57',
  '32323032-4c53-4545-4c42-4b4e494c4f57',
  '33323032-4c53-4545-4c42-4b4e494c4f57',
  '34323032-4c53-4545-4c42-4b4e494c4f57',
  '35323032-4c53-4545-4c42-4b4e494c4f57',
  '3e3d1158-5656-4217-b715-266f37eb5000',
] as const;

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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
    roomTitle: previous?.roomTitle || `${room.roomNumber}호 입원환자 정보`,
    wardLabel: previous?.wardLabel || '',
    headerNote: previous?.headerNote || '',
    templateName: previous?.templateName || '',
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
    `제목: ${draft.roomTitle || '-'}`,
    `병동/부서: ${draft.wardLabel || '-'}`,
    `레이아웃 메모: ${draft.templateName || '-'}`,
    `기기 바코드: ${draft.deviceId || '-'}`,
    draft.headerNote ? `상단 메모: ${draft.headerNote}` : '',
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
      roomTitle: draft.roomTitle,
      wardLabel: draft.wardLabel,
      headerNote: draft.headerNote,
      templateName: draft.templateName,
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

export default function ZhsunycoEslSync(_props: Props) {
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [rooms, setRooms] = useState<HandoverRoomConfig[]>([]);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomBoardDraft>>({});
  const [selectedRoomNumber, setSelectedRoomNumber] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [summary, setSummary] = useState('');
  const [bleBusy, setBleBusy] = useState(false);
  const [bleStatus, setBleStatus] = useState('BLE 기기 스캔 전');
  const [bleDeviceName, setBleDeviceName] = useState('');
  const [bleDeviceId, setBleDeviceId] = useState('');
  const [bleServices, setBleServices] = useState<BleServiceSnapshot[]>([]);

  useEffect(() => {
    try {
      const rawDrafts = localStorage.getItem(ROOM_DRAFT_STORAGE_KEY);
      if (rawDrafts) {
        setRoomDrafts(JSON.parse(rawDrafts) as Record<string, RoomBoardDraft>);
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
        .sort((left, right) => compareDateKeys(right.dateKey, left.dateKey))
        .find((snapshot) => compareDateKeys(snapshot.dateKey, selectedDate) <= 0);

      const nextRooms = matched?.rooms || [];
      setRooms(nextRooms);
      setRoomDrafts((prev) => {
        const next: Record<string, RoomBoardDraft> = {};
        nextRooms.forEach((room) => {
          next[room.roomNumber] = buildRoomDraft(room, prev[room.roomNumber]);
        });
        return next;
      });
      setSummary(
        nextRooms.length > 0
          ? `${selectedDate} 기준 병실 ${nextRooms.length}개를 불러왔습니다.`
          : `${selectedDate} 기준 병실 설정이 없습니다.`,
      );
    } catch (error) {
      console.error('Failed to load handover room configs:', error);
      setRooms([]);
      setSummary('병실 설정을 불러오지 못했습니다.');
      toast('병실 설정을 불러오지 못했습니다.', 'error');
    } finally {
      setLoadingRooms(false);
    }
  }, [selectedDate]);

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

  const selectedRoom = useMemo(() => rooms.find((room) => room.roomNumber === selectedRoomNumber) || null, [rooms, selectedRoomNumber]);
  const selectedDraft = useMemo(() => (selectedRoomNumber ? roomDrafts[selectedRoomNumber] || null : null), [roomDrafts, selectedRoomNumber]);
  const preparedRooms = useMemo(
    () => rooms.map((room) => roomDrafts[room.roomNumber]).filter((draft): draft is RoomBoardDraft => Boolean(draft)).filter((draft) => draft.updatedAt || draft.templateName.trim() || draft.deviceId.trim()),
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

  const markSelectedRoomPrepared = useCallback(() => {
    if (!selectedDraft) return;
    if (!selectedDraft.deviceId.trim()) {
      toast('기기 바코드를 먼저 입력해 주세요.', 'error');
      return;
    }
    updateSelectedDraft((draft) => ({ ...draft, updatedAt: new Date().toISOString() }));
    toast('직결 전송 대기 목록에 올렸습니다.', 'success');
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
    toast(`${roomNumber}호 전송 대기를 해제했습니다.`, 'success');
  }, []);

  const handleBleScan = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      toast('이 브라우저에서는 Web Bluetooth를 지원하지 않습니다.', 'error');
      setBleStatus('Web Bluetooth 미지원');
      return;
    }

    if (!window.isSecureContext) {
      toast('BLE 스캔은 https 또는 localhost 환경에서만 동작합니다.', 'error');
      setBleStatus('보안 컨텍스트 필요');
      return;
    }

    setBleBusy(true);
    setBleStatus('기기 선택 창 여는 중...');
    setBleServices([]);

    try {
      const bluetoothNavigator = navigator as NavigatorWithBluetooth;
      const device = await bluetoothNavigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [...WOLINK_OPTIONAL_SERVICE_UUIDS],
      });

      setBleDeviceName(String(device.name || '').trim());
      setBleDeviceId(String(device.id || '').trim());
      setBleStatus('GATT 연결 중...');

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('BLE GATT 서버에 연결하지 못했습니다.');
      }

      const services = await server.getPrimaryServices();
      const snapshots: BleServiceSnapshot[] = [];

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        snapshots.push({
          uuid: service.uuid,
          characteristics: characteristics.map((characteristic) => ({
            uuid: characteristic.uuid,
            properties: Object.entries(characteristic.properties)
              .filter(([, enabled]) => enabled === true)
              .map(([key]) => key),
          })),
        });
      }

      setBleServices(snapshots);
      setBleStatus(`BLE 연결 완료: ${device.name || device.id}`);

      if (selectedRoomNumber) {
        updateSelectedDraft((draft) => ({
          ...draft,
          deviceId: String(device.name || device.id || draft.deviceId),
        }));
      }

      toast('BLE 기기 스캔과 연결에 성공했습니다.', 'success');
      device.gatt?.disconnect();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'BLE 기기 스캔 또는 연결에 실패했습니다.';
      setBleStatus(message);
      toast(message, 'error');
    } finally {
      setBleBusy(false);
    }
  }, [selectedRoomNumber, updateSelectedDraft]);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-lg font-bold text-[var(--foreground)]">입원실 안내판 ESL 준비</h2>
            <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
              제조사가 제공한 연결 방법을 바탕으로, 우리 프로그램 안에서 병실 데이터 작성과 BLE 기기 연결을 직접 처리하는
              화면입니다. 클라우드 입력은 제거하고 직결 흐름만 남겼습니다.
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 px-4 py-3 text-[12px] leading-6 text-[var(--toss-gray-3)]">
            <div>1. 인계노트에서 병실 구성 불러오기</div>
            <div>2. 병실별 기기 바코드와 레이아웃 메모 정리</div>
            <div>3. 프로그램 안에서 BLE 기기 스캔</div>
            <div>4. 직결 전송 데이터 완성</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[220px_auto]">
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">병실 기준 날짜</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadRooms()}
            disabled={loadingRooms}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
          >
            {loadingRooms ? '불러오는 중...' : '병실 데이터 새로고침'}
          </button>
        </div>

        {summary ? <p className="mt-3 text-[12px] font-semibold text-[var(--foreground)]">{summary}</p> : null}
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">PC BLE 기기 스캔</h3>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              프로그램 안에서 ESL 기기를 직접 찾는 첫 단계입니다. 스캔한 기기가 있으면 현재 선택 병실의 기기칸에 자동으로
              채워집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleBleScan()}
            disabled={bleBusy}
            className="rounded-[var(--radius-md)] bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {bleBusy ? '스캔 중...' : 'BLE 기기 스캔'}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/15 p-4">
            <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">상태</div>
            <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">{bleStatus}</div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/15 p-4">
            <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">기기 이름</div>
            <div className="mt-2 break-all text-sm font-semibold text-[var(--foreground)]">{bleDeviceName || '-'}</div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/15 p-4">
            <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">브라우저 기기 ID</div>
            <div className="mt-2 break-all text-sm font-semibold text-[var(--foreground)]">{bleDeviceId || '-'}</div>
          </div>
        </div>

        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/10 p-4">
          <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">발견한 서비스 / 특성</div>
          {bleServices.length === 0 ? (
            <div className="mt-2 text-sm text-[var(--toss-gray-3)]">아직 연결된 BLE 서비스 정보가 없습니다.</div>
          ) : (
            <div className="mt-3 space-y-3">
              {bleServices.map((service) => (
                <div key={service.uuid} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                  <div className="text-[12px] font-bold text-[var(--foreground)]">{service.uuid}</div>
                  <div className="mt-2 space-y-1 text-[11px] text-[var(--toss-gray-3)]">
                    {service.characteristics.map((characteristic) => (
                      <div key={characteristic.uuid}>
                        {characteristic.uuid}
                        {characteristic.properties.length > 0 ? ` · ${characteristic.properties.join(', ')}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[var(--foreground)]">병실 목록</h3>
            <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
              {rooms.length}개
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {loadingRooms ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
                병실 데이터를 불러오는 중입니다.
              </div>
            ) : rooms.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
                선택한 날짜 기준 병실 설정이 없습니다.
              </div>
            ) : (
              rooms.map((room) => {
                const draft = roomDrafts[room.roomNumber];
                const selected = room.roomNumber === selectedRoomNumber;
                return (
                  <button
                    key={room.roomNumber}
                    type="button"
                    onClick={() => setSelectedRoomNumber(room.roomNumber)}
                    className={`w-full rounded-[var(--radius-lg)] border px-3 py-3 text-left transition ${
                      selected ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/35' : 'border-[var(--border)] bg-[var(--muted)]/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[var(--foreground)]">{room.roomNumber}호</span>
                      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">{room.capacity}병상</span>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-[var(--toss-gray-3)]">
                      <div>레이아웃: {draft?.templateName || '-'}</div>
                      <div>기기: {draft?.deviceId || '-'}</div>
                      <div>
                        환자: {room.beds.filter((bed) => String(bed.patientName || '').trim()).length}/{room.capacity}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">병실 데이터 편집</h3>
                <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                  7.5인치 안내판 기준으로 환자 정보는 이름, 나이, 성별만 정리합니다. 이름은 인계노트에서 가져오고 나이와
                  성별은 여기서 직접 입력하면 됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  직결 전송 준비
                </button>
              </div>
            </div>

            {!selectedDraft ? (
              <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--toss-gray-3)]">
                왼쪽에서 병실을 선택해 주세요.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <input
                    value={selectedDraft.roomTitle}
                    onChange={(event) => updateSelectedDraft((draft) => ({ ...draft, roomTitle: event.target.value }))}
                    placeholder="안내판 제목"
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <input
                    value={selectedDraft.wardLabel}
                    onChange={(event) => updateSelectedDraft((draft) => ({ ...draft, wardLabel: event.target.value }))}
                    placeholder="병동 / 부서"
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <input
                    value={selectedDraft.deviceId}
                    onChange={(event) => updateSelectedDraft((draft) => ({ ...draft, deviceId: event.target.value }))}
                    placeholder="기기 바코드"
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <input
                    value={selectedDraft.templateName}
                    onChange={(event) => updateSelectedDraft((draft) => ({ ...draft, templateName: event.target.value }))}
                    placeholder="레이아웃 메모(선택)"
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </div>

                <textarea
                  value={selectedDraft.headerNote}
                  onChange={(event) => updateSelectedDraft((draft) => ({ ...draft, headerNote: event.target.value }))}
                  rows={2}
                  placeholder="상단 메모"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                />

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
              <h3 className="text-base font-bold text-[var(--foreground)]">직결 전송 대기</h3>
              <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                {preparedRooms.length}건
              </span>
            </div>

            {preparedRooms.length === 0 ? (
              <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
                아직 직결 전송 준비한 병실이 없습니다.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {preparedRooms.map((draft) => (
                  <div key={draft.roomNumber} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[var(--foreground)]">{draft.roomNumber}호 · {draft.roomTitle}</div>
                        <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          레이아웃 {draft.templateName || '-'} / 기기 {draft.deviceId || '-'}
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
        </div>
      </section>

    </div>
  );
}
