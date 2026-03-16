'use client';

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
  bedKey: string;
  roomNumber: string;
  roomCapacity: number;
  bedNumber: number;
  patientName: string;
  label: string;
};

type Summary = { general: number; patient: number; total: number };
type RoomStatus = 'idle' | 'saving' | 'saved' | 'error';

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

function createdLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function createRoom(roomNumber: string, capacity: number): HandoverRoomConfig {
  return {
    id: crypto.randomUUID(),
    roomNumber,
    capacity,
    beds: Array.from({ length: capacity }, (_, index) => ({
      bedNumber: index + 1,
      patientName: '',
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
  const [showBedSettings, setShowBedSettings] = useState(false);

  const skipRoomPersistRef = useRef(true);
  const roomStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const currentMonth = useMemo(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), [selectedDate]);
  const currentMonthGrid = useMemo(() => monthGrid(currentMonth), [currentMonth]);

  useEffect(() => {
    void loadNotes();
    return () => {
      if (roomStatusTimerRef.current) clearTimeout(roomStatusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const configNote = notes.find(
      (note) => note.handover_kind === 'room_config' && note.handover_date === selectedDateKey,
    );
    skipRoomPersistRef.current = true;
    setRoomConfigs(configNote ? parseRoomConfigsFromNote(configNote) : []);
    setSelectedBedKey('');
  }, [notes, selectedDateKey]);

  useEffect(() => {
    if (skipRoomPersistRef.current) {
      skipRoomPersistRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void persistRoomConfigs(roomConfigs);
    }, 500);
    return () => clearTimeout(timer);
  }, [roomConfigs, selectedDateKey]);

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

  const selectedDateNotes = useMemo(() => {
    return notes
      .filter((note) => note.handover_kind === 'note' && note.handover_date === selectedDateKey)
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
  }, [notes, selectedDateKey]);

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return selectedDateNotes;
    return selectedDateNotes.filter((note) => buildHandoverSearchText(note).includes(query));
  }, [searchQuery, selectedDateNotes]);

  const generalNotes = useMemo(() => {
    return filteredNotes.filter((note) => note.note_scope !== 'patient' || !note.patient_name);
  }, [filteredNotes]);

  const patientGroups = useMemo(() => {
    const groups = new Map<string, { label: string; roomNumber: string | null; bedNumber: number | null; patientName: string; notes: HandoverNote[] }>();
    filteredNotes.forEach((note) => {
      if (note.note_scope !== 'patient' || !note.patient_name) return;
      const key = note.bed_key || note.patient_key || note.id;
      const current = groups.get(key);
      if (current) {
        current.notes.push(note);
        return;
      }
      groups.set(key, {
        label: formatPatientBedLabel(note),
        roomNumber: note.room_number,
        bedNumber: note.bed_number,
        patientName: note.patient_name,
        notes: [note],
      });
    });
    return Array.from(groups.entries())
      .map(([key, value]) => ({
        key,
        ...value,
        notes: value.notes.sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()),
      }))
      .sort((left, right) => {
        const roomCompare = compareRooms(left.roomNumber, right.roomNumber);
        if (roomCompare !== 0) return roomCompare;
        return (left.bedNumber || 0) - (right.bedNumber || 0);
      });
  }, [filteredNotes]);

  const bedOptions = useMemo<BedOption[]>(() => {
    return roomConfigs
      .flatMap((room) =>
        room.beds.map((bed) => ({
          bedKey: buildBedKey(room.roomNumber, bed.bedNumber) || `${room.id}-${bed.bedNumber}`,
          roomNumber: room.roomNumber,
          roomCapacity: room.capacity,
          bedNumber: bed.bedNumber,
          patientName: bed.patientName,
          label: formatPatientBedLabel({ roomNumber: room.roomNumber, bedNumber: bed.bedNumber, patientName: bed.patientName }),
        })),
      )
      .filter((option) => option.patientName)
      .sort((left, right) => {
        const roomCompare = compareRooms(left.roomNumber, right.roomNumber);
        if (roomCompare !== 0) return roomCompare;
        return left.bedNumber - right.bedNumber;
      });
  }, [roomConfigs]);

  useEffect(() => {
    if (noteScope !== 'patient') return;
    if (selectedBedKey && !bedOptions.some((option) => option.bedKey === selectedBedKey)) {
      setSelectedBedKey('');
    }
  }, [bedOptions, noteScope, selectedBedKey]);

  const selectedBed = useMemo(() => bedOptions.find((option) => option.bedKey === selectedBedKey) || null, [bedOptions, selectedBedKey]);
  function replaceRooms(nextRooms: HandoverRoomConfig[]) {
    setRoomConfigs(normalizeHandoverRoomConfigs(nextRooms));
  }

  function handleAddRoom() {
    const roomNumber = normalizeRoomNumber(newRoomNumber);
    const capacity = normalizeRoomCapacity(newRoomCapacity) || 4;
    if (!roomNumber) {
      alert('병실 호수를 입력해주세요.');
      return;
    }
    if (roomConfigs.some((room) => room.roomNumber === roomNumber)) {
      alert('같은 병실 호수가 이미 있습니다.');
      return;
    }
    replaceRooms([...roomConfigs, createRoom(roomNumber, capacity)]);
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
          beds: room.beds.map((bed) => (bed.bedNumber === bedNumber ? { ...bed, patientName } : bed)),
        };
      }),
    );
  }

  async function handleCreateNote() {
    const trimmedContent = content.trim();
    if (!trimmedContent || saving) return;
    if (noteScope === 'patient' && !selectedBed) {
      alert('환자별 인계는 병상 설정에서 환자를 지정한 뒤 선택해주세요.');
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
        alert('인계노트 저장 중 오류가 발생했습니다.');
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
      alert('인계노트 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompleted(targetNote: HandoverNote) {
    const nextCompleted = !targetNote.is_completed;
    setNotes((prev) => prev.map((note) => (note.id === targetNote.id ? { ...note, is_completed: nextCompleted } : note)));
    const { error } = await supabase.from('handover_notes').update({ is_completed: nextCompleted }).eq('id', targetNote.id);
    if (error) {
      console.error('인계노트 완료 상태 변경 실패:', error);
      setNotes((prev) => prev.map((note) => (note.id === targetNote.id ? { ...note, is_completed: targetNote.is_completed } : note)));
      alert('인계노트 상태 변경 중 오류가 발생했습니다.');
    }
  }

  function renderNote(note: HandoverNote) {
    return (
      <div key={note.id} className={`rounded-[18px] border px-4 py-3 shadow-sm ${note.is_completed ? 'border-[var(--toss-border)] bg-[var(--page-bg)]' : note.priority === 'High' ? 'border-red-200 bg-red-50/60' : 'border-[var(--toss-border)] bg-[var(--toss-card)]'}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-[var(--toss-blue-light)] px-2.5 py-1 text-[var(--toss-blue)]">{note.shift}</span>
              <span className={`rounded-full px-2.5 py-1 ${note.priority === 'High' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-[var(--toss-gray-3)]'}`}>{note.priority === 'High' ? '중요' : '일반'}</span>
              <span className={`rounded-full px-2.5 py-1 ${note.note_scope === 'patient' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{note.note_scope === 'patient' ? '환자별' : '공통'}</span>
              {note.note_scope === 'patient' ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{formatPatientBedLabel(note)}</span> : null}
              <span className="text-[var(--toss-gray-3)]">{note.author_name || '이름 없음'} · {createdLabel(note.created_at)}</span>
            </div>
            <p className={`whitespace-pre-wrap text-sm leading-6 ${note.is_completed ? 'text-[var(--toss-gray-3)] line-through' : 'text-[var(--foreground)]'}`}>{note.content}</p>
          </div>
          <button type="button" onClick={() => toggleCompleted(note)} className={`shrink-0 rounded-[12px] px-3 py-2 text-xs font-semibold transition ${note.is_completed ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--page-bg)] text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}>
            {note.is_completed ? '완료됨' : '완료 처리'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--toss-border)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-xl font-bold text-[var(--foreground)]">병동 인계노트</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={selectedDateKey}
            onChange={(event) => setSelectedDate(fromDateKey(event.target.value))}
            className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--toss-blue)] focus:ring-2 focus:ring-[var(--toss-blue)]/20"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(new Date())}
            className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--page-bg)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--toss-gray-1)]"
          >
            오늘
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="검색"
            className="w-[140px] rounded-[12px] border border-[var(--toss-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--toss-blue)] focus:ring-2 focus:ring-[var(--toss-blue)]/20"
          />
          <button
            type="button"
            onClick={() => setShowBedSettings(true)}
            className="rounded-[12px] bg-[var(--toss-blue)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            병상설정
          </button>
        </div>
      </div>

      <section className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--page-bg)] p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="rounded-[10px] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)]"
          >
            이전
          </button>
          <h4 className="text-sm font-bold text-[var(--foreground)]">{monthLabel(currentMonth)}</h4>
          <button
            type="button"
            onClick={() => setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="rounded-[10px] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)]"
          >
            다음
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => <div key={label} className="py-0.5 text-center text-[10px] font-bold text-[var(--toss-gray-3)]">{label}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {currentMonthGrid.map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} className="min-h-[52px] rounded-[10px] border border-transparent" />;
            const dateKey = toDateKey(cell);
            const summary = summaryByDate.get(dateKey) || emptySummary();
            const isSelected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(cell)}
                className={`min-h-[52px] rounded-[10px] border px-2 py-1.5 text-left transition ${isSelected ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]/60 shadow-sm' : 'border-[var(--toss-border)] bg-[var(--toss-card)] hover:border-[var(--toss-blue)]/40 hover:bg-[var(--toss-blue-light)]/20'}`}
              >
                <div className="flex items-start justify-between">
                  <span className={`text-[11px] font-black ${isToday ? 'text-emerald-600' : 'text-[var(--foreground)]'}`}>{cell.getDate()}</span>
                  {summary.total > 0 ? <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--toss-blue)]" /> : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-[18px] bg-[var(--page-bg)] p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setNoteScope('general'); setSelectedBedKey(''); }} className={`rounded-full px-3 py-2 text-sm font-semibold ${noteScope === 'general' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>공통 인계</button>
          <button type="button" onClick={() => setNoteScope('patient')} className={`rounded-full px-3 py-2 text-sm font-semibold ${noteScope === 'patient' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>환자별 인계</button>
        </div>

        {noteScope === 'patient' ? (
          <div className="space-y-3 rounded-[16px] border border-emerald-100 bg-emerald-50/70 p-3">
            {bedOptions.length === 0 ? (
              <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-700">먼저 병상 설정에서 환자를 지정해주세요.</div>
            ) : (
              <>
                <select value={selectedBedKey} onChange={(event) => setSelectedBedKey(event.target.value)} className="w-full rounded-[12px] border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 md:max-w-[320px]">
                  <option value="">환자 선택</option>
                  {bedOptions.map((option) => <option key={option.bedKey} value={option.bedKey}>{option.label}</option>)}
                </select>
                <div className="flex flex-wrap gap-2">
                  {bedOptions.map((option) => (
                    <button key={option.bedKey} type="button" onClick={() => setSelectedBedKey(option.bedKey)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${selectedBedKey === option.bedKey ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700'}`}>{option.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[140px_140px_minmax(0,1fr)_auto]">
          <select value={shift} onChange={(event) => setShift(event.target.value)} className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--toss-card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--toss-blue)]"><option value="Day">Day</option><option value="Evening">Evening</option><option value="Night">Night</option></select>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--toss-card)] px-3 py-2 text-sm font-semibold outline-none transition focus:border-[var(--toss-blue)]"><option value="Normal">일반</option><option value="High">중요</option></select>
          <input type="text" value={content} onChange={(event) => setContent(event.target.value)} placeholder={noteScope === 'patient' ? '선택한 환자에게 필요한 인계 내용을 입력해주세요' : '공통 인계 내용을 입력해주세요'} className="rounded-[14px] border border-[var(--toss-border)] bg-[var(--toss-card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--toss-blue)] focus:ring-2 focus:ring-[var(--toss-blue)]/20" />
          <button type="button" onClick={handleCreateNote} disabled={saving || !content.trim()} className="rounded-[14px] bg-[var(--toss-blue)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{saving ? '저장 중' : '인계 추가'}</button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-[18px] border border-dashed border-[var(--toss-border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">인계노트를 불러오는 중입니다.</div>
      ) : filteredNotes.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[var(--toss-border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">선택한 날짜에 표시할 인계노트가 없습니다.</div>
      ) : (
        <div className="space-y-5">
          {generalNotes.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--foreground)]">공통 인계</h3>
                <span className="text-xs text-[var(--toss-gray-3)]">{generalNotes.length}건</span>
              </div>
              <div className="space-y-3">{generalNotes.map(renderNote)}</div>
            </section>
          ) : null}

          {patientGroups.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--foreground)]">환자별 인계</h3>
                <span className="text-xs text-[var(--toss-gray-3)]">{patientGroups.length}병상</span>
              </div>
              <div className="space-y-4">
                {patientGroups.map((group) => (
                  <div key={group.key} className="rounded-[18px] border border-emerald-100 bg-emerald-50/40 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-emerald-900">{group.label}</h4>
                        <p className="mt-1 text-xs text-emerald-700">{group.patientName} 관련 인계 {group.notes.length}건</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">{group.notes.length}건</span>
                    </div>
                    <div className="space-y-3">{group.notes.map(renderNote)}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {showBedSettings ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="max-h-[82vh] w-full max-w-[720px] overflow-hidden rounded-[18px] border border-[var(--toss-border)] bg-[var(--toss-card)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--toss-border)] px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)]">병상 설정</h3>
                <p className="mt-0.5 text-[11px] text-[var(--toss-gray-3)]">{fullDateLabel(selectedDate)}</p>
              </div>
              <div className="flex items-center gap-2">
                {roomStatus === 'saving' ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">저장 중</span> : null}
                {roomStatus === 'saved' ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">저장됨</span> : null}
                {roomStatus === 'error' ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-600">저장 실패</span> : null}
                <button
                  type="button"
                  onClick={() => setShowBedSettings(false)}
                  className="rounded-[10px] bg-[var(--page-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--toss-gray-1)]"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="max-h-[calc(82vh-62px)] overflow-y-auto px-3 py-2.5">
              <div className="grid gap-1.5 rounded-[12px] border border-[var(--toss-border)] bg-[var(--page-bg)] p-1.5 sm:grid-cols-[72px_72px_auto]">
                <input
                  type="text"
                  value={newRoomNumber}
                  onChange={(event) => setNewRoomNumber(event.target.value)}
                  placeholder="예: 101"
                  className="rounded-[8px] border border-[var(--toss-border)] bg-white px-2.5 py-1.5 text-xs outline-none transition focus:border-[var(--toss-blue)]"
                />
                <select
                  value={newRoomCapacity}
                  onChange={(event) => setNewRoomCapacity(Number(event.target.value))}
                  className="rounded-[8px] border border-[var(--toss-border)] bg-white px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--toss-blue)]"
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
                  className="rounded-[8px] bg-[var(--toss-blue)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  병실 추가
                </button>
              </div>

              {roomConfigs.length === 0 ? (
                <div className="mt-4 rounded-[16px] border border-dashed border-[var(--toss-border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
                  등록된 병상 설정이 없습니다.
                </div>
              ) : (
                 <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {roomConfigs.map((room) => (
                     <div key={room.id} className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--page-bg)] p-2 shadow-sm">
                       <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_68px_auto] sm:items-center">
                         <input
                           type="text"
                           value={room.roomNumber}
                           onChange={(event) => handleRoomNumberChange(room.id, event.target.value)}
                            className="rounded-[8px] border border-[var(--toss-border)] bg-white px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--toss-blue)]"
                         />
                         <select
                           value={room.capacity}
                           onChange={(event) => handleRoomCapacityChange(room.id, Number(event.target.value))}
                            className="rounded-[8px] border border-[var(--toss-border)] bg-white px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--toss-blue)]"
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
                            className="rounded-[8px] bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100"
                         >
                           호수 삭제
                         </button>
                       </div>

                        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                          {room.beds.map((bed) => (
                            <input
                              key={`${room.id}-${bed.bedNumber}`}
                              type="text"
                              value={bed.patientName}
                              onChange={(event) => handleBedPatientChange(room.id, bed.bedNumber, event.target.value)}
                              placeholder="환자 이름"
                              className="rounded-[8px] border border-[var(--toss-border)] bg-white px-2.5 py-1.5 text-xs outline-none transition focus:border-[var(--toss-blue)]"
                            />
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
