/**
 * dummy-data.ts — OP체크 보드 더미 데이터
 *
 * JM4: 엄격한 유니온 타입, 외부 입력 없음(더미)
 * JM5: 환자명은 "환자A"~"환자H" 익명 처리
 */

// ── 타입 정의 ────────────────────────────────────────────────────────────────

export type OpStatus = 'waiting' | 'ready' | 'in_progress' | 'completed';

export interface CheckItem {
  label: string;
  done: boolean;
}

export interface OpPatient {
  id: string;
  name: string;
  room: string;
  doctor: string;
  opName: string;
  scheduledTime: string;
  /** 경과/대기 시간 텍스트 */
  elapsed: string;
  /** 경과 시간 분 (시간 경고 판별용) */
  elapsedMin: number;
  status: OpStatus;
  checks: CheckItem[];
}

// ── 더미 데이터 ───────────────────────────────────────────────────────────────

export const DUMMY_PATIENTS: OpPatient[] = [
  {
    id: 'p1',
    name: '환자A',
    room: '수술실 1호',
    doctor: '김철수 원장',
    opName: '백내장 제거',
    scheduledTime: '09:00',
    elapsed: '24분 대기',
    elapsedMin: 24,
    status: 'waiting',
    checks: [
      { label: '마취 동의서 확인', done: true },
      { label: '금식 확인', done: false },
      { label: '수술 부위 표시', done: false },
    ],
  },
  {
    id: 'p2',
    name: '환자B',
    room: '수술실 2호',
    doctor: '이영희 원장',
    opName: '망막 검사',
    scheduledTime: '09:30',
    elapsed: '8분 대기',
    elapsedMin: 8,
    status: 'waiting',
    checks: [
      { label: '마취 동의서 확인', done: false },
      { label: '금식 확인', done: false },
      { label: '수술 부위 표시', done: false },
    ],
  },
  {
    id: 'p3',
    name: '환자C',
    room: '수술실 1호',
    doctor: '박민준 원장',
    opName: '녹내장 수술',
    scheduledTime: '10:00',
    elapsed: '45분 대기',
    elapsedMin: 45,
    status: 'waiting',
    checks: [
      { label: '마취 동의서 확인', done: true },
      { label: '금식 확인', done: true },
      { label: '수술 부위 표시', done: false },
    ],
  },
  {
    id: 'p4',
    name: '환자D',
    room: '수술실 3호',
    doctor: '김철수 원장',
    opName: '레이저 교정',
    scheduledTime: '10:30',
    elapsed: '예약 전',
    elapsedMin: 0,
    status: 'waiting',
    checks: [
      { label: '마취 동의서 확인', done: false },
      { label: '금식 확인', done: false },
      { label: '수술 부위 표시', done: false },
    ],
  },
  {
    id: 'p5',
    name: '환자E',
    room: '수술실 2호',
    doctor: '이영희 원장',
    opName: '각막 이식',
    scheduledTime: '11:00',
    elapsed: '준비 5분',
    elapsedMin: 5,
    status: 'ready',
    checks: [
      { label: '마취 동의서 확인', done: true },
      { label: '금식 확인', done: true },
      { label: '수술 부위 표시', done: true },
    ],
  },
  {
    id: 'p6',
    name: '환자F',
    room: '수술실 3호',
    doctor: '박민준 원장',
    opName: '비문증 수술',
    scheduledTime: '11:30',
    elapsed: '준비 12분',
    elapsedMin: 12,
    status: 'ready',
    checks: [
      { label: '마취 동의서 확인', done: true },
      { label: '금식 확인', done: true },
      { label: '수술 부위 표시', done: true },
    ],
  },
  {
    id: 'p7',
    name: '환자G',
    room: '수술실 1호',
    doctor: '김철수 원장',
    opName: '렌즈 삽입술',
    scheduledTime: '08:45',
    elapsed: '경과 45분',
    elapsedMin: 45,
    status: 'in_progress',
    checks: [
      { label: '마취 동의서 확인', done: true },
      { label: '금식 확인', done: true },
      { label: '수술 부위 표시', done: true },
    ],
  },
  {
    id: 'p8',
    name: '환자H',
    room: '수술실 3호',
    doctor: '박민준 원장',
    opName: '망막 수술',
    scheduledTime: '09:10',
    elapsed: '경과 78분',
    elapsedMin: 78,
    status: 'in_progress',
    checks: [
      { label: '마취 동의서 확인', done: true },
      { label: '금식 확인', done: true },
      { label: '수술 부위 표시', done: true },
    ],
  },
];

// ── 상태 메타 ─────────────────────────────────────────────────────────────────

export interface StatusMeta {
  label: string;
  nextLabel: string | null;
  nextStatus: OpStatus | null;
}

export const STATUS_META: Record<OpStatus, StatusMeta> = {
  waiting: {
    label: '대기',
    nextLabel: '준비완료로 전환',
    nextStatus: 'ready',
  },
  ready: {
    label: '준비완료',
    nextLabel: '수술 시작',
    nextStatus: 'in_progress',
  },
  in_progress: {
    label: '수술중',
    nextLabel: '수술 완료',
    nextStatus: 'completed',
  },
  completed: {
    label: '수술완료',
    nextLabel: null,
    nextStatus: null,
  },
};
