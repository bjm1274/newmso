'use client';
import { useState } from 'react';
import 구성원관리 from './인사관리서브/구성원현황'; 
import CertificateGenerator from './인사관리서브/증명서발급';
import PayrollMain from './인사관리서브/급여관리';
import AttendanceSystem from './근태시스템';
import AttendanceMain from './인사관리서브/근태기록/근태관리메인';
import LeaveManagement from './인사관리서브/휴가신청/휴가관리메인';
import SharedCalendarView from './공유캘린더';
import CalendarSync from './캘린더동기화';
import ShiftManagement from './인사관리서브/근무형태관리';
import AssetLoanManager from './인사관리서브/비품장비대여관리';

export default function 인사관리({ user, staffs, depts, onRefresh }: any) {
  const [현재메뉴, 메뉴설정] = useState('구성원');
  const [선택사업체, 사업체설정] = useState('전체');
  const [등록창상태, 창상태설정] = useState(false);
  const [근태뷰, 근태뷰설정] = useState<'실시간' | '월별'>('실시간'); 

  const 사업체목록 = ["전체", "박철홍정형외과", "수연의원", "SY INC."];

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
    <div className="flex flex-col h-full bg-[#F8FAFC] overflow-hidden">
      {/* 헤더 - 모바일 대응 */}
      <header className="bg-white border-b border-gray-100 p-4 md:p-8 shrink-0 z-20 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight italic">SY INC. 인사 통합 제어</h1>
            <p className="text-[10px] md:text-xs text-blue-600 font-bold mt-1 uppercase tracking-widest">MSO Integrated HR Engine</p>
          </div>
          
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            <button onClick={() => 창상태설정(true)} className="w-full md:w-auto bg-[#1E293B] text-white px-6 py-2.5 text-[11px] font-black rounded-xl shadow-md hover:bg-black transition-all">신규 직원 등록</button>
            
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 overflow-x-auto no-scrollbar">
              {['구성원', '근무형태', '근태', '급여', '연차/휴가', '캘린더', '비품대여', '증명서'].map(이름 => (
                <button key={이름} onClick={() => 메뉴설정(이름)} className={`flex-1 px-4 py-2 text-[10px] font-black transition-all rounded-lg whitespace-nowrap ${현재메뉴 === 이름 ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}>{이름}</button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <aside className="w-full md:w-64 bg-white border-b md:border-r border-gray-100 flex flex-col shrink-0">
          <div className="p-4 md:p-8">
            <p className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase mb-3 md:mb-4 italic tracking-widest">사업자 필터</p>
            <div className="flex md:flex-col gap-1 overflow-x-auto no-scrollbar">
              {사업체목록.map(회사 => (
                <button key={회사} onClick={() => 사업체설정(회사)} className={`flex-1 md:w-full text-center md:text-left px-4 py-2.5 md:py-3 text-[10px] md:text-xs font-black border-b-2 md:border-b-0 md:border-l-4 transition-all whitespace-nowrap ${선택사업체 === 회사 ? 'bg-blue-50 border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:bg-gray-50'}`}>{회사}</button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex-1 overflow-y-auto bg-[#F8FAFC] custom-scrollbar p-4 md:p-0">
          {현재메뉴 === '구성원' && (
            <구성원관리 
              직원목록={staffs} 부서목록={depts} 선택사업체={선택사업체} 새로고침={onRefresh}
              창상태={등록창상태} 창닫기={() => 창상태설정(false)} 
            />
          )}
          {현재메뉴 === '근무형태' && <ShiftManagement selectedCo={선택사업체} />}
          {현재메뉴 === '근태' && (
            <div className="flex flex-col h-full">
              <div className="flex gap-2 mb-4">
                <button onClick={() => 근태뷰설정('실시간')} className={`px-4 py-2 text-xs font-black rounded-xl ${근태뷰 === '실시간' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>실시간 출퇴근</button>
                <button onClick={() => 근태뷰설정('월별')} className={`px-4 py-2 text-xs font-black rounded-xl ${근태뷰 === '월별' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>월별/일별 대장</button>
              </div>
              {근태뷰 === '실시간' ? <AttendanceSystem user={user} staffs={staffs} selectedCo={선택사업체} isAdminView={true} /> : <AttendanceMain staffs={staffs} selectedCo={선택사업체} />}
            </div>
          )}
          {현재메뉴 === '급여' && <PayrollMain staffs={staffs} selectedCo={선택사업체} />}
          {현재메뉴 === '연차/휴가' && <LeaveManagement staffs={staffs} selectedCo={선택사업체} />}
          {현재메뉴 === '캘린더' && (
            <div className="p-4 md:p-10 flex flex-col lg:flex-row gap-8">
              <div className="flex-1"><SharedCalendarView user={user} /></div>
              <div className="lg:w-80 shrink-0"><CalendarSync /></div>
            </div>
          )}
          {현재메뉴 === '비품대여' && <div className="p-4 md:p-10"><AssetLoanManager staffs={staffs} selectedCo={선택사업체} /></div>}
          {현재메뉴 === '증명서' && <div className="p-4 md:p-10"><CertificateGenerator staffs={staffs} /></div>}
        </section>
      </main>
    </div>
  );
}
