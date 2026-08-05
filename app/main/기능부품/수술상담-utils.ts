// ─── 수술상담 유틸리티 함수 ────────────────────────────────────────────────────
import { formatKoreanDateKey, getKoreanMonthString } from '@/lib/seoul-time';
import type { ConsultationResult, SavedRecord, PatientGroup, KpiData } from './수술상담-types';
import { SECTIONS, CONSULT_RECORD_TTL_MS } from './수술상담-types';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function buildPlainText(result: ConsultationResult): string {
  const lines: string[] = ['[수술상담 분석 결과]', ''];
  for (const sec of SECTIONS) {
    const val = result[sec.key];
    if (!val || (Array.isArray(val) && val.length === 0)) continue;
    lines.push(`■ ${sec.label}`);
    if (Array.isArray(val)) {
      val.forEach((v, i) => lines.push(`  ${i + 1}. ${v}`));
    } else {
      lines.push(`  ${val}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * 환자 식별키 추출.
 * 1순위: patientName 필드 (신규 저장 기록)
 * 2순위: filename 기반 폴백 (레거시 기록 하위 호환)
 *   "녹음_" / "분석_" / "상담_" 접두어와 확장자를 제거한다.
 */
export function extractPatientKey(record: SavedRecord & { chartNumber?: string }): string {
  const name = record.patientName?.trim() || '미지정';
  const chart = record.chartNumber?.trim();
  if (chart && chart !== '미지정') {
    return `${name} (${chart})`;
  }
  if (record.patientName && record.patientName.trim()) {
    return record.patientName.trim();
  }
  const nameWithoutExt = record.filename.replace(/\.[^/.]+$/, '');
  return nameWithoutExt
    .replace(/^녹음_/, '')
    .replace(/^분석_/, '')
    .replace(/^상담_/, '');
}

export function groupByPatient(records: SavedRecord[]): PatientGroup[] {
  const map = new Map<string, SavedRecord[]>();
  for (const rec of records) {
    const key = extractPatientKey(rec);
    const existing = map.get(key) ?? [];
    map.set(key, [...existing, rec]);
  }
  const groups: PatientGroup[] = [];
  map.forEach((recs, key) => {
    const sorted = [...recs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const hasConsent = sorted.some(
      (r) => Array.isArray(r.result.consent_required) && r.result.consent_required.length > 0
    );
    groups.push({ key, records: sorted, latestAt: sorted[0].created_at, hasConsent });
  });
  return groups.sort(
    (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
  );
}

export function deriveKpi(records: SavedRecord[]): KpiData {
  const now = new Date();
  const todayStr = formatKoreanDateKey(now);
  const thisMonth = getKoreanMonthString(now);

  let todayCount = 0;
  let consentDoneThisMonth = 0;
  let consentMissing = 0;
  let reconsultRequest = 0;

  for (const rec of records) {
    const recDate = new Date(rec.created_at);
    const recDay = isNaN(recDate.getTime()) ? rec.created_at.slice(0, 10) : formatKoreanDateKey(recDate);
    const recMonth = recDay.slice(0, 7);
    const consentItems = rec.result.consent_required ?? [];
    const hasConsent = consentItems.length > 0;

    if (recDay === todayStr) todayCount++;
    if (recMonth === thisMonth && hasConsent) consentDoneThisMonth++;
    if (!hasConsent) consentMissing++;
    if (
      rec.result.next_schedule?.includes('재상담') ||
      rec.result.special_notes?.includes('재상담')
    ) {
      reconsultRequest++;
    }
  }

  return { todayCount, consentDoneThisMonth, consentMissing, reconsultRequest };
}

// ─── 상담 기록 보관 ────────────────────────────────────────────────────────────
//
// 상담 기록은 환자명·차트번호·진단·수술계획을 담은 환자정보다. 예전에는
// localStorage 에 평문으로 최대 30건을 만료 없이 쌓았고, 로그아웃해도 그대로
// 남았다. 공용 단말이라면 브라우저 프로필을 여는 것만으로 앱 인증 없이 읽힌다.
//
// 지금은 탭을 닫으면 사라지는 sessionStorage 에 보관하고, 보관 기간이 지난
// 기록은 읽는 시점에 버린다. 서버로 옮기는 것이 정답이지만 그건 저장 위치와
// 열람 권한을 함께 설계해야 하는 별개의 작업이라, 여기서는 "필요 이상으로
// 오래 남는 사본"을 없애는 데까지만 한다.

export function pruneExpiredRecords(
  records: SavedRecord[],
  now: number = Date.now(),
  ttlMs: number = CONSULT_RECORD_TTL_MS,
): SavedRecord[] {
  return records.filter((rec) => {
    const created = new Date(rec.created_at).getTime();
    // 생성 시각을 못 읽는 기록은 나이를 알 수 없으므로 남기지 않는다.
    if (!Number.isFinite(created)) return false;
    return now - created < ttlMs;
  });
}

function parseRecords(raw: string | null): SavedRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * 보관된 상담 기록을 읽는다.
 *
 * 레거시 localStorage 에 남아 있는 기록은 옮겨 담고 **원본을 지운다**.
 * 이 정리를 하지 않으면 이미 각 단말에 쌓인 환자정보가 영영 남는다.
 */
export function loadConsultationRecords(now: number = Date.now()): SavedRecord[] {
  if (typeof window === 'undefined') return [];

  let records: SavedRecord[] = [];
  try {
    records = parseRecords(window.sessionStorage.getItem(STORAGE_KEYS.CONSULTATION_RECORDS_SESSION));
  } catch { /* 세션 저장소 접근 불가 */ }

  try {
    const legacy = parseRecords(window.localStorage.getItem(STORAGE_KEYS.CONSULTATION_RECORDS_LEGACY));
    if (legacy.length > 0 && records.length === 0) records = legacy;
    window.localStorage.removeItem(STORAGE_KEYS.CONSULTATION_RECORDS_LEGACY);
  } catch { /* 로컬 저장소 접근 불가 */ }

  const pruned = pruneExpiredRecords(records, now);
  if (pruned.length !== records.length || records.length > 0) saveConsultationRecords(pruned);
  return pruned;
}

export function saveConsultationRecords(records: SavedRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEYS.CONSULTATION_RECORDS_SESSION, JSON.stringify(records));
  } catch { /* 용량 초과 등 — 기록 보관 실패가 분석 흐름을 막지 않는다 */ }
}
