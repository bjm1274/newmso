/**
 * dummy-data.ts — 퇴원심사 더미 데이터
 * JM5: 가상 진단명 사용, 실제 환자 정보 없음
 */

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

export type ReviewStatus = 'wait' | 'progress' | 'done' | 'reject';
export type StepId = 1 | 2 | 3;
export type ApproverStatus = 'pending' | 'signed' | 'rejected' | 'unreached';
export type DischargeReason = '완치 퇴원' | '자의 퇴원' | '전원' | '사망' | '기타';

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  checked: boolean;
}

export interface Approver {
  role: string;
  name: string;
  status: ApproverStatus;
}

export interface DischargeReview {
  id: string;
  patientId: string;
  patientName: string;
  age: number;
  sex: '남' | '여';
  department: string;
  room: string;
  admitDate: string;
  dischargeDate: string;
  status: ReviewStatus;
  requestedAt: string;
  completedAt?: string;
  doctorName: string;
  diagnosis: string;
  dischargeReason: DischargeReason;
  dischargePlan: string;
  specialNote: string;
  checklist: ChecklistItem[];
  approvers: Approver[];
  finalOpinion: string;
}

// ── 상태 레이블 ───────────────────────────────────────────────────────────────

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  wait: '대기',
  progress: '진행',
  done: '완료',
  reject: '반려',
};

export const APPROVER_STATUS_LABELS: Record<ApproverStatus, string> = {
  pending: '서명 대기',
  signed: '서명 완료',
  rejected: '반려',
  unreached: '미도달',
};

// ── 더미 데이터 ───────────────────────────────────────────────────────────────

export const DUMMY_REVIEWS: DischargeReview[] = [
  {
    id: 'DR-2026-001',
    patientId: 'PT-2026-0511',
    patientName: '환자 A',
    age: 45,
    sex: '여',
    department: '정형외과',
    room: '201호',
    admitDate: '2026-05-01',
    dischargeDate: '2026-05-13',
    status: 'progress',
    requestedAt: '2026-05-11 09:12',
    doctorName: '김의사',
    diagnosis: '요추 추간판 탈출증 (L4-L5)',
    dischargeReason: '완치 퇴원',
    dischargePlan: '물리치료 2주 후 외래 추적, NSAIDs 처방 7일분',
    specialNote: '',
    checklist: [
      { id: 'ci-1', title: '처방 약품 수령 확인', description: '퇴원 처방전 및 약품 수령 여부', checked: true },
      { id: 'ci-2', title: '퇴원 동의서 서명', description: '환자 및 보호자 서명 완료', checked: true },
      { id: 'ci-3', title: '간호 교육 완료', description: '투약 방법, 주의사항 교육', checked: false },
      { id: 'ci-4', title: '의료비 정산', description: '입원비 정산 및 영수증 발급', checked: false },
      { id: 'ci-5', title: '병실 물품 반납', description: '병원 지급 물품 회수 확인', checked: false },
      { id: 'ci-6', title: '외래 예약 확인', description: '2주 후 추적 외래 예약 완료', checked: false },
    ],
    approvers: [
      { role: '담당 간호사', name: '간호사 김○○', status: 'pending' },
      { role: '담당 의사', name: '김의사', status: 'pending' },
      { role: '과장', name: '정형외과 과장', status: 'unreached' },
    ],
    finalOpinion: '',
  },
  {
    id: 'DR-2026-002',
    patientId: 'PT-2026-0503',
    patientName: '환자 B',
    age: 62,
    sex: '남',
    department: '내과',
    room: '305호',
    admitDate: '2026-05-05',
    dischargeDate: '2026-05-14',
    status: 'wait',
    requestedAt: '2026-05-11 10:30',
    doctorName: '이의사',
    diagnosis: '만성 폐쇄성 폐질환 급성 악화',
    dischargeReason: '완치 퇴원',
    dischargePlan: '금연 교육, 흡입기 사용법 재교육, 1개월 후 외래',
    specialNote: '보호자 동반 필요',
    checklist: [
      { id: 'ci-1', title: '처방 약품 수령 확인', description: '퇴원 처방전 및 약품 수령 여부', checked: false },
      { id: 'ci-2', title: '퇴원 동의서 서명', description: '환자 및 보호자 서명 완료', checked: false },
      { id: 'ci-3', title: '간호 교육 완료', description: '투약 방법, 주의사항 교육', checked: false },
      { id: 'ci-4', title: '의료비 정산', description: '입원비 정산 및 영수증 발급', checked: false },
      { id: 'ci-5', title: '병실 물품 반납', description: '병원 지급 물품 회수 확인', checked: false },
    ],
    approvers: [
      { role: '담당 간호사', name: '간호사 이○○', status: 'pending' },
      { role: '담당 의사', name: '이의사', status: 'pending' },
      { role: '과장', name: '내과 과장', status: 'unreached' },
    ],
    finalOpinion: '',
  },
  {
    id: 'DR-2026-003',
    patientId: 'PT-2026-0498',
    patientName: '환자 C',
    age: 38,
    sex: '남',
    department: '신경외과',
    room: '112호',
    admitDate: '2026-05-03',
    dischargeDate: '2026-05-10',
    status: 'done',
    requestedAt: '2026-05-10 08:00',
    completedAt: '2026-05-10 16:45',
    doctorName: '박의사',
    diagnosis: '경추 추간판 탈출증 (C5-C6)',
    dischargeReason: '완치 퇴원',
    dischargePlan: '경추 보조기 착용 4주, 3주 후 외래 추적',
    specialNote: '자가용 이동 가능',
    checklist: [
      { id: 'ci-1', title: '처방 약품 수령 확인', description: '퇴원 처방전 및 약품 수령 여부', checked: true },
      { id: 'ci-2', title: '퇴원 동의서 서명', description: '환자 및 보호자 서명 완료', checked: true },
      { id: 'ci-3', title: '간호 교육 완료', description: '투약 방법, 주의사항 교육', checked: true },
      { id: 'ci-4', title: '의료비 정산', description: '입원비 정산 및 영수증 발급', checked: true },
      { id: 'ci-5', title: '병실 물품 반납', description: '병원 지급 물품 회수 확인', checked: true },
    ],
    approvers: [
      { role: '담당 간호사', name: '간호사 박○○', status: 'signed' },
      { role: '담당 의사', name: '박의사', status: 'signed' },
      { role: '과장', name: '신경외과 과장', status: 'signed' },
    ],
    finalOpinion: '퇴원 상태 양호. 외래 추적 권고.',
  },
  {
    id: 'DR-2026-004',
    patientId: 'PT-2026-0487',
    patientName: '환자 D',
    age: 71,
    sex: '여',
    department: '순환기내과',
    room: '408호',
    admitDate: '2026-05-02',
    dischargeDate: '2026-05-15',
    status: 'reject',
    requestedAt: '2026-05-10 14:00',
    completedAt: '2026-05-11 11:00',
    doctorName: '최의사',
    diagnosis: '만성 심부전 급성 악화',
    dischargeReason: '완치 퇴원',
    dischargePlan: '저염식이 교육, 2주 후 외래',
    specialNote: '가족 보호자 동반 필수',
    checklist: [
      { id: 'ci-1', title: '처방 약품 수령 확인', description: '퇴원 처방전 및 약품 수령 여부', checked: true },
      { id: 'ci-2', title: '퇴원 동의서 서명', description: '환자 및 보호자 서명 완료', checked: false },
      { id: 'ci-3', title: '간호 교육 완료', description: '투약 방법, 주의사항 교육', checked: false },
      { id: 'ci-4', title: '의료비 정산', description: '입원비 정산 및 영수증 발급', checked: false },
      { id: 'ci-5', title: '병실 물품 반납', description: '병원 지급 물품 회수 확인', checked: false },
    ],
    approvers: [
      { role: '담당 간호사', name: '간호사 최○○', status: 'pending' },
      { role: '담당 의사', name: '최의사', status: 'rejected' },
      { role: '과장', name: '순환기내과 과장', status: 'unreached' },
    ],
    finalOpinion: '체크리스트 미완료 상태로 반려. 재심사 필요.',
  },
  {
    id: 'DR-2026-005',
    patientId: 'PT-2026-0512',
    patientName: '환자 E',
    age: 29,
    sex: '여',
    department: '산부인과',
    room: '502호',
    admitDate: '2026-05-09',
    dischargeDate: '2026-05-12',
    status: 'wait',
    requestedAt: '2026-05-11 13:00',
    doctorName: '정의사',
    diagnosis: '자연 분만 후 산욕기',
    dischargeReason: '완치 퇴원',
    dischargePlan: '산후 관리 교육, 6주 후 산부인과 외래',
    specialNote: '신생아 동반 퇴원',
    checklist: [
      { id: 'ci-1', title: '처방 약품 수령 확인', description: '퇴원 처방전 및 약품 수령 여부', checked: false },
      { id: 'ci-2', title: '퇴원 동의서 서명', description: '환자 및 보호자 서명 완료', checked: false },
      { id: 'ci-3', title: '간호 교육 완료', description: '산후 케어 및 수유 교육', checked: false },
      { id: 'ci-4', title: '의료비 정산', description: '입원비 정산 및 영수증 발급', checked: false },
      { id: 'ci-5', title: '신생아 퇴원 확인', description: '신생아 검사 완료 및 서류 발급', checked: false },
    ],
    approvers: [
      { role: '담당 간호사', name: '간호사 정○○', status: 'pending' },
      { role: '담당 의사', name: '정의사', status: 'pending' },
      { role: '과장', name: '산부인과 과장', status: 'unreached' },
    ],
    finalOpinion: '',
  },
];

// ── 템플릿 더미 데이터 ─────────────────────────────────────────────────────────

export interface ChecklistTemplate {
  id: string;
  name: string;
  department: string;
  itemCount: number;
  updatedAt: string;
  isRecommended?: boolean;
  items: Omit<ChecklistItem, 'checked'>[];
}

export const DUMMY_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 'tpl-1',
    name: '정형외과 기본 퇴원',
    department: '정형외과',
    itemCount: 6,
    updatedAt: '2026-04-10',
    isRecommended: true,
    items: [
      { id: 'ti-1', title: '처방 약품 수령 확인', description: '퇴원 처방전 및 약품 수령 여부' },
      { id: 'ti-2', title: '퇴원 동의서 서명', description: '환자 및 보호자 서명 완료' },
      { id: 'ti-3', title: '간호 교육 완료', description: '투약 방법, 주의사항 교육' },
      { id: 'ti-4', title: '의료비 정산', description: '입원비 정산 및 영수증 발급' },
      { id: 'ti-5', title: '병실 물품 반납', description: '병원 지급 물품 회수 확인' },
      { id: 'ti-6', title: '외래 예약 확인', description: '추적 외래 예약 완료' },
    ],
  },
  {
    id: 'tpl-2',
    name: '내과 일반 퇴원',
    department: '내과',
    itemCount: 5,
    updatedAt: '2026-03-22',
    items: [
      { id: 'ti-1', title: '처방 약품 수령 확인', description: '퇴원 처방전 및 약품 수령 여부' },
      { id: 'ti-2', title: '퇴원 동의서 서명', description: '환자 및 보호자 서명 완료' },
      { id: 'ti-3', title: '간호 교육 완료', description: '투약 방법, 생활 습관 교육' },
      { id: 'ti-4', title: '의료비 정산', description: '입원비 정산 및 영수증 발급' },
      { id: 'ti-5', title: '외래 예약 확인', description: '추적 외래 예약 완료' },
    ],
  },
  {
    id: 'tpl-3',
    name: '수술 후 퇴원 (표준)',
    department: '공통',
    itemCount: 8,
    updatedAt: '2026-04-01',
    items: [
      { id: 'ti-1', title: '처방 약품 수령 확인', description: '퇴원 처방전 및 약품 수령 여부' },
      { id: 'ti-2', title: '퇴원 동의서 서명', description: '환자 및 보호자 서명 완료' },
      { id: 'ti-3', title: '간호 교육 완료', description: '창상 관리, 투약 교육' },
      { id: 'ti-4', title: '의료비 정산', description: '입원비 정산 및 영수증 발급' },
      { id: 'ti-5', title: '병실 물품 반납', description: '병원 지급 물품 회수 확인' },
      { id: 'ti-6', title: '외래 예약 확인', description: '실밥 제거 및 추적 외래 예약' },
      { id: 'ti-7', title: '수술 후 주의사항 교육', description: '운동 제한, 식이 제한 안내' },
      { id: 'ti-8', title: '응급 연락처 안내', description: '응급 시 연락처 및 응급실 내원 기준 안내' },
    ],
  },
];
