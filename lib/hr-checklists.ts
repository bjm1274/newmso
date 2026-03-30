export type ChecklistType = '입사' | '퇴사';

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  doneAt: string | null;
};

export type ContractChecklistSummary = {
  status?: string | null;
  requestedAt?: string | null;
  signedAt?: string | null;
};

const ENTRY_DEFAULTS: ChecklistItem[] = [
  { key: 'contract_signature', label: '근로계약서 전송 및 전자서명 요청', done: false, doneAt: null },
  { key: 'profile_card', label: '인사카드 및 기본 인적사항 확인', done: false, doneAt: null },
  { key: 'account_setup', label: '사내 계정과 권한 기본 세팅', done: false, doneAt: null },
  { key: 'device_setup', label: 'PC·모바일·업무장비 지급 확인', done: false, doneAt: null },
  { key: 'orientation', label: '신규입사 오리엔테이션 및 업무 안내', done: false, doneAt: null },
  { key: 'first_day_ready', label: '첫 출근 준비 사항 최종 점검', done: false, doneAt: null },
];

const EXIT_DEFAULTS: ChecklistItem[] = [
  { key: 'handover', label: '업무 인수인계 완료', done: false, doneAt: null },
  { key: 'account_disable', label: '사내 계정 및 권한 회수', done: false, doneAt: null },
  { key: 'asset_return', label: 'PC·노트북·비품 반납 확인', done: false, doneAt: null },
  { key: 'card_security_return', label: '카드·보안매체·출입 권한 회수', done: false, doneAt: null },
  { key: 'payroll_settlement', label: '최종 급여 및 정산 확인', done: false, doneAt: null },
  { key: 'document_close', label: '문서·전자서명·인수 기록 마감', done: false, doneAt: null },
];

function toChecklistItem(raw: unknown): ChecklistItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!label) return null;

  const key =
    typeof record.key === 'string' && record.key.trim()
      ? record.key.trim()
      : label
          .replace(/\s+/g, '_')
          .replace(/[^\w가-힣]/g, '')
          .toLowerCase();

  return {
    key,
    label,
    done: Boolean(record.done),
    doneAt:
      typeof record.doneAt === 'string'
        ? record.doneAt
        : typeof record.done_at === 'string'
          ? record.done_at
          : null,
  };
}

export function getDefaultChecklist(type: ChecklistType): ChecklistItem[] {
  const source = type === '입사' ? ENTRY_DEFAULTS : EXIT_DEFAULTS;
  return source.map((item) => ({ ...item }));
}

export function getChecklistTargetDate(type: ChecklistType, baseDateValue?: string | null) {
  const baseDate = baseDateValue ? new Date(baseDateValue) : new Date();
  if (Number.isNaN(baseDate.getTime())) return null;
  const offsetDays = type === '입사' ? 14 : 7;
  baseDate.setDate(baseDate.getDate() + offsetDays);
  return baseDate.toISOString().slice(0, 10);
}

export function normalizeChecklistItems(rawItems: unknown, type: ChecklistType): ChecklistItem[] {
  const defaults = getDefaultChecklist(type);
  const incoming = Array.isArray(rawItems)
    ? (rawItems.map(toChecklistItem).filter(Boolean) as ChecklistItem[])
    : [];

  const merged = defaults.map((item) => {
    const matched = incoming.find(
      (candidate) => candidate.key === item.key || candidate.label === item.label,
    );

    return matched
      ? {
          ...item,
          done: matched.done,
          doneAt: matched.done ? matched.doneAt ?? null : null,
        }
      : item;
  });

  const extraItems = incoming.filter(
    (candidate) =>
      !merged.some((item) => item.key === candidate.key || item.label === candidate.label),
  );

  return [...merged, ...extraItems];
}

export function syncChecklistWithContract(
  items: ChecklistItem[],
  type: ChecklistType,
  contract?: ContractChecklistSummary | null,
): ChecklistItem[] {
  if (type !== '입사' || !contract?.status) return items;

  const shouldMarkRequested = ['서명대기', '서명완료'].includes(contract.status);
  if (!shouldMarkRequested) return items;

  let changed = false;
  const nextItems = items.map((item) => {
    if (item.key !== 'contract_signature') return item;
    if (item.done && item.doneAt) return item;

    changed = true;
    return {
      ...item,
      done: true,
      doneAt: contract.signedAt ?? contract.requestedAt ?? item.doneAt ?? new Date().toISOString(),
    };
  });

  return changed ? nextItems : items;
}

export function toggleChecklistItem(items: ChecklistItem[], key: string): ChecklistItem[] {
  return items.map((item) =>
    item.key === key
      ? {
          ...item,
          done: !item.done,
          doneAt: item.done ? null : new Date().toISOString(),
        }
      : item,
  );
}

export function countChecklistDone(items: ChecklistItem[]) {
  return items.filter((item) => item.done).length;
}

export function isChecklistComplete(items: ChecklistItem[]) {
  return items.length > 0 && items.every((item) => item.done);
}
