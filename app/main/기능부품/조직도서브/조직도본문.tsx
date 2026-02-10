'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

import OrgChart from './조직도그림'; 
import MyPage from '../마이페이지'; 
import ChatView from '../메신저'; 
import BoardView from '../게시판';
import ApprovalView from '../전자결재'; 
import HRView from '../인사관리';
import InventoryView from '../재고관리_통합완성';
import AdminView from '../관리자전용';
import AttendanceView from '../근태시스템';
import AIChatView from '../AI채팅';
import NotificationInbox from '../알림인박스';
import 추가기능 from '../추가기능';

export default function MainContent({ user, mainMenu, data, subView, setSubView, selectedCo, setSelectedCo, companies = [], selectedCompanyId, setSelectedCompanyId, onRefresh }: any) {
  const [pendingContract, setPendingContract] = useState<any>(null);
  const [annualLeaveNotice, setAnnualLeaveNotice] = useState<any>(null);
  const [signature, setSignature] = useState('');

  useEffect(() => {
    const checkNotifications = async () => {
      if (!user?.id) return;

      const { data: contract } = await supabase
        .from('employment_contracts')
        .select('*')
        .eq('staff_id', user.id)
        .eq('status', '서명대기')
        .single();
      
      if (contract) setPendingContract(contract);

      const { data: staff } = await supabase
        .from('staff_members')
        .select('annual_leave_total, annual_leave_used')
        .eq('id', user.id)
        .single();

      if (staff) {
        const remaining = (staff.annual_leave_total || 0) - (staff.annual_leave_used || 0);
        const currentMonth = new Date().getMonth() + 1;
        if (remaining > 0 && (currentMonth >= 7)) {
          setAnnualLeaveNotice({ remaining, total: staff.annual_leave_total });
        }
      }
    };
    checkNotifications();
  }, [user]);

  const handleSignContract = async () => {
    if (!signature.trim()) return alert("서명을 입력해주세요.");
    try {
      const { error } = await supabase
        .from('employment_contracts')
        .update({ status: '서명완료', signed_at: new Date().toISOString(), signature_data: signature })
        .eq('id', pendingContract.id);
      if (error) throw error;
      alert("근로계약서 서명이 완료되었습니다.");
      setPendingContract(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("서명 저장 중 오류가 발생했습니다.");
    }
  };

  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const hospitalCompanies = (companies || []).filter((c: any) => c.type !== 'MSO').sort((a: any, b: any) => {
    const order = ['박철홍정형외과', '수연의원', 'SY INC.'];
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-[#F8FAFC]">
      {isMso && hospitalCompanies.length > 0 && setSelectedCompanyId && (
        <div className="shrink-0 px-4 py-2 bg-white border-b border-gray-100 flex items-center gap-3">
          <span className="text-xs font-bold text-gray-500">회사 선택</span>
          <select
            value={selectedCo}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedCo(v);
              if (v === '전체') setSelectedCompanyId(null);
              else {
                const c = hospitalCompanies.find((x: any) => x.name === v);
                if (c) setSelectedCompanyId(c.id);
              }
            }}
            className="text-sm font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-100"
          >
            <option value="전체">전체</option>
            {hospitalCompanies.map((c: any) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {mainMenu === '내정보' && <div className="w-full flex-1 overflow-hidden"><MyPage user={user} /></div>}
      {mainMenu === '조직도' && <div className="flex-1 overflow-hidden"><OrgChart staffs={data.staffs} selectedCo={selectedCo} setSelectedCo={setSelectedCo} /></div>}
      {mainMenu === '채팅' && <div className="flex-1 overflow-hidden bg-white z-20"><ChatView user={user} onRefresh={onRefresh} staffs={data.staffs} /></div>}
      {mainMenu === 'AI채팅' && <div className="flex-1 overflow-hidden"><AIChatView /></div>}
      {mainMenu === '알림' && <div className="flex-1 overflow-hidden"><NotificationInbox user={user} onRefresh={onRefresh} /></div>}
      {mainMenu === '게시판' && <div className="flex-1 overflow-hidden"><BoardView user={user} posts={data.posts?.filter((p:any) => p.board_type === subView) || []} subView={subView} setSubView={setSubView} surgeries={data.surgeries} mris={data.mris} onRefresh={onRefresh} /></div>}
      {mainMenu === '전자결재' && <div className="flex-1 overflow-hidden"><ApprovalView user={user} staffs={data.staffs} selectedCo={selectedCo} setSelectedCo={setSelectedCo} selectedCompanyId={selectedCompanyId} onRefresh={onRefresh} /></div>}
      {mainMenu === '근태관리' && <div className="flex-1 overflow-hidden"><AttendanceView user={user} staffs={data.staffs} selectedCo={selectedCo} /></div>}
      {mainMenu === '인사관리' && <div className="flex-1 overflow-hidden"><HRView user={user} staffs={data.staffs} depts={data.depts} selectedCo={selectedCo} onRefresh={onRefresh} /></div>}
      {mainMenu === '재고관리' && <div className="flex-1 overflow-hidden"><InventoryView user={user} depts={data.depts} onRefresh={onRefresh} selectedCo={selectedCo} /></div>}
      {mainMenu === '추가기능' && <div className="flex-1 overflow-hidden"><추가기능 /></div>}
      {mainMenu === '관리자' && <div className="flex-1 overflow-hidden"><AdminView user={user} staffs={data.staffs} depts={data.depts} onRefresh={onRefresh} /></div>}

      {/* 근로계약서 서명 팝업 - 모바일 최적화 */}
      {pendingContract && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9999] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white w-full max-w-2xl rounded-t-[2.5rem] md:rounded-[3rem] shadow-2xl border-t-8 border-blue-600 flex flex-col animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
            <div className="p-8 md:p-10 border-b border-gray-50">
              <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic">근로계약서 서명 요청</h2>
              <p className="text-xs text-blue-600 font-bold mt-1 uppercase tracking-widest">본 계약서는 법적 효력을 갖는 전자 문서입니다.</p>
            </div>
            <div className="p-8 md:p-10 space-y-8">
              <div className="bg-gray-50 p-6 md:p-8 rounded-2xl border border-gray-100 text-xs leading-relaxed text-gray-600 font-medium">
                <h3 className="text-sm font-black text-gray-800 mb-6 text-center underline underline-offset-8">표준 근로계약서 (요약)</h3>
                <div className="space-y-3">
                  <p>1. 근로계약기간: 입사일로부터 정함이 없는 기간</p>
                  <p>2. 근무장소: 소속 병원 내 지정 장소</p>
                  <p>3. 업무내용: 채용 시 결정된 직무 및 부수 업무</p>
                  <p>4. 소정근로시간: 주 40시간 (운영 스케줄에 따름)</p>
                  <p>5. 임금: 연봉계약서 및 급여 규정에 따름</p>
                </div>
                <p className="mt-8 text-center font-black text-gray-400 italic">[상기 내용을 확인하였으며 이에 동의합니다]</p>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">전자 서명 (성함 입력)</label>
                <input type="text" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="본인의 성함을 정자로 입력해주세요" className="w-full p-5 bg-blue-50/50 border-2 border-blue-100 rounded-2xl outline-none focus:border-blue-600 font-black text-xl text-center transition-all" />
              </div>
              <button onClick={handleSignContract} className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl text-sm shadow-xl shadow-blue-100 hover:scale-[0.99] active:scale-95 transition-all">확인 및 전자서명 완료</button>
            </div>
          </div>
        </div>
      )}

      {/* 연차 촉진 알림 - 모바일 대응 */}
      {annualLeaveNotice && !pendingContract && (
        <div className="fixed bottom-24 right-4 left-4 md:left-auto md:right-10 z-[9998] animate-in slide-in-from-bottom-10">
          <div className="bg-white border-2 border-gray-900 p-6 md:p-8 shadow-2xl rounded-[2rem] w-full md:w-80 space-y-4">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-black text-gray-800 italic tracking-tighter">연차 사용 촉진 알림</h3>
              <button onClick={() => setAnnualLeaveNotice(null)} className="text-gray-400 hover:text-gray-900 text-xl">✕</button>
            </div>
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
              <p className="text-[10px] font-black text-orange-600 uppercase mb-1 tracking-widest">법적 준수 사항</p>
              <p className="text-xs font-bold text-gray-700 leading-relaxed">
                {user.name}님, 현재 잔여 연차가 <span className="text-orange-600 font-black">{annualLeaveNotice.remaining}일</span> 남았습니다. 
                근로기준법 제61조에 의거하여 연차 사용을 권고드립니다.
              </p>
            </div>
            <button onClick={() => setAnnualLeaveNotice(null)} className="w-full py-4 bg-gray-900 text-white text-[11px] font-black rounded-xl hover:bg-black transition-all">확인했습니다</button>
          </div>
        </div>
      )}
    </div>
  );
}
