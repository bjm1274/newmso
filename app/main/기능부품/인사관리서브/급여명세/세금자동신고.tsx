'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function TaxAutoReport() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [taxData, setTaxData] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [reportStatus, setReportStatus] = useState('미신고');

  useEffect(() => {
    fetchTaxData();
  }, [selectedYear]);

  const fetchTaxData = async () => {
    const { data: staff } = await supabase.from('staffs').select('*');
    setStaffList(staff || []);

    const { data: payroll } = await supabase
      .from('payroll')
      .select('*')
      .like('month', `${selectedYear}%`);

    if (payroll) {
      // 직원별 연간 세금 데이터 집계
      const taxByStaff: any = {};
      
      payroll.forEach((pay: any) => {
        if (!taxByStaff[pay.staff_id]) {
          taxByStaff[pay.staff_id] = {
            staff_id: pay.staff_id,
            staff_name: pay.staff_name,
            total_salary: 0,
            total_tax: 0,
            total_insurance: 0,
            total_deduction: 0,
            monthly_records: [],
          };
        }
        taxByStaff[pay.staff_id].total_salary += pay.total_salary || 0;
        taxByStaff[pay.staff_id].total_tax += pay.tax_amount || 0;
        taxByStaff[pay.staff_id].total_insurance += pay.insurance_amount || 0;
        taxByStaff[pay.staff_id].total_deduction += pay.total_deduction || 0;
        taxByStaff[pay.staff_id].monthly_records.push(pay);
      });

      const taxList = Object.values(taxByStaff).map((item: any) => ({
        ...item,
        // 4대보험 계산
        health_insurance: Math.round(item.total_salary * 0.03395), // 건강보험 3.395%
        long_term_care: Math.round(item.total_salary * 0.00775), // 장기요양보험 0.775%
        employment_insurance: Math.round(item.total_salary * 0.008), // 고용보험 0.8%
        pension: Math.round(item.total_salary * 0.045), // 국민연금 4.5%
        // 소득세 계산 (간단한 계산식)
        income_tax: calculateIncomeTax(item.total_salary),
        // 지방소득세
        local_tax: Math.round(calculateIncomeTax(item.total_salary) * 0.1),
      }));

      setTaxData(taxList);
    }
  };

  const calculateIncomeTax = (salary: number) => {
    // 간단한 소득세 계산 (실제는 더 복잡함)
    if (salary <= 14000000) return Math.round(salary * 0.06);
    if (salary <= 50000000) return Math.round(salary * 0.15);
    return Math.round(salary * 0.35);
  };

  const generateTaxReport = () => {
    return taxData.map((item) => ({
      직원명: item.staff_name,
      연간급여: item.total_salary,
      건강보험: item.health_insurance,
      장기요양보험: item.long_term_care,
      고용보험: item.employment_insurance,
      국민연금: item.pension,
      소득세: item.income_tax,
      지방소득세: item.local_tax,
      총공제액: item.health_insurance + item.long_term_care + item.employment_insurance + item.pension + item.income_tax + item.local_tax,
      실수령액: item.total_salary - (item.health_insurance + item.long_term_care + item.employment_insurance + item.pension + item.income_tax + item.local_tax),
    }));
  };

  const submitTaxReport = async () => {
    const report = generateTaxReport();
    
    // 세무서 API 연동 (실제 구현 시)
    const reportPayload = {
      year: selectedYear,
      report_date: new Date().toISOString(),
      data: report,
      status: '신고완료',
    };

    // 신고 기록 저장
    const { error } = await supabase.from('tax_reports').insert([reportPayload]);

    if (!error) {
      setReportStatus('신고완료');
      alert('세금 신고가 완료되었습니다.');
    }
  };

  const downloadTaxReport = () => {
    const report = generateTaxReport();
    const csv = [
      ['직원명', '연간급여', '건강보험', '장기요양보험', '고용보험', '국민연금', '소득세', '지방소득세', '총공제액', '실수령액'].join(','),
      ...report.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `세금신고_${selectedYear}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* 년도 선택 */}
      <div className="flex gap-4 items-center">
        <label className="text-sm font-medium text-[var(--foreground)]">신고 년도</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium focus:outline-none focus:border-[var(--toss-blue)]"
        >
          {[2024, 2025, 2026].map((year) => (
            <option key={year} value={year.toString()}>{year}년</option>
          ))}
        </select>
        <span className={`px-3 py-1.5 rounded-md text-xs font-medium ${
          reportStatus === '신고완료'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {reportStatus}
        </span>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--page-bg)] p-4 rounded-lg border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 급여액</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">
            ₩{taxData.reduce((sum, item) => sum + item.total_salary, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-lg border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 세금/보험료</p>
          <p className="text-lg font-semibold text-red-600">
            ₩{taxData.reduce((sum, item) => sum + item.total_deduction, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-lg border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">신고 대상</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">{taxData.length}명</p>
        </div>
      </div>

      {/* 세금 신고 테이블 */}
      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[var(--toss-border)] bg-[var(--tab-bg)] flex justify-between items-center">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">세금 신고 현황</h3>
          <div className="flex gap-2">
            <button
              onClick={downloadTaxReport}
              className="px-3 py-2 bg-[var(--foreground)] text-white rounded-lg text-xs font-medium hover:opacity-90"
            >
              CSV 다운로드
            </button>
            <button
              onClick={submitTaxReport}
              disabled={reportStatus === '신고완료'}
              className="px-3 py-2 bg-[var(--toss-blue)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {reportStatus === '신고완료' ? '신고완료' : '신고 제출'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--tab-bg)] border-b border-[var(--toss-border)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-[var(--foreground)] text-xs">직원명</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">연간급여</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">건강보험</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">장기요양</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">고용보험</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">국민연금</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">소득세</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">지방소득세</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">총공제</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)] text-xs">실수령액</th>
              </tr>
            </thead>
            <tbody>
              {taxData.map((item) => (
                <tr key={item.staff_id} className="border-b border-[var(--toss-border)] hover:bg-[var(--page-bg)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--foreground)] text-xs">{item.staff_name}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-[var(--foreground)] text-xs">
                    ₩{item.total_salary.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)] text-xs">
                    ₩{item.health_insurance.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)] text-xs">
                    ₩{item.long_term_care.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)] text-xs">
                    ₩{item.employment_insurance.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)] text-xs">
                    ₩{item.pension.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-red-600 text-xs">
                    ₩{item.income_tax.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-red-600 text-xs">
                    ₩{item.local_tax.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-red-600 text-xs">
                    ₩{(item.health_insurance + item.long_term_care + item.employment_insurance + item.pension + item.income_tax + item.local_tax).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 text-xs">
                    ₩{(item.total_salary - (item.health_insurance + item.long_term_care + item.employment_insurance + item.pension + item.income_tax + item.local_tax)).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4대보험 설명 */}
      <div className="bg-[var(--page-bg)] border border-[var(--toss-border)] rounded-lg p-4">
        <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">4대보험료 자동 계산</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="font-medium text-[var(--toss-blue)]">건강보험: 3.395%</p>
            <p className="text-xs text-[var(--toss-gray-3)]">직원과 회사 각각 부담</p>
          </div>
          <div>
            <p className="font-medium text-[var(--toss-blue)]">장기요양보험: 0.775%</p>
            <p className="text-xs text-[var(--toss-gray-3)]">건강보험료의 약 12.5%</p>
          </div>
          <div>
            <p className="font-medium text-[var(--toss-blue)]">고용보험: 0.8%</p>
            <p className="text-xs text-[var(--toss-gray-3)]">직원 0.8%, 회사 0.25%</p>
          </div>
          <div>
            <p className="font-medium text-[var(--toss-blue)]">국민연금: 4.5%</p>
            <p className="text-xs text-[var(--toss-gray-3)]">직원과 회사 각각 부담</p>
          </div>
        </div>
      </div>
    </div>
  );
}
