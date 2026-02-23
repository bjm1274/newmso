'use client';
import { useState, useEffect } from 'react';
import 구성원관리 from './인사관리서브/구성원현황'; 
import CertificateGenerator from './인사관리서브/증명서발급';
import PayrollMain from './인사관리서브/급여관리';
import AttendanceSystem from './근태시스템';
import AttendanceMain from './인사관리서브/근태기록/근태관리메인';
import LeaveManagement from './인사관리서브/휴가신청/휴가관리메인';
import SharedCalendarView from './공유캘린더';
import CalendarSync from './캘린더동기화';
import AssetLoanManager from './인사관리서브/비품장비대여관리';
import ContractMain from './인사관리서브/계약관리';
import 문서보관함 from './인사관리서브/문서보관함';
import EducationMain from './인사관리서브/교육관리';

// 기본 함수 이름을 영문 대문자로 시작하도록 변경해
// React ESLint 규칙을 만족시킵니다. default export 이므로
// 외부에서의 import 이름(인사관리)은 그대로 유지됩니다.
const HR_TAB_KEY = 'erp_hr_tab';
const HR_COMPANY_KEY = 'erp_hr_company';
const HR_STATUS_KEY = 'erp_hr_status';
const HR_ATT_VIEW_KEY = 'erp_hr_att_view';

const HR_MENU_IDS = ['구성원', '계약', '문서보관함', '교육', '근태', '급여', '연차/휴가', '캘린더', '비품대여', '증명서'];

export default function HRMainView({ user, staffs, depts, onRefresh, initialMenu }: any) {
  const [현재메뉴, 메뉴설정] = useState(initialMenu && HR_MENU_IDS.includes(initialMenu) ? initialMenu : '구성원');
  const [선택사업체, 사업체설정] = useState('전체');
  const [등록창상태, 창상태설정] = useState(false);
  const [근태뷰, 근태뷰설정] = useState<'실시간' | '월별'>('실시간'); 
  const [직원상태필터, 직원상태필터설정] = useState<'재직' | '퇴사'>('재직');
  const [문서연결대상, 문서연결대상설정] = useState<{ id?: string; name?: string } | undefined>(undefined);

  const 사업체목록 = ["전체", "박철홍정형외과", "수연의원", "SY INC."];
  const p = user?.permissions || {};
  const hasAccess = p.mso === true || user?.company === 'SY INC.' || p.hr === true || p.menu_인사관리 === true;

  const HR_TABS = [
    { id: '구성원', perm: 'hr_구성원' },
    { id: '계약', perm: 'hr_계약' },
    { id: '문서보관함', perm: 'hr_문서보관함' },
    { id: '교육', perm: 'hr_교육' },
    { id: '근태', perm: 'hr_근태' },
    { id: '급여', perm: 'hr_급여' },
    { id: '연차/휴가', perm: 'hr_연차휴가' },
    { id: '캘린더', perm: 'hr_캘린더' },
    { id: '비품대여', perm: 'hr_비품대여' },
    { id: '증명서', perm: 'hr_증명서' }
  ];
  const visibleHrTabs = HR_TABS.filter(t => p[t.perm] !== false);
  const activeMenu = visibleHrTabs.some(t => t.id === 현재메뉴) ? 현재메뉴 : (visibleHrTabs[0]?.id || '구성원');

  // initialMenu가 바뀌면 현재 메뉴 동기화 (사이드바 플라이아웃에서 선택한 하위 메뉴 반영)
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
      const savedAtt = window.localStorage.getItem(HR_ATT_VIEW_KEY) as '실시간' | '월별' | null;

      if (!initialMenu && savedTab && HR_TABS.some(t => t.id === savedTab)) {
        메뉴설정(savedTab);
      }
      if (savedCo) {
        사업체설정(savedCo);
      }
      if (savedStatus === '재직' || savedStatus === '퇴사') {
        직원상태필터설정(savedStatus);
      }
      if (savedAtt === '실시간' || savedAtt === '월별') {
        근태뷰설정(savedAtt);
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
      window.localStorage.setItem(HR_ATT_VIEW_KEY, 근태뷰);
    } catch {
      // ignore
    }
  }, [activeMenu, 선택사업체, 직원상태필터, 근태뷰]);

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
      {/* 좌측: 인사관리 서브메뉴 + 하단 사업자/직원상태 필터 */}
      <aside className="flex flex-col h-full p-3 md:p-4 bg-[var(--toss-card)] border-r border-[var(--toss-border)] shrink-0 w-[72px] md:w-44 overflow-hidden">
        {/* 상단: 구성원/계약/문서보관함 등 메뉴 */}
        <div className="flex flex-col gap-1.5 overflow-y-auto min-h-0">
          {visibleHrTabs.map(({ id }) => (
            <button
              key={id}
              onClick={() => 메뉴설정(id)}
              className={`w-full px-3 py-2.5 text-[11px] md:text-[11px] font-semibold rounded-[12px] transition-all text-left shrink-0 ${
                activeMenu === id
                  ? 'bg-[var(--toss-blue)] text-white shadow-md'
                  : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)] hover:bg-[var(--toss-gray-1)]'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
        {/* 하단: 사업자 드롭다운 + 직원상태 드롭다운 */}
        <div className="flex flex-col gap-3 mt-auto pt-4 shrink-0 border-t border-[var(--toss-border)]">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-4)]">사업자</label>
            <select
              value={선택사업체}
              onChange={(e) => 사업체설정(e.target.value)}
              className="w-full px-3 py-2.5 text-[11px] md:text-[11px] font-semibold rounded-[12px] border border-[var(--toss-border)] bg-emerald-50 dark:bg-emerald-950/20 text-[var(--foreground)] focus:ring-2 focus:ring-emerald-500/30 outline-none"
            >
              {사업체목록.map(회사 => (
                <option key={회사} value={회사}>{회사}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-4)]">직원 상태</label>
            <select
              value={직원상태필터}
              onChange={(e) => 직원상태필터설정(e.target.value as '재직' | '퇴사')}
              className="w-full px-3 py-2.5 text-[11px] md:text-[11px] font-semibold rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-blue-light)]/30 text-[var(--foreground)] focus:ring-2 focus:ring-[var(--toss-blue)]/30 outline-none"
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
              <div className="flex gap-0.5 p-1 app-tab-bar w-fit mb-4">
                <button
                  onClick={() => 근태뷰설정('실시간')}
                  className={`px-4 py-2 text-[11px] md:text-[11px] font-semibold rounded-[12px] transition-all ${
                    근태뷰 === '실시간'
                      ? 'bg-[var(--toss-card)] shadow-md text-[var(--toss-blue)]'
                      : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'
                  }`}
                >
                  실시간 출퇴근
                </button>
                <button
                  onClick={() => 근태뷰설정('월별')}
                  className={`px-4 py-2 text-[11px] md:text-[11px] font-semibold rounded-[12px] transition-all ${
                    근태뷰 === '월별'
                      ? 'bg-[var(--toss-card)] shadow-md text-[var(--toss-blue)]'
                      : 'text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]'
                  }`}
                >
                  월별/일별 대장
                </button>
              </div>
              {근태뷰 === '실시간' ? (
                <AttendanceSystem user={user} staffs={staffs} selectedCo={선택사업체} isAdminView={true} />
              ) : (
                <AttendanceMain staffs={staffs} selectedCo={선택사업체} />
              )}
            </div>
          )}
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
              <CertificateGenerator staffs={staffs} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
