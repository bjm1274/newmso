import { GoogleGenerativeAI, type ResponseSchema, SchemaType } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';

// 유저별 AI 근무표 생성 요청 횟수 제한 (인스턴스 내 메모리 기반)
const rosterRateLimit = new Map<string, { count: number; resetAt: number }>();
const ROSTER_MAX_PER_HOUR = 10;
const ROSTER_WINDOW_MS = 60 * 60 * 1000;

function checkRosterRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rosterRateLimit.get(userId);
  if (!entry || now > entry.resetAt) {
    rosterRateLimit.set(userId, { count: 1, resetAt: now + ROSTER_WINDOW_MS });
    return true;
  }
  if (entry.count >= ROSTER_MAX_PER_HOUR) return false;
  entry.count++;
  return true;
}

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'] as const;
const OFF_SHIFT_TOKEN = '__OFF__';

const DAY_ONLY_TEAM_KEYWORDS = [
  '외래',
  '원무',
  '행정',
  '경영지원',
  '총무',
  '인사',
  '재무',
  '구매',
  '홍보',
  '마케팅',
  '상담',
  '접수',
  '예약',
  '검진',
];

const NIGHT_CARE_TEAM_KEYWORDS = [
  '병동',
  '입원',
  '응급',
  '중환자',
  '중환자실',
  '수술',
  '회복실',
  '분만',
  '투석',
  '간호',
];

type RequestWorkShift = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  shift_type?: string | null;
  company_name?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
};

type RequestStaff = {
  id: string;
  name: string;
  employeeNo?: string;
  position?: string;
  role?: string;
  employmentType?: string;
  department?: string;
  assignedShiftId?: string;
  shiftType?: string;
};

type RequestBody = {
  selectedMonth: string;
  selectedCompany: string;
  selectedDepartment: string;
  monthDates: string[];
  workShifts: RequestWorkShift[];
  staffs: RequestStaff[];
};

type GeminiRecommendationResponse = {
  summary: string;
  teamAnalysis: {
    teamPurpose: string;
    workMode: string;
    includesNight: boolean;
    reasoning: string[];
    planningFocus: string[];
  };
  staffPlans: Array<{
    staffId: string;
    modeLabel: string;
    rationale: string;
    assignments: string[];
  }>;
};

const responseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    teamAnalysis: {
      type: SchemaType.OBJECT,
      properties: {
        teamPurpose: { type: SchemaType.STRING },
        workMode: { type: SchemaType.STRING },
        includesNight: { type: SchemaType.BOOLEAN },
        reasoning: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        planningFocus: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
      required: ['teamPurpose', 'workMode', 'includesNight', 'reasoning', 'planningFocus'],
    },
    staffPlans: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          staffId: { type: SchemaType.STRING },
          modeLabel: { type: SchemaType.STRING },
          rationale: { type: SchemaType.STRING },
          assignments: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: ['staffId', 'modeLabel', 'rationale', 'assignments'],
      },
    },
  },
  required: ['summary', 'teamAnalysis', 'staffPlans'],
};

function normalizeShiftName(name: string) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

function resolveShiftBand(shift: RequestWorkShift) {
  const normalized = normalizeShiftName(shift.name);
  const startHour = Number(String(shift.start_time || '').slice(0, 2) || '0');

  if (
    normalized.includes('night') ||
    normalized.includes('나이트') ||
    normalized.includes('야간') ||
    startHour >= 20 ||
    startHour <= 4
  ) {
    return 'night';
  }

  if (
    normalized.includes('evening') ||
    normalized.includes('eve') ||
    normalized.includes('이브닝') ||
    normalized.includes('오후') ||
    (startHour >= 12 && startHour < 20)
  ) {
    return 'evening';
  }

  if (
    normalized.includes('off') ||
    normalized.includes('휴무') ||
    normalized.includes('비번') ||
    normalized.includes('오프')
  ) {
    return 'off';
  }

  return 'day';
}

function deriveTeamHint({ selectedDepartment, workShifts }: RequestBody) {
  const normalizedDepartment = normalizeShiftName(selectedDepartment);
  const shiftBands = workShifts.map(resolveShiftBand);
  const hasNightShift = shiftBands.includes('night');
  const hasEveningShift = shiftBands.includes('evening');
  const hasSevenDayShift = workShifts.some(
    (shift) => shift.is_weekend_work || Number(shift.weekly_work_days) >= 7
  );
  const matchesDayOnly = DAY_ONLY_TEAM_KEYWORDS.some((keyword) =>
    normalizedDepartment.includes(normalizeShiftName(keyword))
  );
  const matchesNightCare = NIGHT_CARE_TEAM_KEYWORDS.some((keyword) =>
    normalizedDepartment.includes(normalizeShiftName(keyword))
  );

  if (matchesNightCare && hasNightShift) {
    return {
      mode: '24시간 교대 가능성 높음',
      reason:
        '팀명상 병동/입원/응급/수술 계열로 보이며, 등록된 근무형태에 야간이 있어 주야간 편성이 필요할 가능성이 높습니다.',
    };
  }

  if (matchesDayOnly && !hasNightShift) {
    return {
      mode: '주간 전용 가능성 높음',
      reason:
        '외래/행정/원무 계열 팀명이며 야간 근무형태가 없어 평일 중심 주간 근무일 가능성이 높습니다.',
    };
  }

  if (hasNightShift && hasEveningShift && hasSevenDayShift) {
    return {
      mode: '야간 포함 운영 가능성 있음',
      reason:
        '등록된 근무형태에 이브닝/나이트/주말 포함 근무가 있어 야간 포함 순환 편성이 필요한 팀일 수 있습니다.',
    };
  }

  return {
    mode: '주간 중심 운영 가능성 있음',
    reason:
      '팀명과 등록 근무형태만으로는 24시간 운영 근거가 강하지 않아, 주간 중심 편성 여부를 우선 검토해야 합니다.',
  };
}

function buildPrompt(payload: RequestBody) {
  const teamHint = deriveTeamHint(payload);
  const shiftLines = payload.workShifts
    .map((shift) => {
      const timeRange =
        shift.start_time && shift.end_time
          ? `${String(shift.start_time).slice(0, 5)}-${String(shift.end_time).slice(0, 5)}`
          : '시간 미정';

      return [
        `- shiftId: ${shift.id}`,
        `name: ${shift.name}`,
        `band: ${resolveShiftBand(shift)}`,
        `time: ${timeRange}`,
        `type: ${shift.shift_type || '-'}`,
        `weekend: ${shift.is_weekend_work ? '가능' : '제외 우선'}`,
        `weeklyWorkDays: ${shift.weekly_work_days ?? '-'}`,
      ].join(' | ');
    })
    .join('\n');

  const staffLines = payload.staffs
    .map((staff) =>
      [
        `- staffId: ${staff.id}`,
        `name: ${staff.name}`,
        `employeeNo: ${staff.employeeNo || '-'}`,
        `position: ${staff.position || '-'}`,
        `role: ${staff.role || '-'}`,
        `employmentType: ${staff.employmentType || '-'}`,
        `department: ${staff.department || '-'}`,
        `assignedShiftId: ${staff.assignedShiftId || '-'}`,
        `shiftType: ${staff.shiftType || '-'}`,
      ].join(' | ')
    )
    .join('\n');

  return [
    '당신은 병원 팀 운영 특성을 읽어 월간 근무표 초안을 짜는 전문가입니다.',
    '이번 작업은 패턴 추천이 아니라 직원별 월간 근무표 초안을 직접 만드는 것입니다.',
    '',
    `대상 월: ${payload.selectedMonth}`,
    `사업체: ${payload.selectedCompany}`,
    `팀: ${payload.selectedDepartment}`,
    `날짜 순서: ${payload.monthDates.join(', ')}`,
    `직원 수: ${payload.staffs.length}`,
    '',
    `OFF는 반드시 "${OFF_SHIFT_TOKEN}" 문자열로만 표기하세요.`,
    'assignments는 monthDates와 같은 순서, 같은 길이로 작성하세요.',
    'assignments에는 반드시 제공된 shiftId 또는 __OFF__만 사용하세요.',
    '팀이 외래/행정/원무/경영지원처럼 주간 중심이면 주말은 기본적으로 OFF로 두고, 야간/이브닝을 쓰지 마세요.',
    '팀이 병동/응급/입원/수술처럼 24시간 운영 성격이고 야간 근무형태가 실제로 있으면 데이/이브닝/나이트를 합리적으로 섞으세요.',
    '불필요한 평일 OFF는 만들지 말고, 주간 팀은 평일 근무 + 주말 휴무 위주로 편성하세요.',
    '직원별 assignments는 사람이 읽어도 자연스럽게 이어지는 월간 초안이어야 합니다.',
    '반드시 모든 직원을 staffPlans에 포함하세요.',
    '',
    `로컬 팀 힌트: ${teamHint.mode}`,
    `로컬 팀 힌트 이유: ${teamHint.reason}`,
    '',
    '사용 가능한 근무형태:',
    shiftLines,
    '',
    '대상 직원:',
    staffLines,
    '',
    '응답 형식 규칙:',
    '- summary: 팀 전체 초안 요약 1~2문장',
    '- teamAnalysis.teamPurpose: 이 팀이 어떤 일을 하는 팀인지 해석',
    '- teamAnalysis.workMode: 예시) 주간 외래팀 / 주간 행정팀 / 주야간 병동팀 / 24시간 교대팀',
    '- teamAnalysis.includesNight: 야간이 실제 필요한 팀이면 true, 아니면 false',
    '- teamAnalysis.reasoning: 판단 근거 2~5개',
    '- teamAnalysis.planningFocus: 편성 시 우선한 기준 2~5개',
    '- staffPlans[].modeLabel: 직원별 배치 성격 요약',
    '- staffPlans[].rationale: 왜 그렇게 배치했는지 한 문장',
    '- staffPlans[].assignments: 월 전체 shiftId 배열',
  ].join('\n');
}

function buildFallbackRecommendation(
  payload: RequestBody,
  errorMessage?: string
): GeminiRecommendationResponse {
  const teamHint = deriveTeamHint(payload);
  const dayShift =
    payload.workShifts.find((shift) => resolveShiftBand(shift) === 'day') || payload.workShifts[0];
  const eveningShift = payload.workShifts.find((shift) => resolveShiftBand(shift) === 'evening');
  const nightShift = payload.workShifts.find((shift) => resolveShiftBand(shift) === 'night');
  const supportsNight = Boolean(
    nightShift && (teamHint.mode.includes('24시간') || teamHint.mode.includes('야간'))
  );

  const staffPlans = payload.staffs.map((staff, staffIndex) => {
    const assignments = payload.monthDates.map((date, dateIndex) => {
      const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

      if (supportsNight && dayShift && nightShift) {
        const sequence = eveningShift
          ? [dayShift.id, eveningShift.id, nightShift.id, OFF_SHIFT_TOKEN]
          : [dayShift.id, nightShift.id, OFF_SHIFT_TOKEN, OFF_SHIFT_TOKEN];
        return sequence[(dateIndex + staffIndex) % sequence.length];
      }

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return OFF_SHIFT_TOKEN;
      }

      return dayShift?.id || OFF_SHIFT_TOKEN;
    });

    return {
      staffId: staff.id,
      modeLabel: supportsNight ? '기본 교대 초안' : '기본 주간 초안',
      rationale: supportsNight
        ? '팀 특성과 등록 근무형태를 기준으로 주야간 교대형 초안을 먼저 배치했습니다.'
        : '팀 특성과 등록 근무형태를 기준으로 주간형 초안을 먼저 배치했습니다.',
      assignments,
    };
  });

  return {
    summary: errorMessage
      ? `Gemini 응답 처리 중 오류가 있어 팀 특성과 근무형태 기준의 기본 초안을 먼저 생성했습니다. ${teamHint.reason}`
      : `${teamHint.reason} 이를 기준으로 기본 초안을 생성했습니다.`,
    teamAnalysis: {
      teamPurpose: supportsNight ? '야간 대응이 필요한 팀으로 추정' : '주간 중심 운영 팀으로 추정',
      workMode: supportsNight ? '기본 24시간 교대 초안' : '기본 주간 초안',
      includesNight: supportsNight,
      reasoning: [teamHint.reason].concat(errorMessage ? ['Gemini 응답 오류로 기본 로직 사용'] : []),
      planningFocus: supportsNight
        ? ['주야간 순환 유지', '야간 인력 공백 방지', 'OFF 분산']
        : ['평일 근무 유지', '주말 휴무 반영', '주간 인력 우선'],
    },
    staffPlans,
  };
}

async function requestRecommendation(payload: RequestBody): Promise<GeminiRecommendationResponse> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다. .env.local의 GEMINI_API_KEY를 확인해주세요.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(payload);
  let lastError = '';

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });

      const result = await model.generateContent(prompt);
      const parsed = JSON.parse(result.response.text()) as GeminiRecommendationResponse;

      if (
        !parsed?.summary ||
        !parsed?.teamAnalysis ||
        !Array.isArray(parsed.staffPlans) ||
        parsed.staffPlans.length === 0
      ) {
        throw new Error('Gemini 응답 형식이 올바르지 않습니다.');
      }

      return parsed;
    } catch (error: any) {
      lastError = error?.message || String(error);
      if (lastError.includes('404') || lastError.includes('429')) {
        continue;
      }
    }
  }

  throw new Error(lastError || 'Gemini 팀 근무표 초안 생성에 실패했습니다.');
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = String((session.user as any)?.id || (session.user as any)?.name || 'unknown');
    if (!checkRosterRateLimit(userId)) {
      return NextResponse.json({ error: '1시간에 최대 10회까지 AI 근무표 생성이 가능합니다.' }, { status: 429 });
    }

    const body = (await request.json()) as Partial<RequestBody>;
    const payload: RequestBody = {
      selectedMonth: String(body.selectedMonth || '').trim(),
      selectedCompany: String(body.selectedCompany || '').trim(),
      selectedDepartment: String(body.selectedDepartment || '').trim(),
      monthDates: Array.isArray(body.monthDates) ? body.monthDates.map(String) : [],
      workShifts: Array.isArray(body.workShifts) ? body.workShifts : [],
      staffs: Array.isArray(body.staffs) ? body.staffs : [],
    };

    if (!payload.selectedMonth || !payload.selectedCompany || !payload.selectedDepartment) {
      return NextResponse.json(
        { error: '사업체, 팀, 대상 월 정보가 필요합니다.' },
        { status: 400 }
      );
    }

    if (payload.monthDates.length === 0) {
      return NextResponse.json({ error: '대상 월 날짜 정보가 없습니다.' }, { status: 400 });
    }

    if (payload.workShifts.length === 0) {
      return NextResponse.json({ error: '추천에 사용할 근무형태가 없습니다.' }, { status: 400 });
    }

    if (payload.staffs.length === 0) {
      return NextResponse.json({ error: '추천할 팀 직원이 없습니다.' }, { status: 400 });
    }

    let recommendation: GeminiRecommendationResponse;
    try {
      recommendation = await requestRecommendation(payload);
    } catch (error: any) {
      const message = error?.message || String(error);
      recommendation = buildFallbackRecommendation(payload, message);
    }

    return NextResponse.json(recommendation);
  } catch (error: any) {
    return NextResponse.json({ error: '근무표 추천 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
