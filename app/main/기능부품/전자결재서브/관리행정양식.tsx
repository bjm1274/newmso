'use client';
import { useState } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';

/**
 * AdminForms 컴포넌트
 * @param staffs - 전체 직원 목록 (인사명령 대상자 선택용)
 * @param formType - 현재 선택된 결재 양식 종류
 * @param setExtraData - 상위 Approval 컴포넌트로 데이터를 전달하는 함수
 */
export default function AdminForms({ staffs, formType, setExtraData }: any) {
  const [localExecutionDate, setLocalExecutionDate] = useState('');

  // 병원 실무에서 주로 사용하는 본문 가이드라인 정의
  const hospitalGuides: any = {
    '업무기안': "1. 기안 목적:\n2. 주요 내용:\n3. 관련 부서 협조 사항:\n4. 기대 효과:",
    '업무보고': "1. 금주 주요 성과:\n2. 미결 및 지연 사항:\n3. 차주 업무 계획:\n4. 건의 사항:",
    '회의록': "1. 회의 안건:\n2. 논의 내용:\n3. 결정 사항:\n4. 향후 일정:",
    '업무협조': "상기 부서에 다음과 같이 업무 협조를 요청합니다.\n\n[협조 내용]:"
  };

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
                  onChange={e => setExtraData((p: any) => ({ ...p, orderCategory: e.target.value }))}
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
                  onChange={val => { setLocalExecutionDate(val); setExtraData((p: any) => ({ ...p, executionDate: val })); }}
                  inputClassName="w-full h-[46px] px-4 rounded-[var(--radius-md)] bg-[var(--card)] font-semibold text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[var(--card)] rounded-[var(--radius-lg)] border border-purple-50 shadow-inner">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] block ml-1">발령 대상자 선택</label>
                <select
                  className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] text-xs font-bold outline-none border-none focus:ring-2 focus:ring-purple-100"
                  onChange={e => setExtraData((p: any) => ({ ...p, orderTargetId: e.target.value }))}
                >
                  <option value="">직원을 선택하세요</option>
                  {staffs.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.position} / {s.department || s.departments?.name})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-blue-500 block ml-1">변경(발령) 직급/부서</label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 p-4 bg-blue-50/50 rounded-[var(--radius-lg)] text-xs font-semibold text-[var(--accent)] outline-none border-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    onChange={e => setExtraData((p: any) => ({ ...p, newPosition: e.target.value }))}
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
                    className="flex-1 p-4 bg-blue-50/50 rounded-[var(--radius-lg)] text-xs font-semibold text-[var(--accent)] outline-none border-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    onChange={e => setExtraData((p: any) => ({ ...p, targetDept: e.target.value }))}
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
                onChange={e => setExtraData((p: any) => ({ ...p, targetDept: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-blue-500 ml-1">협조 희망일</label>
              <SmartDatePicker
                value=""
                onChange={val => setExtraData((p: any) => ({ ...p, deadlineDate: val }))}
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
                onChange={e => setExtraData((p: any) => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-green-600 ml-1">참석자</label>
              <input
                type="text"
                placeholder="참석자 성함 나열"
                className="w-full p-4 rounded-[var(--radius-md)] border bg-[var(--card)] font-bold text-xs shadow-sm outline-none border-none focus:ring-2 focus:ring-green-100"
                onChange={e => setExtraData((p: any) => ({ ...p, attendees: e.target.value }))}
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
                onChange={e => setExtraData((p: any) => ({ ...p, reportCycle: e.target.value }))}
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
