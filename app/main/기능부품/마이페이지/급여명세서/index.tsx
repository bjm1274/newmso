'use client';
import { useState, useEffect } from 'react';
import SalarySlipUI from './명세서디자인';

export default function SalarySlipContainer({ user }: any) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [salaryData, setSalaryData] = useState<any>(null);

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  useEffect(() => {
    if (!user) return;
    // 기본급여가 설정되지 않은 경우 명세서 생성 자체를 막는다.
    if (!user.base_salary || user.base_salary <= 0) {
      setSalaryData(null);
      return;
    }
    const base = user.base_salary;
    const month = currentDate.getMonth() + 1;
    const overtimePay = Math.floor((month % 2 === 0 ? 12.5 : 5.0) * 22000);
    const bonus = month === 12 ? 1500000 : 0;
    const totalPay = base + overtimePay + 100000 + bonus;

    setSalaryData({
      base_salary: base,
      overtime_pay: overtimePay,
      bonus: bonus,
      national_pension: Math.floor(totalPay * 0.045),
      health_insurance: Math.floor(totalPay * 0.03545),
      income_tax: Math.floor(totalPay * 0.03),
    });
  }, [currentDate, user]);

  const handlePrint = () => { window.print(); };

  if (!user?.base_salary || user.base_salary <= 0) {
    return (
      <div className="p-10 text-sm font-black text-gray-500">
        아직 <span className="text-blue-600">기본급여</span>가 등록되지 않아 급여명세서를 생성할 수 없습니다.
        <br />
        인사 담당자에게 직원 기본급을 먼저 등록해 달라고 요청해 주세요.
      </div>
    );
  }

  if (!salaryData) return <div className="p-10 text-gray-400 font-black">데이터 로딩 중...</div>;

  const totalPayment = salaryData.base_salary + salaryData.overtime_pay + 100000 + salaryData.bonus;
  const totalDeduction = salaryData.national_pension + salaryData.health_insurance + Math.floor(salaryData.health_insurance * 0.1281) + Math.floor(totalPayment * 0.009) + salaryData.income_tax + Math.floor(salaryData.income_tax * 0.1);

  return (
    <>
      <style jsx global>{`
        @media print {
          /* 1. 기본 설정 초기화 */
          body * { visibility: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          html, body { margin: 0 !important; padding: 0 !important; height: 100%; overflow: hidden; }
          
          /* 2. 인쇄 페이지 여백 설정 (프린터 물리 여백 확보) */
          @page {
            size: A4;
            margin: 5mm; /* 최소한의 안전 여백 5mm 확보 */
          }
          
          /* 3. 인쇄 대상 컨테이너 설정 */
          #print-section {
            visibility: visible !important;
            position: fixed;
            left: 0;
            top: 0;
            width: 100% !important; /* 여백을 제외한 나머지 영역을 꽉 채움 */
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            
            /* [핵심] 내용이 넘치지 않도록 자동 맞춤 */
            display: flex;
            align-items: flex-start; /* 상단부터 채움 */
            justify-content: center; /* 좌우 중앙 정렬 */
          }
          
          /* 4. 내부 콘텐츠 스케일링 (안전장치) */
          #print-section > div {
            width: 100% !important;
            max-width: 210mm !important; /* 최대폭 제한 */
            transform: scale(0.98); /* 98%로 미세 축소하여 잘림 방지 */
            transform-origin: top center;
          }

          #print-section * { visibility: visible !important; }
        }
      `}</style>

      <div className="bg-white border border-gray-100 shadow-sm rounded-[2.5rem] overflow-hidden flex flex-col h-full">
        <div className="p-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex gap-2">
              <button onClick={() => changeMonth(-1)} className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-100 flex items-center justify-center shadow-sm">◀</button>
              <button onClick={() => changeMonth(1)} className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-100 flex items-center justify-center shadow-sm">▶</button>
            </div>
            <h3 className="text-xl font-black text-gray-900">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월 내역</h3>
          </div>
          <button onClick={handlePrint} className="px-8 py-4 bg-gray-900 text-white text-sm font-black rounded-2xl hover:bg-black transition-all flex items-center gap-2 shadow-xl">
             🖨️ A4 한 장에 맞춰 인쇄
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-200 p-12 flex justify-center custom-scrollbar">
          <div id="print-section" className="bg-white shadow-2xl print:shadow-none print:w-full">
            <SalarySlipUI 
              user={user} 
              currentDate={currentDate} 
              salaryData={salaryData}
              totalPayment={totalPayment}
              totalDeduction={totalDeduction}
            />
          </div>
        </div>
      </div>
    </>
  );
}