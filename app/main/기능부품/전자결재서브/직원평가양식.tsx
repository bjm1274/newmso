'use client';

import { useState, useEffect, useMemo } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';

type StaffMember = {
  id: string;
  name: string;
  position: string;
  department?: string;
  departments?: { name: string };
  base_salary?: number;
  join_date?: string;
  joined_at?: string;
};

type EmployeeEvaluationFormProps = {
  staffs: StaffMember[];
  formType: string;
  setExtraData: (updater: (p: Record<string, unknown>) => Record<string, unknown>) => void;
  setFormTitle?: (title: string) => void;
};

// 수습평가 문항 12개
const PROBATION_QUESTIONS = [
  { key: 'q1', label: '1. 직무 수행 능력 (기본 직무 역량)' },
  { key: 'q2', label: '2. 업무 정확성 및 처리 속도' },
  { key: 'q3', label: '3. 근무 태도 및 근태 관리' },
  { key: 'q4', label: '4. 협동심 및 대인 관계 (부서 내 융화)' },
  { key: 'q5', label: '5. 책임감 및 성실성' },
  { key: 'q6', label: '6. 규정 준수 및 기밀 유지' },
  { key: 'q7', label: '7. 지시 이행 및 복종도' },
  { key: 'q8', label: '8. 의사소통 및 업무 보고 방식' },
  { key: 'q9', label: '9. 발전 가능성 및 적극성' },
  { key: 'q10', label: '10. 직무 이해도 및 신기술 습득 속도' },
  { key: 'q11', label: '11. 고객(환자) 응대 친절도 및 자세' },
  { key: 'q12', label: '12. 애사심 및 소속감' },
];

// 급여인상평가 문항 8개
const SALARY_QUESTIONS = [
  { key: 's1', label: '1. 목표 달성도 (성과 달성률)' },
  { key: 's2', label: '2. 업무 기여도 및 난이도 수행력' },
  { key: 's3', label: '3. 위기 대처 및 문제 해결 능력' },
  { key: 's4', label: '4. 역량 개발 및 교육 이수 성실도' },
  { key: 's5', label: '5. 근무 성실도 및 규율 준수' },
  { key: 's6', label: '6. 리더십 및 팀워크 기여도' },
  { key: 's7', label: '7. 원가 절감 및 생산성 향상 노력' },
  { key: 's8', label: '8. 고객 만족도 및 대외 평판도' },
];

export default function EmployeeEvaluationForm({
  staffs,
  formType,
  setExtraData,
  setFormTitle }: EmployeeEvaluationFormProps) {
  // 공통 선택 직원 ID
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const selectedStaff = useMemo(
    () => staffs.find((s) => s.id === selectedStaffId) || null,
    [staffs, selectedStaffId]
  );

  // 1. 수습평가용 상태
  const [probationJoinDate, setProbationJoinDate] = useState('');
  const [probationPeriodStart, setProbationPeriodStart] = useState('');
  const [probationPeriodEnd, setProbationPeriodEnd] = useState('');
  const [probationScores, setProbationScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(PROBATION_QUESTIONS.map((q) => [q.key, 3]))
  );
  const [probationReview, setProbationReview] = useState('');
  const [probationDecision, setProbationDecision] = useState('정규직 임용 승인');

  const probationTotalScore = useMemo(
    () => Object.values(probationScores).reduce((acc, cur) => acc + cur, 0),
    [probationScores]
  );

  // 2. 급여인상평가용 상태
  const [currentSalary, setCurrentSalary] = useState(0);
  const [salaryScores, setSalaryScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(SALARY_QUESTIONS.map((q) => [q.key, 5]))
  );
  const [raisePercent, setRaisePercent] = useState(0);
  const [raiseEffectiveMonth, setRaiseEffectiveMonth] = useState('');
  const [salaryReview, setSalaryReview] = useState('');

  const salaryTotalScore = useMemo(
    () => Object.values(salaryScores).reduce((acc, cur) => acc + cur, 0),
    [salaryScores]
  );

  const newSalary = useMemo(
    () => Math.round(currentSalary * (1 + raisePercent / 100)),
    [currentSalary, raisePercent]
  );

  // 직원 선택 시 연동 처리
  useEffect(() => {
    if (selectedStaff) {
      if (setFormTitle) {
        const titleLabel =
          formType === '수습직원평가서'
            ? `[수습평가] ${selectedStaff.name} 수습직원 평가 보고`
            : `[급여인상] ${selectedStaff.name} 급여 인상 심사 보고`;
        setFormTitle(titleLabel);
      }
      
      // 수습직원평가서일 경우 입사일 및 평가기간 세팅
      if (formType === '수습직원평가서') {
        const hireDate = (selectedStaff.join_date || selectedStaff.joined_at || '').slice(0, 10);
        if (hireDate && /^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
          setProbationJoinDate(hireDate);
          setProbationPeriodStart(hireDate);
          
          const parts = hireDate.split('-');
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const d = parseInt(parts[2], 10);
          
          // 3개월 뒤 계산 (종료일은 포함 기준이므로 하루를 뺌)
          const endDate = new Date(y, m - 1 + 3, d);
          endDate.setDate(endDate.getDate() - 1);
          
          const formatY = endDate.getFullYear();
          const formatM = String(endDate.getMonth() + 1).padStart(2, '0');
          const formatD = String(endDate.getDate()).padStart(2, '0');
          setProbationPeriodEnd(`${formatY}-${formatM}-${formatD}`);
        } else {
          setProbationJoinDate('');
          setProbationPeriodStart('');
          setProbationPeriodEnd('');
        }
      }
      
      // 급여인상 폼일 경우 해당 직원의 기본급 세팅
      if (formType === '급여인상평가서') {
        setCurrentSalary(selectedStaff.base_salary || 0);
      }
    }
  }, [selectedStaff, formType, setFormTitle]);

  // 상위 상태(extraData) 싱크로나이즈
  useEffect(() => {
    if (formType === '수습직원평가서') {
      setExtraData((prev) => ({
        ...prev,
        evaluationType: 'probation',
        targetStaffId: selectedStaffId,
        targetStaffName: selectedStaff?.name || '',
        joinDate: probationJoinDate,
        periodStart: probationPeriodStart,
        periodEnd: probationPeriodEnd,
        scores: probationScores,
        totalScore: probationTotalScore,
        review: probationReview,
        decision: probationDecision }));
    } else if (formType === '급여인상평가서') {
      setExtraData((prev) => ({
        ...prev,
        evaluationType: 'salary_increase',
        targetStaffId: selectedStaffId,
        targetStaffName: selectedStaff?.name || '',
        currentSalary,
        scores: salaryScores,
        totalScore: salaryTotalScore,
        raisePercent,
        newSalary,
        effectiveMonth: raiseEffectiveMonth,
        review: salaryReview }));
    }
  }, [
    formType,
    selectedStaffId,
    selectedStaff,
    probationJoinDate,
    probationPeriodStart,
    probationPeriodEnd,
    probationScores,
    probationTotalScore,
    probationReview,
    probationDecision,
    currentSalary,
    salaryScores,
    salaryTotalScore,
    raisePercent,
    newSalary,
    raiseEffectiveMonth,
    salaryReview,
    setExtraData,
  ]);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-in fade-in duration-300">
      <div className="p-4 bg-[var(--toss-blue-light)]/30 border-b border-[var(--border)]">
        <h4 className="text-sm font-bold text-[var(--foreground)]">{formType}</h4>
        <p className="text-[11px] font-semibold text-[var(--toss-gray-4)] mt-1">인사 평가 및 직무 수행 평가 서식</p>
      </div>

      <div className="p-4 space-y-5 bg-[var(--tab-bg)]/30">
        {/* 👤 대상 직원 공통 선택 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-blue-600 block ml-1 uppercase">평가 대상자</label>
            <select
              value={selectedStaffId}
              className="w-full p-3.5 bg-[var(--muted)] rounded-[var(--radius-lg)] text-xs font-bold outline-none border-none focus:ring-2 focus:ring-blue-100"
              onChange={(e) => setSelectedStaffId(e.target.value)}
            >
              <option value="">직원을 선택하세요</option>
              {staffs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.position} / {s.department || s.departments?.name || '부서 없음'})
                </option>
              ))}
            </select>
          </div>
          {selectedStaff && (
            <div className="rounded-[var(--radius-lg)] bg-[var(--muted)]/50 p-3.5 text-xs space-y-1.5">
              <p className="font-bold text-[var(--foreground)]">대상자 상세 프로필</p>
              <p className="text-[var(--toss-gray-4)]">
                소속 부서: {selectedStaff.department || selectedStaff.departments?.name || '-'} <br />
                직위(직함): {selectedStaff.position} <br />
                {formType === '급여인상평가서' && `현재 기본급: ${currentSalary.toLocaleString('ko-KR')}원`}
              </p>
            </div>
          )}
        </div>

        {/* 📝 1. 수습직원평가서 세부 입력 */}
        {formType === '수습직원평가서' && (
          <div className="space-y-4 animate-in slide-in-from-top-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">입사일</label>
                <SmartDatePicker
                  value={probationJoinDate}
                  onChange={setProbationJoinDate}
                  inputClassName="w-full h-11 px-3 rounded-[var(--radius-md)] bg-[var(--card)] font-semibold text-xs border border-[var(--border)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">평가 시작일</label>
                <SmartDatePicker
                  value={probationPeriodStart}
                  onChange={setProbationPeriodStart}
                  inputClassName="w-full h-11 px-3 rounded-[var(--radius-md)] bg-[var(--card)] font-semibold text-xs border border-[var(--border)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">평가 종료일</label>
                <SmartDatePicker
                  value={probationPeriodEnd}
                  onChange={setProbationPeriodEnd}
                  inputClassName="w-full h-11 px-3 rounded-[var(--radius-md)] bg-[var(--card)] font-semibold text-xs border border-[var(--border)]"
                />
              </div>
            </div>

            {/* 📊 역량 평정 12문항 */}
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b pb-1">
                <span className="text-xs font-bold text-[var(--foreground)]">역량 및 태도 평정 (5점 척도)</span>
                <span className="text-xs font-black text-blue-600">총점: {probationTotalScore} / 60점</span>
              </div>
              <div className="max-h-[300px] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                {PROBATION_QUESTIONS.map((q) => (
                  <div key={q.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] gap-2">
                    <span className="text-[12px] font-bold text-[var(--foreground)]">{q.label}</span>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <label key={score} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`probation_${q.key}`}
                            checked={probationScores[q.key] === score}
                            onChange={() =>
                              setProbationScores((prev) => ({ ...prev, [q.key]: score }))
                            }
                            className="w-3.5 h-3.5 accent-blue-600"
                          />
                          <span className="text-[11px] font-semibold text-[var(--toss-gray-4)]">{score}점</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 종합평가의견 & 최종판정 */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">종합 평가 의견</label>
                <textarea
                  value={probationReview}
                  onChange={(e) => setProbationReview(e.target.value)}
                  className="w-full h-24 p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] font-semibold text-xs leading-relaxed outline-none"
                  placeholder="피평가자의 강약점 및 직무 태도에 대한 서술형 평가를 입력하세요."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1 block">최종 판정 의견</label>
                <div className="flex gap-4">
                  {['정규직 임용 승인', '수습기간 연장(1~3개월)', '채용 취소 및 근로 계약 종료'].map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="probation_decision"
                        checked={probationDecision === opt}
                        onChange={() => setProbationDecision(opt)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-[11px] font-bold text-[var(--foreground)]">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 📝 2. 급여인상 직원평가서 세부 입력 */}
        {formType === '급여인상평가서' && (
          <div className="space-y-4 animate-in slide-in-from-top-2">
            {/* 📊 역량 평정 8문항 */}
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b pb-1">
                <span className="text-xs font-bold text-[var(--foreground)]">업무 실적 및 기여도 평정 (10점 척도)</span>
                <span className="text-xs font-black text-blue-600">총점: {salaryTotalScore} / 80점</span>
              </div>
              <div className="max-h-[260px] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                {SALARY_QUESTIONS.map((q) => (
                  <div key={q.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] gap-2">
                    <span className="text-[12px] font-bold text-[var(--foreground)]">{q.label}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                        <label key={score} className="flex items-center gap-0.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`salary_${q.key}`}
                            checked={salaryScores[q.key] === score}
                            onChange={() =>
                              setSalaryScores((prev) => ({ ...prev, [q.key]: score }))
                            }
                            className="w-3.5 h-3.5 accent-blue-600"
                          />
                          <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">{score}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 인상 비율 & 인상된 금액 시뮬레이션 */}
            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-blue-600 ml-1 block">인상율 설정 (%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={raisePercent}
                      onChange={(e) => setRaisePercent(parseFloat(e.target.value) || 0)}
                      className="w-24 p-2.5 rounded-[var(--radius-md)] bg-[var(--card)] font-bold text-xs border border-[var(--border)] text-right"
                    />
                    <span className="text-xs font-bold">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-blue-600 ml-1 block">적용 예정 월</label>
                  <input
                    type="month"
                    value={raiseEffectiveMonth}
                    onChange={(e) => setRaiseEffectiveMonth(e.target.value)}
                    className="w-full p-2.5 rounded-[var(--radius-md)] bg-[var(--card)] font-bold text-xs border border-[var(--border)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs p-2 rounded-lg bg-[var(--card)]">
                <div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">현재 기본급</p>
                  <p className="font-bold text-[var(--foreground)] mt-0.5">{currentSalary.toLocaleString('ko-KR')}원</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">인상 비율</p>
                  <p className="font-extrabold text-blue-600 mt-0.5">+{raisePercent}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">인상 후 기본급</p>
                  <p className="font-black text-[var(--accent)] mt-0.5">{newSalary.toLocaleString('ko-KR')}원</p>
                </div>
              </div>

              <div className="text-[10px] font-bold text-[var(--toss-gray-4)] leading-relaxed">
                💡 **인상율 등급 가이드**: <br />
                - **S 등급** (70~80점): 10 ~ 15% 인상 권장 <br />
                - **A 등급** (60~69점): 7 ~ 9% 인상 권장 <br />
                - **B 등급** (50~59점): 4 ~ 6% 인상 권장 <br />
                - **C 등급** (40~49점): 1 ~ 3% 인상 권장 <br />
                - **D 등급** (40점 미만): 동결 (0%) 권장
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">심사 및 평가 의견</label>
              <textarea
                value={salaryReview}
                onChange={(e) => setSalaryReview(e.target.value)}
                className="w-full h-24 p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] font-semibold text-xs leading-relaxed outline-none"
                placeholder="급여 인상 타당성 조서 및 평가 의견을 구체적으로 입력하세요."
              />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-[var(--card)] border-t border-[var(--border)] text-center">
        <p className="text-[11px] font-bold text-[var(--toss-gray-3)] font-sans">
          {formType} 내역은 결재 완료 즉시 인사 시스템과 연동될 수 있도록 자동 저장 큐에 등록됩니다.
        </p>
      </div>
    </div>
  );
}
