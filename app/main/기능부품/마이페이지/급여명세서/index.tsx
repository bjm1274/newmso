'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SalarySlipUI from './명세서디자인';

export default function SalarySlipContainer({ user }: any) {
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [salaryData, setSalaryData] = useState<any>(null);

  const handlePasswordVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setVerifyError('직원 계정으로 로그인한 상태에서만 이용할 수 있습니다.');
      return;
    }
    const pwd = passwordInput.trim();
    if (!pwd) {
      setVerifyError('비밀번호를 입력해 주세요.');
      return;
    }
    setVerifying(true);
    setVerifyError('');
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id')
        .eq('id', user.id)
        .eq('password', pwd)
        .single();
      if (error || !data) {
        setVerifyError('비밀번호가 일치하지 않습니다.');
        setPasswordInput('');
        setVerifying(false);
        return;
      }
      setUnlocked(true);
      setPasswordInput('');
    } catch {
      setVerifyError('본인 확인 중 오류가 발생했습니다.');
    }
    setVerifying(false);
  };

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

  /* 암호 미확인 시 비밀번호 입력 화면 */
  if (!unlocked) {
    return (
      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[16px] overflow-hidden flex flex-col items-center justify-center min-h-[320px] p-8 sm:p-10">
        <h3 className="text-xl font-bold text-[var(--foreground)] mb-2">급여 명세서 조회</h3>
        <p className="text-[13px] text-[var(--toss-gray-4)] mb-8">본인 확인을 위해 비밀번호를 입력해 주세요.</p>
        <form onSubmit={handlePasswordVerify} className="w-full max-w-sm space-y-5">
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setVerifyError(''); }}
            placeholder="비밀번호"
            className="w-full px-4 py-3.5 rounded-[16px] border border-[var(--toss-border)] bg-[var(--input-bg)] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 focus:border-[var(--toss-blue)]"
            autoComplete="current-password"
            disabled={verifying}
          />
          {verifyError && <p className="text-[12px] text-[var(--toss-danger)] font-medium">{verifyError}</p>}
          <button
            type="submit"
            disabled={verifying}
            className="w-full py-3.5 bg-[var(--toss-blue)] text-white font-semibold rounded-[16px] hover:opacity-95 disabled:opacity-50 transition-all"
          >
            {verifying ? '확인 중...' : '확인'}
          </button>
        </form>
      </div>
    );
  }

  if (!user?.base_salary || user.base_salary <= 0) {
    return (
      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-8 sm:p-10 text-sm font-semibold text-[var(--toss-gray-4)] leading-relaxed">
        아직 <span className="text-[var(--toss-blue)]">기본급여</span>가 등록되지 않아 급여명세서를 생성할 수 없습니다.
        <br className="my-2" />
        인사 담당자에게 직원 기본급을 먼저 등록해 달라고 요청해 주세요.
      </div>
    );
  }

  if (!salaryData) return <div className="p-8 text-[var(--toss-gray-3)] font-semibold">데이터 로딩 중...</div>;

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

      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[16px] overflow-hidden flex flex-col h-full">
        <div className="px-5 py-4 sm:px-6 sm:py-5 bg-[var(--toss-gray-1)] border-b border-[var(--toss-border)] flex flex-wrap justify-between items-center gap-4 shrink-0">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex gap-2">
              <button type="button" onClick={() => changeMonth(-1)} className="w-10 h-10 rounded-full bg-[var(--toss-card)] border border-[var(--toss-border)] hover:bg-[var(--toss-gray-2)] flex items-center justify-center shadow-sm">◀</button>
              <button type="button" onClick={() => changeMonth(1)} className="w-10 h-10 rounded-full bg-[var(--toss-card)] border border-[var(--toss-border)] hover:bg-[var(--toss-gray-2)] flex items-center justify-center shadow-sm">▶</button>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-[var(--foreground)]">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월 내역</h3>
          </div>
          <button type="button" onClick={handlePrint} className="px-6 py-3 sm:px-8 sm:py-4 bg-[var(--foreground)] text-white text-sm font-semibold rounded-[16px] hover:opacity-95 transition-all flex items-center gap-2 shadow-lg">
            🖨️ A4 한 장에 맞춰 인쇄
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[var(--toss-gray-1)] p-6 sm:p-8 lg:p-10 flex justify-center custom-scrollbar">
          <div id="print-section" className="bg-[var(--toss-card)] shadow-2xl print:shadow-none print:w-full">
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