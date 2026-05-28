// ─── 수술상담 유틸리티 함수 ────────────────────────────────────────────────────
import type { ConsultationResult, SavedRecord, PatientGroup, KpiData } from './수술상담-types';
import { SECTIONS } from './수술상담-types';

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
  const todayStr = now.toISOString().slice(0, 10);
  const thisMonth = now.toISOString().slice(0, 7);

  let todayCount = 0;
  let consentDoneThisMonth = 0;
  let consentMissing = 0;
  let reconsultRequest = 0;

  for (const rec of records) {
    const recDay = rec.created_at.slice(0, 10);
    const recMonth = rec.created_at.slice(0, 7);
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
