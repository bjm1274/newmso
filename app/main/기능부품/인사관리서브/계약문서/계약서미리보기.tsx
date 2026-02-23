'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Props = {
  staff?: any;
  contract?: any;
};

export default function ContractPreview({ staff, contract }: Props) {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!staff) {
        setText('');
        return;
      }
      setLoading(true);
      try {
        const companyName = staff.company || '전체';

        // 근무형태 조회
        let shift: any = null;
        const shiftId = contract?.shift_id ?? staff.shift_id;
        if (shiftId) {
          const { data: shiftData } = await supabase
            .from('work_shifts')
            .select('*')
            .eq('id', shiftId)
            .maybeSingle();
          shift = shiftData;
        }

        // 회사 기본정보 조회
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
          .maybeSingle();

        let templateText = tmpl?.template_content || '';
        if (!templateText) {
          const { data: fallback } = await supabase
            .from('contract_templates')
            .select('template_content')
            .eq('company_name', '전체')
            .maybeSingle();
          templateText = fallback?.template_content || '';
        }

        setText(fillContractTemplate(templateText, staff, contract, shift, companyInfo));
      } catch (e) {
        console.warn('ContractPreview load error', e);
        setText('');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staff?.id, staff?.company, contract?.id]);

  if (!staff) {
    return (
      <div className="bg-white border border-gray-200 shadow-sm p-8 flex items-center justify-center h-[800px] text-xs text-gray-400">
        계약 대상자를 왼쪽에서 선택하면 이곳에 근로계약서가 미리보기로 표시됩니다.
      </div>
    );
  }

  // 근로계약서 템플릿 변수 치환 (조직도본문과 동일한 규칙을 축약해 사용)
  function fillContractTemplate(
    template: string,
    user: any,
    contract: any,
    shift: any,
    company: any,
  ) {
    if (!template) return '';

    const formatDate = (value?: string | null) => {
      if (!value) return '';
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

      company_name: company?.name || user?.company || '',
      company_ceo: company?.ceo_name || '',
      ceo_name: company?.ceo_name || '',
      company_business_no: company?.business_no || '',
      business_no: company?.business_no || '',
      company_address: company?.address || '',
      company_phone: company?.phone || '',

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
    Object.entries(vars).forEach(([key, value]) => {
      const token = `{{${key}}}`;
      if (result.includes(token)) {
        result = result.split(token).join(value || '');
      }
    });

    return result;
  }

  const sig = contract?.signature_data as string | undefined;

  return (
    <div className="bg-white border border-gray-200 shadow-2xl p-10 flex flex-col h-[800px] overflow-y-auto rounded-lg relative custom-scrollbar print:shadow-none">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            근로계약서 미리보기
          </p>
          <h1 className="text-lg font-bold text-gray-900 mt-1">표준 근로계약서</h1>
          <p className="mt-1 text-[11px] text-gray-500">
            {staff.company} / {staff.name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {contract?.status && (
            <span
              className={`px-3 py-1 text-[10px] font-semibold rounded-full border ${
                contract.status === '서명완료'
                  ? 'bg-green-50 text-green-600 border-green-100'
                  : 'bg-orange-50 text-orange-600 border-orange-100'
              }`}
            >
              {contract.status}
            </span>
          )}
          {sig && (
            <div className="text-[10px] text-gray-500">
              전자 서명 완료
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 mt-4 p-6 bg-gray-50 border border-gray-100 rounded-xl font-mono text-[11px] leading-relaxed text-gray-800 whitespace-pre-wrap">
        {loading
          ? '계약서 내용을 불러오는 중입니다...'
          : text || '이 회사에 설정된 표준 근로계약서 양식이 없습니다.'}
      </div>

      {sig && (
        <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
          <p className="text-[10px] text-gray-500">
            위 내용은 전자 서명을 통해 동의된 근로계약 내용입니다.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-500 font-semibold">근로자 서명</span>
            {sig.startsWith('data:image') ? (
              <img
                src={sig}
                alt="전자 서명"
                className="h-10 w-auto object-contain bg-white border border-gray-200 rounded"
              />
            ) : (
              <span className="px-3 py-1 text-[11px] font-semibold text-gray-900 bg-white border border-gray-200 rounded">
                {sig}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}