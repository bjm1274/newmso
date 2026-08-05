/**
 * 원천징수 신고 파일 생성 유틸리티
 * - 국세청 홈택스 원천세 전자신고 TXT
 * - 4대사회보험 EDI 일괄업로드 TXT
 * - 사내 보고용 통합 급여대장 Excel (CSV)
 */

export type PayrollExportRow = {
  staffName: string;
  residentNumber: string;
  department: string;
  position: string;
  baseSalary: number;
  totalTaxable: number;
  totalTaxfree: number;
  incomeTax: number;
  localTax: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  totalDeduction: number;
  netPay: number;
};

export type TaxFileCompanyInfo = {
  companyName: string;
  businessNumber: string;
  representativeName: string;
};

const PAD = (v: string | number, len: number) => String(v).padStart(len, '0');
const COMMA_NUM = (v: number) => Math.round(v).toLocaleString('ko-KR');

/**
 * CSV 셀 이스케이프.
 * 금액은 ko-KR 천단위 구분 쉼표를 그대로 쓰기 때문에 따옴표로 감싸지 않으면
 * "3,100,000" 이 3개 열로 쪼개져 열이 통째로 밀린다(성명·부서에 쉼표가 있어도 동일).
 * 열 수를 헤더와 맞추려면 모든 셀을 이 함수로 내보내야 한다.
 */
const CSV_CELL = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/**
 * 국세청 홈택스 원천세 전자신고 TXT 생성
 * C레코드 포맷: 간이세액 신고용
 */
export function generateHometaxTxt(
  rows: PayrollExportRow[],
  company: TaxFileCompanyInfo,
  yearMonth: string,
): string {
  const lines: string[] = [];
  const [year, month] = yearMonth.split('-');
  const bizNo = (company.businessNumber || '').replace(/[^0-9]/g, '');

  // H레코드 (헤더)
  lines.push(
    `H,${bizNo},${year}${month},${company.companyName},${company.representativeName},${rows.length}`,
  );

  // C레코드 (개인별 데이터)
  for (const row of rows) {
    const rn = (row.residentNumber || '').replace(/[^0-9]/g, '');
    lines.push(
      [
        'C13',
        bizNo,
        `${year}${month}`,
        '1004', // 소득구분: 근로소득
        rn,
        row.staffName,
        Math.round(row.totalTaxable),
        Math.round(row.totalTaxfree),
        Math.round(row.incomeTax),
        Math.round(row.localTax),
      ].join(','),
    );
  }

  // T레코드 (합계)
  const totals = rows.reduce(
    (acc, r) => ({
      taxable: acc.taxable + r.totalTaxable,
      taxfree: acc.taxfree + r.totalTaxfree,
      income: acc.income + r.incomeTax,
      local: acc.local + r.localTax }),
    { taxable: 0, taxfree: 0, income: 0, local: 0 },
  );
  lines.push(
    `T,${rows.length},${Math.round(totals.taxable)},${Math.round(totals.taxfree)},${Math.round(totals.income)},${Math.round(totals.local)}`,
  );

  return lines.join('\r\n');
}

/**
 * 4대사회보험 EDI 일괄업로드 TXT 생성
 */
export function generateEdiTxt(
  rows: PayrollExportRow[],
  company: TaxFileCompanyInfo,
  yearMonth: string,
): string {
  const lines: string[] = [];
  const [year, month] = yearMonth.split('-');
  const bizNo = (company.businessNumber || '').replace(/[^0-9]/g, '');

  lines.push(`[4대보험 EDI 일괄신고 데이터]`);
  lines.push(`사업장번호: ${bizNo}`);
  lines.push(`귀속연월: ${year}년 ${month}월`);
  lines.push(`사업장명: ${company.companyName}`);
  lines.push(`대상인원: ${rows.length}명`);
  lines.push('');
  lines.push('번호\t성명\t주민번호\t보험기준금액\t국민연금\t건강보험\t장기요양\t고용보험');

  rows.forEach((row, i) => {
    const base = Math.round(row.totalTaxable);
    lines.push(
      [
        PAD(i + 1, 3),
        row.staffName,
        row.residentNumber || '-',
        base,
        Math.round(row.nationalPension),
        Math.round(row.healthInsurance),
        Math.round(row.longTermCare),
        Math.round(row.employmentInsurance),
      ].join('\t'),
    );
  });

  lines.push('');
  const totals = rows.reduce(
    (acc, r) => ({
      np: acc.np + r.nationalPension,
      hi: acc.hi + r.healthInsurance,
      ltc: acc.ltc + r.longTermCare,
      ei: acc.ei + r.employmentInsurance }),
    { np: 0, hi: 0, ltc: 0, ei: 0 },
  );
  lines.push(
    `합계\t\t\t\t${Math.round(totals.np)}\t${Math.round(totals.hi)}\t${Math.round(totals.ltc)}\t${Math.round(totals.ei)}`,
  );

  return lines.join('\r\n');
}

/**
 * 사내 보고용 Excel (CSV) 생성
 */
export function generateExcelCsv(
  rows: PayrollExportRow[],
  company: TaxFileCompanyInfo,
  yearMonth: string,
): string {
  const [year, month] = yearMonth.split('-');
  const lines: string[] = [];

  lines.push(CSV_CELL(`${company.companyName} ${year}년 ${month}월 급여대장`));
  lines.push('');
  lines.push(
    [
      '번호', '성명', '부서', '직위', '기본급', '과세총액', '비과세', '소득세', '지방세',
      '국민연금', '건강보험', '장기요양', '고용보험', '공제합계', '차인지급액',
    ]
      .map(CSV_CELL)
      .join(','),
  );

  rows.forEach((row, i) => {
    lines.push(
      [
        i + 1,
        row.staffName,
        row.department,
        row.position,
        COMMA_NUM(row.baseSalary),
        COMMA_NUM(row.totalTaxable),
        COMMA_NUM(row.totalTaxfree),
        COMMA_NUM(row.incomeTax),
        COMMA_NUM(row.localTax),
        COMMA_NUM(row.nationalPension),
        COMMA_NUM(row.healthInsurance),
        COMMA_NUM(row.longTermCare),
        COMMA_NUM(row.employmentInsurance),
        COMMA_NUM(row.totalDeduction),
        COMMA_NUM(row.netPay),
      ]
        .map(CSV_CELL)
        .join(','),
    );
  });

  // 합계행
  // 헤더/데이터행과 동일한 15열이어야 한다. 과거에는 `,합계,` 뒤에 값을 붙여
  // 앞 공백이 3칸(번호·성명·부서)뿐이라 '직위' 열이 빠진 14열이 되었고,
  // 기본급 합계가 직위 칸에 들어가는 식으로 합계가 전부 한 칸씩 왼쪽으로 밀렸다.
  // 실수를 반복하지 않도록 데이터행과 같은 배열 join 방식으로 맞춘다.
  const sum = (key: keyof PayrollExportRow) =>
    COMMA_NUM(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));
  lines.push(
    [
      '', // 번호
      '합계', // 성명
      '', // 부서
      '', // 직위
      sum('baseSalary'),
      sum('totalTaxable'),
      sum('totalTaxfree'),
      sum('incomeTax'),
      sum('localTax'),
      sum('nationalPension'),
      sum('healthInsurance'),
      sum('longTermCare'),
      sum('employmentInsurance'),
      sum('totalDeduction'),
      sum('netPay'),
    ]
      .map(CSV_CELL)
      .join(','),
  );

  return '\uFEFF' + lines.join('\r\n'); // BOM for Excel
}

/**
 * payroll_records + staff_members 를 PayrollExportRow 배열로 변환
 */
export function buildExportRows(
  payrollRecords: Record<string, unknown>[],
  staffMap: Map<string, Record<string, unknown>>,
): PayrollExportRow[] {
  return payrollRecords
    .map((pr) => {
      const staffId = String(pr.staff_id || '');
      const staff = staffMap.get(staffId);
      if (!staff) return null;

      return {
        staffName: String(staff.name || ''),
        residentNumber: String(staff.resident_no ?? staff.resident_number ?? staff.rrn ?? ''),
        department: String(staff.department || ''),
        position: String(staff.position || ''),
        baseSalary: Number(pr.base_salary) || 0,
        totalTaxable: Number(pr.total_taxable) || 0,
        totalTaxfree: Number(pr.total_taxfree) || 0,
        incomeTax: Number(pr.income_tax) || 0,
        localTax: Number(pr.local_tax) || 0,
        nationalPension: Number(pr.national_pension) || 0,
        healthInsurance: Number(pr.health_insurance) || 0,
        longTermCare: Number(pr.long_term_care) || 0,
        employmentInsurance: Number(pr.employment_insurance) || 0,
        totalDeduction: Number(pr.total_deduction) || 0,
        netPay: Number(pr.net_pay) || 0 };
    })
    .filter((r): r is PayrollExportRow => r !== null);
}
