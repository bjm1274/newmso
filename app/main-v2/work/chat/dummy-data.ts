/**
 * dummy-data.ts — 채팅 더미 데이터
 *
 * JM4: 명시적 타입, any 금지
 * JM5: 실제 이름·연락처 없음 (더미 전용)
 * JM: 단일 책임 — 데이터 정의만
 */

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type MessageStatus = 'sent' | 'delivered' | 'read';
export type RoomType = 'direct' | 'group';

export interface ChatUser {
  id: string;
  name: string;
  /** 이니셜 기반 아바타 색상 (CSS 변수 키) */
  color: string;
}

export interface ChatRoom {
  id: string;
  type: RoomType;
  name: string;
  participants: readonly string[]; // user id 목록
  lastMessage: string;
  lastAt: string; // ISO 8601
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  sentAt: string; // ISO 8601
  status: MessageStatus;
}

// ── 더미 사용자 ───────────────────────────────────────────────────────────────

export const ME_ID = 'u1';

export const DUMMY_USERS: readonly ChatUser[] = [
  { id: 'u1', name: '김민수', color: '#2563EB' },
  { id: 'u2', name: '이서연', color: '#10B981' },
  { id: 'u3', name: '박지훈', color: '#F59E0B' },
  { id: 'u4', name: '최유진', color: '#EF4444' },
  { id: 'u5', name: '정하늘', color: '#8B5CF6' },
  { id: 'u6', name: '강도현', color: '#EC4899' },
] as const;

export const USER_MAP: Readonly<Record<string, ChatUser>> = Object.fromEntries(
  DUMMY_USERS.map((u) => [u.id, u]),
);

// ── 더미 채팅방 ───────────────────────────────────────────────────────────────

export const DUMMY_ROOMS: readonly ChatRoom[] = [
  {
    id: 'r1',
    type: 'group',
    name: '간호팀 전체',
    participants: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
    lastMessage: '오늘 오후 회의 참석 부탁드립니다.',
    lastAt: '2026-05-11T14:30:00+09:00',
    unreadCount: 3,
  },
  {
    id: 'r2',
    type: 'direct',
    name: '이서연',
    participants: ['u1', 'u2'],
    lastMessage: '네, 확인했습니다!',
    lastAt: '2026-05-11T13:10:00+09:00',
    unreadCount: 0,
  },
  {
    id: 'r3',
    type: 'group',
    name: '원무팀',
    participants: ['u1', 'u3', 'u5'],
    lastMessage: '청구 오류 건 처리 완료됐습니다.',
    lastAt: '2026-05-11T11:45:00+09:00',
    unreadCount: 1,
  },
  {
    id: 'r4',
    type: 'direct',
    name: '박지훈',
    participants: ['u1', 'u3'],
    lastMessage: '내일 일정 공유해 드릴게요.',
    lastAt: '2026-05-10T17:20:00+09:00',
    unreadCount: 0,
  },
  {
    id: 'r5',
    type: 'group',
    name: '원장·수간호사',
    participants: ['u1', 'u4', 'u6'],
    lastMessage: '월례 회의 일정 조율 중입니다.',
    lastAt: '2026-05-10T09:00:00+09:00',
    unreadCount: 5,
  },
] as const;

// ── 더미 메시지 생성 헬퍼 ─────────────────────────────────────────────────────

function makeMessages(
  roomId: string,
  senderIds: readonly string[],
  texts: readonly string[],
  baseIso: string,
): ChatMessage[] {
  const base = new Date(baseIso).getTime();
  return texts.map((text, i) => ({
    id: `${roomId}_m${i + 1}`,
    roomId,
    senderId: senderIds[i % senderIds.length],
    text,
    sentAt: new Date(base + i * 3 * 60_000).toISOString(),
    status: 'read' as MessageStatus,
  }));
}

// ── r1 메시지 (100개) ─────────────────────────────────────────────────────────

const R1_TEXTS = [
  '안녕하세요, 오늘 오후 2시 회의 있습니다.',
  '네, 알겠습니다!',
  '회의실 예약 완료됐나요?',
  '3층 대회의실 예약했습니다.',
  '감사합니다 :)',
  '자료 준비해서 오세요.',
  '어떤 자료가 필요한가요?',
  '지난 달 통계 자료 부탁드립니다.',
  '알겠습니다, 준비하겠습니다.',
  '혹시 PPT 형식으로 준비해 주실 수 있나요?',
  '네, PPT로 만들겠습니다.',
  '몇 장 정도면 될까요?',
  '10장 내외로 부탁드려요.',
  '마감은 오전 11시까지입니다.',
  '이해했습니다.',
  '참석 인원 확인 부탁드립니다.',
  '현재 6명 확정입니다.',
  '점심 식사 후 바로 시작합니다.',
  '회의 시작 전에 간식 준비하겠습니다.',
  '고마워요!',
  '회의 전 미리 자료 공유해 주세요.',
  '구글 드라이브에 올려놓겠습니다.',
  '링크 공유 부탁드립니다.',
  '잠시 후 공유드립니다.',
  '회의 어젠다 확인하셨나요?',
  '네, 확인했습니다.',
  '추가 안건 있으신 분?',
  '저는 없습니다.',
  '저도 없어요.',
  '그러면 기존 안건대로 진행하겠습니다.',
  '시작 5분 전에 알림 주세요.',
  '알겠습니다!',
  '오늘 발표 준비 잘 하셨나요?',
  '열심히 준비했습니다!',
  '힘내세요 :)',
  '감사합니다 ^^',
  '오늘 출석 확인했나요?',
  '아직입니다, 바로 확인하겠습니다.',
  '참석자 명단 공유해 주세요.',
  '아래에 올려드릴게요.',
  '회의 시작합니다!',
  '다들 주목해 주세요.',
  '화면 공유 잘 보이시나요?',
  '네, 잘 보입니다.',
  '소리도 괜찮나요?',
  '선명하게 들립니다.',
  '자료 설명 시작하겠습니다.',
  '5월 환자 방문 수는 전월 대비 8% 증가했습니다.',
  '좋은 결과네요!',
  '다음 달 목표는 10% 성장입니다.',
  '도전적인 목표네요.',
  '모두 함께 노력합시다.',
  '네, 열심히 하겠습니다.',
  '질문 있으신 분?',
  '청구 관련 문의드려도 될까요?',
  '물론입니다, 말씀해 주세요.',
  '4월 청구 오류 건은 처리됐나요?',
  '내일까지 처리 완료 예정입니다.',
  '감사합니다.',
  '다른 질문 있으신가요?',
  '없습니다.',
  '그럼 다음 안건으로 넘어가겠습니다.',
  '교육 일정 공유드립니다.',
  '감사합니다.',
  '다음 달 교육 참석 필수입니다.',
  '알겠습니다!',
  '교육 장소는 어디인가요?',
  '2층 교육실입니다.',
  '몇 시부터 시작하나요?',
  '오전 9시 시작입니다.',
  '사전 신청 필요한가요?',
  '그룹웨어에서 신청하시면 됩니다.',
  '링크 공유해 주세요.',
  '잠시 후 공지 올리겠습니다.',
  '감사합니다 :)',
  '회의 마무리하겠습니다.',
  '수고하셨습니다!',
  '오늘 회의 잘 마쳤습니다.',
  '내용 정리해서 공유드리겠습니다.',
  '감사합니다.',
  '회의록 언제 올라오나요?',
  '오늘 퇴근 전까지 올리겠습니다.',
  '네, 확인할게요.',
  '다들 수고하셨습니다!',
  '내일도 파이팅!',
  '네!',
  '좋은 하루 마무리하세요.',
  '감사합니다~',
  '내일 뵙겠습니다.',
  '안녕히 계세요!',
  '오후 회의 참석 감사드립니다.',
  '수고하셨습니다.',
  '다음 회의 일정 확인 부탁드립니다.',
  '캘린더에서 확인할게요.',
  '공지 사항 있으면 말씀해 주세요.',
  '특별한 공지는 없습니다.',
  '그렇군요, 감사합니다.',
  '오늘 오후 회의 참석 부탁드립니다.',
] as const;

export const DUMMY_MESSAGES_R1: readonly ChatMessage[] = makeMessages(
  'r1',
  ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
  R1_TEXTS,
  '2026-05-11T08:00:00+09:00',
);

// ── 나머지 방 메시지 (간략) ───────────────────────────────────────────────────

export const DUMMY_MESSAGES_R2: readonly ChatMessage[] = makeMessages(
  'r2',
  ['u1', 'u2'],
  ['서류 확인 부탁드립니다.', '어떤 서류인가요?', '4월 근무 확인서입니다.', '확인 후 연락드릴게요.', '네, 확인했습니다!'],
  '2026-05-11T12:00:00+09:00',
);

export const DUMMY_MESSAGES_R3: readonly ChatMessage[] = makeMessages(
  'r3',
  ['u1', 'u3', 'u5'],
  ['청구 오류 내역 공유합니다.', '확인했습니다.', '수정 작업 시작하겠습니다.', '청구 오류 건 처리 완료됐습니다.'],
  '2026-05-11T10:00:00+09:00',
);

export const DUMMY_MESSAGES_R4: readonly ChatMessage[] = makeMessages(
  'r4',
  ['u1', 'u3'],
  ['내일 일정 있으신가요?', '오전은 회의입니다.', '오후에 시간 되세요?', '오후 3시 이후 괜찮습니다.', '내일 일정 공유해 드릴게요.'],
  '2026-05-10T16:00:00+09:00',
);

export const DUMMY_MESSAGES_R5: readonly ChatMessage[] = makeMessages(
  'r5',
  ['u1', 'u4', 'u6'],
  ['월례 회의 날짜 정해야 합니다.', '저는 15일이 좋습니다.', '저는 16일 이후가 좋습니다.', '그럼 17일로 하겠습니다.', '월례 회의 일정 조율 중입니다.'],
  '2026-05-10T08:00:00+09:00',
);

// ── 방별 메시지 맵 ────────────────────────────────────────────────────────────

export const ROOM_MESSAGES: Readonly<Record<string, readonly ChatMessage[]>> = {
  r1: DUMMY_MESSAGES_R1,
  r2: DUMMY_MESSAGES_R2,
  r3: DUMMY_MESSAGES_R3,
  r4: DUMMY_MESSAGES_R4,
  r5: DUMMY_MESSAGES_R5,
};
