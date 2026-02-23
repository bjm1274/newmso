'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function YearEndSettlement({ staffs = [], selectedCo }: any) {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [settlementData, setSettlementData] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [showCertificate, setShowCertificate] = useState(false);

  useEffect(() => {
    fetchSettlementData();
  }, [selectedYear]);

  const fetchSettlementData = async () => {
    const { data: staff } = await supabase.from('staffs').select('*');
    setStaffList(staff || []);

    const { data: payroll } = await supabase
      .from('payroll')
      .select('*')
      .like('month', `${selectedYear}%`);

    if (payroll) {
      const settlementByStaff: any = {};

      payroll.forEach((pay: any) => {
        if (!settlementByStaff[pay.staff_id]) {
          settlementByStaff[pay.staff_id] = {
            staff_id: pay.staff_id,
            staff_name: pay.staff_name,
            staff_email: pay.staff_email,
            total_salary: 0,
            total_tax_paid: 0,
            total_insurance: 0,
            monthly_count: 0,
          };
        }
        settlementByStaff[pay.staff_id].total_salary += pay.total_salary || 0;
        settlementByStaff[pay.staff_id].total_tax_paid += pay.tax_amount || 0;
        settlementByStaff[pay.staff_id].total_insurance += pay.insurance_amount || 0;
        settlementByStaff[pay.staff_id].monthly_count += 1;
      });

      const settlement = Object.values(settlementByStaff).map((item: any) => {
        const standardDeduction = 1500000; // 기본공제
        const taxableIncome = Math.max(0, item.total_salary - standardDeduction);
        const calculatedTax = calculateYearEndTax(taxableIncome);
        const refund = item.total_tax_paid - calculatedTax;

        return {
          ...item,
          standard_deduction: standardDeduction,
          taxable_income: taxableIncome,
          calculated_tax: calculatedTax,
          tax_paid: item.total_tax_paid,
          refund_or_additional: refund,
          settlement_status: refund > 0 ? '환급' : refund < 0 ? '추가납부' : '정산완료',
        };
      });

      setSettlementData(settlement);
    }
  };

  const calculateYearEndTax = (taxableIncome: number) => {
    if (taxableIncome <= 0) return 0;
    if (taxableIncome <= 14000000) return Math.round(taxableIncome * 0.06);
    if (taxableIncome <= 50000000) return Math.round(taxableIncome * 0.15);
    return Math.round(taxableIncome * 0.35);
  };

  const generateWithholdingCertificate = (staff: any) => {
    return `
근로소득 원천징수영수증
발급일: ${new Date().toLocaleDateString('ko-KR')}
정산년도: ${selectedYear}년

[납세자 정보]
성명: ${staff.staff_name}
주민등록번호: ****-***${staff.id?.slice(-3) || '***'}
주소: [등록된 주소]

[소득 정보]
근로소득액: ₩${staff.total_salary.toLocaleString()}
기본공제: ₩${staff.standard_deduction.toLocaleString()}
과세표준: ₩${staff.taxable_income.toLocaleString()}

[세금 정보]
산출세액: ₩${staff.calculated_tax.toLocaleString()}
기납부세액: ₩${staff.tax_paid.toLocaleString()}
환급/추가납부: ₩${Math.abs(staff.refund_or_additional).toLocaleString()}

[보험료 정보]
건강보험료: ₩${Math.round(staff.total_salary * 0.03395).toLocaleString()}
국민연금료: ₩${Math.round(staff.total_salary * 0.045).toLocaleString()}
고용보험료: ₩${Math.round(staff.total_salary * 0.008).toLocaleString()}

[발급 기관]
박철홍정형외과
사업자등록번호: [등록번호]
대표자: [대표명]

이 증명서는 근로소득세법에 따라 발급되었습니다.
    `;
  };

  const downloadCertificate = (staff: any) => {
    const certificate = generateWithholdingCertificate(staff);
    const blob = new Blob([certificate], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `원천징수영수증_${staff.staff_name}_${selectedYear}.txt`;
    link.click();
  };

  const sendCertificateEmail = async (staff: any) => {
    // 이메일 발송 로직
    const { error } = await supabase.from('email_queue').insert([{
      recipient: staff.staff_email,
      subject: `[${selectedYear}년] 근로소득 원천징수영수증`,
      body: generateWithholdingCertificate(staff),
      type: 'withholding_certificate',
      status: '대기',
      created_at: new Date().toISOString(),
    }]);

    if (!error) {
      alert('이메일이 발송되었습니다.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3 items-center">
        <label className="text-sm font-medium text-[var(--foreground)]">정산 년도</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="h-9 px-3 border border-[var(--toss-border)] rounded-md text-sm font-medium focus:outline-none focus:border-[var(--toss-blue)]"
        >
          {[2024, 2025, 2026].map((year) => (
            <option key={year} value={year.toString()}>{year}년</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[var(--page-bg)] p-4 rounded-[12px] border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 급여액</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">
            ₩{settlementData.reduce((sum, item) => sum + item.total_salary, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[12px] border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-emerald-600 mb-1">총 환급액</p>
          <p className="text-lg font-semibold text-emerald-700">
            ₩{settlementData.filter(item => item.refund_or_additional > 0).reduce((sum, item) => sum + item.refund_or_additional, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[12px] border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-red-600 mb-1">총 추가납부</p>
          <p className="text-lg font-semibold text-red-700">
            ₩{Math.abs(settlementData.filter(item => item.refund_or_additional < 0).reduce((sum, item) => sum + item.refund_or_additional, 0)).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[12px] border border-[var(--toss-border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">정산 대상</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">{settlementData.length}명</p>
        </div>
      </div>

      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[12px] overflow-hidden">
        <div className="p-4 border-b border-[var(--toss-border)] bg-[var(--tab-bg)]">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">연말정산 현황</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--tab-bg)] border-b border-[var(--toss-border)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-[var(--foreground)]">직원명</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)]">연간급여</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)]">기본공제</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)]">과세표준</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)]">산출세액</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)]">기납부세액</th>
                <th className="px-4 py-2.5 text-right font-semibold text-[var(--foreground)]">환급/추가</th>
                <th className="px-4 py-2.5 text-center font-semibold text-[var(--foreground)]">상태</th>
                <th className="px-4 py-2.5 text-center font-semibold text-[var(--foreground)]">액션</th>
              </tr>
            </thead>
            <tbody>
              {settlementData.map((item) => (
                <tr key={item.staff_id} className="border-b border-[var(--toss-border)] hover:bg-[var(--page-bg)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--foreground)]">{item.staff_name}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-[var(--foreground)]">
                    ₩{item.total_salary.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)]">
                    ₩{item.standard_deduction.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)]">
                    ₩{item.taxable_income.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-[var(--foreground)]">
                    ₩{item.calculated_tax.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--toss-gray-4)]">
                    ₩{item.tax_paid.toLocaleString()}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${
                    item.refund_or_additional > 0 ? 'text-emerald-600' : item.refund_or_additional < 0 ? 'text-red-600' : 'text-[var(--toss-gray-4)]'
                  }`}>
                    ₩{Math.abs(item.refund_or_additional).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${
                      item.settlement_status === '환급'
                        ? 'bg-emerald-100 text-emerald-700'
                        : item.settlement_status === '추가납부'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
                    }`}>
                      {item.settlement_status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center space-x-1">
                    <button
                      onClick={() => {
                        setSelectedStaff(item);
                        setShowCertificate(true);
                      }}
                      className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] rounded-md text-xs font-medium hover:opacity-90"
                    >
                      보기
                    </button>
                    <button
                      onClick={() => downloadCertificate(item)}
                      className="px-2 py-1 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-md text-xs font-medium hover:opacity-90"
                    >
                      다운
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCertificate && selectedStaff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
          <div className="bg-[var(--toss-card)] rounded-[12px] p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-[var(--foreground)]">근로소득 원천징수영수증</h3>
              <button
                onClick={() => setShowCertificate(false)}
                className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-xl"
              >
                ✕
              </button>
            </div>

            <div className="bg-[var(--page-bg)] p-4 rounded-[12px] font-mono text-sm whitespace-pre-wrap mb-4 border border-[var(--toss-border)]">
              {generateWithholdingCertificate(selectedStaff)}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCertificate(false)}
                className="flex-1 py-2.5 bg-[var(--toss-gray-1)] text-[var(--foreground)] rounded-[12px] text-sm font-medium hover:opacity-90"
              >
                닫기
              </button>
              <button
                onClick={() => downloadCertificate(selectedStaff)}
                className="flex-1 py-2.5 bg-[var(--foreground)] text-white rounded-[12px] text-sm font-medium hover:opacity-90"
              >
                다운로드
              </button>
              <button
                onClick={() => sendCertificateEmail(selectedStaff)}
                className="flex-1 py-2.5 bg-[var(--toss-blue)] text-white rounded-[12px] text-sm font-medium hover:opacity-90"
              >
                이메일 발송
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
