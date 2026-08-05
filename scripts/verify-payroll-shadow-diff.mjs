#!/usr/bin/env node
/**
 * 과거 확정 급여를 서버 재계산과 대조한다. **읽기 전용이다.**
 *
 * 왜 필요한가 — 급여 확정 금액이 100% 클라이언트 계산이었다(8차 D04-008).
 * 서버 재계산을 강제 교정으로 올리려면 그 전에 "서버 계산이 과거 확정분과
 * 일치하는가" 를 실측해야 한다. 차이가 있는데 그대로 강제하면 **실제 지급액이
 * 바뀐다.** 이 스크립트가 그 대조를 한다.
 *
 * 어떻게 재현하는가 — payroll_records.deduction_detail 에 확정 당시의 부양가족 수,
 * 8~20세 자녀 수, 원천징수 비율, 두루누리·의료급여 여부, 세금·보험 적용 여부가
 * 함께 저장돼 있다. 그래서 소득세·지방소득세는 확정 시점 입력을 그대로 복원할 수 있다.
 *
 * 재현할 수 없는 것 — 국민연금·건강보험·고용보험의 **가입 적용 여부**와 국민연금
 * 고정액은 staff_members 의 현재 설정에서 읽는다(확정 시점 값이 어디에도 남지 않는다).
 * 그 사이 가입 상태가 바뀐 직원은 실제로는 맞는데 다르게 보일 수 있다.
 * 그래서 결과를 두 등급으로 나눠 보고한다.
 *   - 높음(세금)  : income_tax · local_tax — 입력을 완전히 복원했으므로 차이는 진짜다.
 *   - 낮음(보험)  : national_pension · health_insurance · long_term_care ·
 *                   employment_insurance — 가입 상태 변경이면 거짓 양성일 수 있다.
 *
 * 사용법
 *   node scripts/verify-payroll-shadow-diff.mjs 2026-01 2026-02 2026-03
 *   BASE_URL=https://erp.pchos.kr LOGIN_ID=9999 LOGIN_PW=... node scripts/verify-payroll-shadow-diff.mjs 2026-01
 *
 * 환경변수
 *   BASE_URL   기본 http://127.0.0.1:3000
 *   LOGIN_ID   기본 E2E-ADMIN
 *   LOGIN_PW   기본 E2ePassw0rd!
 *   COMPANY    기본 전체
 *   STATUS     대조 대상 상태. 기본 확정
 *
 * 이 스크립트는 조회(/api/d1/query)와 dryRun 검증(/api/payroll/shadow-verify)만
 * 호출한다. 어떤 행도 쓰지 않고 감사로그도 남기지 않는다.
 */

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const LOGIN_ID = process.env.LOGIN_ID || 'E2E-ADMIN';
const LOGIN_PW = process.env.LOGIN_PW || 'E2ePassw0rd!';
const COMPANY = process.env.COMPANY || '전체';
const STATUS = process.env.STATUS || '확정';

/** 확정 당시 입력을 완전히 복원할 수 있는 항목 — 차이가 나면 진짜다. */
const TAX_FIELDS = new Set(['income_tax', 'local_tax']);
/**
 * 다른 항목에서 계산되는 합계. 자체 원인이 없고 위 두 분류를 따라가므로
 * 따로 세지 않는다 — 함께 세면 한 사람의 차이가 여러 번 계상돼 규모가 부풀려진다.
 */
const DERIVED_FIELDS = new Set(['total_deduction', 'gross_pay', 'net_pay', 'total_insurance_deductions']);

const months = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
if (months.length === 0) {
  console.error('대조할 월을 YYYY-MM 형식으로 하나 이상 지정하세요.');
  console.error('예: node scripts/verify-payroll-shadow-diff.mjs 2026-01 2026-02');
  process.exit(2);
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/master-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: LOGIN_ID, password: LOGIN_PW }) });
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`로그인 실패 (${LOGIN_ID}): HTTP ${res.status}`);
  return cookie;
}

async function post(cookie, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 비 JSON 응답 */ }
  return { status: res.status, json, text: text.slice(0, 300) };
}

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

function parseDetail(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parsePermissions(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 확정 당시 옵션 복원.
 *
 * deduction_detail 에 남아 있는 값이 우선이고, 거기 없는 보험 가입 여부만
 * 현재 직원 설정에서 가져온다. 어떤 값을 어디서 가져왔는지 caveats 로 표시해
 * 결과 등급 분류에 쓴다.
 */
function buildInput(record, staff) {
  const detail = parseDetail(record.deduction_detail);
  const perms = parsePermissions(staff?.permissions);
  const insurance = perms.insurance_settings && typeof perms.insurance_settings === 'object'
    ? perms.insurance_settings
    : {};

  const reconstructedFromRecord =
    detail.dependent_count !== undefined || detail.is_duru_nuri !== undefined;

  return {
    input: {
      staff_id: String(record.staff_id),
      total_taxable: num(record.total_taxable),
      total_taxfree: num(record.total_taxfree),
      custom_deduction: num(detail.custom_deduction),
      advance_pay: num(record.advance_pay),
      options: {
        applyInsurance: detail.apply_insurance !== false,
        applyTax: detail.apply_tax !== false,
        isDuruNuriActive: detail.is_duru_nuri === true,
        isMedicalBenefit: detail.is_medical_benefit === true,
        dependentCount: Math.max(0, Number(detail.dependent_count) || 0),
        qualifyingChildCount: Math.max(0, Number(detail.child_count_8_20) || 0),
        withholdingRatePercent: detail.withholding_rate_percent ?? undefined,
        // ↓ 확정 시점 값이 남지 않아 현재 설정을 쓴다 (거짓 양성 가능)
        applyNationalPension: insurance.national !== false,
        applyHealthInsurance: insurance.health !== false,
        applyEmploymentInsurance: insurance.employment !== false,
        nationalPensionAmount:
          insurance.national_amount != null ? Number(insurance.national_amount) : null,
        joinedAt: staff?.joined_at || staff?.join_date || null,
        yearMonth: String(record.year_month) },
      client: {
        national_pension: num(record.national_pension),
        health_insurance: num(record.health_insurance),
        long_term_care: num(record.long_term_care),
        employment_insurance: num(record.employment_insurance),
        income_tax: num(record.income_tax),
        local_tax: num(record.local_tax) } },
    reconstructedFromRecord };
}

async function main() {
  const cookie = await login();
  console.log(`대상: ${BASE} · 회사 ${COMPANY} · 상태 ${STATUS}`);
  console.log(`월: ${months.join(', ')}\n`);

  let totalChecked = 0;
  let totalHigh = 0;
  let totalLow = 0;
  let totalNoDetail = 0;

  for (const yearMonth of months) {
    const q = await post(cookie, '/api/d1/query', {
      table: 'payroll_records',
      limit: 1000,
      where: [
        { field: 'year_month', op: 'eq', value: yearMonth },
        { field: 'status', op: 'eq', value: STATUS },
      ] });
    const records = q.json?.data ?? [];
    if (q.status !== 200) {
      console.log(`${yearMonth}  조회 실패 (HTTP ${q.status}) ${q.text}`);
      continue;
    }
    if (records.length === 0) {
      console.log(`${yearMonth}  ${STATUS} 기록 없음`);
      continue;
    }

    const staffIds = [...new Set(records.map((r) => String(r.staff_id)).filter(Boolean))];
    const staffRows = [];
    for (let i = 0; i < staffIds.length; i += 100) {
      const chunk = staffIds.slice(i, i + 100);
      const sq = await post(cookie, '/api/d1/query', {
        table: 'staff_members',
        limit: 200,
        columns: ['id', 'name', 'permissions', 'joined_at', 'join_date'],
        where: [{ field: 'id', op: 'in', value: chunk }] });
      staffRows.push(...(sq.json?.data ?? []));
    }
    const staffById = new Map(staffRows.map((s) => [String(s.id), s]));

    const inputs = [];
    let noDetail = 0;
    for (const record of records) {
      const { input, reconstructedFromRecord } = buildInput(record, staffById.get(String(record.staff_id)));
      if (!reconstructedFromRecord) noDetail += 1;
      inputs.push(input);
    }

    const res = await post(cookie, '/api/payroll/shadow-verify', {
      yearMonth,
      companyName: COMPANY,
      targetStatus: STATUS,
      dryRun: true,
      staffs: inputs });

    if (res.status !== 200 || !res.json?.ok) {
      console.log(`${yearMonth}  검증 실패 (HTTP ${res.status}) ${res.text}`);
      continue;
    }

    const mismatches = res.json.mismatches ?? [];
    const high = [];
    const low = [];
    for (const entry of mismatches) {
      const taxOnly = entry.mismatches.filter((m) => TAX_FIELDS.has(m.field));
      const insuranceOnly = entry.mismatches.filter(
        (m) => !TAX_FIELDS.has(m.field) && !DERIVED_FIELDS.has(m.field),
      );
      const derivedOnly = entry.mismatches.filter((m) => DERIVED_FIELDS.has(m.field));
      // 합계만 어긋나고 구성 항목은 모두 같다면 합산 규칙 자체가 다르다는 뜻이라
      // 그때는 놓치지 않도록 높음으로 올린다.
      if (taxOnly.length > 0) high.push({ staff_id: entry.staff_id, fields: taxOnly });
      else if (insuranceOnly.length === 0 && derivedOnly.length > 0) {
        high.push({ staff_id: entry.staff_id, fields: derivedOnly });
      }
      if (insuranceOnly.length > 0) low.push({ staff_id: entry.staff_id, fields: insuranceOnly });
    }

    totalChecked += records.length;
    totalHigh += high.length;
    totalLow += low.length;
    totalNoDetail += noDetail;

    const flags = [];
    if (res.json.locked) flags.push('마감잠금');
    if (!res.json.ratesConfigured) flags.push('요율 미설정');
    if (!res.json.officialWithholdingTable) flags.push('간이세액표 비공식');

    console.log(
      `${yearMonth}  ${records.length}건 검사 · 세금 불일치 ${high.length}명 · 보험 불일치 ${low.length}명`
      + (noDetail > 0 ? ` · 옵션 복원 불가 ${noDetail}건` : '')
      + (flags.length > 0 ? `  [${flags.join(', ')}]` : ''),
    );

    const show = (label, list) => {
      for (const item of list.slice(0, 20)) {
        const name = staffById.get(item.staff_id)?.name ?? item.staff_id;
        const detail = item.fields
          .map((f) => `${f.field} 확정 ${f.client.toLocaleString()} vs 서버 ${f.server.toLocaleString()} (차 ${f.diff.toLocaleString()})`)
          .join(', ');
        console.log(`    ${label} ${name}: ${detail}`);
      }
      if (list.length > 20) console.log(`    ... 외 ${list.length - 20}명`);
    };
    show('[높음]', high);
    show('[낮음]', low);
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`검사 ${totalChecked}건`);
  console.log(`세금 불일치(신뢰도 높음) ${totalHigh}명 — 확정 당시 입력을 그대로 복원한 결과다.`);
  console.log(`보험 불일치(신뢰도 낮음) ${totalLow}명 — 가입 상태 변경으로 인한 거짓 양성일 수 있다.`);
  if (totalNoDetail > 0) {
    console.log(`옵션 복원 불가 ${totalNoDetail}건 — deduction_detail 이 없는 옛 기록이다. 이 건들의 결과는 신뢰할 수 없다.`);
  }
  console.log('');
  if (totalHigh === 0) {
    console.log('세금 항목에서 차이가 없다. 강제 교정으로 올릴 근거가 된다.');
  } else {
    console.log('세금 항목에 차이가 있다. 원인을 규명하기 전에는 강제 교정으로 올리면 안 된다.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('대조 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
