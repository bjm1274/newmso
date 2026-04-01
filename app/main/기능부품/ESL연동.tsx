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

type MobileConfig = {
  baseUrl: string;
  userName: string;
  password: string;
};

type PersistedMobileConfig = Omit<MobileConfig, 'password'>;

type MobileTemplateRecord = {
  id?: number | string;
  code?: string | null;
  name?: string | null;
  type_code?: string | null;
  orientation?: number | null;
  is_open?: number | null;
  promotion?: string | null;
};

type RoomBoardPatientSlot = {
  bedNumber: number;
  patientName: string;
  admissionDate: string;
  diagnosis: string;
  contact: string;
  note: string;
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

type HandoverSnapshot = {
  dateKey: string;
  createdAt: string | null;
  rooms: HandoverRoomConfig[];
};

type ZhsunycoEslSyncProps = {
  user?: StaffMember | null;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
};

const MOBILE_CONFIG_STORAGE_KEY = 'erp-zhsunyco-mobile-config';
const ROOM_DRAFT_STORAGE_KEY = 'erp-zhsunyco-room-board-drafts';
const DEFAULT_BASE_URL = 'http://www.zhsunyco.com.cn';

const DEFAULT_CONFIG: MobileConfig = {
  baseUrl: DEFAULT_BASE_URL,
  userName: '',
  password: '',
};

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compareDateKeys(left?: string | null, right?: string | null) {
  return String(left || '').localeCompare(String(right || ''), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function stringify(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function persistedConfig(config: MobileConfig): PersistedMobileConfig {
  const { password: _password, ...rest } = config;
  return rest;
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
        admissionDate: String(bed.admissionDate || '').trim(),
        diagnosis: existing?.diagnosis || '',
        contact: existing?.contact || '',
        note: existing?.note || '',
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
    `템플릿: ${draft.templateName || '-'}`,
    `기기 바코드: ${draft.deviceId || '-'}`,
    draft.headerNote ? `상단 메모: ${draft.headerNote}` : '',
    '',
    ...draft.patientSlots.map((slot) => {
      const parts = [
        `${slot.bedNumber}번`,
        slot.patientName || '미배정',
        slot.admissionDate ? `입원일 ${slot.admissionDate}` : '',
        slot.diagnosis ? `진단 ${slot.diagnosis}` : '',
        slot.contact ? `연락처 ${slot.contact}` : '',
        slot.note ? `메모 ${slot.note}` : '',
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

export default function ZhsunycoEslSync(_props: ZhsunycoEslSyncProps) {
  const [config, setConfig] = useState<MobileConfig>(DEFAULT_CONFIG);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [rooms, setRooms] = useState<HandoverRoomConfig[]>([]);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomBoardDraft>>({});
  const [selectedRoomNumber, setSelectedRoomNumber] = useState('');
  const [mobileTemplates, setMobileTemplates] = useState<MobileTemplateRecord[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [busy, setBusy] = useState<'mobileTest' | 'mobileTemplates' | null>(null);
  const [summary, setSummary] = useState('');
  const [debugText, setDebugText] = useState('');

  useEffect(() => {
    try {
      const rawConfig = localStorage.getItem(MOBILE_CONFIG_STORAGE_KEY);
      if (rawConfig) {
        setConfig((prev) => ({
          ...prev,
          ...(JSON.parse(rawConfig) as Partial<PersistedMobileConfig>),
          password: '',
        }));
      }

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
      localStorage.setItem(MOBILE_CONFIG_STORAGE_KEY, JSON.stringify(persistedConfig(config)));
    } catch {
      // ignore local storage failures
    }
  }, [config.baseUrl, config.userName]);

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
      const { data, error } = await supabase
        .from('handover_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1500);

      if (error) throw error;

      const notes = ((data || []) as HandoverNoteRow[]).map(normalizeHandoverNote);
      const latestByDate = new Map<string, HandoverSnapshot>();

      notes.forEach((note) => {
        if (note.handover_kind !== 'room_config' || !note.handover_date) return;

        const nextSnapshot: HandoverSnapshot = {
          dateKey: note.handover_date,
          createdAt: note.created_at || null,
          rooms: parseRoomConfigsFromNote(note),
        };

        const currentSnapshot = latestByDate.get(note.handover_date);
        const currentTime = currentSnapshot ? new Date(currentSnapshot.createdAt || 0).getTime() : -1;
        const nextTime = new Date(note.created_at || 0).getTime();

        if (!currentSnapshot || nextTime >= currentTime) {
          latestByDate.set(note.handover_date, nextSnapshot);
        }
      });

      const matchedSnapshot = Array.from(latestByDate.values())
        .sort((left, right) => compareDateKeys(right.dateKey, left.dateKey))
        .find((snapshot) => compareDateKeys(snapshot.dateKey, selectedDate) <= 0);

      const nextRooms = matchedSnapshot?.rooms || [];
      setRooms(nextRooms);
      setRoomDrafts((prev) => {
        const next: Record<string, RoomBoardDraft> = {};
        nextRooms.forEach((room) => {
          next[room.roomNumber] = buildRoomDraft(room, prev[room.roomNumber]);
        });
        Object.entries(prev).forEach(([roomNumber, draft]) => {
          if (!next[roomNumber]) next[roomNumber] = draft;
        });
        return next;
      });
      setSummary(
        nextRooms.length > 0
          ? `${selectedDate} 기준 병실 ${nextRooms.length}개를 불러왔습니다.`
          : `${selectedDate} 기준 병실 설정이 없습니다. 인계노트의 병상 설정을 먼저 확인해주세요.`,
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
      return;
    }

    if (selectedRoomNumber && !rooms.some((room) => room.roomNumber === selectedRoomNumber)) {
      setSelectedRoomNumber(rooms[0]?.roomNumber || '');
    }
  }, [rooms, selectedRoomNumber]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomNumber === selectedRoomNumber) || null,
    [rooms, selectedRoomNumber],
  );

  const selectedDraft = useMemo(
    () => (selectedRoomNumber ? roomDrafts[selectedRoomNumber] || null : null),
    [roomDrafts, selectedRoomNumber],
  );

  const preparedRooms = useMemo(
    () =>
      rooms
        .map((room) => roomDrafts[room.roomNumber])
        .filter((draft): draft is RoomBoardDraft => Boolean(draft))
        .filter((draft) => draft.deviceId.trim() || draft.templateName.trim() || draft.updatedAt),
    [roomDrafts, rooms],
  );

  const mobileTemplateOptions = useMemo(
    () =>
      mobileTemplates
        .map((template) => ({
          id: String(template.id || ''),
          name: String(template.name || '').trim(),
          typeCode: String(template.type_code || '').trim(),
        }))
        .filter((template) => template.name),
    [mobileTemplates],
  );

  const updateSelectedDraft = useCallback(
    (updater: (draft: RoomBoardDraft) => RoomBoardDraft) => {
      if (!selectedRoomNumber) return;
      setRoomDrafts((prev) => {
        const current = prev[selectedRoomNumber];
        if (!current) return prev;
        return {
          ...prev,
          [selectedRoomNumber]: updater(current),
        };
      });
    },
    [selectedRoomNumber],
  );

  const resetSelectedRoomFromSource = useCallback(() => {
    if (!selectedRoom) return;
    setRoomDrafts((prev) => ({
      ...prev,
      [selectedRoom.roomNumber]: buildRoomDraft(selectedRoom, prev[selectedRoom.roomNumber]),
    }));
    toast('현재 병상 설정으로 다시 채웠습니다.', 'success');
  }, [selectedRoom]);

  const markSelectedRoomPrepared = useCallback(() => {
    updateSelectedDraft((draft) => ({
      ...draft,
      updatedAt: new Date().toISOString(),
    }));
    toast('전송 대기 상태로 표시했습니다.', 'success');
  }, [updateSelectedDraft]);

  const callApi = useCallback(
    async (action: 'mobileTest' | 'mobileTemplates') => {
      const response = await fetch('/api/esl/zhsunyco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          config,
        }),
      });

      const result = await response.json().catch(() => ({ ok: false, error: '응답을 해석할 수 없습니다.' }));
      if (!response.ok || result?.ok === false) {
        throw new Error(String(result?.error || '연동 요청에 실패했습니다.'));
      }
      return result;
    },
    [config],
  );

  const handleMobileTest = useCallback(async () => {
    if (!config.baseUrl.trim() || !config.userName.trim() || !config.password.trim()) {
      toast('호스트, 계정, 비밀번호를 입력해주세요.', 'error');
      return;
    }

    setBusy('mobileTest');
    try {
      const result = await callApi('mobileTest');
      setSummary('모바일 클라우드 로그인과 라이선스 정보를 확인했습니다.');
      setDebugText(stringify(result));
      toast('모바일 클라우드 연결을 확인했습니다.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '모바일 연결 확인에 실패했습니다.';
      setSummary(message);
      setDebugText(message);
      toast(message, 'error');
    } finally {
      setBusy(null);
    }
  }, [callApi, config.baseUrl, config.password, config.userName]);

  const handleMobileTemplates = useCallback(async () => {
    if (!config.baseUrl.trim() || !config.userName.trim() || !config.password.trim()) {
      toast('호스트, 계정, 비밀번호를 입력해주세요.', 'error');
      return;
    }

    setBusy('mobileTemplates');
    try {
      const result = await callApi('mobileTemplates');
      const templates = Array.isArray(result?.templates) ? (result.templates as MobileTemplateRecord[]) : [];
      setMobileTemplates(templates);
      setSummary(templates.length > 0 ? `템플릿 ${templates.length}개를 불러왔습니다.` : '등록된 모바일 템플릿이 없습니다.');
      setDebugText(stringify(result));
      toast('모바일 템플릿을 불러왔습니다.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '템플릿 조회에 실패했습니다.';
      setSummary(message);
      setDebugText(message);
      toast(message, 'error');
    } finally {
      setBusy(null);
    }
  }, [callApi, config.baseUrl, config.password, config.userName]);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[var(--foreground)]">입원실 안내판 ESL 준비</h2>
        <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
          병실호수 기준으로 안내판 데이터를 만들고, 실제 송신은 휴대폰이 기기 근처에서 맡는 흐름입니다.
          프로그램 안에서는 병실별 환자 정보 편집, 기기 바코드 매핑, 템플릿 선택, 전송 대기 큐까지 정리합니다.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">모바일 호스트</span>
            <input
              value={config.baseUrl}
              onChange={(event) => setConfig((prev) => ({ ...prev, baseUrl: event.target.value }))}
              placeholder="http://www.zhsunyco.com.cn"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">계정</span>
            <input
              value={config.userName}
              onChange={(event) => setConfig((prev) => ({ ...prev, userName: event.target.value }))}
              placeholder="모바일 앱 계정"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">비밀번호</span>
            <input
              type="password"
              value={config.password}
              onChange={(event) => setConfig((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="비밀번호"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">병실 기준일</span>
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
            onClick={() => void handleMobileTest()}
            disabled={busy !== null}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {busy === 'mobileTest' ? '확인 중...' : '모바일 연결 테스트'}
          </button>
          <button
            type="button"
            onClick={() => void handleMobileTemplates()}
            disabled={busy !== null}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
          >
            {busy === 'mobileTemplates' ? '불러오는 중...' : '템플릿 불러오기'}
          </button>
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
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">모바일 템플릿</h3>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              WoPda 앱에서 보이는 템플릿명을 그대로 병실별 드래프트에 연결해두면 나중에 헷갈리지 않습니다.
            </p>
          </div>
          <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
            {mobileTemplateOptions.length}개
          </span>
        </div>

        {mobileTemplateOptions.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
            템플릿을 아직 불러오지 않았습니다.
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {mobileTemplateOptions.map((template) => (
              <button
                key={`${template.id}-${template.name}`}
                type="button"
                onClick={() =>
                  updateSelectedDraft((draft) => ({
                    ...draft,
                    templateName: template.name,
                  }))
                }
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
              >
                {template.name} {template.typeCode ? `· ${template.typeCode}` : ''}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">병실 목록</h3>
              <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                인계노트의 병상 설정에서 현재 입원실 구성을 가져옵니다.
              </p>
            </div>
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
                const patientCount = room.beds.filter((bed) => String(bed.patientName || '').trim()).length;
                const selected = room.roomNumber === selectedRoomNumber;
                return (
                  <button
                    key={room.roomNumber}
                    type="button"
                    onClick={() => setSelectedRoomNumber(room.roomNumber)}
                    className={`w-full rounded-[var(--radius-lg)] border px-3 py-3 text-left transition ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/35'
                        : 'border-[var(--border)] bg-[var(--muted)]/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[var(--foreground)]">{room.roomNumber}호</span>
                      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        {patientCount}/{room.capacity}명
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-[var(--toss-gray-3)]">
                      <div>템플릿: {draft?.templateName || '-'}</div>
                      <div>기기 바코드: {draft?.deviceId || '-'}</div>
                      <div>최근 준비: {draft?.updatedAt ? new Date(draft.updatedAt).toLocaleString('ko-KR') : '-'}</div>
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
                <h3 className="text-base font-bold text-[var(--foreground)]">병실 안내판 편집</h3>
                <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                  병실호수, 기기 바코드, 템플릿, 환자별 보조 정보를 프로그램 안에서 정리합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetSelectedRoomFromSource}
                  disabled={!selectedRoom}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60"
                >
                  병상 설정으로 다시 채우기
                </button>
                <button
                  type="button"
                  onClick={markSelectedRoomPrepared}
                  disabled={!selectedDraft}
                  className="rounded-[var(--radius-md)] bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                >
                  전송 대기 표시
                </button>
              </div>
            </div>

            {!selectedDraft ? (
              <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-sm text-[var(--toss-gray-3)]">
                왼쪽에서 병실을 선택해주세요.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">안내판 제목</span>
                    <input
                      value={selectedDraft.roomTitle}
                      onChange={(event) =>
                        updateSelectedDraft((draft) => ({
                          ...draft,
                          roomTitle: event.target.value,
                        }))
                      }
                      placeholder="101호 입원환자 정보"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">병동/부서</span>
                    <input
                      value={selectedDraft.wardLabel}
                      onChange={(event) =>
                        updateSelectedDraft((draft) => ({
                          ...draft,
                          wardLabel: event.target.value,
                        }))
                      }
                      placeholder="3병동"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">기기 바코드</span>
                    <input
                      value={selectedDraft.deviceId}
                      onChange={(event) =>
                        updateSelectedDraft((draft) => ({
                          ...draft,
                          deviceId: event.target.value,
                        }))
                      }
                      placeholder="기기 옆면 바코드"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">템플릿명</span>
                    <input
                      list="zhsunyco-mobile-template-list"
                      value={selectedDraft.templateName}
                      onChange={(event) =>
                        updateSelectedDraft((draft) => ({
                          ...draft,
                          templateName: event.target.value,
                        }))
                      }
                      placeholder="WoPda 템플릿명"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                    />
                    <datalist id="zhsunyco-mobile-template-list">
                      {mobileTemplateOptions.map((template) => (
                        <option key={`${template.id}-${template.name}`} value={template.name} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">상단 메모</span>
                  <textarea
                    value={selectedDraft.headerNote}
                    onChange={(event) =>
                      updateSelectedDraft((draft) => ({
                        ...draft,
                        headerNote: event.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="예: 진단 및 의료 정보 / 전달 및 외로 정보"
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </label>

                <div className="grid gap-3 lg:grid-cols-2">
                  {selectedDraft.patientSlots.map((slot, index) => (
                    <div
                      key={`${selectedDraft.roomNumber}-${slot.bedNumber}`}
                      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold text-[var(--foreground)]">{slot.bedNumber}번 환자</h4>
                        <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          {selectedRoom?.roomNumber || selectedDraft.roomNumber}호
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">환자명</span>
                          <input
                            value={slot.patientName}
                            onChange={(event) =>
                              updateSelectedDraft((draft) => ({
                                ...draft,
                                patientSlots: draft.patientSlots.map((patientSlot, patientIndex) =>
                                  patientIndex === index
                                    ? { ...patientSlot, patientName: event.target.value }
                                    : patientSlot,
                                ),
                              }))
                            }
                            placeholder="환자 이름"
                            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">입원일</span>
                          <input
                            type="date"
                            value={slot.admissionDate}
                            onChange={(event) =>
                              updateSelectedDraft((draft) => ({
                                ...draft,
                                patientSlots: draft.patientSlots.map((patientSlot, patientIndex) =>
                                  patientIndex === index
                                    ? { ...patientSlot, admissionDate: event.target.value }
                                    : patientSlot,
                                ),
                              }))
                            }
                            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">진단/병명</span>
                          <input
                            value={slot.diagnosis}
                            onChange={(event) =>
                              updateSelectedDraft((draft) => ({
                                ...draft,
                                patientSlots: draft.patientSlots.map((patientSlot, patientIndex) =>
                                  patientIndex === index
                                    ? { ...patientSlot, diagnosis: event.target.value }
                                    : patientSlot,
                                ),
                              }))
                            }
                            placeholder="예: 폐렴, 담낭염"
                            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">비상 연락처</span>
                          <input
                            value={slot.contact}
                            onChange={(event) =>
                              updateSelectedDraft((draft) => ({
                                ...draft,
                                patientSlots: draft.patientSlots.map((patientSlot, patientIndex) =>
                                  patientIndex === index
                                    ? { ...patientSlot, contact: event.target.value }
                                    : patientSlot,
                                ),
                              }))
                            }
                            placeholder="예: 010-1234-5678"
                            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <label className="mt-3 block space-y-1">
                        <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">표시 메모</span>
                        <textarea
                          value={slot.note}
                          onChange={(event) =>
                            updateSelectedDraft((draft) => ({
                              ...draft,
                              patientSlots: draft.patientSlots.map((patientSlot, patientIndex) =>
                                patientIndex === index
                                  ? { ...patientSlot, note: event.target.value }
                                  : patientSlot,
                              ),
                            }))
                          }
                          rows={2}
                          placeholder="예: 전달사항, 추가 연락처, 주의사항"
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">휴대폰 전송 준비</h3>
                <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                  기기 근처에 가서 WoPda 앱으로 송신할 때 바로 꺼내볼 수 있도록 병실별 준비 목록을 묶었습니다.
                </p>
              </div>
              <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                {preparedRooms.length}건
              </span>
            </div>

            {preparedRooms.length === 0 ? (
              <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
                아직 기기 바코드나 템플릿이 정리된 병실이 없습니다.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {preparedRooms.map((draft) => (
                  <div
                    key={draft.roomNumber}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--foreground)]">
                          {draft.roomNumber}호 · {draft.roomTitle}
                        </h4>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          템플릿 {draft.templateName || '-'} / 기기 {draft.deviceId || '-'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void copyText(buildRoomSummaryText(draft), `${draft.roomNumber}호 메모를 복사했습니다.`)}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                        >
                          전송 메모 복사
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyText(buildRoomJson(draft), `${draft.roomNumber}호 JSON을 복사했습니다.`)}
                          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                        >
                          JSON 복사
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
                            {slot.patientName || '미배정'}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                            {[slot.admissionDate, slot.diagnosis, slot.contact].filter(Boolean).join(' / ') || '추가 정보 없음'}
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

      {debugText ? (
        <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h3 className="text-base font-bold text-[var(--foreground)]">최근 응답</h3>
          <pre className="mt-3 overflow-x-auto rounded-[var(--radius-lg)] bg-[#0f172a] p-4 text-[11px] leading-5 text-slate-100">
            {debugText}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
