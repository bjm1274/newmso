'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

type ContractType = '근로계약' | '위임계약' | '용역계약';

interface ContractForm {
  contract_type: ContractType;
  staff_name: string;
  staff_id: number | '';
  position: string;
  department: string;
  salary: string;
  start_date: string;
  end_date: string;
  company_name: string;
  representative: string;
  work_location: string;
  work_hours: string;
  note: string;
}

const CONTRACT_TEMPLATES: Record<ContractType, { title: string; description: string; color: string }> = {
  근로계약: { title: '근로 계약서', description: '정규직·계약직 근로자와의 표준 근로계약', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  위임계약: { title: '위임 계약서', description: '업무 위임 및 대리 수행 계약', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  용역계약: { title: '용역 계약서', description: '외부 용역 서비스 제공 계약', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
};

const DEFAULT_FORM: ContractForm = {
  contract_type: '근로계약',
  staff_name: '',
  staff_id: '',
  position: '',
  department: '',
  salary: '',
  start_date: '',
  end_date: '',
  company_name: '',
  representative: '',
  work_location: '',
  work_hours: '09:00~18:00 (휴게 1시간)',
  note: '',
};

export default function ContractAutoGenerator({ staffs, selectedCo, user }: Props) {
  const [form, setForm] = useState<ContractForm>({ ...DEFAULT_FORM, company_name: selectedCo !== '전체' ? selectedCo : '' });
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const handleStaffSelect = (id: string) => {
    const s = filtered.find((x: any) => String(x.id) === id);
    if (s) {
      setForm((prev) => ({
        ...prev,
        staff_id: s.id,
        staff_name: s.name || '',
        position: s.position || '',
        department: s.dept || s.department || '',
        salary: s.base ? String(s.base) : '',
      }));
    }
  };

  const setField = (field: keyof ContractForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.staff_name || !form.start_date) {
      setMessage({ type: 'error', text: '성명과 계약 시작일은 필수입니다.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('generated_contracts').insert([{
        contract_type: form.contract_type,
        staff_id: form.staff_id || null,
        staff_name: form.staff_name,
        position: form.position,
        department: form.department,
        salary: form.salary,
        start_date: form.start_date,
        end_date: form.end_date,
        company_name: form.company_name,
        representative: form.representative,
        work_location: form.work_location,
        work_hours: form.work_hours,
        note: form.note,
        created_by: user?.name || '',
      }]);
      if (error) throw error;
      setMessage({ type: 'success', text: '계약서가 저장되었습니다.' });
    } catch (e: unknown) {
      setMessage({ type: 'error', text: `저장 실패: ${((e as Error)?.message ?? String(e))}` });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    setShowPreview(true);
    setTimeout(() => window.print(), 300);
  };

  const tmpl = CONTRACT_TEMPLATES[form.contract_type];

  const PreviewContent = () => (
    <div className="print-area font-serif text-sm leading-relaxed text-[var(--foreground)] space-y-4 p-5">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-extrabold">{tmpl.title}</h1>
        <p className="text-xs text-[var(--toss-gray-4)]">계약 유형: {form.contract_type}</p>
      </div>

      <div className="border-t-2 border-b-2 border-gray-800 py-4 space-y-2">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="font-bold">갑(사용자): </span>{form.company_name || '__________'}</div>
          <div><span className="font-bold">대표자: </span>{form.representative || '__________'}</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><span className="font-bold">을(근로자): </span>{form.staff_name || '__________'}</div>
          <div><span className="font-bold">직위/직책: </span>{form.position || '__________'}</div>
        </div>
        {form.department && <div><span className="font-bold">소속 부서: </span>{form.department}</div>}
      </div>

      <div className="space-y-4">
        <section>
          <h2 className="font-extrabold text-base border-b border-[var(--border)] pb-1 mb-2">제1조 (계약 기간)</h2>
          <p>
            계약 기간은 <strong>{form.start_date || '____년 __월 __일'}</strong>부터{' '}
            <strong>{form.end_date || '____년 __월 __일'}</strong>까지로 한다.
            {!form.end_date && form.contract_type === '근로계약' && ' (기간의 정함이 없는 근로계약)'}
          </p>
        </section>

        <section>
          <h2 className="font-extrabold text-base border-b border-[var(--border)] pb-1 mb-2">제2조 (업무 내용)</h2>
          <p>을은 갑의 지휘·감독 하에 <strong>{form.position || '해당 직무'}</strong>에 관한 업무를 성실히 수행한다.</p>
          {form.work_location && <p>근무 장소: {form.work_location}</p>}
        </section>

        {form.contract_type === '근로계약' && (
          <section>
            <h2 className="font-extrabold text-base border-b border-[var(--border)] pb-1 mb-2">제3조 (근무 시간)</h2>
            <p>근무 시간: {form.work_hours || '09:00~18:00 (휴게 1시간)'}</p>
            <p>휴일: 주휴일(일요일), 법정 공휴일</p>
          </section>
        )}

        <section>
          <h2 className="font-extrabold text-base border-b border-[var(--border)] pb-1 mb-2">{form.contract_type === '근로계약' ? '제4조 (임금)' : '제3조 (보수)'}</h2>
          <p>
            {form.contract_type === '근로계약' ? '월 기본급' : '계약 보수'}:{' '}
            <strong>{form.salary ? Number(form.salary).toLocaleString() + '원' : '____________원'}</strong>
          </p>
          {form.contract_type === '근로계약' && <p>지급일: 매월 말일 (은행 이체)</p>}
        </section>

        {form.note && (
          <section>
            <h2 className="font-extrabold text-base border-b border-[var(--border)] pb-1 mb-2">특약 사항</h2>
            <p className="whitespace-pre-wrap">{form.note}</p>
          </section>
        )}

        <section>
          <h2 className="font-extrabold text-base border-b border-[var(--border)] pb-1 mb-2">기타 조항</h2>
          <p>본 계약에서 정하지 아니한 사항은 근로기준법 및 관련 법령에 따른다.</p>
        </section>
      </div>

      <div className="pt-8 space-y-4">
        <p className="text-center text-sm">작성일: {new Date().toLocaleDateString('ko-KR')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center space-y-5">
            <p className="font-bold">갑 (사용자)</p>
            <div>
              <p>{form.company_name || '회사명'}</p>
              <p>대표 {form.representative || '__________'} (인)</p>
            </div>
          </div>
          <div className="text-center space-y-5">
            <p className="font-bold">을 ({form.contract_type === '근로계약' ? '근로자' : '수임인'})</p>
            <div>
              <p>{form.staff_name || '성명'} (인)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-4 space-y-4" data-testid="contract-utility-auto-generator">
      {/* 인쇄 전용 스타일 */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .print-area { display: block !important; }
        }
        .print-area { display: none; }
      `}</style>
      <div className="print-area"><PreviewContent /></div>

      {/* 헤더 */}
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">계약서 자동 생성기</h2>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">계약 유형과 변수를 입력하면 계약서를 자동으로 생성합니다.</p>
      </div>

      {/* 메시지 */}
      {message && (
        <div
          data-testid="contract-generator-message"
          className={`px-4 py-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
        >
          {message.text}
        </div>
      )}

      {/* 계약 유형 선택 */}
      <div>
        <p className="text-xs font-bold text-[var(--toss-gray-4)] mb-2">계약 유형 선택</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONTRACT_TEMPLATES) as ContractType[]).map((type) => {
            const t = CONTRACT_TEMPLATES[type];
            const isActive = form.contract_type === type;
            return (
              <button
                key={type}
                onClick={() => setField('contract_type', type)}
                className={`px-4 py-2 rounded-[var(--radius-md)] border-2 font-bold text-sm transition-all ${isActive ? t.color + ' border-current shadow-sm scale-105' : 'bg-[var(--card)] border-[var(--border)] text-[var(--toss-gray-3)] hover:border-[var(--toss-gray-2)]'}`}
              >
                <div className="font-extrabold">{type}</div>
                <div className="text-[10px] font-normal mt-0.5">{t.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 변수 입력 폼 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
        <h3 className="text-sm font-bold text-[var(--foreground)]">계약 정보 입력</h3>

        {/* 직원 선택 */}
        <div>
          <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">직원 선택 (자동 입력)</label>
          <select
            onChange={(e) => handleStaffSelect(e.target.value)}
            data-testid="contract-generator-staff-select"
            className="w-full sm:w-64 px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          >
            <option value="">-- 직원 선택하면 자동 입력 --</option>
            {filtered.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.position || '직위 없음'})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: '성명', field: 'staff_name', placeholder: '홍길동' },
            { label: '직위/직책', field: 'position', placeholder: '팀장' },
            { label: '소속 부서', field: 'department', placeholder: '간호부' },
            { label: '회사명 (갑)', field: 'company_name', placeholder: '박철홍정형외과' },
            { label: '대표자', field: 'representative', placeholder: '박철홍' },
            { label: '근무 장소', field: 'work_location', placeholder: '서울시 강남구...' },
            { label: '급여/보수 (원)', field: 'salary', placeholder: '3000000', type: 'number' },
            { label: '계약 시작일', field: 'start_date', type: 'date' },
            { label: '계약 종료일', field: 'end_date', type: 'date' },
          ].map(({ label, field, placeholder, type = 'text' }) => (
            <div key={field}>
              <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">{label}</label>
              <input
                type={type}
                value={(form as any)[field]}
                onChange={(e) => setField(field as keyof ContractForm, e.target.value)}
                data-testid={`contract-generator-field-${field}`}
                placeholder={placeholder}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">근무 시간</label>
            <input
              type="text"
              value={form.work_hours}
              onChange={(e) => setField('work_hours', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-[var(--toss-gray-4)] block mb-1">특약 사항</label>
          <textarea
            value={form.note}
            onChange={(e) => setField('note', e.target.value)}
            rows={3}
            placeholder="특약 사항이 있으면 입력하세요..."
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30 resize-none"
          />
        </div>
      </div>

      {/* 미리보기 및 액션 버튼 */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="px-5 py-2.5 bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-xs font-bold rounded-xl hover:bg-[var(--toss-gray-2)] transition-colors"
        >
          {showPreview ? '미리보기 닫기' : '미리보기'}
        </button>
        <button
          onClick={handlePrint}
          className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors"
        >
          PDF 출력 (인쇄)
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="contract-generator-save-button"
          className="px-5 py-2.5 bg-[var(--accent)] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? '저장 중...' : 'DB 저장'}
        </button>
        <button
          onClick={() => { setForm({ ...DEFAULT_FORM, company_name: selectedCo !== '전체' ? selectedCo : '' }); setShowPreview(false); setMessage(null); }}
          className="px-5 py-2.5 bg-[var(--muted)] text-[var(--toss-gray-3)] text-xs font-bold rounded-xl hover:bg-[var(--toss-gray-2)] transition-colors"
        >
          초기화
        </button>
      </div>

      {/* 인라인 미리보기 */}
      {showPreview && (
        <div className="bg-[var(--card)] border-2 border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-[var(--muted)] border-b border-[var(--border)] flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--toss-gray-3)]">미리보기 — {tmpl.title}</span>
          </div>
          <PreviewContent />
        </div>
      )}
    </div>
  );
}
