'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import StaffHistoryTimeline from './인사이력타임라인';
import OnboardingChecklist from './급여명세/입퇴사온보딩';
import CertTransferPanel from './교육자격인사이동패널';
import SmartDatePicker from '../공통/SmartDatePicker';

function createEmptyStaffForm(selectedCompany?: string) {
  const company = selectedCompany && selectedCompany !== '전체' ? selectedCompany : '박철홍정형외과';

  return {
    성명: '', 전화번호: '', 내선번호: '', 사업체: company, 팀: '원무팀', 직함: '', 입사일: '', 퇴사일: '',
    주민번호: '', 이메일: '', 주소: '', 면허사항: '', 면허번호: '', 취득일자: '', 면허기타내용: '', 계좌정보: '', 임금정보: '', 상태: '재직',
    연차총개수: 0, 연차사용개수: 0, 근무형태ID: '',
    고용형태: '정규직' as string, 계약종료일: '' as string,
    probation_months: 0,
    base_salary: 0,
    meal_allowance: 0, night_duty_allowance: 0, vehicle_allowance: 0, childcare_allowance: 0, research_allowance: 0, other_taxfree: 0, position_allowance: 0,
    overtime_allowance: 0, night_work_allowance: 0, holiday_work_allowance: 0, annual_leave_pay: 0,
    ins_national: true, ins_health: true, ins_employment: true, ins_injury: true, is_basic_living: false, other_welfare: '',
    ins_duru_nuri: false, duru_nuri_start: '', duru_nuri_end: '', is_medical_benefit: false,
    working_hours_per_week: 40, working_days_per_week: 5,
  };
}

const TAXABLE_SALARY_FIELDS = [
  { key: 'base_salary', label: '기본급 (월)' },
  { key: 'position_allowance', label: '직책수당' },
  { key: 'overtime_allowance', label: '연장근로수당' },
  { key: 'night_work_allowance', label: '야간근로수당' },
  { key: 'holiday_work_allowance', label: '휴일근로수당' },
  { key: 'annual_leave_pay', label: '연차휴가수당' },
] as const;

const TAXFREE_SALARY_FIELDS = [
  { key: 'meal_allowance', label: '식대' },
  { key: 'vehicle_allowance', label: '자가운전' },
  { key: 'childcare_allowance', label: '보육수당' },
  { key: 'research_allowance', label: '연구비' },
  { key: 'other_taxfree', label: '기타 비과세' },
] as const;

const MONTHLY_STANDARD_HOURS = 209;

function formatWon(amount: number) {
  return `${Math.round(amount || 0).toLocaleString('ko-KR')}원`;
}

function getMonthlyWorkingHours(weeklyHours: number) {
  const normalizedWeeklyHours = Number(weeklyHours) || 40;
  if (normalizedWeeklyHours <= 0) return MONTHLY_STANDARD_HOURS;
  return Math.max(1, Math.round(MONTHLY_STANDARD_HOURS * (normalizedWeeklyHours / 40) * 10) / 10);
}

// ESLint가 React 컴포넌트로 인식하도록 함수 이름을
// 영문 대문자로 시작하는 형태로 지정합니다.
// default export이므로 외부 import 이름(구성원관리 등)은 그대로 사용 가능합니다.
export default function StaffListManager({ 직원목록 = [], 부서목록 = [], 선택사업체, 보기상태 = '재직', 새로고침, 창상태, 창닫기, onOpenDocumentRepoForStaff, onOpenNewStaff }: any) {
  const [편집모드, 편집모드설정] = useState(false);
  const [선택된직원ID, 선택된직원ID설정] = useState<string | number | null>(null);
  const [근무형태목록, 근무형태목록설정] = useState<any[]>([]);
  const [팀목록캐시, 팀목록캐시설정] = useState<Record<string, string[]>>({});
  const [activeTab, setActiveTab] = useState('기본'); // '기본', '소속', '급여'
  const [신규직원, 신규직원설정] = useState(() => createEmptyStaffForm(선택사업체));
  const previousModalOpenRef = useRef(false);
  const taxableSalaryTotal = useMemo(
    () =>
      TAXABLE_SALARY_FIELDS.reduce(
        (sum, { key }) => sum + Number(신규직원[key as keyof typeof 신규직원] || 0),
        0,
      ),
    [신규직원],
  );
  const taxfreeSalaryTotal = useMemo(
    () =>
      TAXFREE_SALARY_FIELDS.reduce(
        (sum, { key }) => sum + Number(신규직원[key as keyof typeof 신규직원] || 0),
        0,
      ),
    [신규직원],
  );
  const totalSalaryAmount = taxableSalaryTotal + taxfreeSalaryTotal;
  const monthlyWorkingHours = useMemo(
    () => getMonthlyWorkingHours(신규직원.working_hours_per_week),
    [신규직원.working_hours_per_week],
  );
  const hourlySalaryAmount = useMemo(
    () => Math.round(totalSalaryAmount / monthlyWorkingHours),
    [monthlyWorkingHours, totalSalaryAmount],
  );

  // ESS (직원 셀프 서비스) 승인 대기함 관련
  const [essRequests, setEssRequests] = useState<any[]>([]);
  const [showEssModal, setShowEssModal] = useState(false);

  const 한글정렬 = (a: string, b: string) => a.localeCompare(b, 'ko');

  const getVisibleShiftOptions = (companyName: string) =>
    근무형태목록
      .filter((shift: any) => {
        const isActive = shift?.is_active !== false;
        const shiftCompany = shift?.company_name || shift?.company || '';

        return isActive && shiftCompany === companyName;
      })
      .sort((a: any, b: any) => 한글정렬(a?.name || '', b?.name || ''));

  useEffect(() => {
    const fetchEssRequests = async () => {
      // 1. 먼저 보류 중인 모든 요청을 가져옴
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('target_type', 'ESS_PROFILE_UPDATE_PENDING')
        .order('created_at', { ascending: false });

      if (!logs) {
        setEssRequests([]);
        return;
      }

      // 2. 현재 선택된 사업체에 속한 직원의 요청만 필터링
      // (성능 최적화를 위해 클라이언트 사이드 필터링 수행, 대규모 시 테이블 조인 고려)
      const filtered = logs.filter((log: any) => {
        const staff = 직원목록.find((s: any) => s.id === log.target_id);
        return staff && staff.company === 선택사업체;
      });

      setEssRequests(filtered);
    };
    fetchEssRequests();
  }, [새로고침, 선택사업체, 직원목록]);

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
      if (data) {
        근무형태목록설정(
          [...data].sort((a: any, b: any) => 한글정렬(a?.name || '', b?.name || ''))
        );
      }
    };
    fetchShifts();
  }, []);

  useEffect(() => {
    if (!신규직원.근무형태ID) return;

    const hasSelectedShift = getVisibleShiftOptions(신규직원.사업체).some(
      (shift: any) => shift.id === 신규직원.근무형태ID
    );

    if (!hasSelectedShift) {
      신규직원설정((prev) => ({ ...prev, 근무형태ID: '' }));
    }
  }, [신규직원.사업체, 신규직원.근무형태ID, 근무형태목록]);

  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await supabase.from('org_teams').select('company_name, team_name, division').order('division').order('sort_order');
      if (!data) return;
      const byCo: Record<string, string[]> = {};
      (data as any[]).forEach((r: any) => {
        if (!byCo[r.company_name]) byCo[r.company_name] = [];
        byCo[r.company_name].push(r.team_name);
      });
      팀목록캐시설정(byCo);
    };
    fetchTeams();
  }, [새로고침]);

  // 주당 근로시간 변경 시 연차 자동 계산 (비례 산정)
  useEffect(() => {
    const hours = 신규직원.working_hours_per_week || 0;
    if (hours > 0) {
      // (주당 근로시간 / 40) * 8시간 / 8시간(1일 기준) = 연차 일수
      // 1개월 개근 시 발생하는 연차를 기준으로 계산 (단위: 일)
      const calculatedLeave = (hours / 40); // 1일 기준 8시간이므로 단순히 시간 비중만 계산하면 일수가 됨
      // 소수점 첫째 자리까지 반올림 (예: 주 24시간 -> 0.6일)
      const roundedLeave = Math.round(calculatedLeave * 10) / 10;

      // 1년 미만 근로자의 매월 발생하는 연차를 annual_leave_total에 기본값으로 세팅 (사용자가 원하면 수정 가능)
      // 단, 기존 값이 0이거나 편집모드가 아닐 때만 자동 세팅하여 사용자 입력을 방해하지 않음
      if (!편집모드 && 신규직원.연차총개수 === 0) {
        신규직원설정(prev => ({ ...prev, 연차총개수: roundedLeave }));
      }
    }
  }, [신규직원.working_hours_per_week]);

  const 팀목록가져오기 = (회사: string) => {
    if (팀목록캐시[회사]?.length) return 팀목록캐시[회사];
    if (회사 === 'SY INC.') return ['경영지원팀', '진료지원팀', '관리팀', '재무팀', '인사팀', '전략기획팀', '마케팅팀'];
    return ['진료부', '간호부', '총무부', '진료팀', '병동팀', '수술팀', '외래팀', '외래간호팀', '검사팀', '원무팀', '총무팀', '행정팀', '관리팀', '영양팀'];
  };

  const 직원고용형태 = (직원: any) => 직원?.permissions?.employment_type || '정규직';
  const 직원면허요약 = (직원: any) => {
    const parts = [직원?.license, 직원?.permissions?.license_no, 직원?.permissions?.license_note]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : '-';
  };
  const 직원연락요약 = (직원: any) => {
    const parts = [
      직원?.phone,
      직원?.email,
      직원?.permissions?.extension ? `내선 ${직원.permissions.extension}` : '',
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : '-';
  };

  useEffect(() => {
    const justOpened = 창상태 && !previousModalOpenRef.current;
    previousModalOpenRef.current = 창상태;

    if (!justOpened || 편집모드) return;

    const defaultCompany = 선택사업체 && 선택사업체 !== '전체' ? 선택사업체 : '박철홍정형외과';
    const defaultTeam = 팀목록가져오기(defaultCompany)[0] ?? '원무팀';

    신규직원설정({
      ...createEmptyStaffForm(defaultCompany),
      팀: defaultTeam,
    });
  }, [창상태, 편집모드, 선택사업체, 팀목록캐시]);

  const 정보저장 = async () => {
    if (!신규직원.성명 || !신규직원.입사일 || 신규직원.입사일 === '0000-00-00' || 신규직원.입사일 === '') return alert('성함과 실제 입사일은 필수 입력 사항입니다.');
    try {
      const actor = readClientAuditActor();
      const dateOrNull = (val: string) => (val === '0000-00-00' || val === '0000-00' || !val || val === '') ? null : val;
      const commonData = {
        name: 신규직원.성명,
        phone: 신규직원.전화번호,
        company: 신규직원.사업체,
        department: 신규직원.팀 === '' ? null : 신규직원.팀,
        position: 신규직원.직함,
        resident_no: 신규직원.주민번호,
        email: 신규직원.이메일,
        address: 신규직원.주소,
        license: 신규직원.면허사항,
        bank_account: 신규직원.계좌정보,
        salary_info: 신규직원.임금정보,
        joined_at: dateOrNull(신규직원.입사일),
        resigned_at: dateOrNull(신규직원.퇴사일),
        status: 신규직원.상태,
        permissions: {
          ...(편집모드 && 선택된직원ID ? 직원목록.find((s: any) => s.id === 선택된직원ID)?.permissions : {}),
          extension: 신규직원.내선번호 || null,
          license_no: 신규직원.면허번호 || null,
          license_date: dateOrNull(신규직원.취득일자),
          license_note: 신규직원.면허기타내용?.trim() || null,
          employment_type: 신규직원.고용형태 || '정규직',
          contract_end_date: 신규직원.고용형태 === '계약직' ? dateOrNull(신규직원.계약종료일) : null,
          insurance: {
            national: 신규직원.ins_national,
            health: 신규직원.ins_health,
            employment: 신규직원.ins_employment,
            injury: 신규직원.ins_injury,
            duru_nuri: 신규직원.ins_duru_nuri,
            duru_nuri_start: dateOrNull(신규직원.duru_nuri_start),
            duru_nuri_end: dateOrNull(신규직원.duru_nuri_end)
          },
          probation_months: 신규직원.probation_months || 0,
          is_basic_living: 신규직원.is_basic_living,
          is_medical_benefit: 신규직원.is_medical_benefit,
          other_welfare: 신규직원.other_welfare
        },
        annual_leave_total: 0,
        annual_leave_used: 0,
        shift_id: 신규직원.근무형태ID || null,
        working_hours_per_week: 신규직원.working_hours_per_week || 40,
        working_days_per_week: 신규직원.working_days_per_week || 5,
        base_salary: 신규직원.base_salary,
        other_taxfree: 신규직원.other_taxfree ?? 0, position_allowance: 신규직원.position_allowance ?? 0,
        overtime_allowance: 신규직원.overtime_allowance ?? 0, night_work_allowance: 신규직원.night_work_allowance ?? 0,
        holiday_work_allowance: 신규직원.holiday_work_allowance ?? 0, annual_leave_pay: 신규직원.annual_leave_pay ?? 0
      };

      if (편집모드 && 선택된직원ID) {
        const beforeStaff = 직원목록.find((staff: any) => String(staff.id) === String(선택된직원ID)) || null;
        const afterStaff = {
          ...beforeStaff,
          ...commonData,
          annual_leave_total: 신규직원.연차총개수,
          annual_leave_used: 신규직원.연차사용개수,
        };

        const { error: updateErr } = await supabase.from('staff_members').update({
          ...commonData,
          annual_leave_total: 신규직원.연차총개수,
          annual_leave_used: 신규직원.연차사용개수
        }).eq('id', 선택된직원ID).select();

        if (updateErr) {
          throw updateErr;
        }

        await logAudit(
          '직원정보수정',
          'staff_member',
          String(선택된직원ID),
          {
            staff_name: 신규직원.성명,
            employee_no: beforeStaff?.employee_no || null,
            ...buildAuditDiff(beforeStaff, afterStaff, Object.keys(afterStaff)),
          },
          actor.userId,
          actor.userName
        );
        alert('직원 정보가 수정되었습니다.');
      } else {
        // 사번 부여 로직: 박철홍이면 1, 아니면 기존 숫자 사번의 최대값 다음 번호 사용
        let newEmployeeNo = '';
        if (신규직원.성명 === '박철홍') {
          newEmployeeNo = '1';
        } else {
          const { data: employeeNos, error: employeeNoError } = await supabase
            .from('staff_members')
            .select('employee_no');

          if (employeeNoError) {
            throw employeeNoError;
          }

          const existingEmployeeNos = new Set(
            (employeeNos || [])
              .map((row: any) => String(row?.employee_no || '').trim())
              .filter(Boolean)
          );

          const lastNo = (employeeNos || []).reduce((maxNo: number, row: any) => {
            const parsed = Number.parseInt(String(row?.employee_no || ''), 10);
            if (!Number.isFinite(parsed) || parsed < 2) {
              return maxNo;
            }
            return Math.max(maxNo, parsed);
          }, 1);

          let nextNo = Math.max(2, lastNo + 1);
          while (existingEmployeeNos.has(String(nextNo))) {
            nextNo += 1;
          }
          newEmployeeNo = String(nextNo);
        }

        const { error: insertErr, data: insertedStaff } = await supabase
          .from('staff_members')
          .insert([{ ...commonData, employee_no: newEmployeeNo, role: 'staff', password: '', join_date: dateOrNull(신규직원.입사일) }])
          .select()
          .single();
        if (insertErr) {
          return alert('직원 등록 실패: ' + (insertErr.message || 'DB 오류'));
        }

        await logAudit(
          '직원등록',
          'staff_member',
          String(insertedStaff?.id || newEmployeeNo),
          {
            staff_name: 신규직원.성명,
            employee_no: newEmployeeNo,
            created_fields: buildAuditDiff({}, insertedStaff || commonData, Object.keys(commonData)).after,
          },
          actor.userId,
          actor.userName
        );
        alert(`직원 등록 완료!\n로그인 아이디: 사번 ${newEmployeeNo} 또는 이름 ${신규직원.성명}\n(동명이인이 있으면 사번으로 로그인하세요)`);
      }
      닫기함수(); 새로고침();
    } catch (error: any) {
      alert('처리 중 오류가 발생했습니다: ' + (error.message || 'Unknown error'));
    }
  };

  const 수정시작 = (직원: any) => {
    선택된직원ID설정(직원.id);
    const extensionValue = 직원.extension || 직원.permissions?.extension || '';
    const ins = 직원.permissions?.insurance || { national: true, health: true, employment: true, injury: true };
    신규직원설정({
      성명: 직원.name || '', 전화번호: 직원.phone || '', 내선번호: extensionValue, 사업체: 직원.company || '박철홍정형외과',
      팀: 직원.department ?? '', 직함: 직원.position || '', 입사일: 직원.joined_at || 직원.join_date || '',
      퇴사일: 직원.resigned_at || '', 주민번호: 직원.resident_no || '', 이메일: 직원.email || '',
      주소: 직원.address || '', 면허사항: 직원.license || '',
      면허번호: 직원.permissions?.license_no || '',
      취득일자: 직원.permissions?.license_date || '',
      면허기타내용: 직원.permissions?.license_note || '',
      계좌정보: 직원.bank_account || '',
      임금정보: 직원.salary_info || '', 상태: 직원.status || '재직',
      연차총개수: typeof 직원.annual_leave_total === 'number' ? 직원.annual_leave_total : 0,
      연차사용개수: 직원.annual_leave_used || 0, 근무형태ID: 직원.shift_id || '',
      base_salary: 직원.base_salary || 0,
      meal_allowance: 직원.meal_allowance ?? 0, night_duty_allowance: 직원.night_duty_allowance ?? 0,
      vehicle_allowance: 직원.vehicle_allowance ?? 0, childcare_allowance: 직원.childcare_allowance ?? 0, research_allowance: 직원.research_allowance ?? 0,
      other_taxfree: 직원.other_taxfree ?? 0, position_allowance: 직원.position_allowance ?? 0,
      overtime_allowance: 직원.overtime_allowance ?? 0, night_work_allowance: 직원.night_work_allowance ?? 0,
      holiday_work_allowance: 직원.holiday_work_allowance ?? 0, annual_leave_pay: 직원.annual_leave_pay ?? 0,
      고용형태: 직원.permissions?.employment_type || '정규직',
      계약종료일: 직원.permissions?.contract_end_date || '',
      probation_months: 직원.permissions?.probation_months || 0,
      ins_national: ins.national !== false,
      ins_health: ins.health !== false,
      ins_employment: ins.employment !== false,
      ins_injury: ins.injury !== false,
      is_basic_living: 직원.permissions?.is_basic_living || false,
      is_medical_benefit: 직원.permissions?.is_medical_benefit || false,
      ins_duru_nuri: ins.duru_nuri || false,
      duru_nuri_start: ins.duru_nuri_start || '',
      duru_nuri_end: ins.duru_nuri_end || '',
      other_welfare: 직원.permissions?.other_welfare || '',
      working_hours_per_week: 직원.working_hours_per_week || 40,
      working_days_per_week: 직원.working_days_per_week || 5
    });
    편집모드설정(true);
  };

  const 닫기함수 = () => {
    편집모드설정(false); 선택된직원ID설정(null);
    const defaultCompany = 선택사업체 && 선택사업체 !== '전체' ? 선택사업체 : '박철홍정형외과';
    신규직원설정({
      ...createEmptyStaffForm(defaultCompany),
      팀: 팀목록가져오기(defaultCompany)[0] ?? '원무팀',
    });
    창닫기?.();
  };

  const 직원삭제 = async (직원: any) => {
    if (!confirm(`${직원.name} 직원을 삭제(퇴사 처리) 하시겠습니까?`)) return;
    try {
      const actor = readClientAuditActor();
      const today = new Date().toISOString().slice(0, 10);
      const afterStaff = {
        ...직원,
        status: '퇴사',
        resigned_at: 직원.resigned_at || today,
      };
      await supabase
        .from('staff_members')
        .update({
          status: '퇴사',
          resigned_at: 직원.resigned_at || today,
        })
        .eq('id', 직원.id);

      await logAudit(
        '직원퇴사처리',
        'staff_member',
        String(직원.id),
        {
          staff_name: 직원.name,
          employee_no: 직원.employee_no || null,
          ...buildAuditDiff(직원, afterStaff, ['status', 'resigned_at']),
        },
        actor.userId,
        actor.userName
      );
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
  const 면허등록인원수 = 필터목록.filter((직원: any) => Boolean(직원.license || 직원.permissions?.license_no)).length;
  const 계약직인원수 = 필터목록.filter((직원: any) => 직원고용형태(직원) === '계약직').length;
  const 부서수 = new Set(필터목록.map((직원: any) => 직원.department).filter(Boolean)).size;

  return (
    <div className="flex flex-col h-full app-page">
      <header className="p-3 md:p-4 border-b border-[var(--border)] bg-[var(--card)] shrink-0 flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-[var(--foreground)] tracking-tight">
            {보기상태 === '퇴사' ? '퇴사자 현황' : '실시간 구성원 현황'}{' '}
            <span className="text-sm text-[var(--accent)]">[{선택사업체}]</span>
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
              className="relative bg-amber-100 text-amber-800 px-4 py-2 text-[11px] font-bold rounded-[var(--radius-md)] hover:bg-amber-200 transition-all shadow-sm ring-1 ring-amber-300"
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
            className="bg-[var(--accent)] text-white px-5 py-2.5 text-[11px] font-bold rounded-[var(--radius-md)] shadow-md hover:opacity-95 transition-all"
            data-testid="new-staff-button"
          >
            신규 직원 등록
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {false && (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 보기상태 === '퇴사' ? '퇴사자 수' : '재직자 수', value: 필터목록.length, tone: 'bg-[var(--card)] border-[var(--border)] text-[var(--foreground)]' },
            { label: '면허/자격 등록', value: 면허등록인원수, tone: 'bg-amber-50 border-amber-200 text-amber-900' },
            { label: '계약직', value: 계약직인원수, tone: 'bg-blue-50 border-blue-200 text-blue-900' },
            { label: '부서 수', value: 부서수, tone: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
          ].map((card) => (
            <div key={card.label} className={`rounded-[var(--radius-lg)] border p-4 shadow-sm ${card.tone}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{card.label}</p>
              <p className="mt-2 text-2xl font-bold">{card.value}</p>
            </div>
          ))}
          </div>
        )}

        {선택된직원ID && (
          <div className="mb-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        <div className="hidden md:block bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-x-auto shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--muted)] text-[11px] font-semibold text-[var(--toss-gray-3)] border-b border-[var(--border)] uppercase tracking-widest">
              <tr><th className="p-4">사번</th><th className="p-4">성명/직함</th><th className="p-4">소속</th><th className="p-4">부서/팀</th><th className="p-4">연락/계정</th><th className="p-4">근무정보</th><th className="p-4">면허/자격</th><th className="p-4">상태</th><th className="p-4 text-right">관리</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {필터목록.map((직원: any) => (
                <tr key={직원.id} className="hover:bg-[var(--toss-blue-light)]/30 transition-all">
                  <td className="p-4 font-semibold text-[var(--accent)] text-xs">{직원.employee_no}</td>
                  <td className="p-4">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{직원.name}</p>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{직원.position || '-'}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">{직원.resident_no ? '주민번호 등록' : '주민번호 미등록'}</p>
                  </td>
                  <td className="p-4 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">{직원.company}</td>
                  <td className="p-4 text-xs font-bold text-[var(--toss-gray-4)]">{직원.department}</td>
                  <td className="p-4">
                    <p className="text-xs font-bold text-[var(--foreground)]">{직원연락요약(직원)}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">입사일 {직원.joined_at || 직원.join_date || '-'}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <span className="w-fit px-3 py-1 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[11px] font-semibold rounded-[var(--radius-md)]">
                        {근무형태목록.find(s => s.id === 직원.shift_id)?.name || '-'}
                      </span>
                      <span className={`w-fit px-3 py-1 text-[10px] font-semibold rounded-full ${직원고용형태(직원) === '계약직' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {직원고용형태(직원)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="text-xs font-bold text-[var(--foreground)]">{직원면허요약(직원)}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">취득일 {직원.permissions?.license_date || '-'}</p>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 text-[11px] font-semibold rounded-full ${직원.status === '퇴사' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {직원.status || '재직중'}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => 수정시작(직원)}
                      className="px-4 py-2 bg-[var(--foreground)] text-white text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-all"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => 직원삭제(직원)}
                      className="px-3 py-2 bg-red-50 text-red-600 text-[11px] font-semibold rounded-[var(--radius-md)] hover:bg-red-100 transition-all"
                    >
                      삭제
                    </button>
                    {onOpenDocumentRepoForStaff && (
                      <button
                        onClick={() => onOpenDocumentRepoForStaff(직원)}
                        className="px-3 py-2 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-all"
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
            <div key={직원.id} className="bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[var(--toss-blue-light)] rounded-[var(--radius-md)] flex items-center justify-center text-[var(--accent)] font-semibold text-xs">#{직원.employee_no}</div>
                  <div>
                    <h4 className="text-base font-semibold text-[var(--foreground)]">{직원.name}</h4>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{직원.company} · {직원.position} · {직원.joined_at || 직원.join_date}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 text-[11px] font-semibold rounded-full ${직원.status === '퇴사' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{직원.status || '재직중'}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--border)]">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">부서</p>
                  <p className="text-xs font-bold text-[var(--foreground)]">{직원.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">근무형태</p>
                  <p className="text-xs font-bold text-[var(--foreground)]">{근무형태목록.find(s => s.id === 직원.shift_id)?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">연락처</p>
                  <p className="text-xs font-bold text-[var(--foreground)] break-all">{직원연락요약(직원)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">고용형태</p>
                  <p className="text-xs font-bold text-[var(--foreground)]">{직원고용형태(직원)}</p>
                </div>
              </div>
              <div className="pt-4 border-t border-[var(--border)]">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">면허/자격</p>
                <p className="text-xs font-bold text-[var(--foreground)] break-words">{직원면허요약(직원)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => 수정시작(직원)}
                  className="flex-1 py-3 bg-[var(--muted)] text-[var(--foreground)] text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-all"
                >
                  정보 수정하기
                </button>
                <button
                  onClick={() => 직원삭제(직원)}
                  className="px-3 py-3 bg-red-50 text-red-600 text-[11px] font-semibold rounded-[var(--radius-md)] hover:bg-red-100 transition-all"
                >
                  삭제
                </button>
                {onOpenDocumentRepoForStaff && (
                  <button
                    onClick={() => onOpenDocumentRepoForStaff(직원)}
                    className="px-3 py-3 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-all"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 min-h-screen" onClick={닫기함수}>
          <div data-testid="new-staff-modal" className="bg-[var(--card)] w-full max-w-5xl rounded-2xl md:rounded-2xl overflow-hidden shadow-sm flex flex-col h-[90vh] md:h-[85vh] animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--card)] shrink-0">
              <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">{편집모드 ? '구성원 정보 수정' : '신규 직원 등록'}</h3>
              <button onClick={닫기함수} className="text-[var(--toss-gray-3)] hover:text-red-500 text-2xl">✕</button>
            </div>

            {/* Content Body */}
            <div className="p-4 overflow-y-auto overflow-x-hidden flex-1 bg-[var(--card)] relative">
              {/* 탭 메뉴 */}
              <div className="flex gap-1 p-1 bg-[var(--muted)] rounded-[var(--radius-lg)] mb-4 w-fit">
                {[
                  { id: '기본', label: '인적사항', icon: '👤' },
                  { id: '소속', label: '소속/근무', icon: '🏢' },
                  { id: '급여', label: '급여/보험', icon: '💰' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    data-testid={`new-staff-tab-${tab.id === '기본' ? 'basic' : tab.id === '소속' ? 'affiliation' : 'payroll'}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-[var(--radius-md)] text-sm font-bold transition-all flex items-center gap-2 ${activeTab === tab.id
                      ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                      : 'text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)]'
                      }`}
                  >
                    <span className="text-base">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-[450px]">
                {activeTab === '기본' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-[var(--accent)] rounded-full" />
                        필수 입력
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">성명 *</label>
                          <input data-testid="new-staff-name-input" type="text" value={신규직원.성명} onChange={e => 신규직원설정({ ...신규직원, 성명: e.target.value })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="성명을 입력하세요" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">주민번호</label>
                          <input
                            type="text"
                            value={신규직원.주민번호}
                            maxLength={14}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 13);
                              const formatted = raw.length > 6 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
                              if (raw.length >= 7 && 신규직원.주민번호.replace(/[^0-9]/g, '').length < 7) {
                                const yearPrefix = parseInt(raw.slice(0, 2), 10);
                                const genderDigit = parseInt(raw.slice(6, 7), 10);
                                const birthYear = (genderDigit === 1 || genderDigit === 2) ? 1900 + yearPrefix : 2000 + yearPrefix;
                                const age = new Date().getFullYear() - birthYear;
                                if (age >= 60 && 신규직원.ins_national) alert(`만 ${age}세는 국민연금 의무 가입 대상이 아닙니다.\n국민연금 체크를 해제해 주세요.`);
                              }
                              신규직원설정({ ...신규직원, 주민번호: formatted });
                            }}
                            className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                            placeholder="000000-0000000"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">연락처 (개인)</label>
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
                          className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">주소</label>
                        <input type="text" value={신규직원.주소} onChange={e => 신규직원설정({ ...신규직원, 주소: e.target.value })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="상세 주소 입력" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                        부가 정보
                      </h4>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">내선번호</label>
                        <input type="text" value={신규직원.내선번호} onChange={e => 신규직원설정({ ...신규직원, 내선번호: e.target.value })} placeholder="1234" className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30" />
                      </div>
                      <div className="p-5 bg-amber-50 rounded-[var(--radius-xl)] border border-amber-100 space-y-4">
                        <h5 className="text-[11px] font-extrabold text-amber-800 flex items-center gap-1.5">📜 면허/자격 사항</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-amber-700 ml-1">자격 명칭</label>
                            <input type="text" placeholder="간호사 등" value={신규직원.면허사항} onChange={e => 신규직원설정({ ...신규직원, 면허사항: e.target.value })} className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-amber-700 ml-1">면허 번호</label>
                            <input type="text" placeholder="번호 입력" value={신규직원.면허번호} onChange={e => 신규직원설정({ ...신규직원, 면허번호: e.target.value })} className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-amber-700 ml-1">취득 일자</label>
                          <SmartDatePicker
                            value={신규직원.취득일자}
                            onChange={val => 신규직원설정({ ...신규직원, 취득일자: val })}
                            inputClassName="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-amber-700 ml-1">기타 내용</label>
                          <textarea
                            value={신규직원.면허기타내용}
                            onChange={e => 신규직원설정({ ...신규직원, 면허기타내용: e.target.value })}
                            placeholder="발급기관, 세부 자격 범위, 특이사항 등을 자유롭게 입력"
                            className="min-h-[88px] w-full resize-none p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === '소속' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                        소속 및 직책
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">사업체</label>
                          <select value={신규직원.사업체} onChange={e => 신규직원설정({ ...신규직원, 사업체: e.target.value, 팀: 팀목록가져오기(e.target.value)[0] ?? '', 근무형태ID: '' })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none" data-testid="new-staff-company-select">
                            <option value="박철홍정형외과">박철홍정형외과</option>
                            <option value="수연의원">수연의원</option>
                            <option value="SY INC.">SY INC.</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">부서/팀</label>
                          <select data-testid="new-staff-team-select" value={신규직원.팀} onChange={e => 신규직원설정({ ...신규직원, 팀: e.target.value })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none">
                            <option value="">팀 선택 안함</option>
                            {팀목록가져오기(신규직원.사업체).map(팀 => <option key={팀} value={팀}>{팀}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">직함</label>
                        <select data-testid="new-staff-position-select" value={신규직원.직함} onChange={e => 신규직원설정({ ...신규직원, 직함: e.target.value })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none">
                          <option value="">직함 선택</option>
                          {['사원', '주임', '대리', '팀장', '간호과장', '간호부장', '실장', '부장', '진료부장', '총무부장', '이사', '원장', '병원장'].map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-purple-500 rounded-full" />
                        근무 조건
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">입사일 *</label>
                          <SmartDatePicker
                            value={신규직원.입사일}
                            onChange={val => 신규직원설정({ ...신규직원, 입사일: val || '' })}
                            data-testid="new-staff-joined-at-input"
                            className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">고용형태</label>
                          <div className="flex gap-1 p-1 bg-[var(--muted)] rounded-[var(--radius-md)]">
                            {['정규직', '계약직'].map(type => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => 신규직원설정({ ...신규직원, 고용형태: type, ...(type === '정규직' ? { 계약종료일: '' } : {}) })}
                                className={`flex-1 py-2 rounded-[var(--radius-md)] text-xs font-bold transition-all ${신규직원.고용형태 === type
                                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                                  : 'text-[var(--toss-gray-3)]'
                                  }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-blue-600 ml-1">수습 기간 설정</label>
                          <select
                            value={신규직원.probation_months}
                            onChange={e => 신규직원설정({ ...신규직원, probation_months: Number(e.target.value) })}
                            className="w-full p-4 bg-blue-50 rounded-[var(--radius-lg)] border border-blue-100 outline-none font-bold text-sm focus:ring-2 focus:ring-blue-300 appearance-none"
                          >
                            <option value={0}>수습 없음</option>
                            <option value={1}>1개월</option>
                            <option value={2}>2개월</option>
                            <option value={3}>3개월</option>
                            <option value={6}>6개월</option>
                          </select>
                        </div>
                      </div>
                      <div className="p-5 bg-purple-50 rounded-[var(--radius-xl)] border border-purple-100 space-y-4">
                        <h5 className="text-[11px] font-extrabold text-purple-800 flex items-center gap-1.5">⏱️ 상세 근로 시간 설정</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-purple-700 ml-1">주당 근로시간 (시간)</label>
                            <input
                              type="number"
                              value={신규직원.working_hours_per_week}
                              onChange={e => 신규직원설정({ ...신규직원, working_hours_per_week: parseInt(e.target.value, 10) || 0 })}
                              className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-300"
                              placeholder="40"
                            />
                            {신규직원.working_hours_per_week < 40 && 신규직원.working_hours_per_week > 0 && (
                              <p className="text-[9px] font-bold text-purple-600 mt-1 ml-1">
                                ✨ 단시간 근로자 비례 연차: 월 {Math.round((신규직원.working_hours_per_week / 40) * 10) / 10}일 발생
                              </p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-purple-700 ml-1">주당 근무일수 (일)</label>
                            <input
                              type="number"
                              value={신규직원.working_days_per_week}
                              onChange={e => 신규직원설정({ ...신규직원, working_days_per_week: parseInt(e.target.value, 10) || 0 })}
                              className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-300"
                              placeholder="5"
                            />
                          </div>
                        </div>
                      </div>
                      {신규직원.고용형태 === '계약직' && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                          <label className="text-[11px] font-bold text-orange-600 ml-1">계약 종료일</label>
                          <SmartDatePicker
                            value={신규직원.계약종료일}
                            onChange={val => 신규직원설정({ ...신규직원, 계약종료일: val || '' })}
                            className="w-full p-4 bg-orange-50 rounded-[var(--radius-lg)] border border-orange-100 outline-none font-bold text-sm focus:ring-2 focus:ring-orange-300"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-[var(--toss-gray-4)] ml-1">지정 스케줄 (근무형태)</label>
                        <select value={신규직원.근무형태ID} onChange={e => 신규직원설정({ ...신규직원, 근무형태ID: e.target.value })} className="w-full p-4 bg-[var(--toss-blue-light)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none" data-testid="new-staff-shift-select">
                          <option value="">근무형태 선택</option>
                          {getVisibleShiftOptions(신규직원.사업체).map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.start_time}~{s.end_time})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === '급여' && (
                  <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* (과세) 월 급여 및 고정 수당 */}
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                          <span className="w-1.5 h-4 bg-[var(--accent)] rounded-full" />
                          월 급여 및 고정 수당 (과세)
                        </h4>
                        <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-xl)] bg-[var(--toss-blue-light)] px-4 py-3 md:min-w-[320px]">
                          <div>
                            <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">총 급여</p>
                            <p data-testid="new-staff-total-salary" className="mt-1 text-base font-black text-[var(--foreground)]">{formatWon(totalSalaryAmount)}</p>
                          </div>
                          <div className="border-l border-[var(--border)] pl-3">
                            <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">시급</p>
                            <p data-testid="new-staff-hourly-wage" className="mt-1 text-base font-black text-[var(--accent)]">{formatWon(hourlySalaryAmount)}</p>
                          </div>
                          <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                            <span>과세 {formatWon(taxableSalaryTotal)}</span>
                            <span>비과세 {formatWon(taxfreeSalaryTotal)}</span>
                            <span>월 소정근로시간 {monthlyWorkingHours.toLocaleString('ko-KR')}시간 기준</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-[var(--muted)] p-4 rounded-[var(--radius-xl)]">
                        {TAXABLE_SALARY_FIELDS.map(({ key, label }) => {
                          const val = Number(신규직원[key as keyof typeof 신규직원] ?? 0);
                          return (
                            <div key={key} className="space-y-1.5">
                              <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">{label}</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                data-testid={`new-staff-salary-${key}`}
                                value={val ? val.toLocaleString() : ''}
                                onChange={e => {
                                  const n = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
                                  신규직원설정({ ...신규직원, [key]: n });
                                }}
                                placeholder="0"
                                className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none font-bold text-xs focus:ring-2 focus:ring-[var(--accent)]/30"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* (비과세) 항목 */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                        비과세 수당 항목
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-[var(--muted)] p-4 rounded-[var(--radius-xl)]">
                        {TAXFREE_SALARY_FIELDS.map(({ key, label }) => {
                          const val = Number(신규직원[key as keyof typeof 신규직원] ?? 0);
                          return (
                            <div key={key} className="space-y-1">
                              <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">{label}</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                data-testid={`new-staff-taxfree-${key}`}
                                value={val ? val.toLocaleString() : ''}
                                onChange={e => {
                                  const n = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
                                  신규직원설정({ ...신규직원, [key]: n });
                                }}
                                placeholder="0"
                                className="w-full p-2.5 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none font-bold text-[11px] focus:ring-2 focus:ring-emerald-500/30"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 사회보험 및 복지 (하단) */}
                    <div className="space-y-4 pt-4 border-t border-[var(--border)]">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-red-400 rounded-full" />
                        사회보험 및 복지 설정
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="grid grid-cols-2 gap-2 bg-[var(--muted)] p-4 rounded-[var(--radius-xl)]">
                          {[
                            { key: 'ins_national', label: '국민연금' },
                            { key: 'ins_health', label: '건강보험' },
                            { key: 'ins_employment', label: '고용보험' },
                            { key: 'ins_injury', label: '산재보험' },
                          ].map((item) => (
                            <label key={item.key} className="flex items-center gap-3 p-3 bg-[var(--card)] rounded-[var(--radius-md)] shadow-sm cursor-pointer border-2 border-transparent hover:border-[var(--toss-blue-light)] transition-all">
                              <input
                                type="checkbox"
                                checked={신규직원[item.key as keyof typeof 신규직원] as boolean}
                                onChange={e => {
                                  if (item.key === 'ins_national' && e.target.checked && 신규직원.주민번호.length >= 7) {
                                    const raw = 신규직원.주민번호.replace('-', '');
                                    const yearPrefix = parseInt(raw.slice(0, 2), 10);
                                    const genderDigit = parseInt(raw.slice(6, 7), 10);
                                    const birthYear = (genderDigit === 1 || genderDigit === 2) ? 1900 + yearPrefix : 2000 + yearPrefix;
                                    const age = new Date().getFullYear() - birthYear;
                                    if (age >= 60) return alert('만 60세 이상은 국민연금 가입 대상이 아닙니다.');
                                  }
                                  신규직원설정({ ...신규직원, [item.key]: e.target.checked });
                                }}
                                className="w-4 h-4 rounded text-[var(--accent)]"
                              />
                              <span className="text-xs font-bold text-[var(--foreground)]">{item.label}</span>
                            </label>
                          ))}
                        </div>

                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-[var(--radius-xl)] space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-base">💎</span>
                              <h4 className="text-xs font-bold text-blue-900">두루누리 지원 (80%)</h4>
                            </div>
                            <input type="checkbox" checked={신규직원.ins_duru_nuri} onChange={e => 신규직원설정({ ...신규직원, ins_duru_nuri: e.target.checked })} className="w-4 h-4 rounded" />
                          </div>
                          {신규직원.ins_duru_nuri && (
                            <div className="grid grid-cols-2 gap-2 animate-in fade-in">
                              <SmartDatePicker
                                placeholder="0000-00"
                                value={신규직원.duru_nuri_start}
                                onChange={val => 신규직원설정({ ...신규직원, duru_nuri_start: val || '' })}
                                inputClassName="p-2.5 bg-[var(--card)] border border-blue-200 rounded-lg text-[10px] font-bold"
                              />
                              <SmartDatePicker
                                placeholder="0000-00"
                                value={신규직원.duru_nuri_end}
                                onChange={val => 신규직원설정({ ...신규직원, duru_nuri_end: val || '' })}
                                inputClassName="p-2.5 bg-[var(--card)] border border-blue-200 rounded-lg text-[10px] font-bold"
                              />
                            </div>
                          )}
                        </div>

                        <div className="p-4 bg-emerald-50 rounded-[var(--radius-xl)] border border-emerald-100 space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={신규직원.is_basic_living} onChange={e => {
                              if (e.target.checked && 신규직원.ins_health) {
                                alert('기초생활수급 및 의료급여 수급자는 건강보험 가입 제외 대상일 수 있습니다.\n건강보험 체크 상태를 확인 및 해제해 주세요.');
                              }
                              신규직원설정({ ...신규직원, is_basic_living: e.target.checked });
                            }} className="w-4 h-4 rounded text-emerald-600" />
                            <span className="text-xs font-bold text-emerald-800">기초생활수급/차상위</span>
                          </label>
                          {신규직원.is_basic_living && (
                            <label className="ml-7 flex items-center gap-2 animate-in slide-in-from-left-2">
                              <input type="checkbox" checked={신규직원.is_medical_benefit} onChange={e => 신규직원설정({ ...신규직원, is_medical_benefit: e.target.checked })} className="w-3.5 h-3.5 rounded text-emerald-600" />
                              <span className="text-[10px] font-bold text-emerald-700">의료급여 (건보 제외)</span>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 하단 버튼 영역 (Footer) - 스크롤 영역 외부에 고정 */}
              <div className="px-4 py-3 bg-[var(--page-bg)] border-t border-[var(--border)] flex gap-3 shrink-0">
                <button onClick={닫기함수} className="flex-1 py-3.5 md:py-4 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] font-semibold text-sm hover:opacity-90 transition-all">취소</button>
                <button data-testid="new-staff-save-button" onClick={정보저장} className="flex-[2] py-3.5 md:py-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm hover:scale-[0.99] active:scale-95 transition-all">정보 저장하기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ESS 승인 대기함 모달 */}
      {showEssModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4 min-h-screen" onClick={() => setShowEssModal(false)}>
          <div className="bg-[var(--page-bg)] w-full max-w-3xl rounded-[var(--radius-xl)] overflow-hidden shadow-sm flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--card)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--foreground)]">내정보 변경 요청 (ESS)</h3>
                <p className="text-xs text-[var(--toss-gray-3)] mt-1">직원들이 요청한 프로필 변경 사항을 검토하고 승인하세요.</p>
              </div>
              <button onClick={() => setShowEssModal(false)} className="text-[var(--toss-gray-3)] hover:text-red-500 text-xl font-bold">✕</button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-[var(--muted)]">
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
                      address: '거주지 주소', bank_name: '급여 은행', bank_account: '급여 계좌번호'
                    };

                    return (
                      <div key={req.id} className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm p-5 space-y-4">
                        <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-full bg-[var(--toss-blue-light)] text-[var(--accent)] flex items-center justify-center font-bold">{req.user_name?.[0]}</span>
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
                              <div key={k} className="p-3 bg-[var(--muted)] rounded-[var(--radius-md)] flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">{fieldLabels[k] || k}</span>
                                <div className="text-xs font-semibold text-[var(--foreground)] break-words">
                                  <span className="line-through text-[var(--toss-gray-3)] text-[11px] block">{original[k] || '(빈 값)'}</span>
                                  <span className="text-emerald-600 block mt-0.5">→ {changes[k] || '(빈 값)'}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button onClick={() => handleRejectEss(req)} className="px-5 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-[var(--radius-md)] font-semibold text-[11px] transition-colors">반려</button>
                          <button onClick={() => handleApproveEss(req)} className="px-5 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 rounded-[var(--radius-md)] font-semibold text-[11px] transition-colors shadow-sm">승인하기</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {essRequests.length > 0 && (
              <div className="bg-[var(--card)] p-4 border-t border-[var(--border)] text-center">
                <p className="text-xs font-semibold text-[var(--toss-gray-4)]">총 <span className="text-[var(--accent)]">{essRequests.length}건</span>의 리뷰 대기 건이 있습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
