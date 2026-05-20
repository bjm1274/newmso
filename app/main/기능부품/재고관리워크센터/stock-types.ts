// 재고관리 워크센터 — 공통 타입·상수
//
// 결정 #44: 재고관리 7장 → 4 워크센터 (`status`, `io`, `item`, `analyze`)
// 결정 #36: 워크센터 패턴 = 4 KPI 행 + 메인(탭/split) + 우측 노트

// ─────────────────────────────────────────────────
// 워크센터 ID & 메타
// ─────────────────────────────────────────────────

export const STOCK_WORKCENTER_IDS = ['status', 'io', 'item', 'analyze'] as const;
export type StockWorkcenterId = (typeof STOCK_WORKCENTER_IDS)[number];

export type StockWorkcenterMeta = {
  id: StockWorkcenterId;
  label: string;
  /** 통합 전 원본 화면 라벨 (배너 chips — 코드에는 절대 노출하지 않음, 메타 보존용) */
  merge: readonly string[];
  /** 원본 화면 개수 */
  cnt: number;
  /** ★ 표시 */
  primary?: boolean;
};

export const STOCK_WORKCENTER_META: Record<StockWorkcenterId, StockWorkcenterMeta> = {
  status: {
    id: 'status',
    label: '재고 현황',
    merge: ['재고현황', '내 부서 재고', '재고 알림', '유효기간 알림'],
    cnt: 4,
    primary: true,
  },
  io: {
    id: 'io',
    label: '입출고·발주',
    merge: ['입출고관리', '구매 발주', '거래처관리', '명세서관리', '납품확인서'],
    cnt: 5,
  },
  item: {
    id: 'item',
    label: '물품·자산',
    merge: ['물품등록', '카테고리관리', '품목자산', '자산 QR', 'UDI 관리'],
    cnt: 5,
  },
  analyze: {
    id: 'analyze',
    label: '분석·마감',
    merge: ['ABC 분석', '재고 수요예측', '재고 실사', '월마감', '소모품 통계', 'AS·반품'],
    cnt: 6,
  },
};

// 기존 한글 id(현황·등록·발주·자산·월마감 등) → 워크센터 id 호환 매핑
export const LEGACY_TO_WORKCENTER: Record<string, StockWorkcenterId> = {
  // 정식
  status: 'status',
  io: 'io',
  item: 'item',
  analyze: 'analyze',
  // 기존 한글 한 글자/짧은 키
  현황: 'status',
  내부서재고: 'status',
  유통기한: 'status',
  재고알림: 'status',
  등록: 'io',
  이력: 'io',
  발주: 'io',
  스캔: 'io',
  거래처: 'io',
  명세서: 'io',
  납품확인서: 'io',
  이관: 'io',
  자산: 'item',
  비품대여설정: 'item',
  카테고리: 'item',
  UDI: 'item',
  월마감: 'analyze',
  재고실사: 'analyze',
  소모품통계: 'analyze',
  AS반품: 'analyze',
  수요예측: 'analyze',
};

export function resolveWorkcenterId(raw?: string | null): StockWorkcenterId {
  if (!raw) return 'status';
  const id = LEGACY_TO_WORKCENTER[raw];
  return id ?? 'status';
}

// ─────────────────────────────────────────────────
// 톤 (배지·KPI)
// ─────────────────────────────────────────────────

export type Tone = 'success' | 'warn' | 'danger' | 'accent' | 'muted';

// ─────────────────────────────────────────────────
// status 워크센터 — 행 타입
// ─────────────────────────────────────────────────

export type StockStatusRow = {
  name: string;
  cat: string;
  loc: string;
  stock: number;
  min: number;
  unit: string;
  /** 'YYYY-MM' 또는 '-' (유효기간 없음) */
  expire: string;
  status: '정상' | '부족' | '재고 0' | '유효기간';
  tone: Tone;
};

export type StatusScope = 'all' | 'my' | 'low' | 'zero' | 'expire';

export const STATUS_SCOPE_LABEL: Record<StatusScope, string> = {
  all: '전체',
  my: '내 부서',
  low: '부족',
  zero: '재고 0',
  expire: '유효기간',
};

// ─────────────────────────────────────────────────
// io 워크센터 — 행 타입
// ─────────────────────────────────────────────────

export type StockMoveRow = {
  time: string;
  kind: '입고' | '출고' | '이관' | '반품';
  item: string;
  qty: number;
  unit: string;
  from: string;
  to: string;
  who: string;
  tone: Tone;
};

export type PurchaseOrderRow = {
  id: string;
  vendor: string;
  items: number;
  amt: number;
  status: '발주 대기' | '확정' | '배송 중' | '납품 완료';
  tone: Tone;
  placed: string;
  due: string;
};

export type VendorCard = {
  name: string;
  cat: string;
  orders: number;
  /** 누적 지급 (단위: M = 백만원) */
  paid: number;
  /** 미수금 (단위: M) */
  due: number;
  contact: string;
  tone: Tone;
};

export type IOTab = 'inout' | 'order' | 'vendor';

// ─────────────────────────────────────────────────
// item 워크센터 — 행 타입
// ─────────────────────────────────────────────────

export type CatalogRow = {
  sku: string;
  name: string;
  cat: string;
  unit: string;
  price: number;
  date: string;
  who: string;
};

export type CategoryCard = {
  parent: string;
  items: number;
  kids: string[];
};

export type AssetRow = {
  id: string;
  name: string;
  loc: string;
  date: string;
  qr: boolean;
  status: '정상' | '수리 필요' | 'QR 미부착';
  tone: Tone;
};

export type UdiRow = {
  udi: string;
  name: string;
  mfr: string;
  model: string;
  lot: string;
  date: string;
};

export type ItemTab = 'items' | 'cats' | 'asset' | 'udi';

// ─────────────────────────────────────────────────
// analyze 워크센터 — 행 타입
// ─────────────────────────────────────────────────

export type AbcGrade = {
  grade: 'A' | 'B' | 'C';
  head: string;
  /** 매출 기여도 % (progress bar 폭) */
  contributionPct: number;
  desc: string;
  examples?: string[];
};

export type ForecastRow = {
  name: string;
  stock: number;
  pred: number;
  gap: number;
  when: string;
  conf: string;
  tone: Tone;
};

export type InspectRow = {
  loc: string;
  total: number;
  done: number;
  diff: number;
  who: string;
  tone: Tone;
};

export type CloseStep = {
  n: number;
  title: string;
  desc: string;
  state: 'done' | 'on' | 'pending';
};

export type CloseHistoryRow = {
  month: string;
  amt: string;
  diff: string;
  tone: Tone;
  done: string;
};

export type AnalyzeTab = 'abc' | 'pred' | 'ins' | 'clo';
