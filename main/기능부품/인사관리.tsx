'use client';
import { useState } from 'react';
import 구성원관리 from './인사관리서브/구성원현황';
import CertificateGenerator from './인사관리서브/증명서발급';
import PayrollMain from './인사관리서브/급여관리';
import AttendanceSystem from './근태시스템';
import LeaveManagement from './인사관리서브/휴가신청/휴가관리메인';
import ShiftManagement from './인사관리서브/근무형태관리';

export default function 인사관리({ user, staffs, depts, onRefresh }: any) {
  const [현재메뉴, 메뉴설정] = useState('구성원');
  const [선택사업체, 사업체설정] = useState('전체');
  const [등록창상태, 창상태설정] = useState(false);

  const 사업체목록 = ["전체", "SY INC.", "박철홍정형외과", "수연의원"];

  const hasAccess = user?.permissions?.mso === true || user?.company === 'SY INC.' || user?.permissions?.hr === true;

  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-black text-gray-800">인사관리 접근 권한이 없습니다.</h2>
        <p className="text-sm text-gray-500 font-bold mt-2">MSO 직원이거나 인사 조회 권한이 부여된 직원만 이용할 수 있습니다. 관리자에게 문의하세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden animate-soft-fade">
      {/* 헤더 - 프리미엄 스타일 적용 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 p-6 md:p-10 shrink-0 z-20 shadow-sm relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-primary/10 text-primary text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">HR Management Engine</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">v3.0 Sovereign</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">인사 통합 제어 시스템</h1>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-2xl overflow-x-auto no-scrollbar">
              {['구성원', '근무형태', '근태', '급여', '휴가', '증명서'].map(이름 => (
                <button
                  key={이름}
                  onClick={() => 메뉴설정(이름)}
                  className={`px-5 py-2.5 text-[11px] font-black transition-all rounded-xl whitespace-nowrap ${현재메뉴 === 이름 ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {이름}
                </button>
              ))}
            </div>
            <button
              onClick={() => 창상태설정(true)}
              className="bg-primary text-white px-8 py-3 text-[11px] font-black rounded-2xl shadow-lg shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all"
            >
              신규 직원 등록
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* 사이드 필터 - 프리미엄 세로 탭 스타일 */}
        <aside className="w-full md:w-72 bg-white/50 backdrop-blur-sm border-b md:border-b-0 md:border-r border-slate-200/50 flex flex-col shrink-0">
          <div className="p-8">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-6 tracking-[0.2em] italic">Organizational Scope</p>
            <div className="flex md:flex-col gap-2 overflow-x-auto no-scrollbar">
              {사업체목록.map(회사 => (
                <button
                  key={회사}
                  onClick={() => 사업체설정(회사)}
                  className={`flex-1 md:w-full text-left px-5 py-4 text-[11px] font-black rounded-2xl transition-all duration-300 relative group ${선택사업체 === 회사
                    ? 'bg-primary text-white shadow-xl shadow-blue-900/20 scale-[1.02] z-10'
                    : 'text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-md'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{회사}</span>
                    {선택사업체 === 회사 && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-auto p-8 hidden md:block">
            <div className="premium-card p-5 bg-slate-900 border-none text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/20 blur-2xl rounded-full"></div>
              <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-1">HR Insights</p>
              <p className="text-xs font-bold leading-relaxed mb-3">전체 인원 현황 및 급여 마감 주기를 확인하세요.</p>
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="w-3/4 h-full bg-primary rounded-full"></div>
              </div>
            </div>
          </div>
        </aside>

        {/* 본문 영역 */}
        <section className="flex-1 overflow-y-auto bg-background custom-scrollbar p-0">
          <div className="h-full animate-soft-fade">
            {현재메뉴 === '구성원' && (
              <구성원관리
                직원목록={staffs} 부서목록={depts} 선택사업체={선택사업체} 새로고침={onRefresh}
                창상태={등록창상태} 창닫기={() => 창상태설정(false)}
              />
            )}
            {현재메뉴 === '근무형태' && <ShiftManagement selectedCo={선택사업체} />}
            {현재메뉴 === '근태' && <AttendanceSystem user={user} staffs={staffs} selectedCo={선택사업체} isAdminView={true} />}
            {현재메뉴 === '급여' && <PayrollMain staffs={staffs} selectedCo={선택사업체} />}
            {현재메뉴 === '휴가' && <LeaveManagement staffs={staffs} selectedCo={선택사업체} />}
            {현재메뉴 === '증명서' && <div className="p-10"><CertificateGenerator staffs={staffs} /></div>}
          </div>
        </section>
      </main>
    </div>
  );
}
