'use client';

import {
  buildBedKey,
  buildHandoverSearchText,
  buildPatientKey,
  formatPatientBedLabel,
  parseRoomConfigsFromNote,
  type HandoverNote,
  type HandoverRoomConfig,
} from '@/lib/handover-notes';
import {
  buildEpisodeRenderKey,
  compareDateKeys,
  compareRooms,
  emptySummary,
  type BedOption,
  type PatientEpisode,
  type PatientGroup,
  type RoomConfigSnapshot,
  type Summary,
  type TemplateFamily,
} from './handover-types';

function noteDateKey(note: HandoverNote) {
  return note.handover_date || String(note.created_at || '').slice(0, 10);
}

export function buildRoomConfigSnapshots(notes: HandoverNote[]): RoomConfigSnapshot[] {
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
}

export function findEffectiveRoomConfigs(roomConfigSnapshots: RoomConfigSnapshot[], selectedDateKey: string) {
  const matchedSnapshot = [...roomConfigSnapshots]
    .reverse()
    .find((snapshot) => compareDateKeys(snapshot.dateKey, selectedDateKey) <= 0);

  return matchedSnapshot ? matchedSnapshot.rooms : [];
}

export function buildSummaryByDate(notes: HandoverNote[]): Map<string, Summary> {
  const next = new Map<string, Summary>();

  notes.forEach((note) => {
    if (note.handover_kind !== 'note') return;

    const dateKey = noteDateKey(note);
    if (!dateKey) return;

    const current = next.get(dateKey) || emptySummary();
    current.total += 1;
    if (note.note_scope === 'patient') current.patient += 1;
    else current.general += 1;
    next.set(dateKey, current);
  });

  return next;
}

export function buildContentNotes(notes: HandoverNote[]) {
  return notes
    .filter((note) => note.handover_kind === 'note')
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
}

export function buildTemplateNotes(notes: HandoverNote[]) {
  return notes
    .filter((note) => note.handover_kind === 'template' && note.template_name)
    .sort((left, right) => {
      const versionDiff = Number(right.template_version || 0) - Number(left.template_version || 0);
      if (versionDiff !== 0) return versionDiff;
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    });
}

export function buildTemplateFamilies(templateNotes: HandoverNote[]): TemplateFamily[] {
  const families = new Map<string, TemplateFamily>();

  templateNotes.forEach((note) => {
    const name = String(note.template_name || '').trim();
    if (!name) return;

    const key = `${note.note_scope}:${name}`;
    const version = Number(note.template_version || 1);
    const current = families.get(key);

    if (!current) {
      families.set(key, {
        key,
        name,
        scope: note.note_scope,
        latestVersion: version,
        count: 1,
        latestCreatedAt: note.created_at || null,
        latestAuthorName: note.author_name || null,
      });
      return;
    }

    current.count += 1;
    const currentCreatedAt = new Date(current.latestCreatedAt || 0).getTime();
    const nextCreatedAt = new Date(note.created_at || 0).getTime();
    if (version > current.latestVersion || (version === current.latestVersion && nextCreatedAt > currentCreatedAt)) {
      current.latestVersion = version;
      current.latestCreatedAt = note.created_at || null;
      current.latestAuthorName = note.author_name || null;
    }
  });

  return Array.from(families.values()).sort((left, right) => {
    if (left.scope !== right.scope) return left.scope.localeCompare(right.scope, 'ko-KR');
    return left.name.localeCompare(right.name, 'ko-KR');
  });
}

export function buildPatientEpisodes(roomConfigSnapshots: RoomConfigSnapshot[]): PatientEpisode[] {
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
        const admissionDate = bed.admissionDate || snapshot.dateKey;
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
}

export function buildGeneralNotes({
  contentNotes,
  normalizedSearchQuery,
  selectedDateKey,
}: {
  contentNotes: HandoverNote[];
  normalizedSearchQuery: string;
  selectedDateKey: string;
}) {
  return contentNotes.filter((note) => {
    if (note.note_scope === 'patient' && note.patient_name) return false;

    const currentNoteDateKey = noteDateKey(note);
    const shouldShow =
      currentNoteDateKey === selectedDateKey ||
      (compareDateKeys(currentNoteDateKey, selectedDateKey) <= 0 && !note.is_completed);

    if (!shouldShow) return false;
    if (!normalizedSearchQuery) return true;
    return buildHandoverSearchText(note).includes(normalizedSearchQuery);
  });
}

export function buildPatientGroups({
  contentNotes,
  normalizedSearchQuery,
  patientEpisodes,
  selectedDateKey,
}: {
  contentNotes: HandoverNote[];
  normalizedSearchQuery: string;
  patientEpisodes: PatientEpisode[];
  selectedDateKey: string;
}): PatientGroup[] {
  const nextGroups = patientEpisodes
    .filter((episode) => {
      if (compareDateKeys(episode.startDate, selectedDateKey) > 0) return false;
      if (episode.endDate && compareDateKeys(selectedDateKey, episode.endDate) > 0) return false;
      return true;
    })
    .map((episode) => {
      const notesForEpisode = contentNotes.filter((note) => {
        if (note.note_scope !== 'patient' || !note.patient_name) return false;

        const currentNoteDateKey = noteDateKey(note);
        const visibleUntil =
          episode.endDate && compareDateKeys(episode.endDate, selectedDateKey) < 0 ? episode.endDate : selectedDateKey;
        const inEpisodeRange =
          compareDateKeys(currentNoteDateKey, episode.startDate) >= 0 &&
          compareDateKeys(currentNoteDateKey, visibleUntil) <= 0;

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
}

export function buildBedOptions({
  patientGroups,
  roomConfigs,
}: {
  patientGroups: PatientGroup[];
  roomConfigs: HandoverRoomConfig[];
}): BedOption[] {
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
}
