'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import StaffHistoryTimeline from './인사이력타임라인';
import OnboardingChecklist from './급여명세/입퇴사온보딩';
import CertTransferPanel from './교육자격인사이동패널';

// ESLint가 React 컴포넌트로 인식하도록 함수 이름을
// 영문 대문자로 시작하는 형태로 지정합니다.
// default export이므로 외부 import 이름(구성원관리 등)은 그대로 사용 가능합니다.
export default function StaffListManager({ 직원목록 = [], 부서목록 = [], 선택사업체, 보기상태 = '재직', 새로고침, 창상태, 창닫기, onOpenDocumentRepoForStaff }: any) {
  const [편집모드, 편집모드설정] = useState(false);
  const [선택된직원ID, 선택된직원ID설정] = useState<number | null>(null);
  const [근무형태목록, 근무형태목록설정] = useState<any[]>([]);
  const [팀목록캐시, 팀목록캐시설정] = useState<Record<string, string[]>>({});
  const [신규직원, 신규직원설정] = useState({
    성명: '', 전화번호: '', 사업체: '박철홍정형외과', 팀: '원무팀', 직함: '', 입사일: '', 퇴사일: '',
    주민번호: '', 이메일: '', 주소: '', 면허사항: '', 계좌정보: '', 임금정보: '', 상태: '재직',
    // 신규 입사 시 잔여 연차(총개수)를 0에서 시작하도록 설정
    연차총개수: 0, 연차사용개수: 0, 근무형태ID: '',
    base_salary: 0
  });

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
    return ['진료부', '진료팀', '병동팀', '수술팀', '외래팀', '검사팀', '원무팀', '총무팀', '행정팀', '관리팀'];
  };

  const 정보저장 = async () => {
    if (!신규직원.성명 || !신규직원.입사일) return alert('성함과 입사일은 필수 입력 사항입니다.');
    try {
      const commonData = {
        name: 신규직원.성명, phone: 신규직원.전화번호, company: 신규직원.사업체, department: 신규직원.팀,
        position: 신규직원.직함, resident_no: 신규직원.주민번호, email: 신규직원.이메일, address: 신규직원.주소,
        license: 신규직원.면허사항, bank_account: 신규직원.계좌정보, salary_info: 신규직원.임금정보,
        joined_at: 신규직원.입사일, resigned_at: 신규직원.퇴사일 || null, status: 신규직원.상태,
        // 신규 입사 시 연차는 무조건 0에서 시작
        annual_leave_total: 0,
        annual_leave_used: 0,
        shift_id: 신규직원.근무형태ID || null,
        base_salary: 신규직원.base_salary
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
        alert(`직원 등록 완료! 로그인 아이디(이름): ${신규직원.성명}`);
      }
      닫기함수(); 새로고침();
    } catch (error) { alert('처리 중 오류가 발생했습니다.'); }
  };

  const 수정시작 = (직원: any) => {
    선택된직원ID설정(직원.id);
    신규직원설정({
      성명: 직원.name || '', 전화번호: 직원.phone || '', 사업체: 직원.company || '박철홍정형외과',
      팀: 직원.department || '원무팀', 직함: 직원.position || '', 입사일: 직원.joined_at || '',
      퇴사일: 직원.resigned_at || '', 주민번호: 직원.resident_no || '', 이메일: 직원.email || '',
      주소: 직원.address || '', 면허사항: 직원.license || '', 계좌정보: 직원.bank_account || '',
      임금정보: 직원.salary_info || '', 상태: 직원.status || '재직',
      연차총개수: typeof 직원.annual_leave_total === 'number' ? 직원.annual_leave_total : 0,
      연차사용개수: 직원.annual_leave_used || 0, 근무형태ID: 직원.shift_id || '',
      base_salary: 직원.base_salary || 0
    });
    편집모드설정(true);
  };

  const 닫기함수 = () => {
    편집모드설정(false); 선택된직원ID설정(null);
    신규직원설정({
      성명: '', 전화번호: '', 사업체: '박철홍정형외과', 팀: '원무팀', 직함: '', 입사일: '', 퇴사일: '',
      주민번호: '', 이메일: '', 주소: '', 면허사항: '', 계좌정보: '', 임금정보: '', 상태: '재직',
      연차총개수: 0, 연차사용개수: 0, 근무형태ID: '',
      base_salary: 0
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
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      <header className="p-6 md:p-8 border-b border-gray-100 bg-white shrink-0 flex items-center justify-between">
        <h2 className="text-xl font-black text-gray-800 tracking-tighter italic">
          {보기상태 === '퇴사' ? '퇴사자 현황' : '실시간 구성원 현황'}{' '}
          <span className="text-sm text-blue-600">[{선택사업체}]</span>
        </h2>
        <p className="text-[10px] md:text-xs text-gray-400 font-bold">
          {보기상태 === '퇴사'
            ? '퇴사 처리된 직원만 표시됩니다.'
            : '재직 중인 직원만 표시됩니다.'}
        </p>
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
        <div className="hidden md:block bg-white border border-gray-100 rounded-[2rem] overflow-hidden shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 border-b border-gray-100 uppercase tracking-widest">
              <tr><th className="p-6">사번</th><th className="p-6">성명/직함</th><th className="p-6">소속</th><th className="p-6">부서/팀</th><th className="p-6">근무형태</th><th className="p-6">상태</th><th className="p-6 text-right">관리</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {필터목록.map((직원: any) => (
                <tr key={직원.id} className="hover:bg-blue-50/30 transition-all">
                  <td className="p-6 font-black text-blue-600 text-xs">{직원.employee_no}</td>
                  <td className="p-6">
                    <p className="text-sm font-black text-gray-800">{직원.name}</p>
                    <p className="text-[10px] font-bold text-gray-400">{직원.position || '-'}</p>
                  </td>
                  <td className="p-6 text-[10px] font-black text-gray-400 uppercase">{직원.company}</td>
                  <td className="p-6 text-xs font-bold text-gray-500">{직원.department}</td>
                  <td className="p-6">
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-[9px] font-black rounded-full">
                      {근무형태목록.find(s => s.id === 직원.shift_id)?.name || '기본(09-18)'}
                    </span>
                  </td>
                  <td className="p-6">
                    <span className={`px-3 py-1 text-[9px] font-black rounded-full ${직원.status === '퇴사' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {직원.status || '재직중'}
                    </span>
                  </td>
                  <td className="p-6 text-right space-x-2">
                    <button
                      onClick={() => 수정시작(직원)}
                      className="px-4 py-2 bg-gray-800 text-white text-[10px] font-black rounded-xl hover:bg-black transition-all"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => 직원삭제(직원)}
                      className="px-3 py-2 bg-red-50 text-red-600 text-[10px] font-black rounded-xl hover:bg-red-100 transition-all"
                    >
                      삭제
                    </button>
                    {onOpenDocumentRepoForStaff && (
                      <button
                        onClick={() => onOpenDocumentRepoForStaff(직원)}
                        className="px-3 py-2 bg-blue-50 text-blue-600 text-[10px] font-black rounded-xl hover:bg-blue-100 transition-all"
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
            <div key={직원.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-xs">#{직원.employee_no}</div>
                  <div>
                    <h4 className="text-base font-black text-gray-900">{직원.name}</h4>
                    <p className="text-[10px] font-bold text-gray-400">{직원.company} · {직원.position}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 text-[9px] font-black rounded-full ${직원.status === '퇴사' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{직원.status || '재직중'}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                <div>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">부서</p>
                  <p className="text-xs font-bold text-gray-700">{직원.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">근무형태</p>
                  <p className="text-xs font-bold text-gray-700">{근무형태목록.find(s => s.id === 직원.shift_id)?.name || '기본'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => 수정시작(직원)}
                  className="flex-1 py-3 bg-gray-50 text-gray-800 text-[11px] font-black rounded-xl hover:bg-gray-100 transition-all"
                >
                  정보 수정하기
                </button>
                <button
                  onClick={() => 직원삭제(직원)}
                  className="px-3 py-3 bg-red-50 text-red-600 text-[11px] font-black rounded-xl hover:bg-red-100 transition-all"
                >
                  삭제
                </button>
                {onOpenDocumentRepoForStaff && (
                  <button
                    onClick={() => onOpenDocumentRepoForStaff(직원)}
                    className="px-3 py-3 bg-blue-50 text-blue-600 text-[11px] font-black rounded-xl hover:bg-blue-100 transition-all"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-4" onClick={닫기함수}>
          <div className="bg-white w-full max-w-5xl rounded-t-[2.5rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-8 border-b-4 border-gray-900 pb-4">
              <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tighter italic">{편집모드 ? '구성원 정보 수정' : '신규 직원 등록'}</h3>
              <button onClick={닫기함수} className="text-gray-300 hover:text-red-500 text-2xl">✕</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">기본 인적 사항</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400">성명 *</label>
                    <input type="text" value={신규직원.성명} onChange={e => 신규직원설정({...신규직원, 성명: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400">주민번호</label>
                    <input
                      type="text"
                      value={신규직원.주민번호}
                      maxLength={14}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 13);
                        const formatted = raw.length > 6 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
                        신규직원설정({ ...신규직원, 주민번호: formatted });
                      }}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100"
                      placeholder="000000-0000000"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400">연락처</label>
                  <input type="text" value={신규직원.전화번호} onChange={e => 신규직원설정({...신규직원, 전화번호: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400">주소</label>
                  <input type="text" value={신규직원.주소} onChange={e => 신규직원설정({...신규직원, 주소: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100" />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">소속 및 인사 정보</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400">사업체</label>
                    <select value={신규직원.사업체} onChange={e => 신규직원설정({...신규직원, 사업체: e.target.value, 팀: 팀목록가져오기(e.target.value)[0]})} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100">
                      <option value="박철홍정형외과">박철홍정형외과</option>
                      <option value="수연의원">수연의원</option>
                      <option value="SY INC.">SY INC.</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400">부서/팀</label>
                    <select value={신규직원.팀} onChange={e => 신규직원설정({...신규직원, 팀: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100">
                      {팀목록가져오기(신규직원.사업체).map(팀 => <option key={팀} value={팀}>{팀}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400">직함</label>
                    <input type="text" value={신규직원.직함} onChange={e => 신규직원설정({...신규직원, 직함: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400">입사일 *</label>
                    <input type="date" value={신규직원.입사일} onChange={e => 신규직원설정({...신규직원, 입사일: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400">근무 형태</label>
                  <select value={신규직원.근무형태ID} onChange={e => 신규직원설정({...신규직원, 근무형태ID: e.target.value})} className="w-full p-3 bg-blue-50 rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100">
                    <option value="">기본 근무 (09:00 - 18:00)</option>
                    {근무형태목록.filter(s => s.company === 신규직원.사업체).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.start_time}-{s.end_time})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 bg-gray-50 p-6 rounded-[2rem]">
                <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">기초 급여 설정 (정산 연동)</h4>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400">기본급 (월)</label>
                    <input type="number" value={신규직원.base_salary} onChange={e => 신규직원설정({...신규직원, base_salary: Number(e.target.value)})} className="w-full p-3 bg-white rounded-xl border-none outline-none font-black text-xs focus:ring-2 focus:ring-blue-100" placeholder="0" />
                  </div>
                  <p className="text-[8px] font-bold text-gray-400 leading-tight">* 비과세 항목은 인사관리 → 계약관리에서 근로계약서/변경계약서 발송 시 등록합니다.</p>
                </div>
              </div>
            </div>

            <div className="mt-10 flex gap-3">
              <button onClick={닫기함수} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all">취소</button>
              <button onClick={정보저장} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-100 hover:scale-[0.99] active:scale-95 transition-all">정보 저장하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
