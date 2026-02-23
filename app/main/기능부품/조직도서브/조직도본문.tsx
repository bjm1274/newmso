'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SignaturePad from '@/app/components/SignaturePad';
import { getOrdinaryWageTable } from '@/lib/ordinary-wage';

import OrgChart from './조직도그림'; 
import MyPage from '../마이페이지'; 
import ChatView from '../메신저'; 
import BoardView from '../게시판';
import ApprovalView from '../전자결재'; 
import HRView from '../인사관리';
import InventoryView from '../재고관리_통합완성';
import AdminView from '../관리자전용';
import AttendanceView from '../근태시스템';
import 추가기능 from '../추가기능';

export default function MainContent({
  user,
  mainMenu,
  data,
  subView,
  setSubView,
  selectedCo,
  setSelectedCo,
  companies = [],
  selectedCompanyId,
  setSelectedCompanyId,
  onRefresh,
  initialMyPageTab,
  onConsumeMyPageInitialTab,
  initialOpenChatRoomId,
  onConsumeOpenChatRoomId,
  setMainMenu,
}: any) {
  const [pendingContract, setPendingContract] = useState<any>(null);
  const [annualLeaveNotice, setAnnualLeaveNotice] = useState<any>(null);
  const [signature, setSignature] = useState('');
  const [signatureMode, setSignatureMode] = useState<'none' | 'type' | 'pad'>('none');
  const [contractTemplate, setContractTemplate] = useState<string>('');

  useEffect(() => {
    const checkNotifications = async () => {
      if (!user?.id) return;

      const { data: contract } = await supabase
        .from('employment_contracts')
        .select('*')
        .eq('staff_id', user.id)
        .eq('status', '서명대기')
        .single();
      
      if (contract) {
        setPendingContract(contract);
        const companyName = user.company || '전체';

        // 근무형태(근로시간·휴게) 조회
        let shift: any = null;
        const shiftId = (contract as any).shift_id ?? (user as any).shift_id;
        if (shiftId) {
          const { data: shiftData } = await supabase
            .from('work_shifts')
            .select('*')
            .eq('id', shiftId)
            .single();
          shift = shiftData;
        }

        // 회사 기본정보(대표자, 사업자번호, 주소, 전화 등) 조회
        let companyInfo: any = null;
        if (companyName && companyName !== '전체') {
          const { data: companyRow } = await supabase
            .from('companies')
            .select('*')
            .eq('name', companyName)
            .maybeSingle();
          companyInfo = companyRow;
        }

        // 계약서 템플릿 조회
        const { data: tmpl } = await supabase
          .from('contract_templates')
          .select('template_content')
          .eq('company_name', companyName)
          .single();

        let templateText = tmpl?.template_content || '';
        if (!templateText) {
          const { data: fallback } = await supabase
            .from('contract_templates')
            .select('template_content')
            .eq('company_name', '전체')
            .single();
          templateText = fallback?.template_content || '';
        }

        // 직원 정보·회사 정보·급여·근무형태를 이용해 템플릿 변수 치환
        const filled = fillContractTemplate(templateText, user, contract, shift, companyInfo);
        setContractTemplate(filled);
      }

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

  // 근로계약서 템플릿 변수 치환 유틸
  const fillContractTemplate = (
    template: string,
    user: any,
    contract: any,
    shift: any,
    company: any,
  ) => {
    if (!template) return '';

    const formatDate = (value?: string | null) => {
      if (!value) return '';
      // YYYY-MM-DD 또는 ISO 문자열 가정
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}년 ${m}월 ${day}일`;
    };

    const formatWon = (n?: number | null) => {
      if (!n || Number.isNaN(n)) return '';
      try {
        return n.toLocaleString('ko-KR');
      } catch {
        return String(n);
      }
    };

    const parseBirthFromResident = (resident?: string | null) => {
      if (!resident) return '';
      const raw = resident.replace(/[^0-9]/g, '');
      if (raw.length < 7) return '';
      const yy = raw.slice(0, 2);
      const mm = raw.slice(2, 4);
      const dd = raw.slice(4, 6);
      const genderCode = raw[6];
      const century =
        genderCode === '1' || genderCode === '2' || genderCode === '5' || genderCode === '6'
          ? '19'
          : '20';
      const year = `${century}${yy}`;
      return `${year}년 ${mm}월 ${dd}일`;
    };

    const salarySource = contract || user || {};

    const vars: Record<string, string> = {
      employee_name: user?.name || '',
      employee_no: String(user?.employee_no ?? ''),

      // 회사 기본정보 (회사/조직 → 회사관리에서 입력한 값 우선 사용)
      company_name: company?.name || user?.company || '',

      // 대표자/사업자/주소/전화 – 여러 토큰 이름을 모두 채워줌
      company_ceo: company?.ceo_name || '',
      ceo_name: company?.ceo_name || '',
      company_representative: company?.ceo_name || '',

      company_business_no: company?.business_no || '',
      business_no: company?.business_no || '',

      company_address: company?.address || '',
      address_company: company?.address || '',

      company_phone: company?.phone || '',
      phone_company: company?.phone || '',

      department: user?.department || '',
      position: user?.position || '',
      join_date: formatDate(user?.joined_at || salarySource?.join_date),
      phone: user?.phone || '',
      address: user?.address || '',
      birth_date: parseBirthFromResident(user?.resident_no),

      base_salary: formatWon(salarySource.base_salary),
      position_allowance: formatWon(salarySource.position_allowance),
      meal_allowance: formatWon(salarySource.meal_allowance),
      vehicle_allowance: formatWon(salarySource.vehicle_allowance),
      childcare_allowance: formatWon(salarySource.childcare_allowance),
      research_allowance: formatWon(salarySource.research_allowance),
      other_taxfree: formatWon(salarySource.other_taxfree),

      shift_start: shift?.start_time ? String(shift.start_time).slice(0, 5) : '',
      shift_end: shift?.end_time ? String(shift.end_time).slice(0, 5) : '',
      break_start: shift?.break_start_time ? String(shift.break_start_time).slice(0, 5) : '',
      break_end: shift?.break_end_time ? String(shift.break_end_time).slice(0, 5) : '',

      today: formatDate(new Date().toISOString()),
    };

    let result = template;
    // 1차: {{token}} 치환
    Object.entries(vars).forEach(([key, value]) => {
      const token = `{{${key}}}`;
      if (result.includes(token)) {
        result = result.split(token).join(value || '');
      }
    });

    // 2차: 예전 양식처럼 "회사명 : ______" 식으로 되어 있는 경우에도 회사 정보 강제 주입
    const companyLineValues: Record<string, string | undefined> = {
      회사명: vars.company_name,
      대표자: vars.company_ceo,
      대표자명: vars.company_ceo,
      사업자등록번호: vars.company_business_no,
      주소: vars.company_address,
      전화번호: vars.company_phone,
      '대표 전화번호': vars.company_phone,
    };

    Object.entries(companyLineValues).forEach(([label, value]) => {
      if (!value) return;
      const re = new RegExp(`(${label}\\s*:\\s*)([_\\s]*)`, 'g');
      result = result.replace(re, `$1${value}`);
    });

    return result;
  };

  const handleSignContract = async () => {
    const sigData = signature?.trim();
    if (!sigData) return alert("서명하기 버튼을 눌러 서명칸에서 서명하거나, 성함을 입력해주세요.");
    try {
      const { error } = await supabase
        .from('employment_contracts')
        .update({ status: '서명완료', signed_at: new Date().toISOString(), signature_data: sigData })
        .eq('id', pendingContract.id);
      if (error) throw error;

      // 서명 완료된 근로계약서를 문서보관함에 자동 보관 (PDF 업로드 포함)
      try {
        const title = `${user?.company || ''} ${user?.name || ''} 근로계약서 (${new Date().toISOString().slice(0, 10)})`;

        // 1) 근로계약서 내용을 기반으로 PDF 생성 후 Supabase Storage에 업로드
        const pdfUrl = await (async () => {
          try {
            const jsPDFModule: any = await import('jspdf');
            const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default;
            const doc = new jsPDF('p', 'mm', 'a4');

            const marginLeft = 20;
            const marginTop = 20;
            const maxWidth = 170;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);

            const lines = doc.splitTextToSize(contractTemplate || '', maxWidth);
            doc.text(lines, marginLeft, marginTop);

            let cursorY = marginTop + lines.length * 6;
            if (cursorY > 260) {
              doc.addPage();
              cursorY = marginTop;
            }

            doc.setFontSize(11);
            if (sigData.startsWith('data:image')) {
              doc.text('전자 서명:', marginLeft, cursorY + 10);
              doc.addImage(sigData, 'PNG', marginLeft + 25, cursorY, 35, 18);
              cursorY += 32;
            } else {
              doc.text(`전자 서명: ${sigData}`, marginLeft, cursorY + 10);
              cursorY += 24;
            }

            const blob = doc.output('blob') as Blob;

            const safeCompany =
              user?.company === '박철홍정형외과'
                ? 'pch_ortho'
                : user?.company === '수연의원'
                ? 'suyeon_clinic'
                : user?.company === 'SY INC.'
                ? 'sy_inc'
                : (user?.company || 'company').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'company';

            const safeStaff =
              (user?.name || 'staff').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'staff';

            const filePath = `${safeCompany}/${safeStaff}_contract_${Date.now()}.pdf`;

            const { error: upErr } = await supabase.storage
              .from('contract-pdfs')
              .upload(filePath, blob, { contentType: 'application/pdf', upsert: true });

            if (upErr) {
              console.warn('contract pdf upload error', upErr);
              return null;
            }

            const { data: urlData } = supabase.storage.from('contract-pdfs').getPublicUrl(filePath);
            return urlData.publicUrl as string;
          } catch (e) {
            console.warn('contract pdf generate/upload failed', e);
            return null;
          }
        })();

        // 2) 문서보관함에 계약서 텍스트 + PDF 링크 함께 저장
        await supabase.from('document_repository').insert({
          title,
          category: '계약서',
          content: contractTemplate || '',
          version: 1,
          company_name: user?.company || '전체',
          created_by: user?.id,
          file_url: pdfUrl || null,
        });
      } catch (e) {
        console.warn('문서보관함 저장 실패(계약서 자동 보관):', e);
      }

      alert("근로계약서 서명이 완료되었습니다.");
      setPendingContract(null);
      setSignature('');
      setSignatureMode('none');
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("서명 저장 중 오류가 발생했습니다.");
    }
  };

  const handleSignaturePadSave = (dataUrl: string) => {
    setSignature(dataUrl);
    setSignatureMode('none');
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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#F9FAFB]">
      {isMso && hospitalCompanies.length > 0 && setSelectedCompanyId && (
        <div className="shrink-0 px-4 py-2 bg-white border-b border-[#E5E8EB] flex items-center gap-2">
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

      {mainMenu === '내정보' && (
        <div className="w-full flex-1 min-h-0 overflow-hidden">
          <MyPage
            user={user}
            initialMyPageTab={initialMyPageTab}
            onConsumeMyPageInitialTab={onConsumeMyPageInitialTab}
            onOpenApproval={() => setMainMenu('전자결재')}
            setMainMenu={setMainMenu}
          />
        </div>
      )}
      {mainMenu === '조직도' && <div className="flex-1 overflow-hidden"><OrgChart staffs={data.staffs} selectedCo={selectedCo} setSelectedCo={setSelectedCo} /></div>}
      {mainMenu === '채팅' && <div className="flex-1 overflow-hidden bg-white z-20"><ChatView user={user} onRefresh={onRefresh} staffs={data.staffs} initialOpenChatRoomId={initialOpenChatRoomId} onConsumeOpenChatRoomId={onConsumeOpenChatRoomId} /></div>}
      {mainMenu === '게시판' && (
        <div className="flex-1 overflow-hidden">
          <BoardView
            user={user}
            posts={data.posts?.filter((p: any) => p.board_type === subView) || []}
            subView={subView}
            setSubView={setSubView}
            surgeries={data.surgeries}
            mris={data.mris}
            onRefresh={onRefresh}
            setMainMenu={setMainMenu}
          />
        </div>
      )}
      {mainMenu === '전자결재' && <div className="flex-1 overflow-hidden"><ApprovalView user={user} staffs={data.staffs} selectedCo={selectedCo} setSelectedCo={setSelectedCo} selectedCompanyId={selectedCompanyId} onRefresh={onRefresh} /></div>}
      {mainMenu === '근태관리' && <div className="flex-1 overflow-hidden"><AttendanceView user={user} staffs={data.staffs} selectedCo={selectedCo} /></div>}
      {mainMenu === '인사관리' && <div className="flex-1 overflow-hidden"><HRView user={user} staffs={data.staffs} depts={data.depts} selectedCo={selectedCo} onRefresh={onRefresh} /></div>}
      {mainMenu === '재고관리' && <div className="flex-1 overflow-hidden"><InventoryView user={user} depts={data.depts} onRefresh={onRefresh} selectedCo={selectedCo} /></div>}
      {mainMenu === '추가기능' && <div className="flex-1 overflow-hidden"><추가기능 user={user} /></div>}
      {mainMenu === '관리자' && <div className="flex-1 overflow-hidden"><AdminView user={user} staffs={data.staffs} depts={data.depts} onRefresh={onRefresh} /></div>}

      {/* 근로계약서 서명 팝업 - 모바일/PC 서명 지원 (창 닫기 허용) */}
      {pendingContract && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[9999] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white w-full max-w-2xl rounded-t-[24px] md:rounded-[24px] shadow-2xl border-t-4 border-[#3182F6] flex flex-col animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
            <div className="p-8 md:p-10 border-b border-[#E5E8EB] flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#191F28] tracking-tight">근로계약서 서명 요청</h2>
                <p className="text-xs text-[#3182F6] font-semibold mt-1 uppercase tracking-wider">
                  본 계약서는 법적 효력을 갖는 전자 문서입니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingContract(null);
                  setSignature('');
                  setSignatureMode('none');
                }}
                className="text-[#8B95A1] hover:text-[#191F28] text-xl md:text-2xl leading-none"
                aria-label="근로계약서 창 닫기"
              >
                ✕
              </button>
            </div>
            <div className="p-8 md:p-10 space-y-8">
              {/* 통상임금 산출 표 (근로자가 확인 후 서명) */}
              {(() => {
                const breakdown = {
                  base_salary: pendingContract.base_salary ?? user?.base_salary,
                  meal_allowance: pendingContract.meal_allowance ?? user?.meal_allowance,
                  vehicle_allowance: pendingContract.vehicle_allowance ?? user?.vehicle_allowance,
                  childcare_allowance: pendingContract.childcare_allowance ?? user?.childcare_allowance,
                  research_allowance: pendingContract.research_allowance ?? user?.research_allowance,
                  other_taxfree: pendingContract.other_taxfree ?? user?.other_taxfree,
                  position_allowance: pendingContract.position_allowance ?? user?.position_allowance,
                };
                const { rows, totalMonthly, hourlyWage } = getOrdinaryWageTable(breakdown);
                if (rows.length === 0) return null;
                return (
                  <div className="bg-white p-6 rounded-[16px] border-2 border-[#3182F6]/20">
                    <h4 className="text-xs font-semibold text-[#191F28] mb-3 uppercase tracking-wider">통상임금 산출 (월 소정근로시간 209시간 기준)</h4>
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 font-semibold text-gray-500">항목</th>
                          <th className="text-right py-2 font-semibold text-gray-500">금액 (원/월)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2 font-semibold text-gray-700">{r.label}</td>
                            <td className="py-2 text-right font-bold text-gray-900">{r.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className="bg-[#F2F4F6] font-semibold">
                          <td className="py-2 text-gray-800">월 통상급여 합계</td>
                          <td className="py-2 text-right text-[#3182F6]">{totalMonthly.toLocaleString()}</td>
                        </tr>
                        <tr className="font-semibold">
                          <td className="py-2 text-gray-800">시 통상임금 (원/시간)</td>
                          <td className="py-2 text-right text-[#3182F6]">{hourlyWage.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              <div className="bg-[#F2F4F6] p-6 md:p-8 rounded-[16px] border border-[#E5E8EB] text-xs leading-relaxed text-[#4E5968] font-medium max-h-[40vh] overflow-y-auto custom-scrollbar font-mono">
                <h3 className="text-sm font-bold text-[#191F28] mb-4 text-center underline underline-offset-8">{pendingContract.contract_type || '표준 근로계약서'}</h3>
                <div className="whitespace-pre-wrap">{contractTemplate || '제1조(계약의 목적)\n본 계약은 근로기준법에 따라 사용자와 근로자 간의 근로조건을 정함을 목적으로 한다.\n\n제2조(근로계약기간) 입사일로부터 정함이 없는 기간\n\n제3조(근무장소) 소속 병원 내 지정 장소\n\n제4조(업무내용) 채용 시 결정된 직무 및 부수 업무\n\n제5조(소정근로시간) 주 40시간 (운영 스케줄에 따름)\n\n제6조(임금) 연봉계약서 및 급여 규정에 따름\n\n[상기 내용을 확인하였으며 이에 동의합니다]'}</div>
              </div>

              <div className="space-y-4">
                <label className="text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wider">전자 서명</label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setSignatureMode(signatureMode === 'pad' ? 'none' : 'pad'); setSignature(''); }} className={`px-4 py-2.5 rounded-[12px] text-[13px] font-semibold transition-all ${signatureMode === 'pad' ? 'bg-[#3182F6] text-white' : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'}`}>
                    ✍️ 서명하기 (화면에 직접 서명)
                  </button>
                  <button type="button" onClick={() => { setSignatureMode(signatureMode === 'type' ? 'none' : 'type'); setSignature(''); }} className={`px-4 py-2.5 rounded-[12px] text-[13px] font-semibold transition-all ${signatureMode === 'type' ? 'bg-[#3182F6] text-white' : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'}`}>
                    ⌨️ 성함 입력
                  </button>
                </div>
                {signatureMode === 'pad' && <SignaturePad onSave={handleSignaturePadSave} width={400} height={180} />}
                {signatureMode === 'type' && <input type="text" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="본인의 성함을 정자로 입력해주세요" className="w-full p-5 bg-[#E8F3FF]/50 border-2 border-[#E8F3FF] rounded-[16px] outline-none focus:border-[#3182F6] font-semibold text-xl text-center transition-all" />}
                {signature && !signatureMode && (
                  <div className="flex items-center gap-3 p-3 bg-[#E8F3FF] rounded-[12px]">
                    {signature.startsWith('data:image') ? <img src={signature} alt="서명" className="h-12 object-contain bg-white rounded border" /> : <span className="font-semibold text-[#191F28]">{signature}</span>}
                    <button type="button" onClick={() => setSignature('')} className="text-[#8B95A1] text-sm hover:text-[#191F28]">변경</button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <button
                  onClick={handleSignContract}
                  disabled={!signature?.trim()}
                  className="w-full py-5 bg-[#3182F6] text-white font-semibold rounded-[16px] text-[15px] hover:bg-[#1B64DA] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  확인 및 전자서명 완료
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingContract(null);
                    setSignature('');
                    setSignatureMode('none');
                  }}
                  className="w-full py-3 text-[13px] font-semibold text-[#4E5968] bg-[#F5F7FA] rounded-[14px] hover:bg-[#E5E8EB] transition-all"
                >
                  나중에 서명할게요
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 연차 촉진 알림 - 모바일 대응 */}
      {annualLeaveNotice && !pendingContract && (
        <div className="fixed bottom-28 right-4 left-4 md:bottom-10 md:left-auto md:right-10 z-[9998] animate-in slide-in-from-bottom-10">
          <div className="bg-white border border-[#E5E8EB] p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.08)] rounded-[20px] w-full md:w-80 space-y-4">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-[#191F28] tracking-tight">연차 사용 촉진 알림</h3>
              <button onClick={() => setAnnualLeaveNotice(null)} className="text-[#8B95A1] hover:text-[#191F28] text-xl">✕</button>
            </div>
            <div className="bg-[#FFF8E6] p-4 rounded-[12px] border border-[#FFE4A0]">
              <p className="text-[11px] font-semibold text-[#F59E0B] uppercase mb-1 tracking-wider">법적 준수 사항</p>
              <p className="text-xs font-medium text-[#4E5968] leading-relaxed">
                {user.name}님, 현재 잔여 연차가 <span className="text-[#F59E0B] font-bold">{annualLeaveNotice.remaining}일</span> 남았습니다. 
                근로기준법 제61조에 의거하여 연차 사용을 권고드립니다.
              </p>
            </div>
            <button onClick={() => setAnnualLeaveNotice(null)} className="w-full py-4 bg-[#3182F6] text-white text-[13px] font-semibold rounded-[12px] hover:bg-[#1B64DA] transition-all">확인했습니다</button>
          </div>
        </div>
      )}
    </div>
  );
}
