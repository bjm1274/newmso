'use client';
import { useState, useEffect } from 'react';
import 구성원관리 from './인사관리서브/구성원현황';
import CertificateGenerator from './인사관리서브/증명서발급';
import PayrollMain from './인사관리서브/급여관리';
import AttendanceMain from './인사관리서브/근태기록/근태관리메인';
import LeaveManagement from './인사관리서브/휴가신청/휴가관리메인';
import SharedCalendarView from './공유캘린더';
import CalendarSync from './캘린더동기화';
import AssetLoanManager from './인사관리서브/비품장비대여관리';
import ContractMain from './인사관리서브/계약관리';
import 문서보관함 from './인사관리서브/문서보관함';
import EducationMain from './인사관리서브/교육관리';
import ShiftCalendar from './인사관리서브/시프트캘린더';
import DocumentScanner from './인사관리서브/스마트서류제출';
import OffboardingView from './인사관리서브/오프보딩';
import TaxFileGenerator from './인사관리서브/원천징수파일생성';
import InsuranceManagement from './인사관리서브/4대보험관리';
import HealthCheckupManagement from './인사관리서브/건강검진관리';
import CongratulationsCondolences from './인사관리서브/경조사관리';
import PersonnelAppointment from './인사관리서브/인사발령관리';
import RewardDisciplineManagement from './인사관리서브/포상징계관리';
import BirthdayAnniversary from './인사관리서브/생일기념일알림';
import OrgChartEditor from './인사관리서브/조직도편집기';
import SkillMatrix from './인사관리서브/스킬매트릭스';
import MeetingRoomBooking from './인사관리서브/회의실예약';
import VehicleDispatch from './인사관리서브/차량배차관리';
import NurseSchedule from './인사관리서브/간호근무표';
import LicenseManager from './인사관리서브/면허자격증관리';
import MedicalDeviceInspection from './인사관리서브/의료기기점검';
import PraisesBadges from './인사관리서브/칭찬배지';
import AnnualLeaveExpiryAlert from './인사관리서브/연차소멸알림';
import HolidayCalendar from './인사관리서브/공휴일달력';
import LatenessPatternAnalysis from './인사관리서브/지각조퇴분석';
import IncidentReport from './인사관리서브/사고보고서';

// 기본 함수 이름을 영문 대문자로 시작하도록 변경해
// React ESLint 규칙을 만족시킵니다. default export 이므로
// 외부에서의 import 이름(인사관리)은 그대로 유지됩니다.
const HR_TAB_KEY = 'erp_hr_tab';
const HR_COMPANY_KEY = 'erp_hr_company';
const HR_STATUS_KEY = 'erp_hr_status';

const HR_MENU_IDS = ['구성원', '계약', '문서보관함', '교육', '근태', '교대근무', '급여', '연차/휴가', '캘린더', '비품대여', '증명서', '서류제출', '오프보딩', '원천징수파일', '4대보험', '건강검진', '경조사', '인사발령', '포상/징계', '생일/기념일', '조직도', '스킬매트릭스', '회의실예약', '차량배차', '간호근무표', '면허/자격증', '의료기기점검', '칭찬배지', '연차소멸알림', '공휴일달력', '지각조퇴분석', '사고보고서'];

export default function HRMainView({ user, staffs, depts, onRefresh, initialMenu }: any) {
  const [현재메뉴, 메뉴설정] = useState(initialMenu && HR_MENU_IDS.includes(initialMenu) ? initialMenu : '구성원');
  const [선택사업체, 사업체설정] = useState('전체');
  const [등록창상태, 창상태설정] = useState(false);
  const [직원상태필터, 직원상태필터설정] = useState<'재직' | '퇴사'>('재직');
  const [문서연결대상, 문서연결대상설정] = useState<{ id?: string; name?: string } | undefined>(undefined);

  const 사업체목록 = ["전체", "박철홍정형외과", "수연의원", "SY INC."];
  const p = user?.permissions || {};
  const hasAccess = p.mso === true || user?.company === 'SY INC.' || p.hr === true || p.menu_인사관리 === true;

  const HR_TABS = [
    { id: '구성원', perm: 'hr_구성원', icon: '👥', group: '인력관리' },
    { id: '인사발령', perm: 'hr_구성원', icon: '📋', group: '인력관리' },
    { id: '포상/징계', perm: 'hr_구성원', icon: '🏅', group: '인력관리' },
    { id: '교육', perm: 'hr_교육', icon: '📚', group: '인력관리' },
    { id: '조직도', perm: 'hr_구성원', icon: '🌳', group: '인력관리' },
    { id: '스킬매트릭스', perm: 'hr_구성원', icon: '📊', group: '인력관리' },
    { id: '오프보딩', perm: 'hr_구성원', icon: '🚪', group: '인력관리' },
    { id: '근태', perm: 'hr_근태', icon: '⏰', group: '근태/급여' },
    { id: '교대근무', perm: 'hr_교대근무', icon: '🔄', group: '근태/급여' },
    { id: '연차/휴가', perm: 'hr_연차휴가', icon: '🌴', group: '근태/급여' },
    { id: '급여', perm: 'hr_급여', icon: '💰', group: '근태/급여' },
    { id: '원천징수파일', perm: 'hr_급여', icon: '📊', group: '근태/급여' },
    { id: '간호근무표', perm: 'hr_근태', icon: '🏥', group: '근태/급여' },
    { id: '4대보험', perm: 'hr_구성원', icon: '🏛️', group: '복무/복지' },
    { id: '건강검진', perm: 'hr_구성원', icon: '🩺', group: '복무/복지' },
    { id: '경조사', perm: 'hr_구성원', icon: '🎊', group: '복무/복지' },
    { id: '생일/기념일', perm: 'hr_구성원', icon: '🎂', group: '복무/복지' },
    { id: '회의실예약', perm: 'hr_구성원', icon: '🏢', group: '복무/복지' },
    { id: '차량배차', perm: 'hr_구성원', icon: '🚗', group: '복무/복지' },
    { id: '면허/자격증', perm: 'hr_구성원', icon: '📜', group: '복무/복지' },
    { id: '의료기기점검', perm: 'hr_구성원', icon: '🔧', group: '복무/복지' },
    { id: '칭찬배지', perm: 'hr_구성원', icon: '⭐', group: '복무/복지' },
    { id: '비품대여', perm: 'hr_비품대여', icon: '📦', group: '복무/복지' },
    { id: '계약', perm: 'hr_계약', icon: '📝', group: '문서/기타' },
    { id: '문서보관함', perm: 'hr_문서보관함', icon: '📁', group: '문서/기타' },
    { id: '증명서', perm: 'hr_증명서', icon: '📄', group: '문서/기타' },
    { id: '서류제출', perm: 'hr_구성원', icon: '📤', group: '문서/기타' },
    { id: '캘린더', perm: 'hr_캘린더', icon: '📅', group: '문서/기타' },
    { id: '연차소멸알림', perm: 'hr_연차휴가', icon: '⏰', group: '근태/급여' },
    { id: '공휴일달력', perm: 'hr_근태', icon: '📅', group: '근태/급여' },
    { id: '지각조퇴분석', perm: 'hr_근태', icon: '📊', group: '근태/급여' },
    { id: '사고보고서', perm: 'hr_구성원', icon: '🚨', group: '복무/복지' },
  ];
  const visibleHrTabs = HR_TABS.filter(t => p[t.perm] !== false);
  const activeMenu = visibleHrTabs.some(t => t.id === 현재메뉴) ? 현재메뉴 : (visibleHrTabs[0]?.id || '구성원');

  // 그룹 순서 및 라벨
  const GROUP_ORDER = ['인력관리', '근태/급여', '복무/복지', '문서/기타'];
  const GROUP_LABELS: Record<string, string> = { '인력관리': '👥 인력관리', '근태/급여': '💰 근태 · 급여', '복무/복지': '🏥 복무 · 복지', '문서/기타': '📂 문서 · 기타' };

  // 현재메뉴가 URL이나 외부에서 들어온 경우에 대비
  useEffect(() => {
    if (initialMenu && HR_MENU_IDS.includes(initialMenu)) {
      메뉴설정(initialMenu);
    }
  }, [initialMenu]);

  // 새로고침해도 HR 내에서 보던 탭·필터를 유지 (initialMenu 없을 때만 탭 복원)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedTab = window.localStorage.getItem(HR_TAB_KEY);
      const savedCo = window.localStorage.getItem(HR_COMPANY_KEY);
      const savedStatus = window.localStorage.getItem(HR_STATUS_KEY) as '재직' | '퇴사' | null;

      if (!initialMenu && savedTab && HR_TABS.some(t => t.id === savedTab)) {
        메뉴설정(savedTab);
      }
      if (savedCo) {
        사업체설정(savedCo);
      }
      if (savedStatus === '재직' || savedStatus === '퇴사') {
        직원상태필터설정(savedStatus);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HR_TAB_KEY, activeMenu);
      window.localStorage.setItem(HR_COMPANY_KEY, 선택사업체);
      window.localStorage.setItem(HR_STATUS_KEY, 직원상태필터);
    } catch {
      // ignore
    }
  }, [activeMenu, 선택사업체, 직원상태필터]);

  const 퇴사서류보기 = (직원: any) => {
    문서연결대상설정({ id: 직원.id, name: 직원.name });
    사업체설정(직원.company || '전체');
    메뉴설정('문서보관함');
  };

  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--toss-gray-1)] p-6">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">인사관리 접근 권한이 없습니다.</h2>
        <p className="text-sm text-[var(--toss-gray-4)] font-bold mt-2">MSO 직원이거나 인사 조회 권한이 부여된 직원만 이용할 수 있습니다. 관리자에게 문의하세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-row h-full min-h-0 app-page overflow-hidden">
      {/* 좌측 사이드바 - 그룹별 메뉴 */}
      <aside className="flex flex-col md:flex-col h-auto md:h-full bg-[var(--toss-card)] border-b md:border-b-0 md:border-r border-[var(--toss-border)] shrink-0 w-full md:w-48 overflow-hidden">
        {/* 모바일: 가로 스크롤, PC: 그룹별 세로 리스트 */}
        <div className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-y-auto no-scrollbar min-h-0 p-2 md:p-3 md:flex-1">
          {/* 모바일: 단순 가로 목록 */}
          <div className="flex md:hidden gap-1">
            {visibleHrTabs.map(({ id, icon }) => (
              <button
                key={id}
                onClick={() => 메뉴설정(id)}
                className={`flex-none px-3 py-2 text-[11px] font-bold rounded-[10px] transition-all whitespace-nowrap ${activeMenu === id
                  ? 'bg-[var(--toss-blue)] text-white shadow-md'
                  : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]'
                  }`}
              >
                {icon} {id}
              </button>
            ))}
          </div>
          {/* PC: 그룹별 세로 목록 */}
          <div className="hidden md:flex md:flex-col gap-0.5">
            {GROUP_ORDER.map((group, gi) => {
              const groupTabs = visibleHrTabs.filter(t => t.group === group);
              if (groupTabs.length === 0) return null;
              return (
                <div key={group} className={gi > 0 ? 'mt-2 pt-2 border-t border-[var(--toss-border)]' : ''}>
                  <p className="text-[9px] font-bold text-[var(--toss-gray-3)] px-2.5 py-1.5 uppercase tracking-wider">{GROUP_LABELS[group]}</p>
                  {groupTabs.map(({ id, icon }) => (
                    <button
                      key={id}
                      onClick={() => 메뉴설정(id)}
                      className={`w-full px-2.5 py-2 text-[11px] font-bold rounded-[10px] transition-all text-left flex items-center gap-2 ${activeMenu === id
                        ? 'bg-[var(--toss-blue)] text-white shadow-md'
                        : 'text-[var(--toss-gray-4)] hover:text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]'
                        }`}
                    >
                      <span className="text-[13px] shrink-0">{icon}</span>
                      <span className="truncate">{id}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* 하단 필터 */}
        <div className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-3 p-2 md:p-3 shrink-0 border-t border-[var(--toss-border)]">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] md:text-[11px] font-bold text-[var(--toss-gray-4)]">사업자</label>
            <select
              value={선택사업체}
              onChange={(e) => 사업체설정(e.target.value)}
              className="w-full px-2 py-2 md:px-3 md:py-2.5 text-[11px] font-bold rounded-[12px] border border-[var(--toss-border)] bg-emerald-50 dark:bg-emerald-950/20 text-[var(--foreground)] focus:ring-2 focus:ring-emerald-500/30 outline-none"
            >
              {사업체목록.map(회사 => (
                <option key={회사} value={회사}>{회사}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] md:text-[11px] font-bold text-[var(--toss-gray-4)]">직원 상태</label>
            <select
              value={직원상태필터}
              onChange={(e) => 직원상태필터설정(e.target.value as '재직' | '퇴사')}
              className="w-full px-2 py-2 md:px-3 md:py-2.5 text-[11px] font-bold rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-blue-light)]/30 text-[var(--foreground)] focus:ring-2 focus:ring-[var(--toss-blue)]/30 outline-none"
            >
              <option value="재직">재직자</option>
              <option value="퇴사">퇴사자</option>
            </select>
          </div>
        </div>
      </aside>

      {/* 우측: 실제 인사관리 콘텐츠 */}
      <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
        <section className="flex-1 overflow-y-auto bg-[var(--page-bg)] custom-scrollbar p-4 md:p-0">
          {activeMenu === '구성원' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <구성원관리
                  직원목록={staffs}
                  부서목록={depts}
                  선택사업체={선택사업체}
                  보기상태={직원상태필터}
                  on문서보기={퇴사서류보기}
                  새로고침={onRefresh}
                  창상태={등록창상태}
                  창닫기={() => 창상태설정(false)}
                  onOpenNewStaff={() => 창상태설정(true)}
                />
              </div>
            </div>
          )}
          {activeMenu === '계약' && <ContractMain staffs={staffs} selectedCo={선택사업체} onRefresh={onRefresh} />}
          {activeMenu === '문서보관함' && (
            <문서보관함
              user={user}
              selectedCo={선택사업체}
              linkedTarget={문서연결대상}
            />
          )}
          {activeMenu === '교육' && (
            <div className="p-4 md:p-10">
              <EducationMain staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}
          {activeMenu === '근태' && (
            <div className="flex flex-col h-full">
              <AttendanceMain staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}
          {activeMenu === '교대근무' && <ShiftCalendar staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '급여' && <PayrollMain staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '연차/휴가' && <LeaveManagement staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '캘린더' && (
            <div className="p-4 md:p-10 flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <SharedCalendarView user={user} />
              </div>
              <div className="lg:w-80 shrink-0">
                <CalendarSync />
              </div>
            </div>
          )}
          {activeMenu === '비품대여' && (
            <div className="p-4 md:p-10">
              <AssetLoanManager staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}
          {activeMenu === '증명서' && (
            <div className="p-4 md:p-10">
              <CertificateGenerator staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}
          {activeMenu === '서류제출' && (
            <div className="p-4 md:p-10">
              <DocumentScanner user={user} staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}
          {activeMenu === '오프보딩' && (
            <div className="p-4 md:p-10">
              <OffboardingView staffs={staffs} selectedCo={선택사업체} onRefresh={onRefresh} />
            </div>
          )}
          {activeMenu === '원천징수파일' && (
            <div className="p-4 md:p-10">
              <TaxFileGenerator staffs={staffs} selectedCo={선택사업체} />
            </div>
          )}
          {activeMenu === '4대보험' && <InsuranceManagement staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '건강검진' && <HealthCheckupManagement staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '경조사' && <CongratulationsCondolences staffs={staffs} selectedCo={선택사업체} />}
          {activeMenu === '인사발령' && <PersonnelAppointment staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '포상/징계' && <RewardDisciplineManagement staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '생일/기념일' && <BirthdayAnniversary staffs={staffs} user={user} />}
          {activeMenu === '조직도' && <OrgChartEditor staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '스킬매트릭스' && <SkillMatrix staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '회의실예약' && <MeetingRoomBooking user={user} staffs={staffs} />}
          {activeMenu === '차량배차' && <VehicleDispatch user={user} staffs={staffs} />}
          {activeMenu === '간호근무표' && <NurseSchedule staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '면허/자격증' && <LicenseManager staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '의료기기점검' && <MedicalDeviceInspection selectedCo={선택사업체} user={user} />}
          {activeMenu === '칭찬배지' && <PraisesBadges staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '연차소멸알림' && <AnnualLeaveExpiryAlert staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '공휴일달력' && <HolidayCalendar staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '지각조퇴분석' && <LatenessPatternAnalysis staffs={staffs} selectedCo={선택사업체} user={user} />}
          {activeMenu === '사고보고서' && <IncidentReport staffs={staffs} selectedCo={선택사업체} user={user} />}
        </section>
      </main>
    </div>
  );
}
