'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import StaffHistoryTimeline from './인사이력타임라인';
import OnboardingChecklist from './급여명세/입퇴사온보딩';
import CertTransferPanel from './교육자격인사이동패널';

// ESLint가 React 컴포넌트로 인식하도록 함수 이름을
// 영문 대문자로 시작하는 형태로 지정합니다.
// default export이므로 외부 import 이름(구성원관리 등)은 그대로 사용 가능합니다.
export default function StaffListManager({ 직원목록 = [], 부서목록 = [], 선택사업체, 보기상태 = '재직', 새로고침, 창상태, 창닫기, onOpenDocumentRepoForStaff, onOpenNewStaff }: any) {
  const [편집모드, 편집모드설정] = useState(false);
  const [선택된직원ID, 선택된직원ID설정] = useState<number | null>(null);
  const [근무형태목록, 근무형태목록설정] = useState<any[]>([]);
  const [팀목록캐시, 팀목록캐시설정] = useState<Record<string, string[]>>({});
  const [신규직원, 신규직원설정] = useState({
    성명: '', 전화번호: '', 내선번호: '', 사업체: '박철홍정형외과', 팀: '원무팀', 직함: '', 입사일: '', 퇴사일: '',
    주민번호: '', 이메일: '', 주소: '', 면허사항: '', 계좌정보: '', 임금정보: '', 상태: '재직',
    연차총개수: 0, 연차사용개수: 0, 근무형태ID: '',
    base_salary: 0,
    meal_allowance: 0, night_duty_allowance: 0, vehicle_allowance: 0, childcare_allowance: 0, research_allowance: 0, other_taxfree: 0, position_allowance: 0
  });

  // ESS (직원 셀프 서비스) 승인 대기함 관련
  const [essRequests, setEssRequests] = useState<any[]>([]);
  const [showEssModal, setShowEssModal] = useState(false);

  useEffect(() => {
    const fetchEssRequests = async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('target_type', 'ESS_PROFILE_UPDATE_PENDING')
        .order('created_at', { ascending: false });
      if (data) setEssRequests(data);
    };
    fetchEssRequests();
  }, [새로고침]);

  const handleApproveEss = async (request: any) => {
    if (!confirm(`${request.user_name}님의 정보 변경 요청을 승인하시겠습니까?`)) return;
    try {
      const updates = request.details.requested_changes;
      // 1. 실제 직원 정보 업데이트
      await supabase.from('staff_members').update(updates).eq('id', request.target_id);
      // 2. 요청 상태 변경
      await supabase.from('audit_logs').update({ target_type: 'ESS_PROFILE_UPDATE_APPROVED' }).eq('id', request.id);

      alert('승인되었습니다.');
      setEssRequests(prev => prev.filter(r => r.id !== request.id));
      새로고침();
    } catch (error) {
      alert('승인 처리 중 오류 발생');
    }
  };

  const handleRejectEss = async (request: any) => {
    if (!confirm(`${request.user_name}님의 정보 변경 요청을 반려하시겠습니까?`)) return;
    try {
      await supabase.from('audit_logs').update({ target_type: 'ESS_PROFILE_UPDATE_REJECTED' }).eq('id', request.id);
      alert('반려되었습니다.');
      setEssRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (error) {
      alert('반려 처리 중 오류 발생');
    }
  };

  useEffect(() => {
    const fetchShifts = async () => {
      const { data } = await supabase.from('work_shifts').select('*');
      if (data) 근무형태목록설정(data);
    };
    fetchShifts();
  }, []);

  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await supabase.from('org_teams').select('company_name, team_name, division').order('division').order('sort_order');
      if (!data || data.length === 0) return;
      const byCo: Record<string, string[]> = {};
      (data as any[]).forEach((r: any) => {
        if (!byCo[r.company_name]) byCo[r.company_name] = [];
        byCo[r.company_name].push(r.team_name);
      });
      팀목록캐시설정(prev => ({ ...prev, ...byCo }));
    };
    fetchTeams();
  }, []);

  const 팀목록가져오기 = (회사: string) => {
    if (팀목록캐시[회사]?.length) return 팀목록캐시[회사];
    if (회사 === 'SY INC.') return ['경영지원팀', '재무팀', '인사팀', '전략기획팀', '마케팅팀'];
    return ['진료부', '간호부', '총무부', '진료팀', '병동팀', '수술팀', '외래팀', '외래간호팀', '검사팀', '원무팀', '총무팀', '행정팀', '관리팀', '영양팀'];
  };

  const 정보저장 = async () => {
    if (!신규직원.성명 || !신규직원.입사일) return alert('성함과 입사일은 필수 입력 사항입니다.');
    try {
      const commonData = {
        name: 신규직원.성명, phone: 신규직원.전화번호, extension: 신규직원.내선번호 || null, company: 신규직원.사업체, department: 신규직원.팀 === '' ? null : 신규직원.팀,
        position: 신규직원.직함, resident_no: 신규직원.주민번호, email: 신규직원.이메일, address: 신규직원.주소,
        license: 신규직원.면허사항, bank_account: 신규직원.계좌정보, salary_info: 신규직원.임금정보,
        joined_at: 신규직원.입사일, resigned_at: 신규직원.퇴사일 || null, status: 신규직원.상태,
        annual_leave_total: 0,
        annual_leave_used: 0,
        shift_id: 신규직원.근무형태ID || null,
        base_salary: 신규직원.base_salary,
        meal_allowance: 신규직원.meal_allowance ?? 0, night_duty_allowance: 신규직원.night_duty_allowance ?? 0,
        vehicle_allowance: 신규직원.vehicle_allowance ?? 0, childcare_allowance: 신규직원.childcare_allowance ?? 0, research_allowance: 신규직원.research_allowance ?? 0,
        other_taxfree: 신규직원.other_taxfree ?? 0, position_allowance: 신규직원.position_allowance ?? 0
      };

      if (편집모드 && 선택된직원ID) {
        await supabase.from('staff_members').update(commonData).eq('id', 선택된직원ID);
        alert('직원 정보가 수정되었습니다.');
      } else {
        const { data: maxNo } = await supabase.from('staff_members').select('employee_no').order('employee_no', { ascending: false }).limit(1).single();
        const lastNo = typeof maxNo?.employee_no === 'number' ? maxNo.employee_no : parseInt(String(maxNo?.employee_no || '0'), 10) || 0;
        const newEmployeeNo = String(Math.max(21, lastNo + 1));
        const { error: insertErr } = await supabase.from('staff_members').insert([{ ...commonData, employee_no: newEmployeeNo, role: 'staff', password: '', join_date: 신규직원.입사일 || null }]);
        if (insertErr) {
          console.error(insertErr);
          return alert('직원 등록 실패: ' + (insertErr.message || 'DB 오류'));
        }
        alert(`직원 등록 완료!\n로그인 아이디: 사번 ${newEmployeeNo} 또는 이름 ${신규직원.성명}\n(동명이인이 있으면 사번으로 로그인하세요)`);
      }
      닫기함수(); 새로고침();
    } catch (error) { alert('처리 중 오류가 발생했습니다.'); }
  };

  const 수정시작 = (직원: any) => {
    선택된직원ID설정(직원.id);
    신규직원설정({
      성명: 직원.name || '', 전화번호: 직원.phone || '', 내선번호: 직원.extension || '', 사업체: 직원.company || '박철홍정형외과',
      팀: 직원.department ?? '', 직함: 직원.position || '', 입사일: 직원.joined_at || '',
      퇴사일: 직원.resigned_at || '', 주민번호: 직원.resident_no || '', 이메일: 직원.email || '',
      주소: 직원.address || '', 면허사항: 직원.license || '', 계좌정보: 직원.bank_account || '',
      임금정보: 직원.salary_info || '', 상태: 직원.status || '재직',
      연차총개수: typeof 직원.annual_leave_total === 'number' ? 직원.annual_leave_total : 0,
      연차사용개수: 직원.annual_leave_used || 0, 근무형태ID: 직원.shift_id || '',
      base_salary: 직원.base_salary || 0,
      meal_allowance: 직원.meal_allowance ?? 0, night_duty_allowance: 직원.night_duty_allowance ?? 0,
      vehicle_allowance: 직원.vehicle_allowance ?? 0, childcare_allowance: 직원.childcare_allowance ?? 0, research_allowance: 직원.research_allowance ?? 0,
      other_taxfree: 직원.other_taxfree ?? 0, position_allowance: 직원.position_allowance ?? 0
    });
    편집모드설정(true);
  };

  const 닫기함수 = () => {
    편집모드설정(false); 선택된직원ID설정(null);
    신규직원설정({
      성명: '', 전화번호: '', 내선번호: '', 사업체: '박철홍정형외과', 팀: '원무팀', 직함: '', 입사일: '', 퇴사일: '',
      주민번호: '', 이메일: '', 주소: '', 면허사항: '', 계좌정보: '', 임금정보: '', 상태: '재직',
      연차총개수: 0, 연차사용개수: 0, 근무형태ID: '',
      base_salary: 0,
      meal_allowance: 0, night_duty_allowance: 0, vehicle_allowance: 0, childcare_allowance: 0, research_allowance: 0, other_taxfree: 0, position_allowance: 0
    });
    창닫기();
  };

  const 직원삭제 = async (직원: any) => {
    if (!confirm(`${직원.name} 직원을 삭제(퇴사 처리) 하시겠습니까?`)) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      await supabase
        .from('staff_members')
        .update({
          status: '퇴사',
          resigned_at: 직원.resigned_at || today,
        })
        .eq('id', 직원.id);
      alert('직원이 삭제(퇴사 처리)되었습니다.');
      if (선택된직원ID === 직원.id) {
        닫기함수();
      }
      새로고침();
    } catch (e) {
      alert('직원 삭제 중 오류가 발생했습니다.');
    }
  };

  const 필터목록 = 직원목록.filter((s: any) => {
    const companyMatch = 선택사업체 === '전체' ? true : s.company === 선택사업체;
    const status = s.status || '재직';
    if (보기상태 === '퇴사') {
      return companyMatch && status === '퇴사';
    }
    // 기본은 재직자 위주
    return companyMatch && status !== '퇴사';
  });

  return (
    <div className="flex flex-col h-full app-page">
      <header className="p-6 md:p-8 border-b border-[var(--toss-border)] bg-[var(--toss-card)] shrink-0 flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-[var(--foreground)] tracking-tighter italic">
            {보기상태 === '퇴사' ? '퇴사자 현황' : '실시간 구성원 현황'}{' '}
            <span className="text-sm text-[var(--toss-blue)]">[{선택사업체}]</span>
          </h2>
          <p className="text-[11px] md:text-xs text-[var(--toss-gray-3)] font-bold">
            {보기상태 === '퇴사'
              ? '퇴사 처리된 직원만 표시됩니다.'
              : '재직 중인 직원만 표시됩니다.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {essRequests.length > 0 && (
            <button
              onClick={() => setShowEssModal(true)}
              className="relative bg-amber-100 text-amber-800 px-4 py-2 text-[11px] font-bold rounded-[12px] hover:bg-amber-200 transition-all shadow-sm ring-1 ring-amber-300"
            >
              내정보 변경 요청
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white flex items-center justify-center rounded-full text-[10px] shadow-sm animate-bounce">
                {essRequests.length}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenNewStaff && onOpenNewStaff()}
            className="bg-[var(--toss-blue)] text-white px-5 py-2.5 text-[11px] font-bold rounded-[12px] shadow-md hover:opacity-95 transition-all"
          >
            신규 직원 등록
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        {선택된직원ID && (
          <div className="mb-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StaffHistoryTimeline staffId={선택된직원ID} staffName={필터목록.find((s: any) => s.id === 선택된직원ID)?.name || 직원목록.find((s: any) => s.id === 선택된직원ID)?.name || ''} />
              <div className="flex gap-4 flex-wrap">
                <OnboardingChecklist staffId={String(선택된직원ID)} staffName={필터목록.find((s: any) => s.id === 선택된직원ID)?.name || ''} type="입사" />
                <OnboardingChecklist staffId={String(선택된직원ID)} staffName={필터목록.find((s: any) => s.id === 선택된직원ID)?.name || ''} type="퇴사" />
              </div>
            </div>
            <CertTransferPanel staffId={String(선택된직원ID)} staffName={필터목록.find((s: any) => s.id === 선택된직원ID)?.name || ''} />
          </div>
        )}
        {/* PC 버전 테이블 */}
        <div className="hidden md:block bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] overflow-hidden shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--toss-gray-1)] text-[11px] font-semibold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] uppercase tracking-widest">
              <tr><th className="p-6">사번</th><th className="p-6">성명/직함</th><th className="p-6">소속</th><th className="p-6">부서/팀</th><th className="p-6">근무형태</th><th className="p-6">상태</th><th className="p-6 text-right">관리</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {필터목록.map((직원: any) => (
                <tr key={직원.id} className="hover:bg-[var(--toss-blue-light)]/30 transition-all">
                  <td className="p-6 font-semibold text-[var(--toss-blue)] text-xs">{직원.employee_no}</td>
                  <td className="p-6">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{직원.name}</p>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{직원.position || '-'}</p>
                  </td>
                  <td className="p-6 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">{직원.company}</td>
                  <td className="p-6 text-xs font-bold text-[var(--toss-gray-4)]">{직원.department}</td>
                  <td className="p-6">
                    <span className="px-3 py-1 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] text-[11px] font-semibold rounded-full">
                      {근무형태목록.find(s => s.id === 직원.shift_id)?.name || '기본(09-18)'}
                    </span>
                  </td>
                  <td className="p-6">
                    <span className={`px-3 py-1 text-[11px] font-semibold rounded-full ${직원.status === '퇴사' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {직원.status || '재직중'}
                    </span>
                  </td>
                  <td className="p-6 text-right space-x-2">
                    <button
                      onClick={() => 수정시작(직원)}
                      className="px-4 py-2 bg-[var(--foreground)] text-white text-[11px] font-semibold rounded-[12px] hover:opacity-90 transition-all"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => 직원삭제(직원)}
                      className="px-3 py-2 bg-red-50 text-red-600 text-[11px] font-semibold rounded-[12px] hover:bg-red-100 transition-all"
                    >
                      삭제
                    </button>
                    {onOpenDocumentRepoForStaff && (
                      <button
                        onClick={() => onOpenDocumentRepoForStaff(직원)}
                        className="px-3 py-2 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] text-[11px] font-semibold rounded-[12px] hover:opacity-90 transition-all"
                      >
                        문서
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 버전 카드 리스트 */}
        <div className="md:hidden grid grid-cols-1 gap-4">
          {필터목록.map((직원: any) => (
            <div key={직원.id} className="bg-[var(--toss-card)] p-6 rounded-[16px] border border-[var(--toss-border)] shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[var(--toss-blue-light)] rounded-[12px] flex items-center justify-center text-[var(--toss-blue)] font-semibold text-xs">#{직원.employee_no}</div>
                  <div>
                    <h4 className="text-base font-semibold text-[var(--foreground)]">{직원.name}</h4>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{직원.company} · {직원.position}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 text-[11px] font-semibold rounded-full ${직원.status === '퇴사' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{직원.status || '재직중'}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--toss-border)]">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">부서</p>
                  <p className="text-xs font-bold text-[var(--foreground)]">{직원.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">근무형태</p>
                  <p className="text-xs font-bold text-[var(--foreground)]">{근무형태목록.find(s => s.id === 직원.shift_id)?.name || '기본'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => 수정시작(직원)}
                  className="flex-1 py-3 bg-[var(--toss-gray-1)] text-[var(--foreground)] text-[11px] font-semibold rounded-[12px] hover:opacity-90 transition-all"
                >
                  정보 수정하기
                </button>
                <button
                  onClick={() => 직원삭제(직원)}
                  className="px-3 py-3 bg-red-50 text-red-600 text-[11px] font-semibold rounded-[12px] hover:bg-red-100 transition-all"
                >
                  삭제
                </button>
                {onOpenDocumentRepoForStaff && (
                  <button
                    onClick={() => onOpenDocumentRepoForStaff(직원)}
                    className="px-3 py-3 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] text-[11px] font-semibold rounded-[12px] hover:opacity-90 transition-all"
                  >
                    문서
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 등록/수정 모달 - 모바일 최적화 */}
      {(창상태 || 편집모드) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-end md:items-center justify-center p-0 md:p-4" onClick={닫기함수}>
          <div className="bg-[var(--toss-card)] w-full max-w-5xl rounded-t-[2.5rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-8 border-b-4 border-[var(--foreground)] pb-4">
              <h3 className="text-xl md:text-2xl font-semibold text-[var(--foreground)] tracking-tighter italic">{편집모드 ? '구성원 정보 수정' : '신규 직원 등록'}</h3>
              <button onClick={닫기함수} className="text-[var(--toss-gray-3)] hover:text-red-500 text-2xl">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <h4 className="text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-widest">기본 인적 사항</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">성명 *</label>
                    <input type="text" value={신규직원.성명} onChange={e => 신규직원설정({ ...신규직원, 성명: e.target.value })} className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">주민번호</label>
                    <input
                      type="text"
                      value={신규직원.주민번호}
                      maxLength={14}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 13);
                        const formatted = raw.length > 6 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
                        신규직원설정({ ...신규직원, 주민번호: formatted });
                      }}
                      className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                      placeholder="000000-0000000"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">연락처 (개인)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={신규직원.전화번호}
                    onChange={e => {
                      let raw = e.target.value.replace(/[^0-9]/g, '');
                      let formatted = '';
                      if (raw.startsWith('010')) {
                        raw = raw.slice(0, 11);
                        if (raw.length <= 3) formatted = raw;
                        else if (raw.length <= 7) formatted = raw.slice(0, 3) + '-' + raw.slice(3);
                        else formatted = raw.slice(0, 3) + '-' + raw.slice(3, 7) + '-' + raw.slice(7);
                      } else if (raw.startsWith('02')) {
                        raw = raw.slice(0, 9);
                        if (raw.length <= 2) formatted = raw;
                        else if (raw.length <= 5) formatted = raw.slice(0, 2) + '-' + raw.slice(2);
                        else formatted = raw.slice(0, 2) + '-' + raw.slice(2, 5) + '-' + raw.slice(5);
                      } else {
                        raw = raw.slice(0, 10);
                        if (raw.length <= 3) formatted = raw;
                        else if (raw.length <= 6) formatted = raw.slice(0, 3) + '-' + raw.slice(3);
                        else formatted = raw.slice(0, 3) + '-' + raw.slice(3, 6) + '-' + raw.slice(6);
                      }
                      신규직원설정({ ...신규직원, 전화번호: formatted });
                    }}
                    placeholder="010-1234-5678"
                    className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">내선번호</label>
                  <input
                    type="text"
                    value={신규직원.내선번호}
                    onChange={e => 신규직원설정({ ...신규직원, 내선번호: e.target.value })}
                    placeholder="예: 1234"
                    className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">주소</label>
                  <input type="text" value={신규직원.주소} onChange={e => 신규직원설정({ ...신규직원, 주소: e.target.value })} className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30" />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-widest">소속 및 인사 정보</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">사업체</label>
                    <select value={신규직원.사업체} onChange={e => 신규직원설정({ ...신규직원, 사업체: e.target.value, 팀: 팀목록가져오기(e.target.value)[0] ?? '' })} className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30">
                      <option value="박철홍정형외과">박철홍정형외과</option>
                      <option value="수연의원">수연의원</option>
                      <option value="SY INC.">SY INC.</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">부서/팀</label>
                    <select value={신규직원.팀} onChange={e => 신규직원설정({ ...신규직원, 팀: e.target.value })} className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30">
                      <option value="">팀 선택 안함</option>
                      {팀목록가져오기(신규직원.사업체).map(팀 => <option key={팀} value={팀}>{팀}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">직함</label>
                    <select value={신규직원.직함} onChange={e => 신규직원설정({ ...신규직원, 직함: e.target.value })} className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30">
                      <option value="">선택</option>
                      <option value="사원">사원</option>
                      <option value="주임">주임</option>
                      <option value="대리">대리</option>
                      <option value="팀장">팀장</option>
                      <option value="간호과장">간호과장</option>
                      <option value="간호부장">간호부장</option>
                      <option value="실장">실장</option>
                      <option value="부장">부장</option>
                      <option value="진료부장">진료부장</option>
                      <option value="총무부장">총무부장</option>
                      <option value="이사">이사</option>
                      <option value="원장">원장</option>
                      <option value="병원장">병원장</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">입사일 *</label>
                    <input
                      type="date"
                      value={신규직원.입사일}
                      onChange={e => {
                        let v = e.target.value || '';
                        if (v.length > 10 && v.match(/^\d{5,}/)) {
                          v = v.replace(/^(\d{4})\d+(-\d{2}-\d{2})?/, (_m: string, y: string, rest: string) => rest ? y + rest : y);
                        }
                        신규직원설정({ ...신규직원, 입사일: v });
                      }}
                      className="w-full p-3 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">근무 형태 (근무·휴게시간)</label>
                  <select value={신규직원.근무형태ID} onChange={e => 신규직원설정({ ...신규직원, 근무형태ID: e.target.value })} className="w-full p-3 bg-[var(--toss-blue-light)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30">
                    <option value="">기본 근무 (09:00–18:00, 휴게 60분)</option>
                    {근무형태목록.filter((s: any) => s.company_name === 신규직원.사업체 || s.company === 신규직원.사업체).map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.start_time}~{s.end_time}{s.break_minutes != null ? `, 휴게 ${s.break_minutes}분` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 bg-[var(--toss-gray-1)] p-6 rounded-[16px]">
                <h4 className="text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-widest">급여·비과세 (근로계약서/통상임금 연동)</h4>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'base_salary', label: '기본급 (월)', placeholder: '0' },
                    { key: 'position_allowance', label: '직책수당 (월)', placeholder: '0' },
                    { key: 'meal_allowance', label: '식대 (비과세 한도 20만)', placeholder: '0' },
                    { key: 'vehicle_allowance', label: '자가운전 (비과세 한도 20만)', placeholder: '0' },
                    { key: 'childcare_allowance', label: '보육수당 (비과세)', placeholder: '0' },
                    { key: 'research_allowance', label: '연구활동비 (비과세 한도 20만)', placeholder: '0' },
                  ].map(({ key, label, placeholder }) => {
                    const val = Number(신규직원[key as keyof typeof 신규직원] ?? 0);
                    return (
                      <div key={key} className="space-y-1">
                        <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">{label}</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={val ? val.toLocaleString() : ''}
                          onChange={e => {
                            const n = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
                            신규직원설정({ ...신규직원, [key]: n });
                          }}
                          placeholder={placeholder}
                          className="w-full p-3 bg-[var(--toss-card)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                        />
                      </div>
                    );
                  })}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[11px] font-semibold text-[var(--toss-gray-3)]">기타 비과세</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={(신규직원.other_taxfree ?? 0) ? Number(신규직원.other_taxfree).toLocaleString() : ''}
                      onChange={e => {
                        const n = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
                        신규직원설정({ ...신규직원, other_taxfree: n });
                      }}
                      placeholder="0"
                      className="w-full p-3 bg-[var(--toss-card)] rounded-[12px] border-none outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--toss-blue)]/30"
                    />
                  </div>
                </div>
                <p className="text-[8px] font-bold text-[var(--toss-gray-3)] leading-tight">* 등록 후 인사관리 → 계약관리에서 근로계약서 발송 시 통상임금 표가 자동으로 포함됩니다.</p>
              </div>
            </div>

            <div className="mt-10 flex gap-3">
              <button onClick={닫기함수} className="flex-1 py-4 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-[12px] font-semibold text-sm hover:opacity-90 transition-all">취소</button>
              <button onClick={정보저장} className="flex-[2] py-4 bg-[var(--toss-blue)] text-white rounded-[12px] font-semibold text-sm shadow-xl hover:scale-[0.99] active:scale-95 transition-all">정보 저장하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ESS 승인 대기함 모달 */}
      {showEssModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4 min-h-screen" onClick={() => setShowEssModal(false)}>
          <div className="bg-[var(--page-bg)] w-full max-w-3xl rounded-[24px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[var(--toss-border)] flex justify-between items-center bg-[var(--toss-card)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--foreground)]">내정보 변경 요청 (ESS)</h3>
                <p className="text-xs text-[var(--toss-gray-3)] mt-1">직원들이 요청한 프로필 변경 사항을 검토하고 승인하세요.</p>
              </div>
              <button onClick={() => setShowEssModal(false)} className="text-[var(--toss-gray-3)] hover:text-red-500 text-xl font-bold">✕</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-[var(--toss-gray-1)]">
              {essRequests.length === 0 ? (
                <div className="py-20 text-center text-[var(--toss-gray-3)] font-medium text-sm">
                  대기 중인 변경 요청이 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {essRequests.map(req => {
                    const changes = req.details.requested_changes || {};
                    const original = req.details.original_data || {};
                    // 바뀐 항목만 필터링
                    const changedKeys = Object.keys(changes).filter(k => changes[k] !== original[k]);

                    const fieldLabels: Record<string, string> = {
                      email: '이메일', phone: '연락처', extension: '내선번호',
                      address: '거주지 주소', bank_name: '급여 은행', account_no: '급여 계좌명'
                    };

                    return (
                      <div key={req.id} className="bg-[var(--toss-card)] rounded-[16px] border border-[var(--toss-border)] shadow-sm p-5 space-y-4">
                        <div className="flex justify-between items-center border-b border-[var(--toss-border)] pb-3">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-full bg-[var(--toss-blue-light)] text-[var(--toss-blue)] flex items-center justify-center font-bold">{req.user_name?.[0]}</span>
                            <div>
                              <p className="font-bold text-[var(--foreground)] text-sm">{req.user_name} <span className="text-xs font-medium text-[var(--toss-gray-3)] ml-1">님의 변경 요청</span></p>
                              <p className="text-[10px] text-[var(--toss-gray-3)]">{new Date(req.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {changedKeys.length === 0 ? (
                            <p className="text-xs text-[var(--toss-gray-4)] p-2">변경된 실질 항목이 없습니다.</p>
                          ) : (
                            changedKeys.map(k => (
                              <div key={k} className="p-3 bg-[var(--toss-gray-1)] rounded-[12px] flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-[var(--toss-blue)] uppercase tracking-wider">{fieldLabels[k] || k}</span>
                                <div className="text-xs font-semibold text-[var(--foreground)] break-words">
                                  <span className="line-through text-[var(--toss-gray-3)] text-[11px] block">{original[k] || '(빈 값)'}</span>
                                  <span className="text-emerald-600 block mt-0.5">→ {changes[k] || '(빈 값)'}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button onClick={() => handleRejectEss(req)} className="px-5 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-[12px] font-semibold text-[11px] transition-colors">반려</button>
                          <button onClick={() => handleApproveEss(req)} className="px-5 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 rounded-[12px] font-semibold text-[11px] transition-colors shadow-sm">승인하기</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {essRequests.length > 0 && (
              <div className="bg-[var(--toss-card)] p-4 border-t border-[var(--toss-border)] text-center">
                <p className="text-xs font-semibold text-[var(--toss-gray-4)]">총 <span className="text-[var(--toss-blue)]">{essRequests.length}건</span>의 리뷰 대기 건이 있습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
