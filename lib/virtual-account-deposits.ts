export type DepositProvider = 'toss' | 'generic';
export type DepositStatus = 'issued' | 'deposited' | 'cancelled' | 'unknown';
export type MatchStatus = 'unmatched' | 'matched';

export type VirtualAccountDepositRow = {
  id: string;
  company_id: string | null;
  provider: DepositProvider | string;
  dedupe_key: string;
  provider_event_type: string | null;
  provider_event_id: string | null;
  order_id: string | null;
  order_name: string | null;
  payment_key: string | null;
  transaction_key: string | null;
  method: string | null;
  deposit_status: DepositStatus | string;
  match_status: MatchStatus | string;
  amount: number | string | null;
  currency: string | null;
  depositor_name: string | null;
  customer_name: string | null;
  patient_name: string | null;
  patient_id: string | null;
  transaction_label: string | null;
  bank_code: string | null;
  bank_name: string | null;
  account_number: string | null;
  due_date: string | null;
  deposited_at: string | null;
  matched_target_type: string | null;
  matched_target_id: string | null;
  matched_note: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type NormalizedVirtualAccountDeposit = Omit<
  VirtualAccountDepositRow,
  'id' | 'created_at' | 'updated_at'
>;

type NormalizeOptions = {
  companyId?: string | null;
  provider?: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeIsoDate(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString();
}

function mapDepositStatus(status: string | null): DepositStatus {
  switch ((status || '').toUpperCase()) {
    case 'READY':
    case 'WAITING_FOR_DEPOSIT':
    case 'IN_PROGRESS':
      return 'issued';
    case 'DONE':
    case 'PAID':
    case 'COMPLETED':
    case 'SUCCESS':
      return 'deposited';
    case 'CANCELED':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'ABORTED':
    case 'FAILED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function mapMatchStatus(value: unknown): MatchStatus {
  return String(value || '').toLowerCase() === 'matched' ? 'matched' : 'unmatched';
}

function inferMatchStatus(input: {
  match_status?: unknown;
  patient_name?: unknown;
  patient_id?: unknown;
  transaction_label?: unknown;
  matched_target_type?: unknown;
  matched_target_id?: unknown;
  matched_note?: unknown;
}): MatchStatus {
  const explicit = normalizeText(input.match_status);
  if (explicit === 'matched' || explicit === 'unmatched') {
    return explicit;
  }

  return pickText(
    input.patient_name,
    input.patient_id,
    input.transaction_label,
    input.matched_target_type,
    input.matched_target_id,
    input.matched_note,
  )
    ? 'matched'
    : 'unmatched';
}

function normalizeBankName(raw: string | null) {
  if (!raw) return null;
  return raw.replace(/_/g, ' ').trim();
}

function inferProvider(payload: Record<string, unknown>, explicitProvider?: string | null): DepositProvider {
  if (explicitProvider === 'toss') return 'toss';

  const eventType = normalizeText(payload.eventType);
  if (eventType === 'PAYMENT_STATUS_CHANGED' || eventType === 'DEPOSIT_CALLBACK') {
    return 'toss';
  }

  return 'generic';
}

function buildDedupeKey(provider: DepositProvider, candidates: Array<string | null>) {
  const key = candidates.find((candidate) => candidate && candidate.trim());
  if (key) return `${provider}:${key}`;
  return `${provider}:fallback:${Date.now()}`;
}

function normalizeTossWebhook(
  payload: Record<string, unknown>,
  options: NormalizeOptions,
): NormalizedVirtualAccountDeposit {
  const data = asObject(payload.data);
  const virtualAccount = asObject(data.virtualAccount);
  const metadata = asObject(data.metadata);
  const status = pickText(payload.status, data.status);
  const companyId = pickText(options.companyId, metadata.companyId, payload.companyId, data.companyId);
  const paymentKey = pickText(payload.paymentKey, data.paymentKey);
  const orderId = pickText(payload.orderId, data.orderId);
  const transactionKey = pickText(payload.transactionKey, data.transactionKey);
  const dedupeKey = buildDedupeKey('toss', [paymentKey, orderId, transactionKey]);
  const depositStatus = mapDepositStatus(status);

  return {
    company_id: companyId,
    provider: 'toss',
    dedupe_key: dedupeKey,
    provider_event_type: pickText(payload.eventType, 'DEPOSIT_CALLBACK'),
    provider_event_id: pickText(payload.eventId, data.eventId, transactionKey),
    order_id: orderId,
    order_name: pickText(payload.orderName, data.orderName),
    payment_key: paymentKey,
    transaction_key: transactionKey,
    method: pickText(payload.method, data.method, 'virtual_account'),
    deposit_status: depositStatus,
    match_status: inferMatchStatus({
      patient_name: metadata.patientName,
      patient_id: metadata.patientId,
      transaction_label: metadata.transactionLabel,
    }),
    amount: pickNumber(
      payload.totalAmount,
      payload.balanceAmount,
      data.totalAmount,
      data.balanceAmount,
      payload.amount,
      data.amount,
    ),
    currency: pickText(payload.currency, data.currency, 'KRW'),
    depositor_name: pickText(payload.depositorName, data.depositorName, virtualAccount.customerName),
    customer_name: pickText(payload.customerName, data.customerName, virtualAccount.customerName),
    patient_name: pickText(metadata.patientName),
    patient_id: pickText(metadata.patientId),
    transaction_label: pickText(metadata.transactionLabel, payload.orderName, data.orderName),
    bank_code: pickText(virtualAccount.bankCode, payload.bankCode, data.bankCode),
    bank_name: normalizeBankName(pickText(virtualAccount.bank, payload.bank, data.bank)),
    account_number: pickText(
      virtualAccount.accountNumber,
      payload.accountNumber,
      data.accountNumber,
    ),
    due_date: normalizeIsoDate(virtualAccount.dueDate ?? payload.dueDate ?? data.dueDate),
    deposited_at:
      depositStatus === 'deposited'
        ? normalizeIsoDate(
            payload.approvedAt ??
              payload.depositedAt ??
              data.approvedAt ??
              data.depositedAt ??
              payload.createdAt,
          )
        : null,
    matched_target_type: pickText(metadata.matchedTargetType),
    matched_target_id: pickText(metadata.matchedTargetId),
    matched_note: pickText(metadata.matchedNote),
    raw_payload: payload,
  };
}

function normalizeGenericWebhook(
  payload: Record<string, unknown>,
  options: NormalizeOptions,
): NormalizedVirtualAccountDeposit {
  const metadata = asObject(payload.metadata);
  const status = pickText(payload.status);
  const provider = inferProvider(payload, options.provider);
  const orderId = pickText(payload.orderId, payload.merchant_uid, payload.merchantUid);
  const paymentKey = pickText(payload.paymentKey, payload.imp_uid, payload.impUid);
  const transactionKey = pickText(payload.transactionKey, payload.txId, payload.tx_id);

  return {
    company_id: pickText(options.companyId, metadata.companyId, payload.companyId),
    provider,
    dedupe_key: buildDedupeKey(provider, [paymentKey, orderId, transactionKey]),
    provider_event_type: pickText(payload.eventType, payload.type, payload.status),
    provider_event_id: pickText(payload.eventId, payload.id, transactionKey),
    order_id: orderId,
    order_name: pickText(payload.orderName, payload.name),
    payment_key: paymentKey,
    transaction_key: transactionKey,
    method: pickText(payload.method, 'virtual_account'),
    deposit_status: mapDepositStatus(status),
    match_status: inferMatchStatus({
      patient_name: metadata.patientName,
      patient_id: metadata.patientId,
      transaction_label: metadata.transactionLabel,
    }),
    amount: pickNumber(payload.amount, payload.totalAmount, payload.price),
    currency: pickText(payload.currency, 'KRW'),
    depositor_name: pickText(payload.depositorName, payload.buyerName, payload.customerName),
    customer_name: pickText(payload.customerName, payload.buyerName),
    patient_name: pickText(metadata.patientName),
    patient_id: pickText(metadata.patientId),
    transaction_label: pickText(metadata.transactionLabel, payload.orderName, payload.name),
    bank_code: pickText(payload.bankCode),
    bank_name: normalizeBankName(pickText(payload.bankName, payload.bank)),
    account_number: pickText(payload.accountNumber),
    due_date: normalizeIsoDate(payload.dueDate),
    deposited_at: normalizeIsoDate(payload.depositedAt ?? payload.paidAt ?? payload.approvedAt),
    matched_target_type: pickText(metadata.matchedTargetType),
    matched_target_id: pickText(metadata.matchedTargetId),
    matched_note: pickText(metadata.matchedNote),
    raw_payload: payload,
  };
}

export function normalizeVirtualAccountWebhook(
  rawPayload: unknown,
  options: NormalizeOptions = {},
): NormalizedVirtualAccountDeposit | null {
  const payload = asObject(rawPayload);
  if (!payload || Object.keys(payload).length === 0) return null;

  const provider = inferProvider(payload, options.provider);
  if (provider === 'toss') {
    return normalizeTossWebhook(payload, options);
  }

  return normalizeGenericWebhook(payload, options);
}

export function normalizeDepositDraft(
  input: Partial<VirtualAccountDepositRow> & Record<string, unknown>,
) {
  const patientName = normalizeText(input.patient_name);
  const patientId = normalizeText(input.patient_id);
  const transactionLabel = normalizeText(input.transaction_label);
  const matchedTargetType = normalizeText(input.matched_target_type);
  const matchedTargetId = normalizeText(input.matched_target_id);
  const matchedNote = normalizeText(input.matched_note);

  return {
    patient_name: patientName,
    patient_id: patientId,
    transaction_label: transactionLabel,
    matched_target_type: matchedTargetType,
    matched_target_id: matchedTargetId,
    matched_note: matchedNote,
    match_status: inferMatchStatus({
      match_status: input.match_status,
      patient_name: patientName,
      patient_id: patientId,
      transaction_label: transactionLabel,
      matched_target_type: matchedTargetType,
      matched_target_id: matchedTargetId,
      matched_note: matchedNote,
    }),
  };
}

export function toAmountNumber(value: number | string | null | undefined) {
  return pickNumber(value);
}

export function getDepositStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'issued':
      return '발급/입금대기';
    case 'deposited':
      return '입금완료';
    case 'cancelled':
      return '취소';
    default:
      return '확인필요';
  }
}

export function getMatchStatusLabel(status: string | null | undefined) {
  return mapMatchStatus(status) === 'matched' ? '매칭완료' : '미매칭';
}

export function buildCompanyWebhookUrl(origin: string, companyId?: string | null) {
  const normalizedOrigin = origin.replace(/\/$/, '');
  const params = new URLSearchParams({ provider: 'toss' });
  if (companyId) params.set('companyId', companyId);
  return `${normalizedOrigin}/api/payments/virtual-account-webhook?${params.toString()}`;
}
