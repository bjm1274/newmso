'use client';
import { toast } from '@/lib/toast';

import { useActionDialog } from '@/app/components/useActionDialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import {
  buildBedKey,
  buildPatientKey,
  buildRoomConfigNoteContent,
  encodeHandoverContent,
  normalizeHandoverNote,
  normalizeHandoverRoomConfigs,
  normalizeDateKey,
  normalizeRoomCapacity,
  normalizeRoomNumber,
  type HandoverNote,
  type HandoverNoteRow,
  type HandoverNoteScope,
  type HandoverRoomConfig,
} from '@/lib/handover-notes';

import RoomConfigPanel from './병실설정패널';
import HandoverComposerPane from './HandoverComposerPane';
import HandoverContentSection from './HandoverContentSection';
import HandoverNoteCard from './HandoverNoteCard';
import HandoverSidebar from './HandoverSidebar';
import {
  buildBedOptions,
  buildContentNotes,
  buildGeneralNotes,
  buildPatientEpisodes,
  buildPatientGroups,
  buildRoomConfigSnapshots,
  buildSummaryByDate,
  buildTemplateFamilies,
  buildTemplateNotes,
  findEffectiveRoomConfigs,
} from './handover-selectors';
import PatientGroupNote from './환자그룹노트';
import {
  DEFAULT_SHIFT,
  DEFAULT_PRIORITY,
  DEFAULT_SCOPE,
  toDateKey,
  fromDateKey,
  monthGrid,
  fullDateLabel,
  type RoomStatus,
} from './handover-types';

type Props = { user?: any };

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
  const { dialog, openConfirm, openPrompt } = useActionDialog();
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
  const [selectedTemplateFamilyKey, setSelectedTemplateFamilyKey] = useState('');
  const [selectedTemplateNoteId, setSelectedTemplateNoteId] = useState('');

  const roomStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const currentMonth = useMemo(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), [selectedDate]);
  const currentMonthGrid = useMemo(() => monthGrid(currentMonth), [currentMonth]);
  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const roomConfigSnapshots = useMemo(() => buildRoomConfigSnapshots(notes), [notes]);
  const effectiveRoomConfigs = useMemo(
    () => findEffectiveRoomConfigs(roomConfigSnapshots, selectedDateKey),
    [roomConfigSnapshots, selectedDateKey],
  );

  useEffect(() => {
    void loadNotes();
    return () => {
      if (roomStatusTimerRef.current) clearTimeout(roomStatusTimerRef.current);
    };
  }, []);

  async function loadNotes() {
    setLoading(true);
    try {
      // 부서 격리: 로그인 사용자의 부서/회사 노트만 조회.
      // /api/d1/query MAX_LIMIT=1000 (app/api/d1/query/route.ts) — 1500은 400.
      let query = supabase
        .from('handover_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      // 사용자 회사가 있으면 해당 회사의 노트만 조회 (데이터 격리)
      if (user?.company) {
        query = query.eq('company', user.company);
      }

      const { data, error } = await query;

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

  const summaryByDate = useMemo(() => buildSummaryByDate(notes), [notes]);
  const contentNotes = useMemo(() => buildContentNotes(notes), [notes]);
  const templateNotes = useMemo(() => buildTemplateNotes(notes), [notes]);
  const templateFamilies = useMemo(() => buildTemplateFamilies(templateNotes), [templateNotes]);

  const filteredTemplateFamilies = useMemo(
    () => templateFamilies.filter((family) => family.scope === noteScope),
    [noteScope, templateFamilies],
  );

  const selectedTemplateVersions = useMemo(() => {
    return templateNotes.filter((note) => {
      const name = String(note.template_name || '').trim();
      if (!name) return false;
      return `${note.note_scope}:${name}` === selectedTemplateFamilyKey;
    });
  }, [selectedTemplateFamilyKey, templateNotes]);

  const selectedTemplateNote = useMemo(
    () => selectedTemplateVersions.find((note) => note.id === selectedTemplateNoteId) || selectedTemplateVersions[0] || null,
    [selectedTemplateNoteId, selectedTemplateVersions],
  );
  const selectedTemplateFamily = useMemo(
    () => filteredTemplateFamilies.find((family) => family.key === selectedTemplateFamilyKey) || null,
    [filteredTemplateFamilies, selectedTemplateFamilyKey],
  );
  const latestTemplateNote = useMemo(() => selectedTemplateVersions[0] || null, [selectedTemplateVersions]);

  const patientEpisodes = useMemo(() => buildPatientEpisodes(roomConfigSnapshots), [roomConfigSnapshots]);
  const generalNotes = useMemo(
    () => buildGeneralNotes({ contentNotes, normalizedSearchQuery, selectedDateKey }),
    [contentNotes, normalizedSearchQuery, selectedDateKey],
  );
  const patientGroups = useMemo(
    () => buildPatientGroups({ contentNotes, normalizedSearchQuery, patientEpisodes, selectedDateKey }),
    [contentNotes, normalizedSearchQuery, patientEpisodes, selectedDateKey],
  );

  const visibleNoteCount = generalNotes.length + patientGroups.reduce((sum, group) => sum + group.notes.length, 0);
  const selectedPatientGroup = useMemo(
    () => patientGroups.find((group) => group.key === selectedPatientGroupKey) || null,
    [patientGroups, selectedPatientGroupKey],
  );

  const bedOptions = useMemo(() => buildBedOptions({ patientGroups, roomConfigs }), [patientGroups, roomConfigs]);

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

  useEffect(() => {
    if (filteredTemplateFamilies.length === 0) {
      if (selectedTemplateFamilyKey) setSelectedTemplateFamilyKey('');
      return;
    }

    if (!filteredTemplateFamilies.some((family) => family.key === selectedTemplateFamilyKey)) {
      setSelectedTemplateFamilyKey(filteredTemplateFamilies[0]?.key || '');
    }
  }, [filteredTemplateFamilies, selectedTemplateFamilyKey]);

  useEffect(() => {
    if (selectedTemplateVersions.length === 0) {
      if (selectedTemplateNoteId) setSelectedTemplateNoteId('');
      return;
    }

    if (!selectedTemplateVersions.some((note) => note.id === selectedTemplateNoteId)) {
      setSelectedTemplateNoteId(selectedTemplateVersions[0]?.id || '');
    }
  }, [selectedTemplateNoteId, selectedTemplateVersions]);

  const selectedBed = useMemo(
    () => bedOptions.find((option) => option.selectionKey === selectedBedKey) || null,
    [bedOptions, selectedBedKey],
  );

  function openBedSettings() {
    setRoomConfigs(effectiveRoomConfigs);
    setRoomDirty(false);
    setRoomStatus('idle');
    setShowBedSettings(true);
  }

  async function closeBedSettings() {
    if (roomDirty) {
      const confirmed = await openConfirm({
        title: '병상 설정 닫기',
        description: '저장하지 않은 병상 설정이 있습니다. 닫으시겠습니까?',
        confirmText: '닫기',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
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
          if (!omittedColumns.has('patient_key'))
            payload.patient_key = noteScope === 'patient' ? buildPatientKey(patientName) : null;
          if (!omittedColumns.has('note_scope')) payload.note_scope = noteScope;
          if (!omittedColumns.has('handover_date')) payload.handover_date = selectedDateKey;
          if (!omittedColumns.has('room_number')) payload.room_number = noteScope === 'patient' ? roomNumber : null;
          if (!omittedColumns.has('room_capacity'))
            payload.room_capacity = noteScope === 'patient' ? roomCapacity : null;
          if (!omittedColumns.has('bed_number')) payload.bed_number = noteScope === 'patient' ? bedNumber : null;
          if (!omittedColumns.has('bed_key'))
            payload.bed_key = noteScope === 'patient' ? buildBedKey(roomNumber, bedNumber) : null;

          return supabase.from('handover_notes').insert([payload]).select('*').single();
        },
        [
          'patient_name',
          'patient_key',
          'note_scope',
          'handover_date',
          'room_number',
          'room_capacity',
          'bed_number',
          'bed_key',
        ],
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

  function applySelectedTemplate() {
    if (!selectedTemplateNote) {
      toast('불러올 템플릿이 없습니다.', 'warning');
      return;
    }

    setNoteScope(selectedTemplateNote.note_scope);
    setShift(selectedTemplateNote.shift || DEFAULT_SHIFT);
    setPriority(selectedTemplateNote.priority || DEFAULT_PRIORITY);
    setContent(selectedTemplateNote.content || '');
    toast(
      `${selectedTemplateNote.template_name || '템플릿'} v${selectedTemplateNote.template_version || 1} 템플릿을 불러왔습니다.`,
      'success',
    );
  }

  async function saveCurrentAsTemplate() {
    const trimmedContent = content.trim();
    if (!trimmedContent || saving) {
      toast('템플릿으로 저장할 내용을 먼저 입력해 주세요.', 'warning');
      return;
    }

    const suggestedName =
      selectedTemplateNote?.template_name || `${noteScope === 'patient' ? '환자별' : '공통'} 인계`;
    const templateName = String(
      (await openPrompt({
        title: '템플릿 이름',
        description: '저장할 인계 템플릿 이름을 입력해 주세요.',
        initialValue: suggestedName,
        placeholder: '템플릿 이름',
        confirmText: '저장',
        required: true,
        maxLength: 60,
        tone: 'accent',
      })) || '',
    ).trim();
    if (!templateName) return;

    const nextVersion =
      templateNotes
        .filter((note) => note.note_scope === noteScope && String(note.template_name || '').trim() === templateName)
        .reduce((max, note) => Math.max(max, Number(note.template_version || 0)), 0) + 1;

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
            omittedColumns.has('bed_key') ||
            omittedColumns.has('template_name') ||
            omittedColumns.has('template_version');

          const payload: Record<string, any> = {
            content: storeMetadataInContent
              ? encodeHandoverContent(trimmedContent, {
                  noteScope,
                  handoverDate: selectedDateKey,
                  handoverKind: 'template',
                  templateName,
                  templateVersion: nextVersion,
                })
              : trimmedContent,
            author_id: user?.id || 'unknown',
            author_name: user?.name || '이름 없음',
            shift,
            priority,
            is_completed: false,
            created_at: new Date().toISOString(),
          };

          if (!omittedColumns.has('note_scope')) payload.note_scope = noteScope;
          if (!omittedColumns.has('handover_date')) payload.handover_date = selectedDateKey;
          if (!omittedColumns.has('template_name')) payload.template_name = templateName;
          if (!omittedColumns.has('template_version')) payload.template_version = nextVersion;

          return supabase.from('handover_notes').insert([payload]).select('*').single();
        },
        [
          'patient_name',
          'patient_key',
          'note_scope',
          'handover_date',
          'room_number',
          'room_capacity',
          'bed_number',
          'bed_key',
          'template_name',
          'template_version',
        ],
      );

      if (error) {
        console.error('인계노트 템플릿 저장 실패:', error);
        toast('템플릿 저장 중 오류가 발생했습니다.', 'error');
        return;
      }

      if (data) {
        const normalized = normalizeHandoverNote(data as HandoverNoteRow);
        setNotes((prev) => [normalized, ...prev.filter((note) => note.id !== normalized.id)]);
        setSelectedTemplateFamilyKey(`${noteScope}:${templateName}`);
        setSelectedTemplateNoteId(normalized.id);
      }

      toast(`${templateName} v${nextVersion} 템플릿으로 저장했습니다.`, 'success');
    } catch (error) {
      console.error('인계노트 템플릿 저장 오류:', error);
      toast('템플릿 저장 중 오류가 발생했습니다.', 'error');
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
      setNotes((prev) =>
        prev.map((note) => (note.id === targetNote.id ? { ...note, is_completed: targetNote.is_completed } : note)),
      );
      toast('인계노트 완료 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setNoteMutationId(null);
    }
  }

  async function saveNoteEdit(targetNote: HandoverNote) {
    const trimmedContent = editingContent.trim();
    if (!trimmedContent) {
      toast('수정할 내용을 입력해주세요.', 'warning');
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
        setNotes((prev) =>
          prev.map((note) => (note.id === targetNote.id ? { ...note, content: trimmedContent } : note)),
        );
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
    const shouldDelete = await openConfirm({
      title: '인계노트 삭제',
      description: '이 인계노트를 삭제합니다.',
      confirmText: '삭제',
      tone: 'danger',
    });
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
    return (
      <HandoverNoteCard
        key={note.id}
        note={note}
        isEditing={editingNoteId === note.id}
        isMutating={noteMutationId === note.id}
        editingContent={editingContent}
        actionValue={noteActionValues[note.id] ?? ''}
        onEditingContentChange={setEditingContent}
        onCancelEdit={cancelNoteEdit}
        onSaveEdit={(targetNote) => void saveNoteEdit(targetNote)}
        onAction={handleNoteAction}
      />
    );
  }

  return (
    <div
      className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
      data-testid="handover-notes-view"
    >
      {dialog}
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
        <HandoverSidebar
          currentMonth={currentMonth}
          currentMonthGrid={currentMonthGrid}
          selectedDateKey={selectedDateKey}
          todayKey={todayKey}
          summaryByDate={summaryByDate}
          generalNoteCount={generalNotes.length}
          patientGroupCount={patientGroups.length}
          visibleNoteCount={visibleNoteCount}
          onPreviousMonth={() => setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
          onNextMonth={() => setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
          onSelectDate={setSelectedDate}
        />

        <section className="space-y-4">
          <HandoverComposerPane
            noteScope={noteScope}
            selectedDate={selectedDate}
            shift={shift}
            priority={priority}
            saving={saving}
            content={content}
            selectedBedKey={selectedBedKey}
            bedOptions={bedOptions}
            filteredTemplateFamilies={filteredTemplateFamilies}
            selectedTemplateFamilyKey={selectedTemplateFamilyKey}
            selectedTemplateNoteId={selectedTemplateNoteId}
            selectedTemplateVersions={selectedTemplateVersions}
            selectedTemplateNote={selectedTemplateNote}
            selectedTemplateFamily={selectedTemplateFamily}
            latestTemplateNote={latestTemplateNote}
            onNoteScopeChange={(scope) => {
              setNoteScope(scope);
              if (scope === 'general') {
                setSelectedBedKey('');
              }
            }}
            onSelectedBedKeyChange={setSelectedBedKey}
            onShiftChange={setShift}
            onPriorityChange={setPriority}
            onContentChange={setContent}
            onTemplateFamilyChange={setSelectedTemplateFamilyKey}
            onTemplateVersionChange={setSelectedTemplateNoteId}
            onApplyTemplate={applySelectedTemplate}
            onSaveAsTemplate={() => void saveCurrentAsTemplate()}
            onCreateNote={handleCreateNote}
          />

          <HandoverContentSection
            noteScope={noteScope}
            loading={loading}
            patientGroups={patientGroups}
            generalNotes={generalNotes}
            renderGeneralNote={renderNote}
            onOpenPatientGroup={setSelectedPatientGroupKey}
          />
        </section>
      </div>

      {selectedPatientGroup ? (
        <PatientGroupNote
          selectedPatientGroup={selectedPatientGroup}
          noteMutationId={noteMutationId}
          editingNoteId={editingNoteId}
          editingContent={editingContent}
          noteActionValues={noteActionValues}
          onClose={() => setSelectedPatientGroupKey('')}
          onEditingContentChange={setEditingContent}
          onNoteAction={handleNoteAction}
          onCancelEdit={cancelNoteEdit}
          onSaveEdit={(note) => void saveNoteEdit(note)}
        />
      ) : null}

      {showBedSettings ? (
        <RoomConfigPanel
          selectedDate={selectedDate}
          roomConfigs={roomConfigs}
          roomStatus={roomStatus}
          roomDirty={roomDirty}
          newRoomNumber={newRoomNumber}
          newRoomCapacity={newRoomCapacity}
          onSave={() => void handleSaveRoomConfigs()}
          onClose={closeBedSettings}
          onAddRoom={handleAddRoom}
          onReplaceRooms={replaceRooms}
          onRoomNumberChange={handleRoomNumberChange}
          onRoomCapacityChange={handleRoomCapacityChange}
          onBedPatientChange={handleBedPatientChange}
          onBedAdmissionDateChange={handleBedAdmissionDateChange}
          onNewRoomNumberChange={setNewRoomNumber}
          onNewRoomCapacityChange={setNewRoomCapacity}
        />
      ) : null}
    </div>
  );
}
