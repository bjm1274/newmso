/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * backfill_payroll_deduction_columns.js
 *
 * R-2 백필 — 과거 payroll_records의 4대보험·소득세 공제값을
 * deduction_detail JSON에서 top-level 컬럼으로 복사한다.
 *
 * 배경: 급여정산/중간정산이 과거에는 공제를 deduction_detail JSON에만 저장하고
 *       top-level 컬럼(national_pension 등)은 비워뒀다. 그런데 모바일 급여명세서·
 *       내정보·워크센터 4대보험 요약은 top-level 컬럼을 읽어, 과거 명세서의 공제가
 *       전부 0원으로 표시된다. (코드는 2026-06-03 수정으로 신규분부터 함께 저장)
 *
 * 동작: deduction_detail의 6개 공제값을 그대로 top-level 컬럼에 기록한다.
 *       net_pay·total_deduction은 손대지 않는다(이미 올바르게 저장됨).
 *       top-level 값이 detail과 이미 일치하면 건너뛴다.
 *
 * 사용법 (repair_payroll_records.js와 동일하게 dry-run 기본):
 *   node scripts/backfill_payroll_deduction_columns.js                  # 전체 dry-run(미적용)
 *   node scripts/backfill_payroll_deduction_columns.js --month=2026-02  # 특정월 dry-run
 *   node scripts/backfill_payroll_deduction_columns.js --apply          # 전체 실제 적용
 *   node scripts/backfill_payroll_deduction_columns.js --month=2026-02 --apply
 *
 * 데이터 소스: .env.local의 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *             (audit/repair 스크립트와 동일. D1 전용 환경은 별도 변형 필요)
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DEDUCTION_COLUMNS = [
  'national_pension',
  'health_insurance',
  'long_term_care',
  'employment_insurance',
  'income_tax',
  'local_tax',
];

function readEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = rawLine.indexOf('=');
    if (eqIndex === -1) continue;
    const key = rawLine.slice(0, eqIndex).trim();
    let value = rawLine.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseDetail(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const monthArg = (process.argv.find((arg) => arg.startsWith('--month=')) || '').split('=')[1] || '';

  const env = readEnv(path.join(process.cwd(), '.env.local'));
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('.env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const res = await supabase
    .from('payroll_records')
    .select('*')
    .order('year_month', { ascending: true });
  if (res.error) throw res.error;

  let rows = res.data || [];
  if (monthArg) rows = rows.filter((row) => row.year_month === monthArg);

  const updates = [];
  let skippedNoDetail = 0;
  let alreadySynced = 0;

  for (const row of rows) {
    const detail = parseDetail(row.deduction_detail);
    const hasAnyDetail = DEDUCTION_COLUMNS.some((col) => detail[col] != null);
    if (!hasAnyDetail) {
      skippedNoDetail += 1;
      continue;
    }

    const before = {};
    const after = {};
    let needsBackfill = false;
    for (const col of DEDUCTION_COLUMNS) {
      const detailVal = toInt(detail[col] || 0);
      const colVal = row[col] == null ? null : toInt(row[col]);
      before[col] = colVal;
      after[col] = detailVal;
      if (colVal !== detailVal) needsBackfill = true;
    }

    if (!needsBackfill) {
      alreadySynced += 1;
      continue;
    }

    updates.push({
      id: row.id,
      staff_id: row.staff_id,
      year_month: row.year_month,
      status: row.status,
      record_type: row.record_type ?? null,
      total_deduction: row.total_deduction,
      before,
      after,
    });
  }

  if (apply) {
    for (const item of updates) {
      const { error } = await supabase
        .from('payroll_records')
        .update(item.after)
        .eq('id', item.id);
      if (error) throw error;
    }
  }

  console.log(
    JSON.stringify(
      {
        apply,
        month_filter: monthArg || '(전체)',
        scanned: rows.length,
        needs_backfill: updates.length,
        already_synced: alreadySynced,
        skipped_no_detail: skippedNoDetail,
        sample: updates.slice(0, 20),
        sample_truncated: Math.max(0, updates.length - 20),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
