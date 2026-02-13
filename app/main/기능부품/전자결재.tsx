'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import AttendanceForms from './전자결재서브/근태신청양식';
import SuppliesForm from './전자결재서브/비품구매양식';
import AdminForms from './전자결재서브/관리행정양식';
import FormRequest from './전자결재서브/양식신청';
import AttendanceCorrectionForm from './전자결재서브/출결정정양식';
import RepairRequestForm from './전자결재서브/수리요청서양식';

const APPROVAL_VIEW_KEY = 'erp_approval_view';

export default function ApprovalView({ user, staffs, selectedCo, setSelectedCo, selectedCompanyId, onRefresh }: any) {
  const [viewMode, setViewMode] = useState('기안함');
  const [approvals, setApprovals] = useState([]);
  const [formType, setFormType] = useState('연차/휴가');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [approverLine, setApproverLine] = useState<any[]>([]);
  const [extraData, setExtraData] = useState<any>({});
  const [customFormTypes, setCustomFormTypes] = useState<{ name: string; slug: string }[]>([]);
  const [lastDraftByType, setLastDraftByType] = useState<Record<string, any>>({});
  const [suppliesLoadKey, setSuppliesLoadKey] = useState(0);
  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;

  const BUILTIN_FORM_TYPES = ['인사명령', '연차/휴가', '연장근무', '물품신청', '수리요청서', '업무기안', '업무협조', '양식신청', '출결정정'];

  // 결재자 후보: 직위 우선, 없으면 전체 직원 표시 (staffs는 이미 메인에서 회사별로 불러옴)
  const APPROVER_POSITIONS = ['팀장', '간호과장', '실장', '부장', '이사', '병원장', '원장', '대표이사'];
  const approverCandidates = useMemo(() => {
    if (!Array.isArray(staffs)) return [];
    const byPosition = staffs.filter((s: any) => APPROVER_POSITIONS.includes(s.position));
    return byPosition.length > 0 ? byPosition : staffs;
  }, [staffs]);

  useEffect(() => {
    supabase.from('approval_form_types').select('name, slug').eq('is_active', true).order('sort_order').then(({ data }) => {
      setCustomFormTypes((data || []).map((r: any) => ({ name: r.name, slug: r.slug })));
    });
  }, []);

  // 부서장 이상(팀장/부장/실장/원장/병원장/대표이사)이 있으면 기본 결재선에 자동 추가 (staffs는 이미 회사별로 불러옴)
  useEffect(() => {
    if (!Array.isArray(staffs) || approverLine.length > 0 || viewMode !== '작성하기') return;
    const defaultApprovers = staffs.filter((s: any) => APPROVER_POSITIONS.includes(s.position));
    if (defaultApprovers.length > 0) setApproverLine(defaultApprovers);
  }, [staffs, viewMode, approverLine.length]);

  // 마지막으로 보던 탭(기안함/결재함/작성하기)을 복구
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(APPROVAL_VIEW_KEY);
      if (saved && ['기안함', '결재함', '작성하기'].includes(saved)) {
        setViewMode(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchApprovals = async () => {
    let query = supabase.from('approvals').select('*').order('created_at', { ascending: false });
    if (!isMso && user?.company_id) query = query.eq('company_id', user.company_id);
    else if (isMso && selectedCompanyId) query = query.eq('company_id', selectedCompanyId);
    else if (!isMso && user?.company) query = query.eq('sender_company', user.company);

    const { data } = await query;
    if (data) setApprovals(data as any);
  };

  useEffect(() => { fetchApprovals(); }, [selectedCompanyId, user?.id]);

  // 작성하기에서 선택한 유형별로 내가 마지막 상신한 결재 조회 (이전 기안 불러오기용)
  const fetchMyLastApproval = async (type: string) => {
    if (!user?.id) return null;
    const { data } = await supabase
      .from('approvals')
      .select('*')
      .eq('sender_id', user.id)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  };

  useEffect(() => {
    if (viewMode !== '작성하기' || !user?.id || !formType) return;
    fetchMyLastApproval(formType).then((row) => {
      if (row) setLastDraftByType((p) => ({ ...p, [formType]: row }));
      else setLastDraftByType((p) => ({ ...p, [formType]: null }));
    });
  }, [viewMode, formType, user?.id]);

  // 양식(연차/휴가, 연장근무 등) 탭을 바꿀 때마다 제목/내용/추가데이터는 새로 작성하도록 초기화
  // → 한 양식에서 쓰던 내용이 다른 탭으로 "따라가는" 현상 방지
  useEffect(() => {
    if (viewMode !== '작성하기') return;
    setFormTitle('');
    setFormContent('');
    setExtraData({});
  }, [formType, viewMode]);

  const loadLastDraft = () => {
    const last = lastDraftByType[formType];
    if (!last) return;
    setFormTitle(last.title || '');
    setFormContent(last.content || '');
    setExtraData(last.meta_data || {});
    if (Array.isArray(last.approver_line) && last.approver_line.length > 0 && Array.isArray(staffs)) {
      const line = last.approver_line
        .map((id: string) => staffs.find((s: any) => s.id === id))
        .filter(Boolean);
      if (line.length > 0) setApproverLine(line);
    }
    if (formType === '물품신청' && last.meta_data?.items?.length) setSuppliesLoadKey((k) => k + 1);
  };

  useEffect(() => {
    const channel = supabase
      .channel('approvals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => {
        fetchApprovals();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleApproveAction = async (item: any) => {
    if (!confirm("승인하시겠습니까? 관련 데이터가 즉시 업데이트됩니다.")) return;
    
    const { error: appError } = await supabase.from('approvals').update({ status: '승인' }).eq('id', item.id);
    
    if (!appError) {
        if (item.type === '물품신청' && item.meta_data.items) {
            await supabase.from('notifications').insert([{
                user_id: '00000000-0000-4000-a000-000000000001', 
                type: '물품이동요청',
                title: '📦 물품 부서이동 승인 알림',
                body: `[${item.title}] 결재가 최종 승인되었습니다. 물품 이동을 완료해주세요.`,
                metadata: { approval_id: item.id, items: item.meta_data.items }
            }]);
            alert("물품 신청이 승인되었습니다. 행정팀에서 물품 이동을 완료하면 재고가 반영됩니다.");
        }

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

        if (item.type === '연차/휴가') {
            await supabase.from('attendance').upsert({ 
                staff_id: item.sender_id, date: item.meta_data.startDate, status: '휴가', is_approved: true 
            });
            const { data: staff } = await supabase.from('staff_members').select('annual_leave').eq('id', item.sender_id).single();
            if (staff) {
                await supabase.from('staff_members').update({ annual_leave: staff.annual_leave - 1 }).eq('id', item.sender_id);
            }
        }

        if (item.type === '양식신청' && item.meta_data?.form_type && item.meta_data?.target_staff && item.meta_data?.auto_issue) {
          try {
            const sn = `CERT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
            await supabase.from('certificate_issuances').insert({
              staff_id: item.meta_data.target_staff,
              cert_type: item.meta_data.form_type,
              serial_no: sn,
              purpose: item.meta_data.purpose || '제출용',
              issued_by: user?.id,
            });
          } catch (_) {}
        }

        alert("최종 승인 처리가 완료되었습니다."); 
        fetchApprovals();
    }
  };

  const handleSubmit = async () => {
    if (!formTitle || approverLine.length === 0) return alert("제목과 결재선을 지정해주세요.");
    
    // 결재 유형별 참조 부서 설정 (알림/조회용 메타데이터)
    const requiredCc = formType === '물품신청' ? ['관리팀', '행정팀'] : ['행정팀'];
    const extraCc = Array.isArray((extraData as any)?.cc_departments) ? (extraData as any).cc_departments : [];
    const cc_departments = Array.from(new Set([...extraCc, ...requiredCc]));

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
      meta_data: { ...extraData, cc_departments },
      status: '대기'
    }]);

    if (!error) { alert("상신 완료!"); setViewMode('기안함'); fetchApprovals(); if (onRefresh) onRefresh(); }
  };

  const filteredApprovals = useMemo(() => {
    if (selectedCo === '전체') return approvals;
    return approvals.filter((a: any) => a.sender_company === selectedCo);
  }, [approvals, selectedCo]);

  return (
    <div className="flex flex-col md:flex-row h-full bg-[#F8FAFC] overflow-hidden">
      {/* 좌측 메뉴 - 모바일 상단 탭 전환 */}
      <aside className="w-full md:w-64 bg-white border-b md:border-r border-[#E5E8EB] shrink-0 z-10">
        <div className="p-4 md:p-8">
          <nav className="flex md:flex-col gap-2 overflow-x-auto no-scrollbar">
            {['기안함', '결재함', '작성하기'].map(m => (
              <button 
                key={m} 
                onClick={() => {
                  setViewMode(m);
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(APPROVAL_VIEW_KEY, m);
                  }
                }} 
                className={`flex-1 md:w-full text-center md:text-left px-4 md:px-6 py-3 md:py-4 rounded-[12px] md:rounded-[16px] text-[11px] md:text-xs font-bold transition-all whitespace-nowrap ${viewMode === m ? 'bg-[#3182F6] text-white shadow-sm' : 'bg-[#F2F4F6] md:bg-transparent text-[#8B95A1] hover:bg-white hover:shadow-sm'}`}
              >
                {m === '기안함' && '📥 '}
                {m === '결재함' && '📤 '}
                {m === '작성하기' && '✍️ '}
                {m}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto p-4 md:p-10 bg-[#F8FAFC] custom-scrollbar">
        {viewMode === '작성하기' ? (
          <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
            <div className="bg-white p-6 md:p-10 rounded-[16px] md:rounded-[20px] border border-[#E5E8EB] shadow-sm space-y-8 md:space-y-10">
              <div className="bg-[#E8F3FF] p-6 md:p-8 rounded-[16px] border border-[#E8F3FF] space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                  <label className="text-[10px] font-bold text-[#3182F6] uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#3182F6] rounded-full animate-pulse"></span>
                    결재선 지정
                  </label>
                  
                  <div className="flex gap-1 bg-[#F2F4F6] p-1 rounded-[12px] w-full md:w-auto overflow-x-auto no-scrollbar">
                    {['전체', '박철홍정형외과', '수연의원', 'SY INC.'].map(co => (
                      <button
                        key={co}
                        onClick={() => setSelectedCo(co)}
                        className={`flex-1 md:flex-none px-3 py-1.5 rounded-[12px] text-[9px] font-bold transition-all whitespace-nowrap ${selectedCo === co ? 'bg-white shadow-sm text-[#3182F6]' : 'text-[#8B95A1]'}`}
                      >
                        {co}
                      </button>
                    ))}
                  </div>
                </div>

                <select onChange={(e) => {
                    const s = approverCandidates.find((st: any) => st.id === e.target.value);
                    if (s && !approverLine.find(al => al.id === s.id)) setApproverLine([...approverLine, s]);
                    e.target.value = '';
                }} className="w-full p-4 bg-white rounded-[12px] text-xs font-bold border border-[#E5E8EB] outline-none shadow-sm">
                    <option value="">결재자 추가...</option>
                    {approverCandidates.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} {s.position || ''} {s.company ? `(${s.company})` : ''}</option>
                    ))}
                </select>
                <div className="flex gap-2 flex-wrap">{approverLine.map((a, i) => <div key={i} className="bg-white px-4 py-3 rounded-[12px] border border-[#E5E8EB] text-[10px] font-bold shadow-sm text-[#3182F6] flex items-center gap-2">{i+1}. {a.name} {a.position} <button onClick={() => setApproverLine(approverLine.filter((_,idx)=>idx!==i))} className="ml-1 text-[#8B95A1] hover:text-red-500">✕</button></div>)}</div>
              </div>

              <div className="flex gap-2 p-1.5 bg-[#F2F4F6] rounded-[12px] w-full overflow-x-auto no-scrollbar">
                {[...BUILTIN_FORM_TYPES, ...customFormTypes.map(c => c.slug)].map(t => {
                  const label = BUILTIN_FORM_TYPES.includes(t) ? t : (customFormTypes.find(c => c.slug === t)?.name ?? t);
                  return (
                    <button key={t} onClick={()=>setFormType(t)} className={`flex-1 px-4 md:px-6 py-3 rounded-[12px] text-[10px] font-bold transition-all whitespace-nowrap ${formType===t ? 'bg-white text-[#3182F6] shadow-sm' : 'text-[#8B95A1] hover:text-[#4E5968]'}`}>{label}</button>
                  );
                })}
              </div>

              {formType !== '양식신청' && lastDraftByType[formType] && (
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <span className="text-[10px] font-bold text-amber-700">
                    마지막 상신: {lastDraftByType[formType].title || '(제목 없음)'} · {new Date(lastDraftByType[formType].created_at).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={loadLastDraft}
                    className="shrink-0 px-4 py-2 rounded-xl bg-amber-500 text-white text-[11px] font-black hover:bg-amber-600 transition-all"
                  >
                    이전 기안 불러오기
                  </button>
                </div>
              )}

              <div className="min-h-[200px] animate-in fade-in duration-500">
                {['연차/휴가', '연장근무'].includes(formType) ? (
                  <AttendanceForms user={user} staffs={staffs} formType={formType} setExtraData={setExtraData} setFormTitle={setFormTitle} />
                ) : formType === '물품신청' ? (
                  <SuppliesForm key={suppliesLoadKey} setExtraData={setExtraData} initialItems={suppliesLoadKey > 0 ? lastDraftByType['물품신청']?.meta_data?.items : undefined} />
                ) : formType === '수리요청서' ? (
                  <RepairRequestForm setExtraData={setExtraData} />
                ) : formType === '양식신청' ? (
                  <FormRequest user={user} staffs={staffs} />
                ) : formType === '출결정정' ? (
                  <AttendanceCorrectionForm user={user} staffs={staffs} />
                ) : (
                  <AdminForms staffs={staffs} formType={formType} setExtraData={setExtraData} />
                )}
              </div>

              {formType !== '양식신청' && (
                <div className="space-y-6 pt-8 md:pt-10 border-t border-[#E5E8EB]">
                  <input
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    className="w-full p-4 md:p-5 bg-[#F2F4F6] rounded-[12px] font-bold outline-none text-lg md:text-xl focus:ring-2 focus:ring-[#3182F6]/20 border border-[#E5E8EB] transition-all"
                    placeholder="기안 제목을 입력하세요"
                  />
                  <textarea
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    className="w-full h-48 md:h-56 p-6 md:p-8 bg-[#F2F4F6] rounded-[16px] outline-none text-sm font-bold leading-relaxed border border-[#E5E8EB] focus:ring-2 focus:ring-[#3182F6]/20 transition-all"
                    placeholder="상세 사유 및 내용을 입력하세요."
                  />
                  <button
                    onClick={handleSubmit}
                    className="w-full py-4 md:py-5 bg-[#3182F6] text-white rounded-[12px] font-bold text-sm shadow-sm hover:opacity-95 active:scale-[0.99] transition-all"
                  >
                    결재 상신
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-[#191F28]">{viewMode} 목록 <span className="text-[#3182F6] ml-2">{filteredApprovals.length}</span></h2>
            </div>
            {filteredApprovals.length === 0 ? (
              <div className="h-96 flex flex-col items-center justify-center opacity-20">
                <span className="text-6xl mb-4">📄</span>
                <p className="font-black text-sm">결재 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredApprovals.map((item: any) => (
                  <div key={item.id} className="bg-white p-6 md:p-8 border border-[#E5E8EB] rounded-[16px] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group hover:border-[#3182F6]/30 hover:shadow-md transition-all animate-in fade-in-up">
                    <div className="flex gap-4 md:gap-6 items-center">
                        <div className="w-14 h-14 md:w-16 md:h-16 bg-gray-50 shrink-0 rounded-2xl flex items-center justify-center text-xl md:text-2xl shadow-inner group-hover:bg-blue-50 transition-colors">
                            {item.type === '물품신청' ? '📦' : item.type === '양식신청' ? '📄' : item.type === '인사명령' ? '🎖️' : item.type === '수리요청서' ? '🔧' : '📋'}
                        </div>
                        <div>
                            <div className="flex flex-wrap gap-2 mb-2 items-center">
                                <span className="px-2 py-0.5 bg-gray-100 rounded-md text-[8px] md:text-[9px] font-black text-gray-400">{item.type}</span>
                                <span className={`px-2 py-0.5 rounded-md text-[8px] md:text-[9px] font-black ${item.status === '승인' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-500'}`}>{item.status}</span>
                                <span className="px-2 py-0.5 bg-blue-50 rounded-md text-[8px] md:text-[9px] font-black text-blue-400">{item.sender_company}</span>
                            </div>
                            <h3 className="font-black text-gray-800 text-sm md:text-base tracking-tight line-clamp-1">{item.title}</h3>
                            <p className="text-[9px] md:text-[10px] text-gray-400 font-bold mt-1">기안자: {item.sender_name || '사용자'} | {new Date(item.created_at).toLocaleDateString()}</p>
                        </div>
                    </div>
                    
                    {viewMode === '결재함' && item.status === '대기' && (user.permissions?.mso || user.role === 'admin') && (
                      <button onClick={() => handleApproveAction(item)} className="w-full md:w-auto px-6 py-3 bg-[#3182F6] text-white rounded-[12px] text-[11px] font-bold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all">승인하기</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
