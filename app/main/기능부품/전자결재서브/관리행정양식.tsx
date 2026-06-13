'use client';
import { useState, useEffect } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';

/**
 * AdminForms 컴포넌트
 * @param staffs - 전체 직원 목록 (인사명령 대상자 선택용)
 * @param formType - 현재 선택된 결재 양식 종류
 * @param setExtraData - 상위 Approval 컴포넌트로 데이터를 전달하는 함수
 */
type AdminFormsProps = {
  user?: any;
  staffs: { id: string; name: string; position: string; department?: string; departments?: { name: string }; photo_url?: string | null; avatar_url?: string | null; profile_photo_url?: string | null }[];
  formType: string;
  setExtraData: (updater: (p: Record<string, unknown>) => Record<string, unknown>) => void;
  setFormTitle?: (val: string) => void;
  setFormContent?: (val: string) => void;
  formContent?: string;
  submitApproval?: () => void;
  submitDisabled?: boolean;
};

export default function AdminForms({ user, staffs, formType, setExtraData, setFormTitle, setFormContent, formContent, submitApproval, submitDisabled }: AdminFormsProps) {
  const [localExecutionDate, setLocalExecutionDate] = useState('');
  const [resignDate, setResignDate] = useState('');
  const [handoverTarget, setHandoverTarget] = useState('');
  const [resignReason, setResignReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  useEffect(() => {
    if (formType !== '사직서') return;

    const finalReason = resignReason === '기타' ? customReason : resignReason;

    setExtraData((p) => ({
      ...p,
      resignDate,
      handoverTarget,
      resignReason: finalReason,
    }));

    if (setFormTitle) {
      setFormTitle(`사직서 (${user?.name || ''})`);
    }

    if (setFormContent) {
      const name = user?.name || '';
      const dept = user?.department || user?.departments?.name || '';
      const pos = user?.position || '';
      const dateStr = resignDate ? `${resignDate}부` : '[사직예정일]부';
      const reasonStr = finalReason ? `(${finalReason})` : '';

      const letter = `사 직 서

성 명: ${name}
부 서: ${dept}
직 위: ${pos}

상기 본인은 개인 사정${reasonStr}으로 인하여 ${dateStr}로 사직하고자 하오니 승인하여 주시기 바랍니다.

${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}

위 신청인: ${name} (인)

귀중`;
      setFormContent(letter);
    }
  }, [formType, resignDate, handoverTarget, resignReason, customReason, user, setExtraData, setFormTitle, setFormContent]);

  // 사직서 양식 전용 렌더링 분기
  if (formType === '사직서') {
    const selectedStaff = staffs.find(s => s.name === handoverTarget);
    const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = new Date().getFullYear();

    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-in fade-in duration-300">
        <div className="p-6 md:p-8 space-y-6">
          {/* 사직서 문서 타이틀 및 메타 정보 */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b border-[var(--border)] pb-5 gap-4">
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-black text-[var(--foreground)] tracking-tight">사직서</h2>
              <div className="text-[12px] font-bold text-[var(--muted-foreground)] space-y-1">
                <p>문서번호 : RS-{currentYear}-1101</p>
                <p>기안일자 : {todayStr}</p>
                <p>기안자 : {user?.name || ''} {user?.position || ''}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. 사직 예정일 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--foreground)] block">1. 사직 예정일</label>
              <SmartDatePicker
                value={resignDate}
                onChange={val => setResignDate(val)}
                className="w-full h-[46px] px-4 rounded-[var(--radius-md)] bg-[var(--card)] font-bold text-xs border border-[var(--border)]"
              />
            </div>

            {/* 2. 인수인계자 */}
            <div className="space-y-2 relative">
              <label className="text-xs font-bold text-[var(--foreground)] block">2. 인수인계자</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsStaffDropdownOpen(!isStaffDropdownOpen)}
                  className="w-full px-4 py-2.5 bg-[var(--card)] rounded-[var(--radius-md)] text-xs font-bold text-left border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-slate-100 flex items-center justify-between h-[46px]"
                >
                  {selectedStaff ? (
                    <div className="flex items-center gap-2">
                      {selectedStaff.photo_url || selectedStaff.avatar_url || selectedStaff.profile_photo_url ? (
                        <img
                          src={(selectedStaff.photo_url || selectedStaff.avatar_url || selectedStaff.profile_photo_url) ?? undefined}
                          alt={selectedStaff.name}
                          className="w-6 h-6 rounded-full object-cover border border-[var(--border)]/30 shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallbackEl = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fallbackEl) fallbackEl.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        style={{ display: (selectedStaff.photo_url || selectedStaff.avatar_url || selectedStaff.profile_photo_url) ? 'none' : 'flex' }}
                        className="w-6 h-6 rounded-full items-center justify-center font-bold text-[10px] shrink-0 bg-[var(--toss-gray-2)] text-[var(--toss-gray-4)]"
                      >
                        {selectedStaff.name?.slice(0, 1)}
                      </div>
                      <span className="truncate">
                        {selectedStaff.name} ({selectedStaff.department || selectedStaff.departments?.name || ''} / {selectedStaff.position || ''})
                      </span>
                    </div>
                  ) : (
                    <span className="text-[var(--muted-foreground)] font-semibold">직원을 선택하세요</span>
                  )}
                  <span className="text-[var(--muted-foreground)]">
                    <svg className={`w-4 h-4 transition-transform duration-200 ${isStaffDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>

                {isStaffDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsStaffDropdownOpen(false)} />
                    <ul className="absolute z-20 w-full mt-1.5 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg max-h-60 overflow-y-auto py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                      <li
                        onClick={() => {
                          setHandoverTarget('');
                          setIsStaffDropdownOpen(false);
                        }}
                        className="px-4 py-2 hover:bg-[var(--muted)] text-xs font-bold text-[var(--muted-foreground)] cursor-pointer"
                      >
                        선택 없음
                      </li>
                      {staffs.map((s) => (
                        <li
                          key={s.id}
                          onClick={() => {
                            setHandoverTarget(s.name);
                            setIsStaffDropdownOpen(false);
                          }}
                          className={`px-4 py-2 hover:bg-[var(--muted)] text-xs font-bold cursor-pointer flex items-center gap-2 ${
                            handoverTarget === s.name ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--foreground)]'
                          }`}
                        >
                          {s.photo_url || s.avatar_url || s.profile_photo_url ? (
                            <img
                              src={(s.photo_url || s.avatar_url || s.profile_photo_url) ?? undefined}
                              alt={s.name}
                              className="w-6 h-6 rounded-full object-cover border border-[var(--border)]/30 shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallbackEl = e.currentTarget.nextElementSibling as HTMLElement;
                                if (fallbackEl) fallbackEl.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div
                            style={{ display: (s.photo_url || s.avatar_url || s.profile_photo_url) ? 'none' : 'flex' }}
                            className="w-6 h-6 rounded-full items-center justify-center font-bold text-[10px] shrink-0 bg-[var(--toss-gray-2)] text-[var(--toss-gray-4)]"
                          >
                            {s.name?.slice(0, 1)}
                          </div>
                          <span className="truncate">
                            {s.name} ({s.department || s.departments?.name || ''} / {s.position || ''})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            {/* 3. 사직 사유 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--foreground)] block">3. 사직 사유</label>
              <select
                value={resignReason}
                className="w-full p-4 bg-[var(--card)] rounded-[var(--radius-md)] text-xs font-bold outline-none border border-[var(--border)] focus:ring-2 focus:ring-slate-100 h-[46px]"
                onChange={e => setResignReason(e.target.value)}
              >
                <option value="">사직 사유 선택 또는 직접 입력</option>
                <option value="개인 사정 (이직 및 충전)">개인 사정 (이직 및 충전)</option>
                <option value="개인 사정 (건강 문제)">개인 사정 (건강 문제)</option>
                <option value="개인 사정 (학업 및 커리어 개발)">개인 사정 (학업 및 커리어 개발)</option>
                <option value="기타">기타 (직접 입력)</option>
              </select>
              {resignReason === '기타' && (
                <input
                  type="text"
                  value={customReason}
                  placeholder="상세 사직 사유를 직접 입력해 주세요"
                  className="w-full p-4 mt-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] font-bold text-xs outline-none shadow-sm focus:ring-2 focus:ring-slate-200 h-[46px]"
                  onChange={e => setCustomReason(e.target.value)}
                />
              )}
            </div>

            {/* 상세 사유 */}
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              <label className="text-xs font-bold text-[var(--foreground)] block">상세 사유</label>
              <textarea
                value={formContent || ''}
                onChange={(e) => setFormContent?.(e.target.value)}
                className="w-full h-44 p-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-xs font-semibold leading-relaxed text-[var(--foreground)] outline-none focus:ring-2 focus:ring-slate-100 resize-y"
                placeholder="상세 사직 사유 및 내용을 입력하세요."
              />
            </div>
          </div>
        </div>

        {/* 결재 요청 버튼 */}
        <div className="p-4 bg-[var(--card)] border-t border-[var(--border)]">
          <button
            type="button"
            onClick={submitApproval}
            disabled={submitDisabled}
            className="w-full h-12 rounded-[var(--radius-md)] bg-[#3b4b66] hover:bg-[#2c3a50] text-white font-bold text-sm shadow-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            결재 요청
          </button>
        </div>
      </div>
    );
  }

  // 병원 실무에서 주로 사용하는 본문 가이드라인 정의
  const hospitalGuides: Record<string, string> = {
    '업무기안': "1. 기안 목적:\n2. 주요 내용:\n3. 관련 부서 협조 사항:\n4. 기대 효과:",
    '업무보고': "1. 금주 주요 성과:\n2. 미결 및 지연 사항:\n3. 차주 업무 계획:\n4. 건의 사항:",
    '회의록': "1. 회의 안건:\n2. 논의 내용:\n3. 결정 사항:\n4. 향후 일정:",
    '업무협조': "상기 부서에 다음과 같이 업무 협조를 요청합니다.\n\n[협조 내용]:",
    '근무표': "[근무표 승인 기안서]\n\n1. 대상 부서: \n2. 대상 년월: \n3. 배정 건수: \n\n상기 부서의 월간 근무표를 확정하여 보고하오니 재가하여 주시기 바랍니다."
  };
  void hospitalGuides;

  const hospitalDepts = ['진료부', '병동팀', '수술팀', '외래팀', '검사팀', '총무팀', '원무팀', '관리팀', '영양팀'];

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-in fade-in duration-300">
      <div className="p-4 md:p-4 bg-[var(--toss-blue-light)]/30 border-b border-[var(--border)]">
        <h4 className="text-sm font-bold text-[var(--foreground)]">{formType} 양식</h4>
        <p className="text-[11px] font-semibold text-[var(--toss-gray-4)] mt-1">사내 행정 결재 전용 표준 양식</p>
      </div>
      <div className="p-4 md:p-4 space-y-4 bg-[var(--tab-bg)]/30">

        {/* 🎖️ 1. 인사명령: 관리자 전용 발령 시스템 */}
        {formType === '인사명령' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-purple-600 ml-1 uppercase">발령 구분</label>
                <select
                  className="w-full p-4 rounded-[var(--radius-md)] border font-semibold text-xs bg-[var(--card)] outline-none shadow-sm focus:ring-2 focus:ring-purple-200 border-none"
                  onChange={e => setExtraData((p) => ({ ...p, orderCategory: e.target.value }))}
                >
                  <option value="">발령 구분 선택</option>
                  <option>정기 승진</option>
                  <option>부서 이동(전보)</option>
                  <option>신규 채용</option>
                  <option>퇴직/면직</option>
                  <option>호봉 승급</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-purple-600 ml-1 uppercase">시행 일자</label>
                <SmartDatePicker
                  value={localExecutionDate}
                  onChange={val => { setLocalExecutionDate(val); setExtraData((p) => ({ ...p, executionDate: val })); }}
                  inputClassName="w-full h-[46px] px-4 rounded-[var(--radius-md)] bg-[var(--card)] font-semibold text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[var(--card)] rounded-[var(--radius-lg)] border border-purple-50 shadow-inner">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] block ml-1">발령 대상자 선택</label>
                <select
                  className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] text-xs font-bold outline-none border-none focus:ring-2 focus:ring-purple-100"
                  onChange={e => setExtraData((p) => ({ ...p, orderTargetId: e.target.value }))}
                >
                  <option value="">직원을 선택하세요</option>
                  {staffs.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.position} / {s.department || s.departments?.name})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-blue-500 block ml-1">변경(발령) 직급/부서</label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 p-4 bg-blue-500/10 rounded-[var(--radius-lg)] text-xs font-semibold text-[var(--accent)] outline-none border-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    onChange={e => setExtraData((p) => ({ ...p, newPosition: e.target.value }))}
                  >
                    <option value="">직급 선택</option>
                    <option>병원장</option>
                    <option>원장</option>
                    <option>부장</option>
                    <option>실장</option>
                    <option>팀장</option>
                    <option>주임</option>
                    <option>사원</option>
                  </select>
                  <select
                    className="flex-1 p-4 bg-blue-500/10 rounded-[var(--radius-lg)] text-xs font-semibold text-[var(--accent)] outline-none border-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    onChange={e => setExtraData((p) => ({ ...p, targetDept: e.target.value }))}
                  >
                    <option value="">부서 선택</option>
                    {hospitalDepts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 📝 2. 업무협조: 부서 간 요청 서식 */}
        {formType === '업무협조' && (
          <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-blue-500 ml-1">수신 부서</label>
              <input
                type="text"
                placeholder="예: 원무과, 간호부"
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-bold text-xs outline-none shadow-sm focus:ring-2 focus:ring-[var(--accent)]/30 border-none"
                onChange={e => setExtraData((p) => ({ ...p, targetDept: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-blue-500 ml-1">협조 희망일</label>
              <SmartDatePicker
                value=""
                onChange={val => setExtraData((p) => ({ ...p, deadlineDate: val }))}
                className="w-full h-[46px] px-4 rounded-[var(--radius-md)] bg-[var(--card)] font-bold text-xs"
              />
            </div>
          </div>
        )}

        {/* 🗣️ 3. 회의록: 병원 내 위원회 및 회의 서식 */}
        {formType === '회의록' && (
          <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-green-600 ml-1">회의 장소</label>
              <input
                type="text"
                placeholder="예: 대회의실, 원장실"
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-bold text-xs shadow-sm outline-none border-none focus:ring-2 focus:ring-green-100"
                onChange={e => setExtraData((p) => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-green-600 ml-1">참석자</label>
              <input
                type="text"
                placeholder="참석자 성함 나열"
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-bold text-xs shadow-sm outline-none border-none focus:ring-2 focus:ring-green-100"
                onChange={e => setExtraData((p) => ({ ...p, attendees: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* 📊 4. 업무보고: 주간/월간 실적 보고 서식 */}
        {formType === '업무보고' && (
          <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-orange-500 ml-1">보고 주기</label>
              <select
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-semibold text-xs outline-none shadow-sm border-none focus:ring-2 focus:ring-orange-100"
                onChange={e => setExtraData((p) => ({ ...p, reportCycle: e.target.value }))}
              >
                <option>주간 업무보고</option>
                <option>월간 업무보고</option>
                <option>수시 업무보고</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-orange-500 ml-1">관련 부서/프로젝트</label>
              <input
                type="text"
                placeholder="해당 프로젝트명"
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-bold text-xs shadow-sm outline-none border-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>
        )}

        {/* 📎 5. 업무기안: 병원 일반 행정 및 품의 */}
        {formType === '업무기안' && (
          <div className="grid grid-cols-1 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] ml-1">기안 성격</label>
              <select className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-semibold text-xs outline-none shadow-sm border-none focus:ring-2 focus:ring-[var(--border)]">
                <option>일반 품의</option>
                <option>예산 집행</option>
                <option>제도 변경</option>
                <option>기타</option>
              </select>
            </div>
          </div>
        )}

        {/* 📋 6. 근무표: 부서 근무표 승인 서식 */}
        {formType === '근무표' && (
          <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-emerald-600 ml-1">대상 년월</label>
              <input
                type="month"
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-bold text-xs shadow-sm outline-none border-none focus:ring-2 focus:ring-emerald-100"
                onChange={e => setExtraData((p) => ({ ...p, yearMonth: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-emerald-600 ml-1">대상 부서/팀</label>
              <input
                type="text"
                placeholder="예: 병동팀, 외래팀"
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-bold text-xs shadow-sm outline-none border-none focus:ring-2 focus:ring-emerald-100"
                onChange={e => setExtraData((p) => ({ ...p, teamName: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* 📄 7. 사직서: 퇴사 의사 피력 및 인수인계 서식 */}
        {formType === '사직서' && (
          <div className="space-y-4 animate-in slide-in-from-top-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-600 ml-1 block">사직 예정일</label>
                <SmartDatePicker
                  value=""
                  onChange={val => setExtraData((p) => ({ ...p, resignDate: val }))}
                  className="w-full h-[46px] px-4 rounded-[var(--radius-md)] bg-[var(--card)] font-bold text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-600 ml-1 block">인수인계자</label>
                <select
                  className="w-full p-4 bg-[var(--card)] rounded-[var(--radius-md)] text-xs font-bold outline-none border-none focus:ring-2 focus:ring-slate-100 h-[46px]"
                  onChange={e => setExtraData((p) => ({ ...p, handoverTarget: e.target.value }))}
                >
                  <option value="">직원을 선택하세요</option>
                  {staffs.map((s) => (
                    <option key={s.id} value={s.name}>{s.name} ({s.position} / {s.department || s.departments?.name || ''})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-600 ml-1 block">사직 사유</label>
              <input
                type="text"
                placeholder="예: 개인 사정, 이직 등"
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-bold text-xs outline-none shadow-sm focus:ring-2 focus:ring-slate-200 border-none h-[46px]"
                onChange={e => setExtraData((p) => ({ ...p, resignReason: e.target.value }))}
              />
            </div>
          </div>
        )}

      </div>
      <div className="p-4 bg-[var(--card)] border-t border-[var(--border)] text-center">
        <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">
          {formType} 전용 가이드 프레임이 적용되었습니다.<br />
          하단 본문 영역에 상세 내용을 자유롭게 작성하세요. ✨
        </p>
      </div>
    </div>
  );
}
