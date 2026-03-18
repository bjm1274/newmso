export type HandoverNoteScope = 'general' | 'patient';
export type HandoverNoteKind = 'note' | 'room_config';

export type HandoverBedConfig = {
  bedNumber: number;
  patientName: string;
  admissionDate: string | null;
};

export type HandoverRoomConfig = {
  id: string;
  roomNumber: string;
  capacity: number;
  beds: HandoverBedConfig[];
};

export type HandoverNoteRow = {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  shift: string;
  priority: string;
  created_at: string;
  is_completed: boolean;
  patient_name?: string | null;
  patient_key?: string | null;
  note_scope?: string | null;
  handover_date?: string | null;
  room_number?: string | null;
  room_capacity?: number | string | null;
  bed_number?: number | string | null;
  bed_key?: string | null;
};

export type HandoverNote = HandoverNoteRow & {
  content: string;
  patient_name: string | null;
  patient_key: string | null;
  note_scope: HandoverNoteScope;
  handover_date: string | null;
  room_number: string | null;
  room_capacity: number | null;
  bed_number: number | null;
  bed_key: string | null;
  handover_kind: HandoverNoteKind;
};

type DecodedHandoverMetadata = {
  content: string;
  patientName: string | null;
  noteScope: HandoverNoteScope | null;
  handoverDate: string | null;
  roomNumber: string | null;
  roomCapacity: number | null;
  bedNumber: number | null;
  handoverKind: HandoverNoteKind;
};

type HandoverContentOptions = {
  patientName?: string | null;
  noteScope?: HandoverNoteScope | null;
  handoverDate?: string | null;
  roomNumber?: string | null;
  roomCapacity?: number | null;
  bedNumber?: number | null;
  handoverKind?: HandoverNoteKind | null;
};

const HANDOVER_MARKER_REGEX = /^\s*\[\[([a-z0-9-]+):(.*?)\]\]\s*/i;

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizePatientName(value?: string | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeRoomNumber(value?: string | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeDateKey(value?: string | null): string | null {
  const normalized = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export function normalizeRoomCapacity(value?: number | string | null): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded >= 1 && rounded <= 4 ? rounded : null;
}

export function normalizeBedNumber(value?: number | string | null): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded >= 1 && rounded <= 4 ? rounded : null;
}

export function buildPatientKey(value?: string | null): string | null {
  const normalized = normalizePatientName(value);
  if (!normalized) return null;
  return normalized.toLowerCase().replace(/\s+/g, '');
}

export function buildBedKey(roomNumber?: string | null, bedNumber?: number | string | null): string | null {
  const normalizedRoom = normalizeRoomNumber(roomNumber);
  const normalizedBed = normalizeBedNumber(bedNumber);
  if (!normalizedRoom || !normalizedBed) return null;
  return `${normalizedRoom}-${normalizedBed}`;
}

export function formatBedLabel(roomNumber?: string | null, _bedNumber?: number | string | null): string {
  const normalizedRoom = normalizeRoomNumber(roomNumber);
  if (normalizedRoom) return `${normalizedRoom}호`;
  return '병실 미설정';
}

export function formatPatientBedLabel(input: {
  room_number?: string | null;
  roomNumber?: string | null;
  bed_number?: number | string | null;
  bedNumber?: number | string | null;
  patient_name?: string | null;
  patientName?: string | null;
}) {
  const roomNumber = input.room_number ?? input.roomNumber;
  const patientName = input.patient_name ?? input.patientName;
  const roomLabel = formatBedLabel(roomNumber);
  const normalizedPatient = normalizePatientName(patientName);
  if (roomLabel && normalizedPatient) return `${roomLabel} · ${normalizedPatient}`;
  if (normalizedPatient) return normalizedPatient;
  return roomLabel;
}
function compareRoomNumbers(left: string, right: string) {
  return left.localeCompare(right, 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function normalizeBeds(value: unknown, capacity: number): HandoverBedConfig[] {
  const patientNames = new Map<number, string>();
  const admissionDates = new Map<number, string | null>();

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (!isRecord(item)) return;
      const bedNumber = normalizeBedNumber(item.bedNumber ?? item.bed_number);
      if (!bedNumber || bedNumber > capacity) return;
      patientNames.set(bedNumber, normalizePatientName(item.patientName ?? item.patient_name));
      admissionDates.set(
        bedNumber,
        normalizeDateKey(item.admissionDate ?? item.admission_date) || null,
      );
    });
  }

  return Array.from({ length: capacity }, (_, index) => {
    const bedNumber = index + 1;
    return {
      bedNumber,
      patientName: patientNames.get(bedNumber) || '',
      admissionDate: admissionDates.get(bedNumber) || null,
    };
  });
}

export function normalizeHandoverRoomConfigs(value: unknown): HandoverRoomConfig[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized = value
    .map((item) => {
      if (!isRecord(item)) return null;

      const roomNumber = normalizeRoomNumber(item.roomNumber ?? item.room_number);
      const capacity = normalizeRoomCapacity(item.capacity ?? item.roomCapacity ?? item.room_capacity);
      if (!roomNumber || !capacity) return null;

      const id = String(item.id || `${roomNumber}-${capacity}`).trim();
      const dedupeKey = id || roomNumber;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);

      return {
        id: dedupeKey,
        roomNumber,
        capacity,
        beds: normalizeBeds(item.beds, capacity),
      } satisfies HandoverRoomConfig;
    })
    .filter((item): item is HandoverRoomConfig => !!item);

  return normalized.sort((left, right) => compareRoomNumbers(left.roomNumber, right.roomNumber));
}

function decodeHandoverMetadata(content?: string | null): DecodedHandoverMetadata {
  let remaining = String(content || '');
  const decoded: DecodedHandoverMetadata = {
    content: '',
    patientName: null,
    noteScope: null,
    handoverDate: null,
    roomNumber: null,
    roomCapacity: null,
    bedNumber: null,
    handoverKind: 'note',
  };

  while (true) {
    const match = remaining.match(HANDOVER_MARKER_REGEX);
    if (!match) break;

    const key = String(match[1] || '').toLowerCase();
    const rawValue = String(match[2] || '').trim();

    if (key === 'patient' || key === 'handover-patient') {
      decoded.patientName = normalizePatientName(rawValue);
      decoded.noteScope = 'patient';
    } else if (key === 'handover-scope') {
      decoded.noteScope = rawValue === 'patient' ? 'patient' : 'general';
    } else if (key === 'handover-date') {
      decoded.handoverDate = normalizeDateKey(rawValue);
    } else if (key === 'handover-room') {
      decoded.roomNumber = normalizeRoomNumber(rawValue);
    } else if (key === 'handover-capacity') {
      decoded.roomCapacity = normalizeRoomCapacity(rawValue);
    } else if (key === 'handover-bed') {
      decoded.bedNumber = normalizeBedNumber(rawValue);
    } else if (key === 'handover-kind') {
      decoded.handoverKind = rawValue === 'room_config' ? 'room_config' : 'note';
    }

    remaining = remaining.slice(match[0].length);
  }

  decoded.content = remaining.trimStart();
  return decoded;
}

function buildMarkerLine(key: string, value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? `[[${key}:${normalized}]]` : null;
}

export function encodeHandoverContent(content: string, options: HandoverContentOptions = {}): string {
  const cleanedContent = String(content || '').trim();
  const markers = [
    buildMarkerLine('handover-kind', options.handoverKind === 'room_config' ? 'room_config' : null),
    buildMarkerLine('handover-date', normalizeDateKey(options.handoverDate)),
    buildMarkerLine(
      'handover-scope',
      options.noteScope === 'patient' || options.noteScope === 'general' ? options.noteScope : null,
    ),
    buildMarkerLine('handover-patient', normalizePatientName(options.patientName)),
    buildMarkerLine('handover-room', normalizeRoomNumber(options.roomNumber)),
    buildMarkerLine('handover-capacity', normalizeRoomCapacity(options.roomCapacity)),
    buildMarkerLine('handover-bed', normalizeBedNumber(options.bedNumber)),
  ].filter((marker): marker is string => !!marker);

  return [...markers, cleanedContent].filter(Boolean).join('\n');
}

export function normalizeHandoverNote(row: HandoverNoteRow): HandoverNote {
  const decoded = decodeHandoverMetadata(row.content);
  const patientName = normalizePatientName(row.patient_name || decoded.patientName) || null;
  const roomNumber = normalizeRoomNumber(row.room_number || decoded.roomNumber) || null;
  const roomCapacity = normalizeRoomCapacity(row.room_capacity ?? decoded.roomCapacity);
  const bedNumber = normalizeBedNumber(row.bed_number ?? decoded.bedNumber);
  const noteScope: HandoverNoteScope =
    row.note_scope === 'patient' || decoded.noteScope === 'patient' || patientName
      ? 'patient'
      : 'general';
  const handoverDate =
    normalizeDateKey(row.handover_date || decoded.handoverDate) ||
    normalizeDateKey(String(row.created_at || '').slice(0, 10));

  return {
    ...row,
    content: decoded.content.trim(),
    patient_name: patientName,
    patient_key: row.patient_key || buildPatientKey(patientName),
    note_scope: noteScope,
    handover_date: handoverDate,
    room_number: roomNumber,
    room_capacity: roomCapacity,
    bed_number: bedNumber,
    bed_key: row.bed_key || buildBedKey(roomNumber, bedNumber),
    handover_kind: decoded.handoverKind,
  };
}

export function parseRoomConfigsFromNote(note: Pick<HandoverNoteRow, 'content'> | null | undefined) {
  const decoded = decodeHandoverMetadata(note?.content);
  try {
    return normalizeHandoverRoomConfigs(JSON.parse(decoded.content || '[]'));
  } catch {
    return [];
  }
}

export function buildRoomConfigNoteContent(rooms: HandoverRoomConfig[], handoverDate?: string | null) {
  return encodeHandoverContent(JSON.stringify(normalizeHandoverRoomConfigs(rooms)), {
    handoverKind: 'room_config',
    handoverDate,
  });
}

export function buildHandoverSearchText(
  note: Pick<
    HandoverNote,
    'content' | 'author_name' | 'patient_name' | 'room_number' | 'bed_number' | 'handover_date'
  >,
): string {
  return [
    note.content,
    note.author_name,
    normalizePatientName(note.patient_name),
    normalizeRoomNumber(note.room_number),
    normalizeBedNumber(note.bed_number),
    normalizeDateKey(note.handover_date),
    formatBedLabel(note.room_number, note.bed_number),
  ]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .join(' ')
    .toLowerCase();
}
