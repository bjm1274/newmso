'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function YearEndSettlement() {
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
    <div className="space-y-6">
      {/* 년도 선택 */}
      <div className="flex gap-4 items-center">
        <label className="font-black text-gray-700">정산 년도:</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
        >
          {[2024, 2025, 2026].map((year) => (
            <option key={year} value={year.toString()}>{year}년</option>
          ))}
        </select>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
          <p className="text-xs font-bold text-blue-600 mb-2">총 급여액</p>
          <p className="text-2xl font-black text-blue-800">
            ₩{settlementData.reduce((sum, item) => sum + item.total_salary, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-green-50 p-6 rounded-xl border border-green-200">
          <p className="text-xs font-bold text-green-600 mb-2">총 환급액</p>
          <p className="text-2xl font-black text-green-800">
            ₩{settlementData.filter(item => item.refund_or_additional > 0).reduce((sum, item) => sum + item.refund_or_additional, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-red-50 p-6 rounded-xl border border-red-200">
          <p className="text-xs font-bold text-red-600 mb-2">총 추가납부</p>
          <p className="text-2xl font-black text-red-800">
            ₩{Math.abs(settlementData.filter(item => item.refund_or_additional < 0).reduce((sum, item) => sum + item.refund_or_additional, 0)).toLocaleString()}
          </p>
        </div>
        <div className="bg-purple-50 p-6 rounded-xl border border-purple-200">
          <p className="text-xs font-bold text-purple-600 mb-2">정산 대상</p>
          <p className="text-2xl font-black text-purple-800">{settlementData.length}명</p>
        </div>
      </div>

      {/* 연말정산 테이블 */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-black text-gray-800">📊 연말정산 현황</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-black text-gray-700">직원명</th>
                <th className="px-4 py-3 text-right font-black text-gray-700">연간급여</th>
                <th className="px-4 py-3 text-right font-black text-gray-700">기본공제</th>
                <th className="px-4 py-3 text-right font-black text-gray-700">과세표준</th>
                <th className="px-4 py-3 text-right font-black text-gray-700">산출세액</th>
                <th className="px-4 py-3 text-right font-black text-gray-700">기납부세액</th>
                <th className="px-4 py-3 text-right font-black text-gray-700">환급/추가</th>
                <th className="px-4 py-3 text-center font-black text-gray-700">상태</th>
                <th className="px-4 py-3 text-center font-black text-gray-700">액션</th>
              </tr>
            </thead>
            <tbody>
              {settlementData.map((item) => (
                <tr key={item.staff_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-800">{item.staff_name}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">
                    ₩{item.total_salary.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    ₩{item.standard_deduction.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    ₩{item.taxable_income.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">
                    ₩{item.calculated_tax.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    ₩{item.tax_paid.toLocaleString()}
                  </td>
                  <td className={`px-4 py-3 text-right font-black ${
                    item.refund_or_additional > 0 ? 'text-green-600' : item.refund_or_additional < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    ₩{Math.abs(item.refund_or_additional).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${
                      item.settlement_status === '환급'
                        ? 'bg-green-100 text-green-600'
                        : item.settlement_status === '추가납부'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-blue-100 text-blue-600'
                    }`}>
                      {item.settlement_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center space-x-1">
                    <button
                      onClick={() => {
                        setSelectedStaff(item);
                        setShowCertificate(true);
                      }}
                      className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs font-black hover:bg-blue-200"
                    >
                      보기
                    </button>
                    <button
                      onClick={() => downloadCertificate(item)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-black hover:bg-gray-200"
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

      {/* 원천징수영수증 모달 */}
      {showCertificate && selectedStaff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-800">
                📄 근로소득 원천징수영수증
              </h3>
              <button
                onClick={() => setShowCertificate(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg font-mono text-sm whitespace-pre-wrap mb-6 border border-gray-200">
              {generateWithholdingCertificate(selectedStaff)}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCertificate(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition-all"
              >
                닫기
              </button>
              <button
                onClick={() => downloadCertificate(selectedStaff)}
                className="flex-1 py-3 bg-gray-600 text-white rounded-lg font-bold hover:bg-gray-700 transition-all"
              >
                📥 다운로드
              </button>
              <button
                onClick={() => sendCertificateEmail(selectedStaff)}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all"
              >
                📧 이메일 발송
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
