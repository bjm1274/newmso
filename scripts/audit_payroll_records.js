/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

function calculateFallbackMonthlyIncomeTax(monthlyTaxable) {
  const annualTaxable = Math.max(0, Math.floor(Number(monthlyTaxable) || 0)) * 12;
  if (annualTaxable <= 0) return 0;

  const brackets = [
    { max: 14_000_000, rate: 0.06, deduction: 0 },
    { max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
    { max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
    { max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
    { max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
    { max: 500_000_000, rate: 0.40, deduction: 25_940_000 },
    { max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
    { max: Number.POSITIVE_INFINITY, rate: 0.45, deduction: 65_940_000 },
  ];
  const matched = brackets.find((entry) => annualTaxable <= entry.max) || brackets[brackets.length - 1];
  const annualTax = Math.max(0, annualTaxable * matched.rate - matched.deduction);
  return Math.floor(annualTax / 12);
}

async function main() {
  const yearMonth = process.argv[2] || '2026-02';
  const env = readEnv(path.join(process.cwd(), '.env.local'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const payrollRes = await supabase.from('payroll_records').select('*').order('created_at', { ascending: false });
  if (payrollRes.error) {
    throw payrollRes.error;
  }

  const targetRows = (payrollRes.data || []).filter((row) => row.year_month === yearMonth && row.status === '확정');
  const staffIds = [...new Set(targetRows.map((row) => row.staff_id).filter(Boolean))];
  const staffRes = staffIds.length
    ? await supabase.from('staff_members').select('id,name,employee_no,company,department').in('id', staffIds)
    : { data: [], error: null };
  const rateRes = await supabase.from('tax_insurance_rates').select('*').eq('effective_year', Number(yearMonth.slice(0, 4)));

  const linkedIds = new Set((staffRes.data || []).map((row) => row.id));
  const findings = targetRows.map((row) => {
    const deductionDetail = row.deduction_detail || {};
    const detailSum =
      Number(deductionDetail.national_pension || 0) +
      Number(deductionDetail.health_insurance || 0) +
      Number(deductionDetail.long_term_care || 0) +
      Number(deductionDetail.employment_insurance || 0) +
      Number(deductionDetail.income_tax || 0) +
      Number(deductionDetail.local_tax || 0) +
      Number(deductionDetail.custom_deduction || 0);
    const expectedNet = Number(row.total_taxable || 0) + Number(row.total_taxfree || 0) - Number(row.total_deduction || 0);
    const legacyThreePercentTax = Math.floor(Number(row.total_taxable || 0) * 0.03);
    const fallbackTax = calculateFallbackMonthlyIncomeTax(Number(row.total_taxable || 0));

    return {
      id: row.id,
      staff_id: row.staff_id,
      year_month: row.year_month,
      total_taxable: row.total_taxable,
      total_taxfree: row.total_taxfree,
      total_deduction: row.total_deduction,
      net_pay: row.net_pay,
      stored_income_tax: Number(deductionDetail.income_tax || 0),
      stored_local_tax: Number(deductionDetail.local_tax || 0),
      detail_sum_matches_total_deduction: detailSum === Number(row.total_deduction || 0),
      net_matches_formula: expectedNet === Number(row.net_pay || 0),
      linked_staff_exists: linkedIds.has(row.staff_id),
      looks_like_legacy_three_percent_tax: Number(deductionDetail.income_tax || 0) === legacyThreePercentTax,
      fallback_monthly_income_tax: fallbackTax,
      fallback_delta_vs_stored_income_tax: fallbackTax - Number(deductionDetail.income_tax || 0),
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    year_month: yearMonth,
    payroll_count: targetRows.length,
    linked_staff_count: staffRes.data?.length || 0,
    tax_insurance_rate_rows_for_year: rateRes.data?.length || 0,
    findings,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
