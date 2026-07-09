/**
 * 근무표 자동 편성 엔진
 *
 * - 병동 3교대 / 2교대 / 외래 주간 등 패턴
 * - 근무유형(work_shifts) → D/E/N/OFF 밴드 매핑
 * - 월 나이트·오프 목표, 시간대별 최소 인원
 * - 직원별 근무 모드(순환/주간전담/이브닝전담/야간전담)
 * - N→D 금지, 나이트 후 오프, 연속 근무 상한, 공정 분배
 */

export type ShiftRole = 'D' | 'E' | 'N' | 'OFF' | 'LEAVE' | 'TRAINING';
export type ScheduleMap = Record<string, Record<number, ShiftRole>>;
export type RosterPattern = 'ward_3shift' | 'two_shift' | 'outpatient_day' | 'custom';
export type StaffWorkMode = 'rotation' | 'day_fixed' | 'evening_fixed' | 'night_fixed';

export type WorkShiftInput = {
  id: string;
  name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  shift_type?: string | null;
  description?: string | null;
  is_shift?: boolean | number | null;
};

export type StaffScheduleInput = {
  id: string;
  name?: string | null;
  /** 순환·전담 모드. 없으면 rotation */
  mode?: StaffWorkMode;
  /** 허용 밴드. 없으면 패턴/모드 기본값 */
  allowedRoles?: Array<'D' | 'E' | 'N'>;
};

export type AutoScheduleParams = {
  yearMonth: string;
  daysInMonth: number;
  staffs: StaffScheduleInput[];
  /** @deprecated staffs 사용 권장 */
  staffIds?: string[];
  pattern?: RosterPattern;
  minStaff: { D: number; E: number; N: number };
  /** 1인당 목표 나이트 수 (0이면 자동 추정) */
  targetNightPerPerson?: number;
  /** 1인당 목표 오프 수 */
  targetOffPerPerson?: number;
  /** 나이트 후 강제 오프 일수 */
  offDaysAfterNight?: number;
  /** 최대 연속 근무일 */
  maxConsecutiveWorkDays?: number;
  /** 최대 연속 나이트 */
  maxConsecutiveNights?: number;
  /** N 다음날 D 금지 */
  avoidDayAfterNight?: boolean;
  workShifts?: WorkShiftInput[];
  /** 사용할 근무유형 id (빈 배열이면 전체) */
  activeShiftIds?: string[];
  existingSchedule?: ScheduleMap;
  /** 시드 (재현 가능한 편성) */
  seed?: number;
};

export type AutoScheduleResult = {
  schedule: ScheduleMap;
  summary: string;
  stats: {
    staffCount: number;
    avgNights: number;
    avgOffs: number;
    minStaffGapDays: number;
    pattern: RosterPattern;
    bandsUsed: Array<'D' | 'E' | 'N'>;
  };
  bandByShiftId: Record<string, 'D' | 'E' | 'N' | 'OFF'>;
};

// ─── 유틸 ───────────────────────────────────────────────────

function hourOf(time?: string | null): number | null {
  if (!time) return null;
  const m = String(time).match(/(\d{1,2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) ? h : null;
}

/** work_shifts 1건 → D/E/N/OFF 밴드 */
export function mapWorkShiftToBand(shift: WorkShiftInput): 'D' | 'E' | 'N' | 'OFF' {
  const name = String(shift.name || '').toLowerCase();
  const type = String(shift.shift_type || '').toLowerCase();
  const desc = String(shift.description || '').toLowerCase();
  const blob = `${name} ${type} ${desc}`;

  if (/오프|휴무|off|rest|holiday|연차/.test(blob)) return 'OFF';
  if (/night|나이트|야간|심야|당직/.test(blob)) return 'N';
  if (/evening|이브닝|오후|스윙|swing|mid/.test(blob)) return 'E';
  if (/day|데이|주간|오전|외래|상근|정규|daytime/.test(blob)) return 'D';

  const start = hourOf(shift.start_time);
  const end = hourOf(shift.end_time);
  if (start != null && end != null) {
    // 자정 넘김 → 나이트
    if (start > end || start >= 21 || start <= 5) return 'N';
    if (start >= 13 && start < 21) return 'E';
    return 'D';
  }
  if (start != null) {
    if (start >= 21 || start <= 5) return 'N';
    if (start >= 13) return 'E';
    return 'D';
  }
  return 'D';
}

export function inferPatternFromContext(opts: {
  deptName?: string;
  workShifts?: WorkShiftInput[];
  activeShiftIds?: string[];
}): RosterPattern {
  const dept = String(opts.deptName || '');
  const shifts = (opts.workShifts || []).filter((s) => {
    if (!opts.activeShiftIds?.length) return true;
    return opts.activeShiftIds.includes(String(s.id));
  });
  const bands = new Set(shifts.map(mapWorkShiftToBand).filter((b) => b !== 'OFF'));
  const hasN = bands.has('N');
  const hasE = bands.has('E');
  const hasD = bands.has('D');

  if (/병동|ward|icu|중환자|응급|nicu|picu|간호/.test(dept) && hasN) {
    return 'ward_3shift';
  }
  if (/외래|원무|원무과|행정|데스크|접수|검사실|재활/.test(dept) && !hasN) {
    return 'outpatient_day';
  }
  if (hasD && hasE && hasN) return 'ward_3shift';
  if ((hasD || hasE) && hasN && !hasE) return 'two_shift';
  if (hasD && hasE && !hasN) return 'two_shift';
  if (hasD && !hasE && !hasN) return 'outpatient_day';
  if (hasN) return 'ward_3shift';
  return 'outpatient_day';
}

function createRng(seed = Date.now()) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isWork(role?: ShiftRole | null): boolean {
  return role === 'D' || role === 'E' || role === 'N';
}

function countRole(row: Record<number, ShiftRole>, role: ShiftRole, days: number): number {
  let n = 0;
  for (let d = 1; d <= days; d++) if (row[d] === role) n++;
  return n;
}

function consecutiveWorkEnding(row: Record<number, ShiftRole>, day: number): number {
  let n = 0;
  for (let d = day; d >= 1; d--) {
    if (isWork(row[d])) n++;
    else break;
  }
  return n;
}

function consecutiveNightsEnding(row: Record<number, ShiftRole>, day: number): number {
  let n = 0;
  for (let d = day; d >= 1; d--) {
    if (row[d] === 'N') n++;
    else break;
  }
  return n;
}

function resolveStaffMode(s: StaffScheduleInput, pattern: RosterPattern): StaffWorkMode {
  if (s.mode) return s.mode;
  if (pattern === 'outpatient_day') return 'day_fixed';
  return 'rotation';
}

function allowedRolesFor(
  s: StaffScheduleInput,
  pattern: RosterPattern,
  bandsAvailable: Array<'D' | 'E' | 'N'>,
): Array<'D' | 'E' | 'N'> {
  if (s.allowedRoles?.length) {
    return s.allowedRoles.filter((r) => bandsAvailable.includes(r));
  }
  const mode = resolveStaffMode(s, pattern);
  if (mode === 'day_fixed') return bandsAvailable.filter((r) => r === 'D');
  if (mode === 'evening_fixed') return bandsAvailable.filter((r) => r === 'E' || r === 'D');
  if (mode === 'night_fixed') return bandsAvailable.filter((r) => r === 'N');
  return [...bandsAvailable];
}

function defaultBands(pattern: RosterPattern): Array<'D' | 'E' | 'N'> {
  if (pattern === 'outpatient_day') return ['D'];
  if (pattern === 'two_shift') return ['D', 'N'];
  return ['D', 'E', 'N'];
}

// ─── 메인 ───────────────────────────────────────────────────

export function generateAutoSchedule(params: AutoScheduleParams): ScheduleMap {
  return generateAutoScheduleDetailed(params).schedule;
}

export function generateAutoScheduleDetailed(params: AutoScheduleParams): AutoScheduleResult {
  const days = Math.max(1, Math.min(31, params.daysInMonth || 30));
  const pattern =
    params.pattern ||
    inferPatternFromContext({
      workShifts: params.workShifts,
      activeShiftIds: params.activeShiftIds,
    });

  const staffs: StaffScheduleInput[] =
    params.staffs?.length
      ? params.staffs
      : (params.staffIds || []).map((id) => ({ id }));

  const staffIds = staffs.map((s) => String(s.id)).filter(Boolean);
  const rng = createRng(params.seed ?? Date.now());

  // 근무유형 → 밴드
  const activeShifts = (params.workShifts || []).filter((s) => {
    if (!params.activeShiftIds?.length) return true;
    return params.activeShiftIds.includes(String(s.id));
  });
  const bandByShiftId: Record<string, 'D' | 'E' | 'N' | 'OFF'> = {};
  for (const s of activeShifts) {
    bandByShiftId[String(s.id)] = mapWorkShiftToBand(s);
  }

  const bandsFromShifts = Array.from(
    new Set(
      Object.values(bandByShiftId).filter((b): b is 'D' | 'E' | 'N' => b === 'D' || b === 'E' || b === 'N'),
    ),
  );
  const bandsAvailable =
    bandsFromShifts.length > 0 ? bandsFromShifts : defaultBands(pattern);

  // 최소 인원 (패턴에 없는 밴드는 0)
  const minStaff = {
    D: bandsAvailable.includes('D') ? Math.max(0, params.minStaff?.D ?? 0) : 0,
    E: bandsAvailable.includes('E') ? Math.max(0, params.minStaff?.E ?? 0) : 0,
    N: bandsAvailable.includes('N') ? Math.max(0, params.minStaff?.N ?? 0) : 0,
  };

  const offAfterN = Math.max(0, Math.min(3, params.offDaysAfterNight ?? 1));
  const maxConsec = Math.max(2, Math.min(7, params.maxConsecutiveWorkDays ?? 5));
  const maxConsecN = Math.max(1, Math.min(5, params.maxConsecutiveNights ?? 3));
  const avoidND = params.avoidDayAfterNight !== false;

  // 목표 나이트/오프
  const rotationStaff = staffs.filter((s) => {
    const mode = resolveStaffMode(s, pattern);
    return mode === 'rotation' || mode === 'night_fixed';
  });
  const nightCapable = staffs.filter((s) =>
    allowedRolesFor(s, pattern, bandsAvailable).includes('N'),
  );

  let targetNight =
    params.targetNightPerPerson != null
      ? Math.max(0, Math.floor(params.targetNightPerPerson))
      : 0;
  if (targetNight === 0 && minStaff.N > 0 && nightCapable.length > 0) {
    // 월 총 나이트 슬롯 / 야간 가능 인원
    targetNight = Math.max(1, Math.round((minStaff.N * days) / nightCapable.length));
    targetNight = Math.min(targetNight, Math.floor(days / 3));
  }
  if (pattern === 'outpatient_day') targetNight = 0;

  let targetOff =
    params.targetOffPerPerson != null
      ? Math.max(0, Math.floor(params.targetOffPerPerson))
      : pattern === 'outpatient_day'
        ? Math.max(8, days - 22) // 주 5일 근사
        : 8;
  targetOff = Math.min(targetOff, days - 1);

  // 초기 스케줄
  const schedule: ScheduleMap = {};
  for (const sid of staffIds) {
    schedule[sid] = {};
    for (let d = 1; d <= days; d++) {
      const fixed = params.existingSchedule?.[sid]?.[d];
      if (fixed) schedule[sid][d] = fixed;
    }
  }

  const staffById = new Map(staffs.map((s) => [String(s.id), s]));

  function canAssign(sid: string, day: number, role: 'D' | 'E' | 'N'): boolean {
    const row = schedule[sid];
    if (row[day]) return false; // 이미 고정/배정

    const staff = staffById.get(sid);
    if (!staff) return false;
    const allowed = allowedRolesFor(staff, pattern, bandsAvailable);
    if (!allowed.includes(role)) return false;

    const prev = day > 1 ? row[day - 1] : undefined;

    // 나이트 후 오프 기간
    if (offAfterN > 0) {
      for (let back = 1; back <= offAfterN; back++) {
        if (day - back >= 1 && row[day - back] === 'N' && role !== 'N') {
          // 나이트 직후 근무 금지 (OFF만 허용 — 여기선 work 금지)
          return false;
        }
      }
    }

    if (avoidND && prev === 'N' && role === 'D') return false;
    if (prev === 'N' && role === 'E' && pattern === 'ward_3shift') return false;

    if (isWork(role)) {
      if (consecutiveWorkEnding(row, day - 1) >= maxConsec) return false;
    }
    if (role === 'N') {
      if (consecutiveNightsEnding(row, day - 1) >= maxConsecN) return false;
      const nightsSoFar = countRole(row, 'N', days);
      // 목표 초과 여유 (공정 분배 단계에서 완화)
      if (nightsSoFar >= targetNight + 2 && targetNight > 0) return false;
    }

    // 고정 LEAVE/TRAINING 옆은 자유

    return true;
  }

  function dayCounts(day: number) {
    const c = { D: 0, E: 0, N: 0, OFF: 0, LEAVE: 0, TRAINING: 0 };
    for (const sid of staffIds) {
      const r = schedule[sid][day];
      if (r && r in c) c[r as keyof typeof c]++;
    }
    return c;
  }

  // ── Pass 1: 나이트 블록 우선 배치 (공정) ──
  if (minStaff.N > 0 && nightCapable.length > 0) {
    // 직원별 나이트 부족분 추적
    const nightNeed = new Map(
      nightCapable.map((s) => [String(s.id), targetNight]),
    );

    for (let d = 1; d <= days; d++) {
      const counts = dayCounts(d);
      let need = Math.max(0, minStaff.N - counts.N);
      if (need <= 0) continue;

      const candidates = shuffle(
        nightCapable
          .map((s) => String(s.id))
          .filter((sid) => canAssign(sid, d, 'N')),
        rng,
      ).sort((a, b) => {
        const na = countRole(schedule[a], 'N', days);
        const nb = countRole(schedule[b], 'N', days);
        // 덜 받은 사람 우선, 목표 미달 우선
        const da = (nightNeed.get(a) ?? 0) - na;
        const db = (nightNeed.get(b) ?? 0) - nb;
        if (db !== da) return db - da;
        return na - nb;
      });

      for (const sid of candidates) {
        if (need <= 0) break;
        schedule[sid][d] = 'N';
        need--;
        // 나이트 다음날 오프 예약
        for (let k = 1; k <= offAfterN; k++) {
          const nd = d + k;
          if (nd <= days && !schedule[sid][nd]) {
            schedule[sid][nd] = 'OFF';
          }
        }
      }
    }
  }

  // ── Pass 2: 일별 D/E 최소 인원 채우기 ──
  for (let d = 1; d <= days; d++) {
    for (const band of ['D', 'E'] as const) {
      if (!bandsAvailable.includes(band) || minStaff[band] <= 0) continue;
      const counts = dayCounts(d);
      let need = Math.max(0, minStaff[band] - counts[band]);
      if (need <= 0) continue;

      const candidates = shuffle(
        staffIds.filter((sid) => canAssign(sid, d, band)),
        rng,
      ).sort((a, b) => {
        // 근무 일수 적은 사람 우선 (균등)
        const wa = Object.values(schedule[a]).filter(isWork).length;
        const wb = Object.values(schedule[b]).filter(isWork).length;
        return wa - wb;
      });

      for (const sid of candidates) {
        if (need <= 0) break;
        schedule[sid][d] = band;
        need--;
      }
    }
  }

  // ── Pass 3: 남은 빈 칸 — 목표 오프/근무 균형 ──
  for (const sid of staffIds) {
    const staff = staffById.get(sid)!;
    const mode = resolveStaffMode(staff, pattern);
    const allowed = allowedRolesFor(staff, pattern, bandsAvailable);
    const row = schedule[sid];

    for (let d = 1; d <= days; d++) {
      if (row[d]) continue;

      const offs = countRole(row, 'OFF', days);
      const works = Object.values(row).filter(isWork).length;
      const nights = countRole(row, 'N', days);

      // 오프 목표 미달이면 OFF 우선 (단, 주말 외래는 주말 OFF)
      const date = new Date(
        Number(params.yearMonth.slice(0, 4)),
        Number(params.yearMonth.slice(5, 7)) - 1,
        d,
      );
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;

      if (pattern === 'outpatient_day' && isWeekend) {
        row[d] = 'OFF';
        continue;
      }

      if (offs < targetOff && works >= days - targetOff - 2) {
        row[d] = 'OFF';
        continue;
      }

      // 나이트 목표 미달 순환/야간전담
      if (
        allowed.includes('N') &&
        nights < targetNight &&
        canAssign(sid, d, 'N') &&
        dayCounts(d).N < minStaff.N + 1
      ) {
        row[d] = 'N';
        for (let k = 1; k <= offAfterN; k++) {
          const nd = d + k;
          if (nd <= days && !schedule[sid][nd]) schedule[sid][nd] = 'OFF';
        }
        continue;
      }

      // 전담/외래: 평일 D
      if (mode === 'day_fixed' || pattern === 'outpatient_day') {
        if (allowed.includes('D') && canAssign(sid, d, 'D')) {
          row[d] = 'D';
        } else {
          row[d] = 'OFF';
        }
        continue;
      }

      if (mode === 'evening_fixed' && allowed.includes('E') && canAssign(sid, d, 'E')) {
        row[d] = 'E';
        continue;
      }
      if (mode === 'night_fixed' && allowed.includes('N') && canAssign(sid, d, 'N')) {
        row[d] = 'N';
        continue;
      }

      // 순환: 부족한 밴드 우선, 아니면 OFF
      const counts = dayCounts(d);
      let placed = false;
      const bandOrder = shuffle(
        allowed.filter((b) => bandsAvailable.includes(b)),
        rng,
      ).sort((a, b) => {
        const gapA = minStaff[a] - counts[a];
        const gapB = minStaff[b] - counts[b];
        return gapB - gapA;
      });

      for (const band of bandOrder) {
        if (canAssign(sid, d, band) && (counts[band] < minStaff[band] + 2 || offs >= targetOff)) {
          row[d] = band;
          placed = true;
          break;
        }
      }
      if (!placed) {
        if (offs < targetOff) {
          row[d] = 'OFF';
        } else if (bandOrder[0] && canAssign(sid, d, bandOrder[0])) {
          row[d] = bandOrder[0];
        } else {
          row[d] = 'OFF';
        }
      }
    }
  }

  // 빈 칸 보장
  for (const sid of staffIds) {
    for (let d = 1; d <= days; d++) {
      if (!schedule[sid][d]) schedule[sid][d] = 'OFF';
    }
  }

  // ── Pass 4: 최소 인원 재점검 ──
  for (let d = 1; d <= days; d++) {
    for (const band of bandsAvailable) {
      const counts = dayCounts(d);
      let need = Math.max(0, minStaff[band] - counts[band]);
      if (need <= 0) continue;

      // OFF인 사람 중 전환 가능자
      const candidates = shuffle(
        staffIds.filter((sid) => {
          if (schedule[sid][d] !== 'OFF') return false;
          // 임시로 비우고 검사
          delete schedule[sid][d];
          const ok = canAssign(sid, d, band);
          schedule[sid][d] = 'OFF';
          return ok;
        }),
        rng,
      ).sort((a, b) => countRole(schedule[a], band, days) - countRole(schedule[b], band, days));

      for (const sid of candidates) {
        if (need <= 0) break;
        schedule[sid][d] = band;
        need--;
      }
    }
  }

  // 통계
  let totalN = 0;
  let totalOff = 0;
  let gapDays = 0;
  for (const sid of staffIds) {
    totalN += countRole(schedule[sid], 'N', days);
    totalOff += countRole(schedule[sid], 'OFF', days);
  }
  for (let d = 1; d <= days; d++) {
    const c = dayCounts(d);
    if (c.D < minStaff.D || c.E < minStaff.E || c.N < minStaff.N) gapDays++;
  }
  const nStaff = Math.max(1, staffIds.length);
  const avgNights = Math.round((totalN / nStaff) * 10) / 10;
  const avgOffs = Math.round((totalOff / nStaff) * 10) / 10;

  const patternLabel =
    pattern === 'ward_3shift'
      ? '병동 3교대'
      : pattern === 'two_shift'
        ? '2교대'
        : pattern === 'outpatient_day'
          ? '외래/주간'
          : '커스텀';

  const summary = [
    `${patternLabel} 자동편성 완료`,
    `대상 ${staffIds.length}명`,
    bandsAvailable.includes('N') ? `인당 나이트 평균 ${avgNights}일(목표 ${targetNight})` : null,
    `인당 오프 평균 ${avgOffs}일(목표 ${targetOff})`,
    `최소인원 D${minStaff.D}/E${minStaff.E}/N${minStaff.N}`,
    gapDays > 0 ? `인원 부족 ${gapDays}일 — 수동 조정 권장` : '최소인원 충족',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    schedule,
    summary,
    stats: {
      staffCount: staffIds.length,
      avgNights,
      avgOffs,
      minStaffGapDays: gapDays,
      pattern,
      bandsUsed: bandsAvailable,
    },
    bandByShiftId,
  };
}
