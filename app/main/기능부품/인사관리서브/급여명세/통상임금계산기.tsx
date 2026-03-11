'use client';
import { useState } from 'react';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

export default function OrdinaryWageCalculator({ staffs, selectedCo, user }: Props) {
  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [basePay, setBasePay] = useState(0);
  const [positionAllowance, setPositionAllowance] = useState(0);
  const [jobAllowance, setJobAllowance] = useState(0);
  const [familyAllowance, setFamilyAllowance] = useState(0);
  const [mealTaxable, setMealTaxable] = useState(0);
  const [transportTaxable, setTransportTaxable] = useState(0);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [nightHours, setNightHours] = useState(0);
  const [holidayHours, setHolidayHours] = useState(0);
  const [unusedLeave, setUnusedLeave] = useState(0);

  const MONTHLY_HOURS = 209;

  const ordinaryWage = basePay + positionAllowance + jobAllowance + familyAllowance + mealTaxable + transportTaxable;
  const hourlyWage = ordinaryWage / MONTHLY_HOURS;
  const overtimePay = hourlyWage * 1.5 * overtimeHours;
  const nightPay = hourlyWage * 0.5 * nightHours;
  const holidayPay = hourlyWage * 1.5 * holidayHours;
  const annualLeavePay = hourlyWage * 8 * unusedLeave;

  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  const handleCsvDownload = () => {
    const staff = filtered.find((s: any) => String(s.id) === selectedStaffId);
    const rows = [
      ['항목', '금액(원)'],
      ['기본급', basePay],
      ['직책수당', positionAllowance],
      ['직무수당', jobAllowance],
      ['가족수당', familyAllowance],
      ['식대(과세)', mealTaxable],
      ['교통비(과세)', transportTaxable],
      ['통상임금 합계', ordinaryWage],
      ['시간급 통상임금', Math.round(hourlyWage)],
      ['연장수당', Math.round(overtimePay)],
      ['야간수당', Math.round(nightPay)],
      ['휴일수당', Math.round(holidayPay)],
      ['연차수당', Math.round(annualLeavePay)],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `통상임금_${staff?.name || '직원'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">통상임금 자동 계산기</h2>
      </div>

      {/* 직원 선택 */}
      <div>
        <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">직원 선택</label>
        <select
          value={selectedStaffId}
          onChange={e => {
            setSelectedStaffId(e.target.value);
            const s = filtered.find((s: any) => String(s.id) === e.target.value);
            if (s) {
              setBasePay(s.base_salary || s.base || 0);
              setPositionAllowance(s.position_allowance || 0);
              setJobAllowance(s.job_allowance || 0);
              setFamilyAllowance(s.family_allowance || 0);
            }
          }}
          className="w-full p-2.5 rounded-[10px] border border-[var(--toss-border)] bg-[var(--toss-card)] text-sm font-bold"
        >
          <option value="">-- 직원을 선택하세요 --</option>
          {filtered.map((s: any) => (
            <option key={s.id} value={String(s.id)}>{s.name} ({s.company || ''})</option>
          ))}
        </select>
      </div>

      {/* 수당 입력 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: '기본급', value: basePay, setter: setBasePay },
          { label: '직책수당', value: positionAllowance, setter: setPositionAllowance },
          { label: '직무수당', value: jobAllowance, setter: setJobAllowance },
          { label: '가족수당', value: familyAllowance, setter: setFamilyAllowance },
          { label: '식대(비과세 초과분)', value: mealTaxable, setter: setMealTaxable },
          { label: '교통비(비과세 초과분)', value: transportTaxable, setter: setTransportTaxable },
        ].map(({ label, value, setter }) => (
          <div key={label}>
            <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">{label}</label>
            <input
              type="number"
              value={value || ''}
              onChange={e => setter(Number(e.target.value))}
              className="w-full p-2 rounded-[8px] border border-[var(--toss-border)] bg-[var(--toss-card)] text-sm font-bold text-right"
              placeholder="0"
              min={0}
            />
          </div>
        ))}
      </div>

      {/* 슬라이더 입력 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[var(--toss-gray-1)] rounded-[12px]">
        <h3 className="col-span-full text-sm font-bold text-[var(--foreground)]">법정수당 계산 입력</h3>
        {[
          { label: '연장근무 시간', value: overtimeHours, setter: setOvertimeHours, max: 100 },
          { label: '야간근무 시간', value: nightHours, setter: setNightHours, max: 100 },
          { label: '휴일근무 시간', value: holidayHours, setter: setHolidayHours, max: 100 },
          { label: '미사용 연차 (일)', value: unusedLeave, setter: setUnusedLeave, max: 25 },
        ].map(({ label, value, setter, max }) => (
          <div key={label}>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[11px] font-bold text-[var(--toss-gray-4)]">{label}</label>
              <span className="text-[11px] font-bold text-[var(--toss-blue)]">{value}</span>
            </div>
            <input
              type="range"
              min={0}
              max={max}
              value={value}
              onChange={e => setter(Number(e.target.value))}
              className="w-full accent-[var(--toss-blue)]"
            />
          </div>
        ))}
      </div>

      {/* 계산 결과 표 */}
      <div className="bg-[var(--toss-card)] rounded-[12px] border border-[var(--toss-border)] overflow-hidden">
        <div className="p-4 border-b border-[var(--toss-border)] bg-[var(--toss-blue)]/5">
          <h3 className="text-sm font-bold text-[var(--toss-blue)]">계산 결과</h3>
        </div>
        <table className="w-full">
          <tbody>
            <tr className="border-b border-[var(--toss-border)]">
              <td className="p-3 text-xs font-bold text-[var(--toss-gray-4)]">월 통상임금 합계</td>
              <td className="p-3 text-sm font-bold text-right text-[var(--foreground)]">{fmt(ordinaryWage)} 원</td>
            </tr>
            <tr className="border-b border-[var(--toss-border)] bg-[var(--toss-blue)]/5">
              <td className="p-3 text-xs font-bold text-[var(--toss-blue)]">시간급 통상임금</td>
              <td className="p-3 text-sm font-bold text-right text-[var(--toss-blue)]">{fmt(hourlyWage)} 원/시간</td>
            </tr>
            <tr className="border-b border-[var(--toss-border)]">
              <td className="p-3 text-xs font-bold text-[var(--toss-gray-4)]">연장수당 (×1.5 × {overtimeHours}시간)</td>
              <td className="p-3 text-sm font-bold text-right text-[var(--foreground)]">{fmt(overtimePay)} 원</td>
            </tr>
            <tr className="border-b border-[var(--toss-border)]">
              <td className="p-3 text-xs font-bold text-[var(--toss-gray-4)]">야간수당 (×0.5 × {nightHours}시간)</td>
              <td className="p-3 text-sm font-bold text-right text-[var(--foreground)]">{fmt(nightPay)} 원</td>
            </tr>
            <tr className="border-b border-[var(--toss-border)]">
              <td className="p-3 text-xs font-bold text-[var(--toss-gray-4)]">휴일수당 (×1.5 × {holidayHours}시간)</td>
              <td className="p-3 text-sm font-bold text-right text-[var(--foreground)]">{fmt(holidayPay)} 원</td>
            </tr>
            <tr>
              <td className="p-3 text-xs font-bold text-[var(--toss-gray-4)]">연차수당 (×8시간 × {unusedLeave}일)</td>
              <td className="p-3 text-sm font-bold text-right text-[var(--foreground)]">{fmt(annualLeavePay)} 원</td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        onClick={handleCsvDownload}
        className="px-5 py-2.5 bg-[var(--toss-blue)] text-white text-xs font-bold rounded-[10px] hover:opacity-90 transition-all"
      >
        CSV 다운로드
      </button>
    </div>
  );
}
