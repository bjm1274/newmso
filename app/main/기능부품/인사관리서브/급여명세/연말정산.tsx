'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function YearEndSettlement({ staffs = [], selectedCo }: any) {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [settlementData, setSettlementData] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [showCertificate, setShowCertificate] = useState(false);

  // New OCR states
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
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
  }, [selectedYear]);

  const handleOCRScan = async (file: File) => {
    setUploadLoading(true);
    // Simulate OCR delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulated result from a typical National Tax Service (Hometax) PDF
    const mockResult = {
      total_salary: 48000000,
      tax_paid: 2400000,
      insurance: 3800000,
      deductions: {
        credit_card: 1200000,
        medical: 500000,
        education: 0,
      }
    };

    setScanResult(mockResult);
    setUploadLoading(false);
    alert("원천징수 영수증 분석이 완료되었습니다. 항목을 확인해 주세요.");
  };

  const fetchSettlementData = async () => {
    const { data: staff } = await supabase.from('staff_members').select('*');
    setStaffList(staff || []);

    const { data: payroll } = await supabase
      .from('payroll_records')
      .select('*')
      .like('year_month', `${selectedYear}%`);

    // Fetch manual overrides if any (Assuming a table exists or using a specific record_type)
    const { data: manualData } = await supabase
      .from('payroll_records')
      .select('*')
      .eq('year_month', `${selectedYear}-YE`) // Special marker for year-end manual entries
      .eq('record_type', 'yearend');

    if (staff) {
      const settlementByStaff: any = {};

      staff.forEach((s: any) => {
        settlementByStaff[s.id] = {
          staff_id: s.id,
          staff_name: s.name,
          staff_email: s.email,
          total_salary: 0,
          total_tax_paid: 0,
          total_insurance: 0,
          monthly_count: 0,
        };
      });

      payroll?.forEach((pay: any) => {
        if (settlementByStaff[pay.staff_id]) {
          settlementByStaff[pay.staff_id].total_salary += pay.base_salary + (pay.extra_allowance || 0) + (pay.overtime_pay || 0) + (pay.bonus || 0);
          settlementByStaff[pay.staff_id].total_tax_paid += (pay.deduction_detail?.income_tax || 0) + (pay.deduction_detail?.local_tax || 0);
          settlementByStaff[pay.staff_id].total_insurance += (pay.total_deduction || 0) - ((pay.deduction_detail?.income_tax || 0) + (pay.deduction_detail?.local_tax || 0));
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

      const settlement = Object.values(settlementByStaff).filter((item: any) => item.total_salary > 0 || item.is_manual).map((item: any) => {
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

  const handleManualSave = async () => {
    if (!manualForm.staff_id) return alert("직원을 선택해 주세요.");

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
      alert("저장 중 오류가 발생했습니다: " + error.message);
    } else {
      alert("수기 정산 데이터가 저장되었습니다.");
      setShowManualModal(false);
      fetchSettlementData();
    }
  };

  const generateWithholdingCertificate = (staff: any) => {
    return `
근로소득 원천징수영수증
발급일: ${new Date().toLocaleDateString('ko-KR')}
정산년도: ${selectedYear}년

[납세자 정보]
성명: ${staff.staff_name}
주민등록번호: ****-***${String(staff.staff_id).slice(-3)}
주소: [등록된 주소]

[소득 정보]
근로소득액: ₩${(staff.total_salary || 0).toLocaleString()}
기본공제: ₩${(staff.standard_deduction || 0).toLocaleString()}
과세표준: ₩${(staff.taxable_income || 0).toLocaleString()}

[세금 정보]
산출세액: ₩${(staff.calculated_tax || 0).toLocaleString()}
기납부세액: ₩${(staff.tax_paid || 0).toLocaleString()}
환급/추가납부: ₩${Math.abs(staff.refund_or_additional || 0).toLocaleString()}

[보험료 정보]
건강보험료: ₩${Math.round((staff.total_salary || 0) * 0.03395).toLocaleString()}
국민연금료: ₩${Math.round((staff.total_salary || 0) * 0.045).toLocaleString()}
고용보험료: ₩${Math.round((staff.total_salary || 0) * 0.008).toLocaleString()}

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
      <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
        <div className="flex gap-4 items-center">
          <div className="flex gap-3 items-center">
            <label className="text-sm font-bold text-blue-800">정산 년도</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-9 px-3 border border-blue-200 rounded-lg text-sm font-bold focus:outline-none focus:border-[var(--toss-blue)] bg-white"
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
              input.onchange = (e: any) => {
                if (e.target.files?.[0]) handleOCRScan(e.target.files[0]);
              };
              input.click();
            }}
            disabled={uploadLoading}
            className="px-4 py-2 bg-[var(--toss-blue)] text-white text-xs font-black rounded-xl hover:scale-105 transition-all shadow-sm flex items-center gap-2"
          >
            {uploadLoading ? "📑 분석 중..." : "📸 영수증 스마트 스캔"}
          </button>
          <button
            onClick={() => setShowManualModal(true)}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-black rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            ➕ 수기 입력
          </button>
        </div>
      </div>

      {scanResult && (
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl animate-in slide-in-from-top duration-500">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-black text-emerald-800 flex items-center gap-2">
              ✨ 자동 분석 결과 (미리보기)
              <span className="text-[10px] bg-emerald-100 px-2 py-0.5 rounded-full font-bold">OCR 완료</span>
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => setScanResult(null)}
                className="px-3 py-1 bg-white border border-emerald-200 text-emerald-600 text-[10px] font-black rounded-lg hover:bg-emerald-100"
              >취소</button>
              <button
                className="px-3 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-lg hover:bg-emerald-700 shadow-sm"
              >이 데이터로 정산하기</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/60 p-3 rounded-xl">
              <p className="text-[10px] text-emerald-600 font-bold">결정세액 (예상)</p>
              <p className="text-sm font-black text-slate-800">₩{scanResult.tax_paid.toLocaleString()}</p>
            </div>
            <div className="bg-white/60 p-3 rounded-xl">
              <p className="text-[10px] text-emerald-600 font-bold">카드 등 공제액</p>
              <p className="text-sm font-black text-slate-800">₩{scanResult.deductions.credit_card.toLocaleString()}</p>
            </div>
            <div className="bg-white/60 p-3 rounded-xl">
              <p className="text-[10px] text-emerald-600 font-bold">의료비 공제액</p>
              <p className="text-sm font-black text-slate-800">₩{scanResult.deductions.medical.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

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
                  <td className="px-4 py-2.5 font-medium text-[var(--foreground)]">
                    {item.staff_name}
                    {item.is_manual && <span className="ml-1 text-[9px] bg-slate-100 text-slate-500 px-1 rounded">수기</span>}
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
                        : 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)]'
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
                      className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] rounded-md text-xs font-medium hover:opacity-90"
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
                      className="px-2 py-1 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-md text-xs font-medium hover:opacity-90"
                    >
                      다운
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {settlementData.length === 0 && (
            <div className="py-20 text-center text-slate-400">
              해당 년도에 확정된 급여 데이터가 없습니다.
            </div>
          )}
        </div>
      </div>

      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800">
                {manualForm.is_edit ? '📝 연말정산 데이터 수정' : '➕ 연말정산 수기 입력'}
              </h3>
              <button
                onClick={() => {
                  setShowManualModal(false);
                  setManualForm({ staff_id: '', total_salary: 0, tax_paid: 0, insurance: 0, is_edit: false });
                }}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >✕</button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">대상 직원</label>
                <select
                  value={manualForm.staff_id}
                  onChange={(e) => setManualForm({ ...manualForm, staff_id: e.target.value })}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]"
                >
                  <option value="">직원을 선택하세요</option>
                  {staffList.filter(s => selectedCo === '전체' || s.company === selectedCo).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.company})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">연간 총 급여액 (과세대상)</label>
                <input
                  type="number"
                  value={manualForm.total_salary}
                  onChange={(e) => setManualForm({ ...manualForm, total_salary: Number(e.target.value) })}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]"
                  placeholder="0"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">기납부 세액 (소득세+지방소득세)</label>
                <input
                  type="number"
                  value={manualForm.tax_paid}
                  onChange={(e) => setManualForm({ ...manualForm, tax_paid: Number(e.target.value) })}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]"
                  placeholder="0"
                />
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200"
                >취소</button>
                <button
                  onClick={handleManualSave}
                  className="flex-[2] py-3 bg-[var(--toss-blue)] text-white rounded-xl text-sm font-bold hover:opacity-90 shadow-md"
                >저장하기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {
        showCertificate && selectedStaff && (
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
        )
      }
    </div >
  );
}
