'use client';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { useState, useEffect } from 'react';
import { getPayrollGrossPay } from '@/lib/payroll-records';
import { supabase } from '@/lib/supabase';
import {
  calculateAnnualIncomeTax,
  DEFAULT_TAX_INSURANCE_RATES,
  fetchTaxInsuranceRates,
  type TaxInsuranceRates,
} from '@/lib/use-tax-insurance-rates';

interface YearEndSettlementProps {
  staffs?: unknown[];
  selectedCo?: unknown;
}

export default function YearEndSettlement({ staffs = [], selectedCo }: YearEndSettlementProps) {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [settlementData, setSettlementData] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedStaff, setSelectedStaff] = useState<Record<string, unknown> | null>(null);
  const [showCertificate, setShowCertificate] = useState(false);
  const [taxInsuranceRates, setTaxInsuranceRates] = useState<TaxInsuranceRates>(DEFAULT_TAX_INSURANCE_RATES);

  // New OCR states
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Manual Input states
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    staff_id: '',
    total_salary: 0,
    tax_paid: 0,
    insurance: 0,
    is_edit: false
  });

  useEffect(() => {
    fetchSettlementData();
  }, [selectedYear, selectedCo]);

  useEffect(() => {
    let active = true;
    (async () => {
      const rates = await fetchTaxInsuranceRates((selectedCo as string) || '전체', Number(selectedYear));
      if (active) setTaxInsuranceRates(rates);
    })();
    return () => {
      active = false;
    };
  }, [selectedCo, selectedYear]);

  const handleOCRScan = async (file: File) => {
    setUploadLoading(true);
    // 실제 OCR API 연동 전까지 시뮬레이션 데이터를 제거합니다.
    await new Promise(resolve => setTimeout(resolve, 1500));
    setUploadLoading(false);
    toast("스마트 OCR 분석 서비스 준비 중입니다. 현재는 수기 입력 기능을 이용해 주세요.", 'warning');
  };

  const fetchSettlementData = async () => {
    const staffQuery = supabase.from('staff_members').select('*');
    const { data: staff } = await (selectedCo && selectedCo !== '전체'
      ? staffQuery.eq('company', selectedCo)
      : staffQuery);
    setStaffList(staff || []);

    const { data: payroll } = await supabase
      .from('payroll_records')
      .select('*')
      .gte('year_month', `${selectedYear}-01`)
      .lte('year_month', `${selectedYear}-12`)
      .not('record_type', 'eq', 'yearend');

    // Fetch manual overrides if any (Assuming a table exists or using a specific record_type)
    const { data: manualData } = await supabase
      .from('payroll_records')
      .select('*')
      .eq('year_month', `${selectedYear}-YE`) // Special marker for year-end manual entries
      .eq('record_type', 'yearend');

    if (staff) {
      const settlementByStaff: any = {};

      staff.forEach((s: StaffMember) => {
        settlementByStaff[s.id] = {
          staff_id: s.id,
          staff_name: s.name,
          staff_email: s.email || s.staff_email || '',
          total_salary: 0,
          total_tax_paid: 0,
          total_insurance: 0,
          monthly_count: 0,
        };
      });

      payroll?.forEach((pay: any) => {
        if (settlementByStaff[pay.staff_id]) {
          const deductionDetail = pay.deduction_detail || {};
          const grossPay = getPayrollGrossPay(pay);
          const incomeTax = Number(deductionDetail.income_tax || 0);
          const localTax = Number(deductionDetail.local_tax || 0);
          const insuranceTotal =
            Number(deductionDetail.health_insurance || 0) +
            Number(deductionDetail.long_term_care || 0) +
            Number(deductionDetail.employment_insurance || 0) +
            Number(deductionDetail.national_pension || 0);

          settlementByStaff[pay.staff_id].total_salary += grossPay;
          settlementByStaff[pay.staff_id].total_tax_paid += incomeTax + localTax;
          settlementByStaff[pay.staff_id].total_insurance += insuranceTotal || ((pay.total_deduction || 0) - incomeTax - localTax);
          settlementByStaff[pay.staff_id].monthly_count += 1;
        }
      });

      // Apply manual overrides
      manualData?.forEach((m: any) => {
        if (settlementByStaff[m.staff_id]) {
          settlementByStaff[m.staff_id].total_salary = m.total_taxable;
          settlementByStaff[m.staff_id].total_tax_paid = m.total_deduction; // Simplified for this view
          settlementByStaff[m.staff_id].is_manual = true;
        }
      });

      const settlement = (Object.values(settlementByStaff) as Record<string, unknown>[]).filter((item) => (item.total_salary as number) > 0 || item.is_manual).map((item) => {
        const standardDeduction = 1500000; // 기본공제
        const taxableIncome = Math.max(0, (item.total_salary as number) - standardDeduction);
        const calculatedTax = calculateYearEndTax(taxableIncome);
        const refund = (item.total_tax_paid as number) - calculatedTax;

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
    return calculateAnnualIncomeTax(taxableIncome, taxInsuranceRates);
  };

  const handleManualSave = async () => {
    if (!manualForm.staff_id) return toast("직원을 선택해 주세요.", 'warning');

    const staff = staffList.find(s => String(s.id) === String(manualForm.staff_id));
    if (!staff) return;

    const { error } = await supabase.from('payroll_records').upsert({
      staff_id: staff.id,
      year_month: `${selectedYear}-YE`,
      record_type: 'yearend',
      total_taxable: manualForm.total_salary,
      total_deduction: manualForm.tax_paid,
      status: '확정'
    }, { onConflict: 'staff_id,year_month' });

    if (error) {
      toast("저장 중 오류가 발생했습니다: " + ((error as Error)?.message ?? String(error)), 'error');
    } else {
      toast("수기 정산 데이터가 저장되었습니다.", 'success');
      setShowManualModal(false);
      fetchSettlementData();
    }
  };

  const generateWithholdingCertificate = (staff: Record<string, unknown>) => {
    const totalSalary = Number(staff.total_salary || 0);
    const standardDeduction = Number(staff.standard_deduction || 0);
    const taxableIncome = Number(staff.taxable_income || 0);
    const calculatedTax = Number(staff.calculated_tax || 0);
    const taxPaid = Number(staff.tax_paid || 0);
    const refundOrAdditional = Number(staff.refund_or_additional || 0);
    return `
근로소득 원천징수영수증
발급일: ${new Date().toLocaleDateString('ko-KR')}
정산년도: ${selectedYear}년

[납세자 정보]
성명: ${staff.staff_name as string}
주민등록번호: ****-***${String(staff.staff_id).slice(-3)}
주소: [등록된 주소]

[소득 정보]
근로소득액: ₩${totalSalary.toLocaleString()}
기본공제: ₩${standardDeduction.toLocaleString()}
과세표준: ₩${taxableIncome.toLocaleString()}

[세금 정보]
산출세액: ₩${calculatedTax.toLocaleString()}
기납부세액: ₩${taxPaid.toLocaleString()}
환급/추가납부: ₩${Math.abs(refundOrAdditional).toLocaleString()}

[보험료 정보]
건강보험료: ₩${Math.round(totalSalary * 0.03395).toLocaleString()}
국민연금료: ₩${Math.round(totalSalary * 0.045).toLocaleString()}
고용보험료: ₩${Math.round(totalSalary * 0.008).toLocaleString()}

[발급 기관]
박철홍정형외과
사업자등록번호: [등록번호]
대표자: [대표명]

이 증명서는 근로소득세법에 따라 발급되었습니다.
    `;
  };

  const downloadCertificate = (staff: Record<string, unknown>) => {
    const certificate = generateWithholdingCertificate(staff);
    const blob = new Blob([certificate], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `원천징수영수증_${staff.staff_name as string}_${selectedYear}.txt`;
    link.click();
  };

  const legacySendCertificateEmail = async (staff: Record<string, unknown>) => {
    // 이메일 발송 로직
    const { error } = await supabase.from('email_queue').insert([{
      recipient: staff.staff_email as string,
      subject: `[${selectedYear}년] 근로소득 원천징수영수증`,
      body: generateWithholdingCertificate(staff),
      type: 'withholding_certificate',
      status: '대기',
      created_at: new Date().toISOString(),
    }]);

    if (!error) {
      toast('이메일이 발송되었습니다.', 'success');
    }
  };

  void legacySendCertificateEmail;

  const sendCertificateEmail = async (staff: Record<string, unknown>) => {
    if (!staff?.staff_email) {
      toast('직원 이메일이 등록되지 않아 발송할 수 없습니다.', 'success');
      return;
    }

    const { error } = await supabase.from('email_queue').insert([
      {
        recipient: staff.staff_email as string,
        subject: `[${selectedYear}] 근로소득 원천징수영수증`,
        body: generateWithholdingCertificate(staff),
        type: 'withholding_certificate',
        status: 'pending',
        created_at: new Date().toISOString(),
      },
    ]);

    if (!error) {
      toast('이메일 발송을 예약했습니다.', 'success');
      return;
    }

    const code = String(error?.code ?? '');
    const message = String(error?.message ?? '');
    const missingSchema = code.startsWith('PGRST') || message.includes('schema cache') || message.includes('Could not find the table');
    if (missingSchema) {
      console.warn('email_queue table is not configured:', error);
      toast('이메일 큐가 설정되지 않아 메일을 보낼 수 없습니다. 다운로드 버튼으로 직접 저장해 주세요.', 'success');
      return;
    }

    console.error('withholding certificate email failed:', error);
    toast(`이메일 발송에 실패했습니다: ${((error as Error)?.message ?? String(error))}`, 'error');
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center bg-[var(--tab-bg)] p-4 rounded-[var(--radius-xl)] border border-[var(--border)]">
        <div className="flex gap-4 items-center">
          <div className="flex gap-3 items-center">
            <label className="text-sm font-bold text-blue-800">정산 년도</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-9 px-3 border border-[var(--border)] rounded-lg text-sm font-bold focus:outline-none focus:border-[var(--accent)] bg-[var(--card)]"
            >
              {[2024, 2025, 2026].map((year) => (
                <option key={year} value={year.toString()}>{year}년</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.pdf,image/*';
              input.onchange = (e: Event) => {
                const target = e.target as HTMLInputElement;
                if (target.files?.[0]) handleOCRScan(target.files[0]);
              };
              input.click();
            }}
            disabled={uploadLoading}
            className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-black rounded-[var(--radius-md)] hover:scale-105 transition-all shadow-sm flex items-center gap-2"
          >
            {uploadLoading ? "📑 분석 중..." : "📸 영수증 스마트 스캔 (준비 중)"}
          </button>
          <button
            onClick={() => setShowManualModal(true)}
            className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-xs font-black rounded-[var(--radius-md)] hover:bg-[var(--tab-bg)] transition-all shadow-sm"
          >
            ➕ 수기 입력
          </button>
        </div>
      </div>

      {scanResult && (
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-[var(--radius-xl)] animate-in slide-in-from-top duration-500">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-black text-emerald-800 flex items-center gap-2">
              ✨ 자동 분석 결과 (미리보기)
              <span className="text-[10px] bg-emerald-100 px-2 py-0.5 rounded-[var(--radius-md)] font-bold">OCR 완료</span>
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => setScanResult(null)}
                className="px-3 py-1 bg-[var(--card)] border border-emerald-200 text-emerald-600 text-[10px] font-black rounded-lg hover:bg-emerald-100"
              >취소</button>
              <button
                className="px-3 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-lg hover:bg-emerald-700 shadow-sm"
              >이 데이터로 정산하기</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[var(--card)]/60 p-3 rounded-[var(--radius-md)]">
              <p className="text-[10px] text-emerald-600 font-bold">결정세액 (예상)</p>
              <p className="text-sm font-black text-[var(--foreground)]">₩{Number(scanResult.tax_paid ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-[var(--card)]/60 p-3 rounded-[var(--radius-md)]">
              <p className="text-[10px] text-emerald-600 font-bold">카드 등 공제액</p>
              <p className="text-sm font-black text-[var(--foreground)]">₩{Number((scanResult.deductions as Record<string, unknown>)?.credit_card ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-[var(--card)]/60 p-3 rounded-[var(--radius-md)]">
              <p className="text-[10px] text-emerald-600 font-bold">의료비 공제액</p>
              <p className="text-sm font-black text-[var(--foreground)]">₩{Number((scanResult.deductions as Record<string, unknown>)?.medical ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 급여액</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">
            ₩{settlementData.reduce((sum, item) => sum + item.total_salary, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-emerald-600 mb-1">총 환급액</p>
          <p className="text-lg font-semibold text-emerald-700">
            ₩{settlementData.filter(item => item.refund_or_additional > 0).reduce((sum, item) => sum + item.refund_or_additional, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-red-600 mb-1">총 추가납부</p>
          <p className="text-lg font-semibold text-red-700">
            ₩{Math.abs(settlementData.filter(item => item.refund_or_additional < 0).reduce((sum, item) => sum + item.refund_or_additional, 0)).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">정산 대상</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">{settlementData.length}명</p>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-xl)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--tab-bg)]">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">연말정산 현황</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--tab-bg)] border-b border-[var(--border)]">
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
                <tr key={item.staff_id} className="border-b border-[var(--border)] hover:bg-[var(--page-bg)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--foreground)]">
                    {item.staff_name}
                    {item.is_manual && <span className="ml-1 text-[9px] bg-[var(--tab-bg)] text-[var(--toss-gray-4)] px-1 rounded">수기</span>}
                  </td>
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
                  <td className={`px-4 py-2.5 text-right font-semibold ${item.refund_or_additional > 0 ? 'text-emerald-600' : item.refund_or_additional < 0 ? 'text-red-600' : 'text-[var(--toss-gray-4)]'
                    }`}>
                    ₩{Math.abs(item.refund_or_additional).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${item.settlement_status === '환급'
                      ? 'bg-emerald-100 text-emerald-700'
                      : item.settlement_status === '추가납부'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                      }`}>
                      {item.settlement_status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center space-x-1 flex items-center justify-center">
                    <button
                      onClick={() => {
                        setSelectedStaff(item);
                        setShowCertificate(true);
                      }}
                      className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded-md text-xs font-medium hover:opacity-90"
                    >
                      보기
                    </button>
                    <button
                      onClick={() => {
                        setManualForm({
                          staff_id: String(item.staff_id),
                          total_salary: item.total_salary,
                          tax_paid: item.tax_paid,
                          insurance: item.total_insurance || 0,
                          is_edit: true
                        } as any);
                        setShowManualModal(true);
                      }}
                      className="px-2 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-md text-xs font-medium hover:bg-amber-100"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => downloadCertificate(item)}
                      className="px-2 py-1 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-md text-xs font-medium hover:opacity-90"
                    >
                      다운
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {settlementData.length === 0 && (
            <div className="py-20 text-center text-[var(--toss-gray-3)]">
              해당 년도에 확정된 급여 데이터가 없습니다.
            </div>
          )}
        </div>
      </div>

      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] animate-in fade-in duration-200">
          <div className="bg-[var(--card)] rounded-[var(--radius-xl)] p-4 w-full max-w-md shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-[var(--foreground)]">
                {manualForm.is_edit ? '📝 연말정산 데이터 수정' : '➕ 연말정산 수기 입력'}
              </h3>
              <button
                onClick={() => {
                  setShowManualModal(false);
                  setManualForm({ staff_id: '', total_salary: 0, tax_paid: 0, insurance: 0, is_edit: false });
                }}
                className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-xl"
              >✕</button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--toss-gray-4)]">대상 직원</label>
                <select
                  value={manualForm.staff_id}
                  onChange={(e) => setManualForm({ ...manualForm, staff_id: e.target.value })}
                  className="w-full h-11 px-3 border border-[var(--border)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  <option value="">직원을 선택하세요</option>
                  {staffList.filter(s => selectedCo === '전체' || s.company === selectedCo).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.company})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--toss-gray-4)]">연간 총 급여액 (과세대상)</label>
                <input
                  type="number"
                  value={manualForm.total_salary}
                  onChange={(e) => setManualForm({ ...manualForm, total_salary: Number(e.target.value) })}
                  className="w-full h-11 px-3 border border-[var(--border)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="0"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--toss-gray-4)]">기납부 세액 (소득세+지방소득세)</label>
                <input
                  type="number"
                  value={manualForm.tax_paid}
                  onChange={(e) => setManualForm({ ...manualForm, tax_paid: Number(e.target.value) })}
                  className="w-full h-11 px-3 border border-[var(--border)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="0"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 py-3 bg-[var(--tab-bg)] text-[var(--foreground)] rounded-[var(--radius-md)] text-sm font-bold hover:bg-[var(--muted)]"
                >취소</button>
                <button
                  onClick={handleManualSave}
                  className="flex-[2] py-3 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold hover:opacity-90 shadow-sm"
                >저장하기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {
        showCertificate && selectedStaff && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
            <div className="bg-[var(--card)] rounded-[var(--radius-md)] p-4 w-full max-w-2xl shadow-sm max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-[var(--foreground)]">근로소득 원천징수영수증</h3>
                <button
                  onClick={() => setShowCertificate(false)}
                  className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] font-mono text-sm whitespace-pre-wrap mb-4 border border-[var(--border)]">
                {generateWithholdingCertificate(selectedStaff)}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCertificate(false)}
                  className="flex-1 py-2.5 bg-[var(--muted)] text-[var(--foreground)] rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90"
                >
                  닫기
                </button>
                <button
                  onClick={() => downloadCertificate(selectedStaff)}
                  className="flex-1 py-2.5 bg-[var(--foreground)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90"
                >
                  다운로드
                </button>
                <button
                  onClick={() => sendCertificateEmail(selectedStaff)}
                  className="flex-1 py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90"
                >
                  이메일 발송
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
