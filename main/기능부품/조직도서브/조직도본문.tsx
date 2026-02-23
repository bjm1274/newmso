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
  const hospitalCompanies = (companies || []).filter((c: any) => c.type !== 'MSO');

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-page-bg">
      {isMso && hospitalCompanies.length > 0 && setSelectedCompanyId && (
        <div className="shrink-0 px-8 py-4 flex items-center justify-between border-b border-zinc-200/50 dark:border-zinc-800/50 glass sticky top-0 z-30 animate-premium-fade">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Active Agency</span>
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
              className="premium text-[11px] font-bold py-1.5 px-3 shadow-premium cursor-pointer"
            >
              <option value="전체">전체 (All Organizations)</option>
              {hospitalCompanies.map((c: any) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full bg-success animate-pulse`}></div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">System Live</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar p-6 safe-pb">
        <div className="max-w-7xl mx-auto space-y-6 animate-premium-fade">
          {/* 전자결재 대기 알림 (프리미엄 배너) */}
          {pendingContract && (
            <div className="p-5 glass card-premium border-blue-100 dark:border-blue-900/30 bg-blue-50/30 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl shadow-lg shadow-blue-600/20">📜</div>
                <div>
                  <h3 className="font-bold text-[14px] text-zinc-900 dark:text-zinc-100 italic tracking-tight">근로계약서 확인 요청</h3>
                  <p className="text-[11px] font-medium text-zinc-500 mt-0.5">아직 서명되지 않은 계약서가 있습니다. 본인 성함을 입력하여 서명을 완료해주세요.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="본인 성함 입력"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  className="premium flex-1 md:w-40 py-2.5 text-xs shadow-inner"
                />
                <button onClick={handleSignContract} className="btn-premium-primary text-xs py-2.5 shadow-premium">서명하기</button>
              </div>
            </div>
          )}

          {/* 연차 촉진 알림 (프리미엄 플로팅 형태) */}
          {annualLeaveNotice && !pendingContract && (
            <div className="p-5 glass card-premium border-orange-100 dark:border-orange-900/30 bg-orange-50/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white">📅</div>
                <div>
                  <h3 className="font-bold text-[13px] text-zinc-900 dark:text-zinc-100">연차 사용 권고</h3>
                  <p className="text-[11px] text-zinc-500">{user?.name}님, 잔여 연차가 {annualLeaveNotice.remaining}일 남았습니다. 근로기준법에 따라 사용을 권장합니다.</p>
                </div>
              </div>
              <button onClick={() => setAnnualLeaveNotice(null)} className="btn-premium-secondary py-1.5 px-3 text-[10px]">확인함</button>
            </div>
          )}

          {mainMenu === 'org' && <OrgChart user={user} data={data} subView={subView} setSubView={setSubView} />}
          {mainMenu === 'mypage' && <MyPage user={user} onRefresh={() => onRefresh && onRefresh()} />}
          {mainMenu === 'messenger' && <ChatView user={user} staffs={data?.staffs || []} onRefresh={() => onRefresh && onRefresh()} />}
          {mainMenu === 'board' && <BoardView user={user} staffs={data?.staffs || []} />}
          {mainMenu === 'approval' && <ApprovalView user={user} staffs={data?.staffs || []} />}
          {mainMenu === 'hr' && <HRView user={user} staffs={data?.staffs || []} />}
          {mainMenu === 'inventory' && <InventoryView user={user} />}
          {mainMenu === 'admin' && <AdminView user={user} staffs={data?.staffs || []} />}
          {mainMenu === 'at' && <AttendanceView user={user} staffs={data?.staffs || []} />}
        </div>
      </div>
    </div>
  );
}
