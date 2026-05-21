// ─── 수술상담 타입 정의 ────────────────────────────────────────────────────────

export interface ConsultationResult {
  transcript_summary?: string;
  chief_complaint?: string;
  diagnosis?: string;
  surgery_plan?: string;
  risks_and_complications?: string[];
  patient_questions?: string[];
  doctor_answers?: string[];
  precautions?: string[];
  post_op_instructions?: string[];
  consent_required?: string[];
  medications?: string[];
  next_schedule?: string;
  special_notes?: string;
  consultation_date?: string;
}

export interface SavedRecord {
  id: string;
  created_at: string;
  filename: string;
  /** 환자명. 신규 저장 시 입력. 레거시 기록에는 없을 수 있으므로 옵셔널. */
  patientName?: string;
  result: ConsultationResult;
}

export interface PatientGroup {
  /** 환자 식별키: patientName 있으면 그 값, 없으면 파일명 기반 폴백 */
  key: string;
  records: SavedRecord[];
  latestAt: string;  // 최신 created_at
  hasConsent: boolean; // consent_required가 1개 이상 있으면 충족으로 간주
}

export interface KpiData {
  todayCount: number;
  consentDoneThisMonth: number;
  consentMissing: number;
  reconsultRequest: number;
}

// ─── 섹션 설정 ─────────────────────────────────────────────────────────────────
export const SECTIONS: {
  key: keyof ConsultationResult;
  label: string;
  icon: string;
  color: string;
  isArray?: boolean;
}[] = [
  { key: 'transcript_summary',      label: '상담 요약',           icon: '📋', color: 'blue',   isArray: false },
  { key: 'chief_complaint',         label: '주요 증상 / 주호소',   icon: '🩺', color: 'rose',   isArray: false },
  { key: 'diagnosis',               label: '진단명',               icon: '🔬', color: 'violet', isArray: false },
  { key: 'surgery_plan',            label: '수술 계획 및 방법',    icon: '🏥', color: 'teal',   isArray: false },
  { key: 'risks_and_complications', label: '합병증 / 위험사항',    icon: '⚠️', color: 'amber',  isArray: true  },
  { key: 'patient_questions',       label: '환자 / 보호자 질문',   icon: '❓', color: 'sky',    isArray: true  },
  { key: 'doctor_answers',          label: '의사 안내 / 답변',     icon: '💬', color: 'green',  isArray: true  },
  { key: 'precautions',             label: '수술 전 주의사항',     icon: '📌', color: 'orange', isArray: true  },
  { key: 'post_op_instructions',    label: '수술 후 주의사항',     icon: '🛡️', color: 'indigo', isArray: true  },
  { key: 'consent_required',        label: '동의 필요 항목',       icon: '✍️', color: 'pink',   isArray: true  },
  { key: 'medications',             label: '처방 / 복약 안내',     icon: '💊', color: 'cyan',   isArray: true  },
  { key: 'next_schedule',           label: '다음 예약 / 일정',     icon: '📅', color: 'lime',   isArray: false },
  { key: 'special_notes',           label: '특이사항 / 메모',      icon: '📝', color: 'slate',  isArray: false },
];

export const COLOR_MAP: Record<string, string> = {
  blue:   'bg-blue-500/10 border-blue-500/20 text-blue-900 dark:text-blue-200',
  rose:   'bg-rose-500/10 border-rose-500/20 text-rose-900 dark:text-rose-200',
  violet: 'bg-violet-500/10 border-violet-500/20 text-violet-900 dark:text-violet-200',
  teal:   'bg-teal-500/10 border-teal-500/20 text-teal-900 dark:text-teal-200',
  amber:  'bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200',
  sky:    'bg-sky-500/10 border-sky-500/20 text-sky-900 dark:text-sky-200',
  green:  'bg-green-500/10 border-green-500/20 text-green-900 dark:text-green-200',
  orange: 'bg-orange-500/10 border-orange-500/20 text-orange-900 dark:text-orange-200',
  indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-900 dark:text-indigo-200',
  pink:   'bg-pink-500/10 border-pink-500/20 text-pink-900 dark:text-pink-200',
  cyan:   'bg-cyan-500/10 border-cyan-500/20 text-cyan-900 dark:text-cyan-200',
  lime:   'bg-lime-500/10 border-lime-500/20 text-lime-900 dark:text-lime-200',
  slate:  'bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]',
};

export const BADGE_MAP: Record<string, string> = {
  blue:   'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  rose:   'bg-rose-500/20 text-rose-700 dark:text-rose-300',
  violet: 'bg-violet-500/20 text-violet-700 dark:text-violet-300',
  teal:   'bg-teal-500/20 text-teal-700 dark:text-teal-300',
  amber:  'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  sky:    'bg-sky-500/20 text-sky-700 dark:text-sky-300',
  green:  'bg-green-500/20 text-green-700 dark:text-green-300',
  orange: 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
  indigo: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  pink:   'bg-pink-500/20 text-pink-700 dark:text-pink-300',
  cyan:   'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
  lime:   'bg-lime-500/20 text-lime-700 dark:text-lime-300',
  slate:  'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

export const SUPPORTED_MIME: Record<string, string> = {
  'audio/webm': 'audio/webm',
  'audio/mp4':  'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
  'audio/wav':  'audio/wav',
  'audio/ogg':  'audio/ogg',
  'video/webm': 'video/webm',
  'video/mp4':  'video/mp4',
};

export const LS_KEY = 'erp_consultation_records';
