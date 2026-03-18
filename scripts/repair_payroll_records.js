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

function resolveIncomeTaxBracket(rates) {
  return Array.isArray(rates?.income_tax_bracket) ? rates.income_tax_bracket : [];
}

function hasOfficialBracket(rates) {
  const entries = resolveIncomeTaxBracket(rates);
  return entries.length > 0 && entries.every((entry) => entry && entry.official === true);
}

function calculateMonthlyIncomeTax(taxableIncome, rates) {
  const monthlyTaxable = Math.max(0, Math.floor(Number(taxableIncome) || 0));
  if (monthlyTaxable <= 0) return 0;

  const annualTaxable = monthlyTaxable * 12;
  const brackets = resolveIncomeTaxBracket(rates)
    .map((entry) => ({
      min: Number(entry.min ?? 0),
      max: entry.max == null ? Number.POSITIVE_INFINITY : Number(entry.max),
      rate: Number(entry.rate ?? 0),
      deduction: Number(entry.deduction ?? 0),
      monthly_tax: entry.monthly_tax == null ? undefined : Number(entry.monthly_tax),
      base_tax: entry.base_tax == null ? undefined : Number(entry.base_tax),
    }))
    .sort((left, right) => left.min - right.min);
  const matched = brackets.find((entry) => annualTaxable >= entry.min && annualTaxable <= entry.max) || brackets[brackets.length - 1];
  if (!matched) return 0;
  if (matched.monthly_tax !== undefined) {
    return Math.max(0, Math.floor(matched.monthly_tax));
  }
  const annualTax = matched.base_tax !== undefined
    ? matched.base_tax + Math.max(0, annualTaxable - matched.min) * matched.rate
    : Math.max(0, annualTaxable * matched.rate - matched.deduction);
  return Math.max(0, Math.floor(annualTax / 12));
}

function recalculateRow(row, rates) {
  const detail = row.deduction_detail || {};
  const totalTaxable = Number(row.total_taxable || 0);
  const totalTaxfree = Number(row.total_taxfree || 0);
  const isMedicalBenefit = detail.is_medical_benefit === true;
  const isDuruNuri = detail.is_duru_nuri === true;
  const dependentCount = Math.max(0, Number(detail.dependent_count || 0));
  const customDeduction = Number(detail.custom_deduction || 0);

  const nationalPension = Math.floor(totalTaxable * Number(rates.national_pension_rate || 0));
  let healthInsurance = 0;
  let longTermCare = 0;
  let employmentInsurance = 0;

  if (!isMedicalBenefit) {
    healthInsurance = Math.floor(totalTaxable * Number(rates.health_insurance_rate || 0));
    longTermCare = Math.floor(totalTaxable * Number(rates.long_term_care_rate || 0));
  }

  const fullEmploymentInsurance = Math.floor(totalTaxable * Number(rates.employment_insurance_rate || 0));
  employmentInsurance = isDuruNuri ? Math.floor(fullEmploymentInsurance * 0.2) : fullEmploymentInsurance;

  const dependentTaxCredit = dependentCount * 12500;
  const incomeTax = Math.max(0, calculateMonthlyIncomeTax(totalTaxable, rates) - dependentTaxCredit);
  const localTax = Math.floor(incomeTax * 0.1 / 10) * 10;

  const totalDeduction = nationalPension + healthInsurance + longTermCare + employmentInsurance + incomeTax + localTax + customDeduction;
  const netPay = totalTaxable + totalTaxfree - totalDeduction;

  return {
    total_deduction: totalDeduction,
    net_pay: netPay,
    deduction_detail: {
      ...detail,
      national_pension: nationalPension,
      health_insurance: healthInsurance,
      long_term_care: longTermCare,
      employment_insurance: employmentInsurance,
      income_tax: incomeTax,
      local_tax: localTax,
      dependent_count: dependentCount,
      dependent_tax_credit: dependentTaxCredit,
      custom_deduction: customDeduction,
      tax_estimated: false,
    },
  };
}

async function main() {
  const yearMonth = process.argv[2] || '2026-02';
  const apply = process.argv.includes('--apply');

  const env = readEnv(path.join(process.cwd(), '.env.local'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const payrollRes = await supabase.from('payroll_records').select('*').order('created_at', { ascending: false });
  if (payrollRes.error) throw payrollRes.error;
  const rows = (payrollRes.data || []).filter((row) => row.year_month === yearMonth && row.status === '확정');

  const rateRes = await supabase
    .from('tax_insurance_rates')
    .select('*')
    .eq('effective_year', Number(yearMonth.slice(0, 4)))
    .eq('company_name', '전체')
    .maybeSingle();
  if (rateRes.error) throw rateRes.error;

  const staffIds = [...new Set(rows.map((row) => row.staff_id).filter(Boolean))];
  const staffRes = staffIds.length
    ? await supabase.from('staff_members').select('id,name,employee_no,company,department').in('id', staffIds)
    : { data: [], error: null };
  if (staffRes.error) throw staffRes.error;

  const linkedIds = new Set((staffRes.data || []).map((staff) => staff.id));
  const issues = [];

  if (!rateRes.data) issues.push('해당 연도 tax_insurance_rates가 없습니다.');
  if (rateRes.data && !hasOfficialBracket(rateRes.data)) issues.push('공식 확인된 income_tax_bracket이 없습니다.');
  if ((staffRes.data || []).length !== staffIds.length) issues.push('현재 staff_members와 연결되지 않는 payroll staff_id가 있습니다.');

  const preview = rows.map((row) => ({
    id: row.id,
    year_month: row.year_month,
    staff_id: row.staff_id,
    linked_staff_exists: linkedIds.has(row.staff_id),
    before: {
      total_deduction: row.total_deduction,
      net_pay: row.net_pay,
      deduction_detail: row.deduction_detail || {},
    },
    after: rateRes.data && linkedIds.has(row.staff_id)
      ? recalculateRow(row, rateRes.data)
      : null,
  }));

  if (apply) {
    if (issues.length > 0) {
      throw new Error(`적용 중단: ${issues.join(' / ')}`);
    }
    for (const item of preview) {
      const payload = item.after;
      const { error } = await supabase.from('payroll_records').update(payload).eq('id', item.id);
      if (error) throw error;
    }
  }

  console.log(JSON.stringify({
    year_month: yearMonth,
    apply,
    payroll_count: rows.length,
    linked_staff_count: staffRes.data?.length || 0,
    has_official_rates: Boolean(rateRes.data),
    issues,
    preview,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
