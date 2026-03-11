'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import AttendanceForms from './전자결재서브/근태신청양식';
import SuppliesForm from './전자결재서브/비품구매양식';
import AdminForms from './전자결재서브/관리행정양식';
import FormRequest from './전자결재서브/양식신청';
import AttendanceCorrectionForm from '@/app/main/기능부품/전자결재서브/출결정정양식';
import ExpenseReportForm from './전자결재서브/지출결의서양식';

export default function ApprovalView({ user, staffs, selectedCo, setSelectedCo, selectedCompanyId, onRefresh }: any) {
  const [viewMode, setViewMode] = useState('기안함');
  const [approvals, setApprovals] = useState([]);
  const [formType, setFormType] = useState('연차/휴가');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [approverLine, setApproverLine] = useState<any[]>([]);
  const [extraData, setExtraData] = useState<any>({});

  const isMso = user?.company === '운영본부' || user?.permissions?.mso === true;

  const fetchApprovals = async () => {
    let query = supabase.from('approvals').select('*').order('created_at', { ascending: false });
    if (!isMso && user?.company_id) query = query.eq('company_id', user.company_id);
    else if (isMso && selectedCompanyId) query = query.eq('company_id', selectedCompanyId);
    else if (!isMso && user?.company) query = query.eq('sender_company', user.company);

    const { data } = await query;
    if (data) setApprovals(data as any);
  };

  useEffect(() => { fetchApprovals(); }, [selectedCompanyId, user?.id]);

  const handleApproveAction = async (item: any, action: '승인' | '반려') => {
    if (!confirm(`${action}하시겠습니까?`)) return;

    // 현재 상신된 결재선
    const line = item.approver_line || [];
    const currentIndex = line.findIndex((id: string) => id === user.id);
    const isFinalApprover = currentIndex === line.length - 1;

    let newStatus = item.status;
    let nextApprover = item.approver_id;

    if (action === '반려') {
      newStatus = '반려';
    } else {
      if (isFinalApprover) {
        newStatus = '승인'; // 최종 결재 완료
      } else {
        // 다음 결재자로 넘김
        nextApprover = line[currentIndex + 1];
      }
    }

    const { error: appError } = await supabase
      .from('approvals')
      .update({ status: newStatus, approver_id: nextApprover })
      .eq('id', item.id);

    if (!appError) {
      if (newStatus === '승인') {
        // === 1. 연차/특별휴가 승인 ===
        if (item.type === '연차신청' || item.type === '특별휴가') {
          const { data: staff } = await supabase.from('staff_members').select('annual_leave').eq('id', item.requester_id).single();
          if (staff) {
            const days = item.meta_data.days || 1;
            await supabase.from('staff_members').update({ annual_leave: staff.annual_leave - days }).eq('id', item.requester_id);

            if (item.meta_data.start_date && item.meta_data.end_date) {
              let current = new Date(item.meta_data.start_date);
              const end = new Date(item.meta_data.end_date);
              while (current <= end) {
                await supabase.from('attendance').upsert([{
                  staff_id: item.requester_id,
                  date: current.toISOString().split('T')[0],
                  status: '휴가'
                }]);
                current.setDate(current.getDate() + 1);
              }
            }
          }
        }

        // === 2. 출결정정 ===
        if (item.type === '출결정정' && item.meta_data.target_date) {
          await supabase.from('attendance').update({ status: '정상', remarks: '결재 승인에 의한 정정' })
            .eq('staff_id', item.requester_id || item.sender_id)
            .eq('date', item.meta_data.target_date);
        }

        // === 3. 연장근무 ===
        if (item.type === '연장근무' && item.meta_data.work_date) {
          const overtimeHours = item.meta_data.hours || 0;
          await supabase.from('attendance').update({ overtime_hours: overtimeHours })
            .eq('staff_id', item.requester_id || item.sender_id)
            .eq('date', item.meta_data.work_date);
        }

        // === 4. 물품신청 ===
        if (item.type === '물품신청' && item.meta_data.items) {
          await supabase.from('notifications').insert([{
            user_id: String(item.requester_id || item.sender_id),
            title: '물품신청 승인',
            message: `${item.meta_data.items[0]?.name} 외 건이 승인되었습니다.`,
            type: 'SUCCESS',
            is_read: false
          }]);
        }

        // === 5. 인사명령 ===
        if (item.type === '인사명령' && item.meta_data.orderTargetId) {
          const { orderTargetId, newPosition, orderCategory } = item.meta_data;
          const updateData: any = {};
          if (newPosition) updateData.position = newPosition;
          if (orderCategory === '부서 이동(전보)' && item.meta_data.targetDept) {
            updateData.department = item.meta_data.targetDept;
          }
          if (Object.keys(updateData).length > 0) {
            await supabase.from('staff_members').update(updateData).eq('id', orderTargetId);
          }
        }

        // (구버전 하위호환: 연차/휴가)
        if (item.type === '연차/휴가' && item.meta_data.startDate) {
          await supabase.from('attendance').upsert({
            staff_id: item.sender_id, date: item.meta_data.startDate, status: '휴가', is_approved: true
          });
          const { data: staff } = await supabase.from('staff_members').select('annual_leave_used, annual_leave_total').eq('id', item.sender_id).single();
          if (staff) {
            await supabase.from('staff_members').update({ annual_leave_used: (staff.annual_leave_used || 0) + 1 }).eq('id', item.sender_id);
          }
        }

        // [최종 승인 알림] 상신자에게 메세지 발송
        await supabase.from('notifications').insert([{
          user_id: String(item.sender_id),
          title: '전자결재 최종 승인',
          message: `'${item.title}' 기안이 최종 승인되었습니다.`,
          type: 'SUCCESS',
          is_read: false
        }]);

        alert("최종 승인 처리가 완료되었습니다.");

      } else if (newStatus === '반려') {
        // [반려 알림]
        await supabase.from('notifications').insert([{
          user_id: String(item.sender_id),
          title: '전자결재 반려',
          message: `'${item.title}' 기안이 관리자에 의해 반려되었습니다.`,
          type: 'DANGER',
          is_read: false
        }]);
        alert("반려 처리되었습니다.");
      } else {
        alert("중간 결재가 승인되어 다음 결재자에게 넘어갔습니다.");
      }

      fetchApprovals();
    }
  };

  const handleSubmit = async () => {
    if (!formTitle || approverLine.length === 0) return alert("제목과 결재선을 지정해주세요.");

    const { error } = await supabase.from('approvals').insert([{
      sender_id: user.id,
      sender_name: user.name,
      sender_company: user.company,
      company_id: user.company_id ?? undefined,
      approver_id: approverLine[0].id,
      approver_line: approverLine.map(a => a.id),
      type: formType,
      title: formTitle,
      content: formContent,
      meta_data: extraData,
      status: '대기'
    }]);

    if (!error) { alert("상신 완료!"); setViewMode('상신함'); fetchApprovals(); if (onRefresh) onRefresh(); }
  };

  const filteredApprovals = useMemo(() => {
    let filtered = approvals;
    if (selectedCo !== '전체') {
      filtered = filtered.filter((a: any) => a.sender_company === selectedCo);
    }

    if (viewMode === '상신함') return filtered.filter((a: any) => a.sender_id === user.id);
    if (viewMode === '결재함') return filtered.filter((a: any) => a.approver_id === user.id);
    return filtered;
  }, [approvals, selectedCo, viewMode, user.id]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden animate-soft-fade">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 p-6 md:p-10 shrink-0 z-20 shadow-sm relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-primary/10 text-primary text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Approval Workflow Engine</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">v4.2 Sovereign</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">전자결재 통합 제어</h1>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl w-full md:w-auto overflow-x-auto no-scrollbar">
            {['기안함', '상신함', '결재함', '보관함'].map((tab) => (
              <button
                key={tab}
                onClick={() => setViewMode(tab)}
                className={`flex-1 md:flex-none px-8 py-2.5 rounded-xl text-[11px] font-black transition-all ${viewMode === tab ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
        <div className="max-w-6xl mx-auto space-y-10">
          {viewMode === '기안함' ? (
            <div className="animate-in slide-in-from-bottom-5 duration-500 space-y-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter">문서 기안 마스터</h2>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Step 01: Setup Workflow</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {/* Form Select */}
                  <div className="premium-card p-1.5 flex bg-slate-100 overflow-x-auto no-scrollbar">
                    {['인사명령', '연차/휴가', '연장근무', '지출결의', '물품신청', '업무기안', '업무협조', '양식신청', '출결정정'].map(t => (
                      <button
                        key={t}
                        onClick={() => setFormType(t)}
                        className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black transition-all whitespace-nowrap ${formType === t ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'
                          }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Dynamic Form */}
                  <div className="premium-card p-8 md:p-10">
                    <div className="min-h-[300px]">
                      {['연차/휴가', '연장근무'].includes(formType) ? (
                        <AttendanceForms user={user} staffs={staffs} formType={formType} setExtraData={setExtraData} setFormTitle={setFormTitle} />
                      ) : formType === '물품신청' ? (
                        <SuppliesForm setExtraData={setExtraData} />
                      ) : formType === '출결정정' ? (
                        <AttendanceCorrectionForm user={user} staffs={staffs} />
                      ) : formType === '지출결의' ? (
                        <ExpenseReportForm setExtraData={setExtraData} setFormTitle={setFormTitle} />
                      ) : (
                        <AdminForms staffs={staffs} formType={formType} setExtraData={setExtraData} />
                      )}
                    </div>

                    <div className="mt-10 pt-10 border-t border-slate-100 space-y-6">
                      <input
                        value={formTitle}
                        onChange={e => setFormTitle(e.target.value)}
                        className="w-full p-6 bg-slate-50 rounded-2xl font-black outline-none text-xl focus:ring-4 focus:ring-primary/5 border-none transition-all"
                        placeholder="기안 제목을 입력하세요"
                      />
                      <textarea
                        value={formContent}
                        onChange={e => setFormContent(e.target.value)}
                        className="w-full h-56 p-8 bg-slate-50 rounded-3xl outline-none text-sm font-bold leading-relaxed border-none focus:ring-4 focus:ring-primary/5 transition-all"
                        placeholder="상세 사유 및 내용을 입력하세요."
                      />
                      <button
                        onClick={handleSubmit}
                        className="w-full py-5 bg-primary text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-900/10 hover:scale-[0.99] active:scale-95 transition-all"
                      >
                        결재 상신하기
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Approver Selection */}
                  <div className="premium-card p-8">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Step 02: Approver Line</p>

                    <div className="space-y-4">
                      <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                        {['전체', '운영본부', '수연의원'].map(co => (
                          <button
                            key={co}
                            onClick={() => setSelectedCo(co)}
                            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black transition-all ${selectedCo === co ? 'bg-white text-primary shadow-sm' : 'text-slate-400'
                              }`}
                          >
                            {co}
                          </button>
                        ))}
                      </div>

                      <select
                        onChange={(e) => {
                          const s = staffs?.find((st: any) => st.id === e.target.value);
                          if (s && !approverLine.find(al => al.id === s.id)) setApproverLine([...approverLine, s]);
                        }}
                        className="w-full p-4 bg-slate-50 rounded-xl text-xs font-bold border-none outline-none"
                      >
                        <option value="">결재자 선택...</option>
                        {staffs?.filter((s: any) => {
                          const isApproverRole = ['팀장', '부장', '원장', '병원장', '대표이사'].includes(s.position);
                          const matchesCompany = selectedCo === '전체' || s.company === selectedCo;
                          return isApproverRole && matchesCompany;
                        }).map((s: any) => <option key={s.id} value={s.id}>{s.name} {s.position} ({s.company})</option>)}
                      </select>

                      <div className="space-y-2 mt-6">
                        {approverLine.map((a, i) => (
                          <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-primary/40">{i + 1}</span>
                              <p className="text-xs font-black text-slate-700">{a.name} <span className="text-[10px] font-bold text-slate-400">{a.position}</span></p>
                            </div>
                            <button onClick={() => setApproverLine(approverLine.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-danger opacity-0 group-hover:opacity-100 transition-all">✕</button>
                          </div>
                        ))}
                        {approverLine.length === 0 && (
                          <div className="py-10 border-2 border-dashed border-slate-100 rounded-2xl flex items-center justify-center">
                            <p className="text-[10px] font-black text-slate-300 uppercase italic">Empty Line</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-slate-800">{viewMode} 내역</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filteredApprovals.length} Documents Found</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredApprovals.length > 0 ? (
                  filteredApprovals.map((item: any) => (
                    <div key={item.id} className="premium-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                      <div className="flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${item.status === '승인' ? 'bg-success-soft text-success' :
                          item.status === '반려' ? 'bg-danger-soft text-danger' :
                            'bg-primary-light text-primary'
                          }`}>
                          {item.type === '연차/휴가' ? '📅' : item.type === '물품신청' ? '🛒' : item.type === '인사명령' ? '🎗️' : item.type === '지출결의' ? '💸' : '📄'}
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1">{item.type} | {item.sender_name} ({item.sender_company})</p>
                          <h3 className="text-sm font-black text-slate-800 group-hover:text-primary transition-colors">{item.title}</h3>
                          <p className="text-[10px] text-slate-400 font-bold mt-1 line-clamp-1 italic">{new Date(item.created_at).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${item.status === '승인' ? 'bg-success-soft text-success border-success/10' :
                            item.status === '반려' ? 'bg-danger-soft text-danger border-danger/10' :
                              'bg-primary-light text-primary border-primary/10 animate-pulse'
                            }`}>
                            {item.status}
                          </span>
                        </div>
                        {viewMode === '결재함' && item.status === '대기' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApproveAction(item, '반려')}
                              className="px-5 py-2 md:px-6 md:py-3 bg-white text-danger border border-danger/20 text-[11px] font-black rounded-xl hover:bg-danger-soft transition-all"
                            >
                              반려
                            </button>
                            <button
                              onClick={() => handleApproveAction(item, '승인')}
                              className="px-5 py-2 md:px-6 md:py-3 bg-primary text-white text-[11px] font-black rounded-xl shadow-lg shadow-blue-900/10 hover:scale-105 active:scale-95 transition-all"
                            >
                              승인
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="premium-card py-32 flex flex-col items-center justify-center bg-slate-50/50 border-dashed">
                    <span className="text-5xl mb-6 opacity-20">📂</span>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] italic">No document synchronized</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
