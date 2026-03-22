'use client';
import { toast } from '@/lib/toast';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  buildBedKey,
  buildHandoverSearchText,
  buildPatientKey,
  buildRoomConfigNoteContent,
  encodeHandoverContent,
  formatBedLabel,
  formatPatientBedLabel,
  normalizeHandoverNote,
  normalizeHandoverRoomConfigs,
  normalizeDateKey,
  normalizeRoomCapacity,
  normalizeRoomNumber,
  parseRoomConfigsFromNote,
  type HandoverNote,
  type HandoverNoteRow,
  type HandoverNoteScope,
  type HandoverRoomConfig,
} from '@/lib/handover-notes';

type Props = { user?: any };
type BedOption = {
  selectionKey: string;
  bedKey: string;
  roomNumber: string;
  roomCapacity: number;
  bedNumber: number;
  patientName: string;
  admissionDate: string;
  label: string;
};

type Summary = { general: number; patient: number; total: number };
type RoomStatus = 'idle' | 'saving' | 'saved' | 'error';
type RoomConfigSnapshot = {
  dateKey: string;
  createdAt: string | null;
  rooms: HandoverRoomConfig[];
};
type PatientEpisode = {
  episodeKey: string;
  bedKey: string;
  roomNumber: string;
  roomCapacity: number;
  bedNumber: number;
  patientName: string;
  patientKey: string | null;
  startDate: string;
  endDate: string | null;
};
type PatientGroup = {
  key: string;
  testIdKey: string;
  label: string;
  roomNumber: string;
  bedNumber: number;
  patientName: string;
  patientKey: string | null;
  startDate: string;
  endDate: string | null;
  notes: HandoverNote[];
};

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DEFAULT_SHIFT = 'Day';
const DEFAULT_PRIORITY = 'Normal';
const DEFAULT_SCOPE: HandoverNoteScope = 'general';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthGrid(date: Date) {
  const firstDay = monthStart(date);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const cells: Array<Date | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push(new Date(date.getFullYear(), date.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
}

function fullDateLabel(date: Date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

function compareDateKeys(left?: string | null, right?: string | null) {
  return String(left || '').localeCompare(String(right || ''), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function previousDateKey(value: string) {
  const date = fromDateKey(value);
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

function createdLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dateLabel(value?: string | null) {
  if (!value) return '-';
  const date = fromDateKey(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function emptySummary(): Summary {
  return { general: 0, patient: 0, total: 0 };
}

function compareRooms(left?: string | null, right?: string | null) {
  return String(left || '').localeCompare(String(right || ''), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function buildEpisodeRenderKey(bedKey: string, startDate: string, patientKey?: string | null, patientName?: string | null) {
  const seed = String(patientKey || patientName || 'patient');
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `${bedKey}-${startDate}-${hash.toString(36)}`;
}

function createRoom(roomNumber: string, capacity: number, admissionDate: string): HandoverRoomConfig {
  return {
    id: crypto.randomUUID(),
    roomNumber,
    capacity,
    beds: Array.from({ length: capacity }, (_, index) => ({
      bedNumber: index + 1,
      patientName: '',
      admissionDate,
    })),
  };
}

export default function HandoverNotes({ user }: Props) {
  const [notes, setNotes] = useState<HandoverNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [shift, setShift] = useState(DEFAULT_SHIFT);
  const [priority, setPriority] = useState(DEFAULT_PRIORITY);
  const [noteScope, setNoteScope] = useState<HandoverNoteScope>(DEFAULT_SCOPE);
  const [content, setContent] = useState('');
  const [roomConfigs, setRoomConfigs] = useState<HandoverRoomConfig[]>([]);
  const [selectedBedKey, setSelectedBedKey] = useState('');
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState(4);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('idle');
  const [roomDirty, setRoomDirty] = useState(false);
  const [showBedSettings, setShowBedSettings] = useState(false);
  const [selectedPatientGroupKey, setSelectedPatientGroupKey] = useState('');
  const [noteActionValues, setNoteActionValues] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [noteMutationId, setNoteMutationId] = useState<string | null>(null);

  const roomStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const currentMonth = useMemo(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), [selectedDate]);
  const currentMonthGrid = useMemo(() => monthGrid(currentMonth), [currentMonth]);
  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);
  const roomConfigSnapshots = useMemo<RoomConfigSnapshot[]>(() => {
    const latestByDate = new Map<string, RoomConfigSnapshot>();

    notes.forEach((note) => {
      if (note.handover_kind !== 'room_config' || !note.handover_date) return;

      const nextSnapshot: RoomConfigSnapshot = {
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

    return Array.from(latestByDate.values()).sort((left, right) => compareDateKeys(left.dateKey, right.dateKey));
  }, [notes]);
  const effectiveRoomConfigs = useMemo(() => {
    const matchedSnapshot = [...roomConfigSnapshots]
      .reverse()
      .find((snapshot) => compareDateKeys(snapshot.dateKey, selectedDateKey) <= 0);

    return matchedSnapshot ? matchedSnapshot.rooms : [];
  }, [roomConfigSnapshots, selectedDateKey]);

  useEffect(() => {
    void loadNotes();
    return () => {
      if (roomStatusTimerRef.current) clearTimeout(roomStatusTimerRef.current);
    };
  }, []);

  async function loadNotes() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('handover_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1500);

      if (error) {
        console.error('인계노트 조회 실패:', error);
        setNotes([]);
        return;
      }

      setNotes(((data || []) as HandoverNoteRow[]).map(normalizeHandoverNote));
    } catch (error) {
      console.error('인계노트 조회 중 오류:', error);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }

  function updateRoomStatus(nextStatus: RoomStatus) {
    setRoomStatus(nextStatus);
    if (roomStatusTimerRef.current) {
      clearTimeout(roomStatusTimerRef.current);
      roomStatusTimerRef.current = null;
    }
    if (nextStatus === 'saved' || nextStatus === 'error') {
      roomStatusTimerRef.current = setTimeout(() => setRoomStatus('idle'), 1800);
    }
  }

  async function persistRoomConfigs(nextConfigs: HandoverRoomConfig[]) {
    const normalizedRooms = normalizeHandoverRoomConfigs(nextConfigs);
    const currentConfigNote = notes.find(
      (note) => note.handover_kind === 'room_config' && note.handover_date === selectedDateKey,
    );

    if (!currentConfigNote && normalizedRooms.length === 0) {
      setRoomStatus('idle');
      setRoomDirty(false);
      return;
    }

    setRoomStatus('saving');
    try {
      const roomContent = buildRoomConfigNoteContent(normalizedRooms, selectedDateKey);
      const { data, error } = currentConfigNote
        ? await withMissingColumnsFallback(
            (omittedColumns) => {
              const payload: Record<string, any> = {
                content: roomContent,
                author_id: user?.id || currentConfigNote.author_id || 'unknown',
                author_name: user?.name || currentConfigNote.author_name || '이름 없음',
              };
              if (!omittedColumns.has('note_scope')) payload.note_scope = 'general';
              if (!omittedColumns.has('handover_date')) payload.handover_date = selectedDateKey;
              return supabase.from('handover_notes').update(payload).eq('id', currentConfigNote.id).select('*').single();
            },
            ['note_scope', 'handover_date'],
          )
        : await withMissingColumnsFallback(
            (omittedColumns) => {
              const payload: Record<string, any> = {
                content: roomContent,
                author_id: user?.id || 'unknown',
                author_name: user?.name || '이름 없음',
                shift: 'System',
                priority: 'Normal',
                is_completed: false,
                created_at: new Date().toISOString(),
              };
              if (!omittedColumns.has('note_scope')) payload.note_scope = 'general';
              if (!omittedColumns.has('handover_date')) payload.handover_date = selectedDateKey;
              return supabase.from('handover_notes').insert([payload]).select('*').single();
            },
            ['note_scope', 'handover_date'],
          );

      if (error) {
        console.error('병상 설정 저장 실패:', error);
        updateRoomStatus('error');
        return;
      }

      if (data) {
        const normalized = normalizeHandoverNote(data as HandoverNoteRow);
        setNotes((prev) => [normalized, ...prev.filter((note) => note.id !== normalized.id)]);
      }

      setRoomDirty(false);
      updateRoomStatus('saved');
    } catch (error) {
      console.error('병상 설정 저장 중 오류:', error);
      updateRoomStatus('error');
    }
  }

  const summaryByDate = useMemo(() => {
    const next = new Map<string, Summary>();
    notes.forEach((note) => {
      if (note.handover_kind !== 'note') return;
      const dateKey = note.handover_date || String(note.created_at || '').slice(0, 10);
      if (!dateKey) return;
      const current = next.get(dateKey) || emptySummary();
      current.total += 1;
      if (note.note_scope === 'patient') current.patient += 1;
      else current.general += 1;
      next.set(dateKey, current);
    });
    return next;
  }, [notes]);

  const contentNotes = useMemo(() => {
    return notes
      .filter((note) => note.handover_kind === 'note')
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
  }, [notes]);

  const patientEpisodes = useMemo<PatientEpisode[]>(() => {
    const episodes: PatientEpisode[] = [];
    const activeEpisodes = new Map<string, PatientEpisode>();

    roomConfigSnapshots.forEach((snapshot) => {
      const nextBeds = new Map<
        string,
        {
          roomNumber: string;
          roomCapacity: number;
          bedNumber: number;
          patientName: string;
          patientKey: string | null;
          admissionDate: string;
        }
      >();

      snapshot.rooms.forEach((room) => {
        room.beds.forEach((bed) => {
          const bedKey = buildBedKey(room.roomNumber, bed.bedNumber) || `${room.roomNumber}-${bed.bedNumber}`;
          const patientName = String(bed.patientName || '').trim();
          const admissionDate = normalizeDateKey(bed.admissionDate) || snapshot.dateKey;
          nextBeds.set(bedKey, {
            roomNumber: room.roomNumber,
            roomCapacity: room.capacity,
            bedNumber: bed.bedNumber,
            patientName,
            patientKey: buildPatientKey(patientName),
            admissionDate,
          });
        });
      });

      const allBedKeys = new Set<string>([...activeEpisodes.keys(), ...nextBeds.keys()]);

      allBedKeys.forEach((bedKey) => {
        const previousEpisode = activeEpisodes.get(bedKey);
        const nextBed = nextBeds.get(bedKey);
        const previousPatientName = previousEpisode?.patientName || '';
        const nextPatientName = nextBed?.patientName || '';
        const nextAdmissionDate = nextBed?.admissionDate || snapshot.dateKey;
        const hasSameEpisode =
          !!previousEpisode &&
          previousPatientName === nextPatientName &&
          previousEpisode.startDate === nextAdmissionDate;

        if (hasSameEpisode) {
          return;
        }

        if (previousEpisode) {
          previousEpisode.endDate = nextPatientName ? nextAdmissionDate : snapshot.dateKey;
          activeEpisodes.delete(bedKey);
        }

        if (nextBed && nextPatientName) {
          const nextEpisode: PatientEpisode = {
            episodeKey: buildEpisodeRenderKey(bedKey, nextAdmissionDate, nextBed.patientKey, nextPatientName),
            bedKey,
            roomNumber: nextBed.roomNumber,
            roomCapacity: nextBed.roomCapacity,
            bedNumber: nextBed.bedNumber,
            patientName: nextPatientName,
            patientKey: nextBed.patientKey,
            startDate: nextAdmissionDate,
            endDate: null,
          };

          episodes.push(nextEpisode);
          activeEpisodes.set(bedKey, nextEpisode);
        }
      });
    });

    return episodes.sort((left, right) => {
      const roomCompare = compareRooms(left.roomNumber, right.roomNumber);
      if (roomCompare !== 0) return roomCompare;
      if (left.bedNumber !== right.bedNumber) return left.bedNumber - right.bedNumber;
      return compareDateKeys(left.startDate, right.startDate);
    });
  }, [roomConfigSnapshots]);

  const generalNotes = useMemo(() => {
    return contentNotes.filter((note) => {
      if (note.note_scope === 'patient' && note.patient_name) return false;

      const noteDate = note.handover_date || String(note.created_at || '').slice(0, 10);
      const shouldShow =
        noteDate === selectedDateKey || (compareDateKeys(noteDate, selectedDateKey) <= 0 && !note.is_completed);

      if (!shouldShow) return false;
      if (!normalizedSearchQuery) return true;
      return buildHandoverSearchText(note).includes(normalizedSearchQuery);
    });
  }, [contentNotes, normalizedSearchQuery, selectedDateKey]);

  const patientGroups = useMemo<PatientGroup[]>(() => {
    const nextGroups = patientEpisodes
      .filter((episode) => {
        if (compareDateKeys(episode.startDate, selectedDateKey) > 0) return false;
        if (episode.endDate && compareDateKeys(selectedDateKey, episode.endDate) > 0) return false;
        return true;
      })
      .map((episode) => {
        const notesForEpisode = contentNotes.filter((note) => {
          if (note.note_scope !== 'patient' || !note.patient_name) return false;

          const noteDate = note.handover_date || String(note.created_at || '').slice(0, 10);
          const visibleUntil = episode.endDate && compareDateKeys(episode.endDate, selectedDateKey) < 0 ? episode.endDate : selectedDateKey;
          const inEpisodeRange =
            compareDateKeys(noteDate, episode.startDate) >= 0 &&
            compareDateKeys(noteDate, visibleUntil) <= 0;

          if (!inEpisodeRange) return false;

          const noteBedKey = note.bed_key || buildBedKey(note.room_number, note.bed_number);
          const sameBed = noteBedKey === episode.bedKey;
          const samePatient =
            (note.patient_key && episode.patientKey && note.patient_key === episode.patientKey) ||
            String(note.patient_name || '').trim() === episode.patientName;

          return sameBed && samePatient;
        });

        const searchableText = [
          episode.roomNumber,
          episode.patientName,
          formatPatientBedLabel({
            roomNumber: episode.roomNumber,
            bedNumber: episode.bedNumber,
            patientName: episode.patientName,
          }),
          ...notesForEpisode.map((note) => buildHandoverSearchText(note)),
        ]
          .join(' ')
          .toLowerCase();

        if (normalizedSearchQuery && !searchableText.includes(normalizedSearchQuery)) {
          return null;
        }

        return {
          key: episode.episodeKey,
          testIdKey: `${episode.bedKey}-${episode.startDate}`,
          label: formatPatientBedLabel({
            roomNumber: episode.roomNumber,
            bedNumber: episode.bedNumber,
            patientName: episode.patientName,
          }),
          roomNumber: episode.roomNumber,
          bedNumber: episode.bedNumber,
          patientName: episode.patientName,
          patientKey: episode.patientKey,
          startDate: episode.startDate,
          endDate: episode.endDate,
          notes: notesForEpisode,
        };
      })
      .filter((group): group is PatientGroup => !!group);

    const dedupedGroups = new Map<string, PatientGroup>();
    nextGroups.forEach((group) => {
      if (!dedupedGroups.has(group.key)) {
        dedupedGroups.set(group.key, group);
      }
    });

    return Array.from(dedupedGroups.values()).sort((left, right) => {
      const roomCompare = compareRooms(left.roomNumber, right.roomNumber);
      if (roomCompare !== 0) return roomCompare;
      if (left.bedNumber !== right.bedNumber) return left.bedNumber - right.bedNumber;
      const startCompare = compareDateKeys(left.startDate, right.startDate);
      if (startCompare !== 0) return startCompare;
      return left.patientName.localeCompare(right.patientName, 'ko-KR', { sensitivity: 'base' });
    });
  }, [contentNotes, normalizedSearchQuery, patientEpisodes, selectedDateKey]);

  const visibleNoteCount = generalNotes.length + patientGroups.reduce((sum, group) => sum + group.notes.length, 0);
  const selectedPatientGroup = useMemo(
    () => patientGroups.find((group) => group.key === selectedPatientGroupKey) || null,
    [patientGroups, selectedPatientGroupKey],
  );

  const bedOptions = useMemo<BedOption[]>(() => {
    const dedupedOptions = new Map<string, BedOption>();

    patientGroups
      .map((group) => ({
        selectionKey: group.key,
        bedKey: buildBedKey(group.roomNumber, group.bedNumber) || `${group.roomNumber}-${group.bedNumber}`,
        roomNumber: group.roomNumber,
        roomCapacity: roomConfigs.find((room) => room.roomNumber === group.roomNumber)?.capacity || 4,
        bedNumber: group.bedNumber,
        patientName: group.patientName,
        admissionDate: group.startDate,
        label: group.label,
      }))
      .forEach((option) => {
        if (!dedupedOptions.has(option.selectionKey)) {
          dedupedOptions.set(option.selectionKey, option);
        }
      });

    return Array.from(dedupedOptions.values()).sort((left, right) => {
        const roomCompare = compareRooms(left.roomNumber, right.roomNumber);
        if (roomCompare !== 0) return roomCompare;
        return left.bedNumber - right.bedNumber;
      });
  }, [patientGroups, roomConfigs]);

  useEffect(() => {
    if (noteScope !== 'patient') return;
    if (selectedBedKey && !bedOptions.some((option) => option.selectionKey === selectedBedKey)) {
      setSelectedBedKey('');
    }
  }, [bedOptions, noteScope, selectedBedKey]);

  useEffect(() => {
    if (selectedPatientGroupKey && !patientGroups.some((group) => group.key === selectedPatientGroupKey)) {
      setSelectedPatientGroupKey('');
    }
  }, [patientGroups, selectedPatientGroupKey]);

  const selectedBed = useMemo(() => bedOptions.find((option) => option.selectionKey === selectedBedKey) || null, [bedOptions, selectedBedKey]);
  function openBedSettings() {
    setRoomConfigs(effectiveRoomConfigs);
    setRoomDirty(false);
    setRoomStatus('idle');
    setShowBedSettings(true);
  }

  function closeBedSettings() {
    if (roomDirty && !window.confirm('저장하지 않은 병상 설정이 있습니다. 닫으시겠습니까?')) {
      return;
    }
    setShowBedSettings(false);
    setRoomConfigs(effectiveRoomConfigs);
    setRoomDirty(false);
    setRoomStatus('idle');
  }

  async function handleSaveRoomConfigs() {
    if (roomStatus === 'saving') return;
    await persistRoomConfigs(roomConfigs);
  }

  function replaceRooms(nextRooms: HandoverRoomConfig[]) {
    setRoomConfigs(normalizeHandoverRoomConfigs(nextRooms));
    setRoomDirty(true);
    setRoomStatus('idle');
  }

  function handleAddRoom() {
    const roomNumber = normalizeRoomNumber(newRoomNumber);
    const capacity = normalizeRoomCapacity(newRoomCapacity) || 4;
    if (!roomNumber) {
      toast('병실 호수를 입력해주세요.', 'warning');
      return;
    }
    if (roomConfigs.some((room) => room.roomNumber === roomNumber)) {
      toast('같은 병실 호수가 이미 있습니다.', 'warning');
      return;
    }
    replaceRooms([...roomConfigs, createRoom(roomNumber, capacity, selectedDateKey)]);
    setNewRoomNumber('');
    setNewRoomCapacity(4);
  }

  function handleRoomNumberChange(roomId: string, value: string) {
    replaceRooms(roomConfigs.map((room) => (room.id === roomId ? { ...room, roomNumber: value } : room)));
  }

  function handleRoomCapacityChange(roomId: string, value: number) {
    const capacity = normalizeRoomCapacity(value) || 4;
    replaceRooms(
      roomConfigs.map((room) => {
        if (room.id !== roomId) return room;
        return {
          ...room,
          capacity,
          beds: Array.from({ length: capacity }, (_, index) => ({
            bedNumber: index + 1,
            patientName: room.beds.find((bed) => bed.bedNumber === index + 1)?.patientName || '',
            admissionDate:
              room.beds.find((bed) => bed.bedNumber === index + 1)?.admissionDate || selectedDateKey,
          })),
        };
      }),
    );
  }

  function handleBedPatientChange(roomId: string, bedNumber: number, patientName: string) {
    replaceRooms(
      roomConfigs.map((room) => {
        if (room.id !== roomId) return room;
        return {
          ...room,
          beds: room.beds.map((bed) =>
            bed.bedNumber === bedNumber
              ? {
                  ...bed,
                  patientName,
                  admissionDate: patientName.trim() ? bed.admissionDate || selectedDateKey : null,
                }
              : bed,
          ),
        };
      }),
    );
  }

  function handleBedAdmissionDateChange(roomId: string, bedNumber: number, value: string) {
    replaceRooms(
      roomConfigs.map((room) => {
        if (room.id !== roomId) return room;
        return {
          ...room,
          beds: room.beds.map((bed) =>
            bed.bedNumber === bedNumber
              ? {
                  ...bed,
                  admissionDate: normalizeDateKey(value),
                }
              : bed,
          ),
        };
      }),
    );
  }

  async function handleCreateNote() {
    const trimmedContent = content.trim();
    if (!trimmedContent || saving) return;
    if (noteScope === 'patient' && !selectedBed) {
      toast('환자별 인계는 병상 설정에서 환자를 지정한 뒤 선택해주세요.', 'warning');
      return;
    }

    const patientName = selectedBed?.patientName || null;
    const roomNumber = selectedBed?.roomNumber || null;
    const roomCapacity = selectedBed?.roomCapacity || null;
    const bedNumber = selectedBed?.bedNumber || null;

    setSaving(true);
    try {
      const { data, error } = await withMissingColumnsFallback(
        (omittedColumns) => {
          const storeMetadataInContent =
            omittedColumns.has('patient_name') ||
            omittedColumns.has('patient_key') ||
            omittedColumns.has('note_scope') ||
            omittedColumns.has('handover_date') ||
            omittedColumns.has('room_number') ||
            omittedColumns.has('room_capacity') ||
            omittedColumns.has('bed_number') ||
            omittedColumns.has('bed_key');

          const payload: Record<string, any> = {
            content: storeMetadataInContent
              ? encodeHandoverContent(trimmedContent, {
                  noteScope,
                  patientName,
                  handoverDate: selectedDateKey,
                  roomNumber,
                  roomCapacity,
                  bedNumber,
                })
              : trimmedContent,
            author_id: user?.id || 'unknown',
            author_name: user?.name || '이름 없음',
            shift,
            priority,
            is_completed: false,
            created_at: new Date().toISOString(),
          };

          if (!omittedColumns.has('patient_name')) payload.patient_name = noteScope === 'patient' ? patientName : null;
          if (!omittedColumns.has('patient_key')) payload.patient_key = noteScope === 'patient' ? buildPatientKey(patientName) : null;
          if (!omittedColumns.has('note_scope')) payload.note_scope = noteScope;
          if (!omittedColumns.has('handover_date')) payload.handover_date = selectedDateKey;
          if (!omittedColumns.has('room_number')) payload.room_number = noteScope === 'patient' ? roomNumber : null;
          if (!omittedColumns.has('room_capacity')) payload.room_capacity = noteScope === 'patient' ? roomCapacity : null;
          if (!omittedColumns.has('bed_number')) payload.bed_number = noteScope === 'patient' ? bedNumber : null;
          if (!omittedColumns.has('bed_key')) payload.bed_key = noteScope === 'patient' ? buildBedKey(roomNumber, bedNumber) : null;

          return supabase.from('handover_notes').insert([payload]).select('*').single();
        },
        ['patient_name', 'patient_key', 'note_scope', 'handover_date', 'room_number', 'room_capacity', 'bed_number', 'bed_key'],
      );

      if (error) {
        console.error('인계노트 저장 실패:', error);
        toast('인계노트 저장 중 오류가 발생했습니다.', 'error');
        return;
      }

      if (data) {
        const normalized = normalizeHandoverNote(data as HandoverNoteRow);
        setNotes((prev) => [normalized, ...prev.filter((note) => note.id !== normalized.id)]);
      }

      setContent('');
      setShift(DEFAULT_SHIFT);
      setPriority(DEFAULT_PRIORITY);
      setNoteScope(DEFAULT_SCOPE);
      setSelectedBedKey('');
    } catch (error) {
      console.error('인계노트 저장 중 오류:', error);
      toast('인계노트 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function resetNoteAction(noteId: string) {
    setNoteActionValues((prev) => ({ ...prev, [noteId]: '' }));
  }

  function beginNoteEdit(note: HandoverNote) {
    setEditingNoteId(note.id);
    setEditingContent(note.content);
  }

  function cancelNoteEdit() {
    setEditingNoteId(null);
    setEditingContent('');
  }

  async function markNoteCompleted(targetNote: HandoverNote) {
    if (targetNote.is_completed) return;

    setNoteMutationId(targetNote.id);
    setNotes((prev) => prev.map((note) => (note.id === targetNote.id ? { ...note, is_completed: true } : note)));

    try {
      const { error } = await supabase.from('handover_notes').update({ is_completed: true }).eq('id', targetNote.id);
      if (error) throw error;
    } catch (error) {
      console.error('인계노트 완료 처리 실패:', error);
      setNotes((prev) => prev.map((note) => (note.id === targetNote.id ? { ...note, is_completed: targetNote.is_completed } : note)));
      toast('인계노트 완료 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setNoteMutationId(null);
    }
  }

  async function saveNoteEdit(targetNote: HandoverNote) {
    const trimmedContent = editingContent.trim();
    if (!trimmedContent) {
      toast('수정할 내용을 입력해주세요.', 'success');
      return;
    }

    setNoteMutationId(targetNote.id);

    try {
      const { data, error } = await withMissingColumnsFallback(
        (omittedColumns) => {
          const storeMetadataInContent =
            omittedColumns.has('patient_name') ||
            omittedColumns.has('patient_key') ||
            omittedColumns.has('note_scope') ||
            omittedColumns.has('handover_date') ||
            omittedColumns.has('room_number') ||
            omittedColumns.has('room_capacity') ||
            omittedColumns.has('bed_number') ||
            omittedColumns.has('bed_key');

          const payload: Record<string, any> = {
            content: storeMetadataInContent
              ? encodeHandoverContent(trimmedContent, {
                  noteScope: targetNote.note_scope,
                  patientName: targetNote.patient_name,
                  handoverDate: targetNote.handover_date,
                  roomNumber: targetNote.room_number,
                  roomCapacity: targetNote.room_capacity,
                  bedNumber: targetNote.bed_number,
                })
              : trimmedContent,
          };

          return supabase.from('handover_notes').update(payload).eq('id', targetNote.id).select('*').single();
        },
        ['patient_name', 'patient_key', 'note_scope', 'handover_date', 'room_number', 'room_capacity', 'bed_number', 'bed_key'],
      );

      if (error) throw error;

      if (data) {
        const normalized = normalizeHandoverNote(data as HandoverNoteRow);
        setNotes((prev) => prev.map((note) => (note.id === normalized.id ? normalized : note)));
      } else {
        setNotes((prev) => prev.map((note) => (note.id === targetNote.id ? { ...note, content: trimmedContent } : note)));
      }

      cancelNoteEdit();
    } catch (error) {
      console.error('인계노트 수정 실패:', error);
      toast('인계노트 수정 중 오류가 발생했습니다.', 'error');
    } finally {
      setNoteMutationId(null);
    }
  }

  async function deleteNote(targetNote: HandoverNote) {
    const shouldDelete = window.confirm('이 인계노트를 삭제할까요?');
    if (!shouldDelete) return;

    setNoteMutationId(targetNote.id);

    try {
      const { error } = await supabase.from('handover_notes').delete().eq('id', targetNote.id);
      if (error) throw error;

      setNotes((prev) => prev.filter((note) => note.id !== targetNote.id));
      if (editingNoteId === targetNote.id) {
        cancelNoteEdit();
      }
    } catch (error) {
      console.error('인계노트 삭제 실패:', error);
      toast('인계노트 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setNoteMutationId(null);
    }
  }

  function handleNoteAction(note: HandoverNote, action: string) {
    setNoteActionValues((prev) => ({ ...prev, [note.id]: action }));

    if (action === 'edit') {
      beginNoteEdit(note);
      resetNoteAction(note.id);
      return;
    }

    if (action === 'delete') {
      resetNoteAction(note.id);
      void deleteNote(note);
      return;
    }

    if (action === 'complete') {
      resetNoteAction(note.id);
      void markNoteCompleted(note);
      return;
    }

    resetNoteAction(note.id);
  }

  function renderNote(note: HandoverNote) {
    const isEditing = editingNoteId === note.id;
    const isMutating = noteMutationId === note.id;

    return (
      <div key={note.id} className={`rounded-[var(--radius-xl)] border px-4 py-3 shadow-sm ${note.is_completed ? 'border-[var(--border)] bg-[var(--page-bg)]' : note.priority === 'High' ? 'border-red-200 bg-red-50/60' : 'border-[var(--border)] bg-[var(--card)]'}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[var(--accent)]">{note.shift}</span>
              <span className={`rounded-[var(--radius-md)] px-2.5 py-1 ${note.priority === 'High' ? 'bg-red-100 text-red-600' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-3)]'}`}>{note.priority === 'High' ? '중요' : '일반'}</span>
              <span className={`rounded-[var(--radius-md)] px-2.5 py-1 ${note.note_scope === 'patient' ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}>{note.note_scope === 'patient' ? '환자별' : '공통'}</span>
              {note.note_scope === 'patient' ? <span className="rounded-[var(--radius-md)] bg-emerald-50 px-2.5 py-1 text-emerald-700">{formatPatientBedLabel(note)}</span> : null}
              <span className="text-[var(--toss-gray-3)]">{note.author_name || '이름 없음'} · {createdLabel(note.created_at)}</span>
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editingContent}
                  onChange={(event) => setEditingContent(event.target.value)}
                  rows={4}
                  data-testid={`handover-note-edit-content-${note.id}`}
                  className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-3 py-2 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelNoteEdit}
                    className="rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveNoteEdit(note)}
                    disabled={isMutating}
                    className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isMutating ? '저장 중' : '수정 저장'}
                  </button>
                </div>
              </div>
            ) : (
              <p className={`whitespace-pre-wrap text-sm leading-6 ${note.is_completed ? 'text-[var(--toss-gray-3)] line-through' : 'text-[var(--foreground)]'}`}>{note.content}</p>
            )}
          </div>
          <div className="shrink-0">
            <select
              value={noteActionValues[note.id] ?? ''}
              onChange={(event) => handleNoteAction(note, event.target.value)}
              data-testid={`handover-note-action-${note.id}`}
              disabled={isMutating}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">없음</option>
              <option value="edit">수정</option>
              <option value="delete">삭제</option>
              <option value="complete">완료</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm" data-testid="handover-notes-view">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">병동 인계노트</h2>
          <p className="mt-1 text-xs font-medium text-[var(--toss-gray-3)]">{fullDateLabel(selectedDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={selectedDateKey}
            onChange={(event) => setSelectedDate(fromDateKey(event.target.value))}
            data-testid="handover-date-input"
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(new Date())}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
          >
            오늘
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="인계 검색"
            data-testid="handover-search-input"
            className="w-[150px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
          <button
            type="button"
            onClick={openBedSettings}
            data-testid="handover-bed-settings-open"
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            병상설정
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
        <aside className="space-y-4">
          <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)]"
              >
                이전
              </button>
              <h4 className="text-sm font-bold text-[var(--foreground)]">{monthLabel(currentMonth)}</h4>
              <button
                type="button"
                onClick={() => setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)]"
              >
                다음
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="py-0.5 text-center text-[10px] font-bold text-[var(--toss-gray-3)]">
                  {label}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {currentMonthGrid.map((cell, index) => {
                if (!cell) {
                  return <div key={`empty-${index}`} className="min-h-[64px] rounded-[var(--radius-md)] border border-transparent" />;
                }

                const dateKey = toDateKey(cell);
                const summary = summaryByDate.get(dateKey) || emptySummary();
                const isSelected = dateKey === selectedDateKey;
                const isToday = dateKey === todayKey;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDate(cell)}
                    className={`min-h-[64px] rounded-[var(--radius-md)] border px-2 py-1.5 text-left transition ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/60 shadow-sm'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/40 hover:bg-[var(--toss-blue-light)]/20'
                    }`}
                  >
                    <div className="flex h-full flex-col justify-between">
                      <div className="flex items-start justify-between">
                        <span className={`text-[11px] font-black ${isToday ? 'text-emerald-600' : 'text-[var(--foreground)]'}`}>
                          {cell.getDate()}
                        </span>
                        {summary.total > 0 ? <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> : null}
                      </div>
                      <div className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                        {summary.total > 0 ? `총 ${summary.total}건` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
              <div className="text-xs font-bold text-[var(--toss-gray-3)]">선택일 공통 인계</div>
              <div className="mt-2 text-xl font-black text-[var(--foreground)]">{generalNotes.length}건</div>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
              <div className="text-xs font-bold text-[var(--toss-gray-3)]">선택일 환자별 인계</div>
              <div className="mt-2 text-xl font-black text-emerald-700">{patientGroups.length}명</div>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
              <div className="text-xs font-bold text-[var(--toss-gray-3)]">검색 결과</div>
              <div className="mt-2 text-xl font-black text-[var(--foreground)]">{visibleNoteCount}건</div>
            </div>
          </section>
        </aside>

        <section className="space-y-4">
          <section className="space-y-3 rounded-[var(--radius-xl)] bg-[var(--page-bg)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="handover-scope-general"
                  onClick={() => {
                    setNoteScope('general');
                    setSelectedBedKey('');
                  }}
                  className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold ${
                    noteScope === 'general' ? 'bg-slate-900 text-white' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
                  }`}
                >
                  공통 인계
                </button>
                <button
                  type="button"
                  data-testid="handover-scope-patient"
                  onClick={() => setNoteScope('patient')}
                  className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold ${
                    noteScope === 'patient' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  환자별 인계사항
                </button>
              </div>
              <span className="text-xs font-medium text-[var(--toss-gray-3)]">{fullDateLabel(selectedDate)}</span>
            </div>

            {noteScope === 'patient' ? (
              <div className="space-y-3 rounded-[var(--radius-lg)] border border-emerald-100 bg-emerald-50/70 p-3">
                {bedOptions.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-700">
                    먼저 병상 설정에서 환자를 지정해주세요.
                  </div>
                ) : (
                  <>
                    <select
                      data-testid="handover-patient-select"
                      value={selectedBedKey}
                      onChange={(event) => setSelectedBedKey(event.target.value)}
                      className="w-full rounded-[var(--radius-md)] border border-emerald-200 bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-emerald-300 md:max-w-[320px]"
                    >
                      <option value="">환자 선택</option>
                      {bedOptions.map((option) => (
                        <option key={option.selectionKey} value={option.selectionKey}>
                          {option.label} · 입원 {dateLabel(option.admissionDate)}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      {bedOptions.map((option) => (
                        <button
                          key={option.selectionKey}
                          type="button"
                          onClick={() => setSelectedBedKey(option.selectionKey)}
                          className={`rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold transition ${
                            selectedBedKey === option.selectionKey ? 'bg-emerald-600 text-white' : 'bg-[var(--card)] text-emerald-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {noteScope === 'general' ? (
              <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={shift}
                    onChange={(event) => setShift(event.target.value)}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
                  >
                    <option value="Day">Day</option>
                    <option value="Evening">Evening</option>
                    <option value="Night">Night</option>
                  </select>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
                  >
                    <option value="Normal">일반</option>
                    <option value="High">중요</option>
                  </select>
                  <span className="text-xs font-medium text-[var(--toss-gray-3)]">미완료 상태면 이후 날짜에도 계속 표시됩니다.</span>
                </div>
                <textarea
                  data-testid="handover-note-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="공지사항처럼 공통 인계 내용을 자세히 입력해주세요"
                  rows={6}
                  className="min-h-[180px] w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3 text-sm leading-6 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="handover-note-add"
                    onClick={handleCreateNote}
                    disabled={saving || !content.trim()}
                    className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? '저장 중' : '공통 인계 등록'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-[140px_140px_minmax(0,1fr)_auto]">
                <select
                  value={shift}
                  onChange={(event) => setShift(event.target.value)}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
                >
                  <option value="Day">Day</option>
                  <option value="Evening">Evening</option>
                  <option value="Night">Night</option>
                </select>
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
                >
                  <option value="Normal">일반</option>
                  <option value="High">중요</option>
                </select>
                <input
                  type="text"
                  data-testid="handover-note-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="선택한 환자에게 필요한 인계 내용을 입력해주세요"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                />
                <button
                  type="button"
                  data-testid="handover-note-add"
                  onClick={handleCreateNote}
                  disabled={saving || !content.trim()}
                  className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? '저장 중' : '인계 추가'}
                </button>
              </div>
            )}
          </section>

          {noteScope === 'patient' ? (
            <section className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--foreground)]">선택일 입원환자 목록</h3>
                <span className="text-xs text-[var(--toss-gray-3)]">{patientGroups.length}명</span>
              </div>
              {patientGroups.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)]">
                  선택한 날짜에 입원 중인 환자가 없습니다.
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {patientGroups.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setSelectedPatientGroupKey(group.key)}
                      data-testid={`handover-patient-open-${group.testIdKey}`}
                      className="rounded-[var(--radius-xl)] border border-emerald-100 bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-emerald-900">{group.label}</div>
                          <div className="mt-1 text-xs text-emerald-700">
                            입원 {dateLabel(group.startDate)}
                            {group.endDate ? ` · 종료 ${dateLabel(group.endDate)}` : ' · 현재 입원 중'}
                          </div>
                        </div>
                        <span className="rounded-[var(--radius-md)] bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          인계 {group.notes.length}건
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {noteScope === 'general' ? (
            <section className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--foreground)]">공통 인계</h3>
                <span className="text-xs text-[var(--toss-gray-3)]">{generalNotes.length}건</span>
              </div>

              {loading ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
                  인계노트를 불러오는 중입니다.
                </div>
              ) : generalNotes.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
                  선택한 날짜의 공통 인계가 없습니다.
                </div>
              ) : (
                <div className="space-y-3">{generalNotes.map(renderNote)}</div>
              )}
            </section>
          ) : null}
        </section>
      </div>

      {selectedPatientGroup ? (
        <div className="fixed inset-0 z-[119] flex items-center justify-center bg-slate-950/45 px-4 py-4" data-testid="handover-patient-history-modal">
          <div className="max-h-[82vh] w-full max-w-[860px] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">{selectedPatientGroup.label}</h3>
                <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                  입원 {dateLabel(selectedPatientGroup.startDate)}
                  {selectedPatientGroup.endDate ? ` · 종료 ${dateLabel(selectedPatientGroup.endDate)}` : ' · 현재 입원 중'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPatientGroupKey('')}
                data-testid="handover-patient-history-close"
                className="rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
              >
                닫기
              </button>
            </div>
            <div className="max-h-[calc(82vh-70px)] overflow-y-auto p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
                  <div className="text-xs font-bold text-[var(--toss-gray-3)]">입원 병실</div>
                  <div className="mt-2 text-lg font-black text-[var(--foreground)]">
                    {selectedPatientGroup.roomNumber}호 {selectedPatientGroup.bedNumber}번
                  </div>
                </div>
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
                  <div className="text-xs font-bold text-[var(--toss-gray-3)]">입원 시작일</div>
                  <div className="mt-2 text-lg font-black text-[var(--foreground)]">{dateLabel(selectedPatientGroup.startDate)}</div>
                </div>
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
                  <div className="text-xs font-bold text-[var(--toss-gray-3)]">누적 인계사항</div>
                  <div className="mt-2 text-lg font-black text-emerald-700">{selectedPatientGroup.notes.length}건</div>
                </div>
              </div>

              <div className="mt-4 rounded-[var(--radius-xl)] border border-emerald-100 bg-emerald-50/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-emerald-900">입원 구간 전체 인계 이력</h4>
                  <span className="text-xs text-emerald-700">
                    {dateLabel(selectedPatientGroup.startDate)}부터 {selectedPatientGroup.endDate ? dateLabel(selectedPatientGroup.endDate) : '현재'}까지
                  </span>
                </div>
                {selectedPatientGroup.notes.length === 0 ? (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-emerald-200 px-4 py-10 text-center text-sm text-emerald-700">
                    이 입원 구간에는 아직 등록된 환자별 인계사항이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">{selectedPatientGroup.notes.map(renderNote)}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showBedSettings ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 py-4" data-testid="handover-bed-settings-modal">
          <div className="max-h-[82vh] w-full max-w-[720px] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">병상 설정</h3>
                <p className="mt-0.5 text-[11px] text-[var(--toss-gray-3)]">{fullDateLabel(selectedDate)}</p>
              </div>
              <div className="flex items-center gap-2">
                {roomDirty ? <span className="rounded-[var(--radius-md)] bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">수정됨</span> : null}
                {roomStatus === 'saving' ? <span className="rounded-[var(--radius-md)] bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">저장 중</span> : null}
                {roomStatus === 'saved' ? <span className="rounded-[var(--radius-md)] bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">저장됨</span> : null}
                {roomStatus === 'error' ? <span className="rounded-[var(--radius-md)] bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-600">저장 실패</span> : null}
                <button
                  type="button"
                  onClick={() => void handleSaveRoomConfigs()}
                  data-testid="handover-bed-settings-save"
                  disabled={roomStatus === 'saving' || !roomDirty}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={closeBedSettings}
                  data-testid="handover-bed-settings-close"
                  className="rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="max-h-[calc(82vh-62px)] overflow-y-auto px-3 py-2.5">
              <div className="grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-1.5 sm:grid-cols-[72px_72px_auto]">
                <input
                  type="text"
                  value={newRoomNumber}
                  onChange={(event) => setNewRoomNumber(event.target.value)}
                  placeholder="예: 101"
                  data-testid="handover-new-room-number"
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
                />
                <select
                  value={newRoomCapacity}
                  onChange={(event) => setNewRoomCapacity(Number(event.target.value))}
                  data-testid="handover-new-room-capacity"
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--accent)]"
                >
                  {[1, 2, 3, 4].map((capacity) => (
                    <option key={capacity} value={capacity}>
                      {capacity}인실
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddRoom}
                  data-testid="handover-add-room"
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  병실 추가
                </button>
              </div>

              {roomConfigs.length === 0 ? (
                <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
                  등록된 병상 설정이 없습니다.
                </div>
              ) : (
                 <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {roomConfigs.map((room, roomIndex) => (
                     <div key={room.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-2 shadow-sm">
                       <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_68px_auto] sm:items-center">
                         <input
                           type="text"
                           value={room.roomNumber}
                           onChange={(event) => handleRoomNumberChange(room.id, event.target.value)}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--accent)]"
                         />
                         <select
                           value={room.capacity}
                           onChange={(event) => handleRoomCapacityChange(room.id, Number(event.target.value))}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--accent)]"
                         >
                           {[1, 2, 3, 4].map((capacity) => (
                             <option key={capacity} value={capacity}>
                               {capacity}인실
                             </option>
                           ))}
                         </select>
                         <button
                           type="button"
                           onClick={() => replaceRooms(roomConfigs.filter((item) => item.id !== room.id))}
                            className="rounded-[var(--radius-md)] bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100"
                         >
                           호수 삭제
                         </button>
                       </div>

                        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                          {room.beds.map((bed, bedIndex) => (
                            <div key={`${room.id}-${bed.bedNumber}`} className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2">
                              <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">{room.roomNumber}호 {bed.bedNumber}번</div>
                              <input
                                type="text"
                                value={bed.patientName}
                                onChange={(event) => handleBedPatientChange(room.id, bed.bedNumber, event.target.value)}
                                placeholder="환자 이름"
                                data-testid={`handover-room-${roomIndex}-patient-${bedIndex}`}
                                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
                              />
                              <input
                                type="date"
                                value={bed.admissionDate || ''}
                                onChange={(event) => handleBedAdmissionDateChange(room.id, bed.bedNumber, event.target.value)}
                                data-testid={`handover-room-${roomIndex}-admission-${bedIndex}`}
                                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
                              />
                            </div>
                          ))}
                       </div>
                     </div>
                   ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
