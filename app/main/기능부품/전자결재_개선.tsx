'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export default function ApprovalSystemImproved({ user, onRefresh }: any) {
  const [activeTab, setActiveTab] = useState('목록');
  const [approvals, setApprovals] = useState<any[]>([]);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState('');
  const [formData, setFormData] = useState<any>({});
  const [userAnnualLeave, setUserAnnualLeave] = useState<any>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<any>(null);
  const [approvalHistory, setApprovalHistory] = useState<any[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const formTypes = [
    { id: '휴가신청', label: '🏖️ 휴가 신청', icon: '🏖️' },
    { id: '연장근무', label: '⏰ 연장근무 수당 신청', icon: '⏰' },
    { id: '비품구매', label: '📦 비품 구매 신청', icon: '📦' },
    { id: '출결정정', label: '✏️ 출결 정정', icon: '✏️' },
    { id: '양식신청', label: '📄 증명서 발급 신청', icon: '📄' },
  ];

  useEffect(() => {
    fetchApprovals();
    fetchUserLeave();
  }, [user]);

  const loadTemplate = async (formType: string) => {
    const { data } = await supabase.from('approval_templates').select('default_values').eq('form_type', formType).single();
    if (data?.default_values) setFormData((prev: any) => ({ ...prev, ...data.default_values }));
    else setFormData({});
  };

  const fetchHistory = async (approvalId: string) => {
    const { data } = await supabase.from('approval_history').select('*').eq('approval_id', approvalId).order('created_at', { ascending: true });
    setApprovalHistory(data || []);
    setShowHistoryModal(approvalId);
  };

  const fetchApprovals = async () => {
    let query = supabase
      .from('approvals')
      .select('*')
      .order('created_at', { ascending: false });
    
    // MSO 직원이 아닌 경우 자기 회사 데이터만 조회
    if (user.company !== 'SY INC.' && !user.permissions?.mso) {
      query = query.eq('sender_company', user.company);
    }

    const { data } = await query;
    setApprovals(data || []);
  };

  const fetchUserLeave = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('staff_members')
      .select('annual_leave')
      .eq('id', user.id)
      .single();
    if (data) setUserAnnualLeave(data.annual_leave);
  };

  const calculateDays = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const diff = e.getTime() - s.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const createDraft = async () => {
    if (!selectedFormType) {
      alert('양식을 선택해주세요.');
      return;
    }

    const requiredFields: any = {
      휴가신청: ['start_date', 'end_date', 'reason', 'leave_type'],
      연장근무: ['date', 'hours', 'reason'],
      비품구매: ['item_name', 'quantity', 'unit_price'],
      출결정정: ['date', 'type', 'reason'],
      양식신청: ['form_type', 'purpose'],
    };

    const required = requiredFields[selectedFormType] || [];
    for (let field of required) {
      if (!formData[field]) {
        alert(`${field}을(를) 입력해주세요.`);
        return;
      }
    }

    // 연차 잔여 확인
    if (selectedFormType === '휴가신청' && formData.leave_type === '연차') {
      const days = calculateDays(formData.start_date, formData.end_date);
      if (days > (userAnnualLeave || 0)) {
        alert(`잔여 연차가 부족합니다. (신청: ${days}일, 잔여: ${userAnnualLeave}일)`);
        return;
      }
    }

    let attachmentUrl = '';
    if (attachmentFile && selectedFormType === '휴가신청') {
      const path = `leave/${Date.now()}_${attachmentFile.name}`;
      const { error: upErr } = await supabase.storage.from('pchos-files').upload(path, attachmentFile);
      if (!upErr) attachmentUrl = supabase.storage.from('pchos-files').getPublicUrl(path).data.publicUrl;
    }
    const metaWithAttachment = { ...formData, attachment_url: attachmentUrl || formData.attachment_url };

    const newApproval = {
      type: selectedFormType,
      sender_id: user.id,
      sender_name: user.name,
      sender_company: user.company,
      status: '대기',
      title: `[${selectedFormType}] ${user.name} - ${formData.reason || formData.item_name || '신청'}`,
      content: formData.reason || '',
      meta_data: metaWithAttachment,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('approvals').insert([newApproval]);

    if (!error && selectedFormType === '휴가신청') {
      const { start_date, end_date, leave_type, reason } = formData;
      await supabase.from('leave_requests').insert([{
        staff_id: user.id,
        company_name: user.company,
        leave_type: leave_type || '연차',
        start_date,
        end_date,
        reason: reason || '',
        status: '대기',
        attachment_url: attachmentUrl || null,
        attachment_name: attachmentFile?.name || null,
      }]);
    }

    if (!error) {
      setShowDraftModal(false);
      setSelectedFormType('');
      setFormData({});
      setAttachmentFile(null);
      fetchApprovals();
      alert('결재가 상신되었습니다. MSO 관리자의 승인을 기다려주세요.');
    }
  };

  const approveApproval = async (approval: any) => {
    if (!confirm('최종 승인하시겠습니까?')) return;
    
    try {
      // 1. 결재 상태 업데이트
      const { error: updateError } = await supabase
        .from('approvals')
        .update({ status: '승인' })
        .eq('id', approval.id);

      if (updateError) throw updateError;

      await supabase.from('approval_history').insert([{ approval_id: approval.id, approver_id: user.id, approver_name: user.name, action: '승인' }]);

      // 2. 출결정정 승인 시 attendance/attendances 반영
      if (approval.type === '출결정정') {
        const { date, type: correctionType } = approval.meta_data || {};
        if (date && approval.sender_id) {
          const newStatus = correctionType === '정상반영' || correctionType === '지각면제' ? 'present' : correctionType || 'present';
          await supabase.from('attendance').upsert({
            staff_id: approval.sender_id,
            date: date,
            status: newStatus === '정상반영' ? '정상' : newStatus === 'present' ? '정상' : '지각'
          }, { onConflict: 'staff_id,date' });
          await supabase.from('attendances').upsert({
            staff_id: approval.sender_id,
            work_date: date,
            status: newStatus,
          }, { onConflict: 'staff_id,work_date' });
        }
      }

      // 3. 휴가 신청인 경우 leave_requests 동기화, 연차 차감
      if (approval.type === '휴가신청') {
        const { start_date, end_date, leave_type } = approval.meta_data || {};
        const days = calculateDays(start_date, end_date);

        // leave_requests 테이블 상태 업데이트 (휴가관리메인과 동기화)
        await supabase
          .from('leave_requests')
          .update({ status: '승인', approved_at: new Date().toISOString() })
          .eq('staff_id', approval.sender_id)
          .eq('start_date', start_date)
          .eq('end_date', end_date)
          .eq('status', '대기');

        // 연차인 경우 annual_leave_used 증가
        if (leave_type === '연차') {
          const { data: staff } = await supabase
            .from('staff_members')
            .select('annual_leave_used, annual_leave')
            .eq('id', approval.sender_id)
            .single();
          const used = (staff?.annual_leave_used ?? staff?.annual_leave ?? 0) + days;
          await supabase
            .from('staff_members')
            .update({ annual_leave_used: used })
            .eq('id', approval.sender_id);
        }
      }

      // 4. 알림 전송
      await supabase.from('notifications').insert([{
        user_id: approval.sender_id,
        type: '결재승인',
        title: '✅ 결재 승인 알림',
        body: `[${approval.title}] 건이 최종 승인되었습니다.`,
        metadata: { approval_id: approval.id }
      }]);

      await logAudit('결재승인', 'approval', approval.id, { type: approval.type, title: approval.title }, user.id, user.name);
      fetchApprovals();
      if (onRefresh) onRefresh();
      alert('최종 승인 처리가 완료되었습니다.');
    } catch (err) {
      console.error(err);
      alert('승인 처리 중 오류가 발생했습니다.');
    }
  };

  const rejectApproval = async (approval: any) => {
    if (!confirm('반려하시겠습니까?')) return;
    const comment = prompt('반려 사유를 입력하세요 (선택)');
    
    await supabase.from('approvals').update({ status: '반려', rejection_comment: comment || null }).eq('id', approval.id);
    await supabase.from('approval_history').insert([{ approval_id: approval.id, approver_id: user.id, approver_name: user.name, action: '반려', comment: comment || null }]);
    await logAudit('결재반려', 'approval', approval.id, { type: approval.type, comment }, user.id, user.name);

    await supabase.from('notifications').insert([{
      user_id: approval.sender_id,
      type: '결재반려',
      title: '❌ 결재 반려 알림',
      body: `[${approval.title}] 건이 반려되었습니다.`,
      metadata: { approval_id: approval.id }
    }]);

    fetchApprovals();
    alert('결재가 반려되었습니다.');
  };

  return (
    <div className="space-y-6 p-8 bg-white h-full overflow-y-auto custom-scrollbar">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tighter italic">전자결재</h2>
          <p className="text-xs text-blue-600 font-bold mt-1">통합 행정 승인 시스템</p>
        </div>
        <div className="bg-blue-50 px-4 py-2 border border-blue-100 rounded-xl">
          <p className="text-[10px] font-black text-blue-400 uppercase">나의 잔여 연차</p>
          <p className="text-lg font-black text-blue-600">
            {userAnnualLeave || 0}일
          </p>
        </div>
      </header>

      <div className="flex gap-3 border-b border-gray-100 pb-4">
        <button
          onClick={() => setActiveTab('목록')}
          className={`px-8 py-3 font-black text-xs transition-all rounded-xl ${
            activeTab === '목록' ? 'bg-[#1E293B] text-white shadow-lg' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
          }`}
        >
          결재 목록
        </button>
        <button
          onClick={() => setShowDraftModal(true)}
          className="px-8 py-3 font-black text-xs bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all"
        >
          + 새 기안 작성
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {approvals.length === 0 ? (
          <div className="py-20 text-center opacity-20">
            <span className="text-5xl">📄</span>
            <p className="mt-4 font-black text-sm">결재 내역이 없습니다.</p>
          </div>
        ) : approvals.map((approval) => (
          <div key={approval.id} className="bg-white border border-gray-100 p-6 hover:border-blue-200 transition-all shadow-sm rounded-2xl">
            <div className="flex justify-between items-center">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] font-black bg-gray-100 px-2 py-1 text-gray-500 rounded-md uppercase">{approval.type}</span>
                  <span className={`text-[10px] font-black px-2 py-1 border rounded-md ${
                    approval.status === '승인' ? 'bg-green-50 text-green-600 border-green-100' :
                    approval.status === '반려' ? 'bg-red-50 text-red-600 border-red-100' :
                    'bg-blue-50 text-blue-600 border-blue-100'
                  }`}>{approval.status}</span>
                  <span className="text-[10px] font-bold text-gray-400">{approval.sender_company}</span>
                </div>
                <h3 className="font-black text-gray-800">{approval.title}</h3>
                <p className="text-[10px] text-gray-400 font-bold mt-1">기안자: {approval.sender_name} | {new Date(approval.created_at).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <div className="flex gap-2 items-center">
                  <button onClick={() => fetchHistory(approval.id)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-[9px] font-black rounded-lg hover:bg-gray-200">이력</button>
                  {approval.status === '대기' && (user.permissions?.mso || user.role === 'admin') && (
                    <>
                      <button onClick={() => approveApproval(approval)} className="px-4 py-2 bg-green-600 text-white text-[10px] font-black shadow-md rounded-lg hover:bg-green-700">승인</button>
                      <button onClick={() => rejectApproval(approval)} className="px-4 py-2 bg-red-600 text-white text-[10px] font-black shadow-md rounded-lg hover:bg-red-700">반려</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showDraftModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl p-10 rounded-[2.5rem] shadow-2xl space-y-6">
            <h3 className="text-2xl font-black text-gray-800 italic tracking-tighter border-b-4 border-blue-600 pb-2 inline-block">새 기안 작성</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-2">양식 선택</label>
                <select value={selectedFormType} onChange={e => { const v = e.target.value; setSelectedFormType(v); loadTemplate(v); }} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs outline-none focus:ring-2 ring-blue-100">
                  <option value="">양식을 선택하세요</option>
                  {formTypes.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>

              {selectedFormType === '휴가신청' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">휴가 종류</label>
                    <select value={formData.leave_type || ''} onChange={e => setFormData({...formData, leave_type: e.target.value})} className="w-full p-4 bg-blue-50/30 border-none rounded-2xl font-black text-xs outline-none">
                      <option value="">선택</option>
                      <option value="연차">연차 (잔여 연차 차감)</option>
                      <option value="병가">병가</option>
                      <option value="경조사">경조사</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">시작일</label>
                    <input type="date" value={formData.start_date || ''} onChange={e => setFormData({...formData, start_date: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">종료일</label>
                    <input type="date" value={formData.end_date || ''} onChange={e => setFormData({...formData, end_date: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">사유</label>
                    <textarea value={formData.reason || ''} onChange={e => setFormData({...formData, reason: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs h-24" placeholder="상세 사유를 입력하세요" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">증빙 서류 (선택)</label>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setAttachmentFile(e.target.files?.[0] || null)} className="w-full p-2 text-xs" />
                  </div>
                </div>
              )}

              {selectedFormType === '출결정정' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">정정 대상일</label>
                    <input type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">정정 유형</label>
                    <select value={formData.type || '정상반영'} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs">
                      <option value="정상반영">정상 반영</option>
                      <option value="지각면제">지각 면제</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">사유</label>
                    <input type="text" value={formData.reason || ''} onChange={e => setFormData({...formData, reason: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs" placeholder="정정 사유" />
                  </div>
                </div>
              )}

              {selectedFormType === '비품구매' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">품목명</label>
                    <input type="text" value={formData.item_name || ''} onChange={e => setFormData({...formData, item_name: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs" placeholder="구매할 물품 이름" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">수량</label>
                    <input type="number" value={formData.quantity || ''} onChange={e => setFormData({...formData, quantity: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-2">예상 단가</label>
                    <input type="number" value={formData.unit_price || ''} onChange={e => setFormData({...formData, unit_price: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-black text-xs" />
                  </div>
                </div>
              )}
            </div>

      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={() => setShowHistoryModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h4 className="font-black text-gray-800 mb-4">결재 이력</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {approvalHistory.map((h: any) => (
                <div key={h.id} className="p-3 bg-gray-50 rounded-xl text-xs">
                  <span className="font-black">{h.approver_name}</span> · {h.action}
                  {h.comment && <p className="text-gray-500 mt-1">{h.comment}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">{new Date(h.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setShowHistoryModal(null)} className="mt-4 w-full py-2 bg-gray-200 rounded-xl text-xs font-black">닫기</button>
          </div>
        </div>
      )}

            <div className="flex gap-3 pt-4">
              <button onClick={() => {setShowDraftModal(false); setSelectedFormType(''); setFormData({}); setAttachmentFile(null);}} className="flex-1 py-5 text-[10px] font-black text-gray-400 hover:bg-gray-50 rounded-2xl transition-all">취소</button>
              <button onClick={createDraft} className="flex-[2] py-5 bg-[#1E293B] text-white text-[10px] font-black hover:bg-black rounded-2xl transition-all shadow-xl">결재 상신하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
