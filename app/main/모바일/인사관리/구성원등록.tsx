'use client';

/**
 * SFormMember — 모바일 인사관리: 구성원 등록 폼 (3-step wizard)
 *
 * 핸드오프 §FM1 (m-screens-forms.jsx :62~189) 1:1 이식.
 *   step 0: 기본 정보 (이름·사번·연락처·이메일)
 *   step 1: 계약·근무 (부서·직급·계약형태·입사일·연봉)
 *   step 2: 권한 설정 (4 radio)
 *
 * staff_members insert는 권한 정책상 PC에서만 — 모바일은 임시 저장 → toast 안내.
 *
 * JM5: insert 직접하지 않고 상위 콜백에 위임. 권한 부여는 감사 대상이므로 PC 안내.
 */

import { useState } from 'react';
import { getKoreanTodayString } from '@/lib/seoul-time';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MIcon from '../공통/MIcon';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import { canAccessHrSection } from '@/lib/access-control';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  MStepDots,
  useFieldIdPrefix,
} from './form-helpers';

export type SFormMemberProps = {
  /** 등록 완료 후 콜백 (새 직원 id 전달). 미전달 시 onBack 호출. */
  onCreated?: (id: string) => void;
  onBack: () => void;
  /** 현재 사용자 — 인사 권한 검증용. 미전달/권한 없음 시 등록 차단. */
  user?: Record<string, unknown> | null;
  /** 등록 대상 회사. undefined/'전체' 면 회사 특정 불가로 차단. */
  company?: string;
};

type AuthLevel = 'employee' | 'team' | 'manager' | 'admin';
type EmployType = '정규직' | '계약직' | '시간제';

type FormState = {
  name: string;
  emp: string;
  phone: string;
  email: string;
  dept: string;
  role: string;
  type: EmployType;
  start: string;
  salary: string;
  auth: AuthLevel;
};

const DEPT_OPTIONS = ['경영지원팀', '영상의학팀', '간호부', '외래팀', 'OP실', '행정팀'];

const STEP_TITLES = ['기본 정보', '계약·근무', '권한 설정'];

export default function 구성원등록({ onBack, onCreated, user, company }: SFormMemberProps) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // 직원 등록은 인사 권한(hr_구성원) 보유자/관리자만 가능.
  const canRegister = canAccessHrSection(user, 'hr_구성원');
  // 회사 특정 불가('전체'/미지정) 시 타 회사 PII 혼입 위험 → 차단.
  const resolvedCompany = (company ?? '').trim();
  const hasValidCompany = resolvedCompany !== '' && resolvedCompany !== '전체';
  const canSubmit = canRegister && hasValidCompany;
  const [form, setForm] = useState<FormState>({
    name: '',
    emp: '',
    phone: '',
    email: '',
    dept: '경영지원팀',
    role: '사원',
    type: '정규직',
    start: getKoreanTodayString().replaceAll('-', '.'),
    salary: '',
    auth: 'employee',
  });
  const fieldId = useFieldIdPrefix('form-member');

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (step < 2) {
      setStep(step + 1);
      return;
    }

    // 권한 가드: 인사 권한 미보유 또는 회사 미특정 시 등록 차단.
    if (!canRegister) {
      toast('직원 등록 권한이 없습니다. 관리자에게 문의하세요.', 'error');
      return;
    }
    if (!hasValidCompany) {
      toast('등록할 회사를 특정할 수 없습니다. PC에서 회사를 선택해 등록하세요.', 'error');
      return;
    }

    // 마지막 단계: staff_members insert (JM5: 주민번호 등 민감 정보 제외, 오프라인 큐 적용)
    if (!form.name.trim()) {
      toast('이름을 입력해주세요.', 'warning');
      return;
    }
    setSubmitting(true);

    // JM5: payload에 토큰·주민번호·비밀번호 등 민감 정보 포함 금지.
    // 연봉(salary)은 숫자 파싱 후 포함 — 큐에 저장될 수 있으므로 문자열 그대로 전달.
    const salaryNum = form.salary ? Number(form.salary.replace(/[^0-9]/g, '')) : null;
    const hireDate = form.start.replaceAll('.', '-');

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      company: resolvedCompany,
      department: form.dept,
      position: form.role,
      employment_type: form.type,
      hire_date: hireDate || null,
      role: form.auth,
      status: '재직',
    };
    if (form.emp.trim()) payload.employee_no = form.emp.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (salaryNum && salaryNum > 0) payload.salary = salaryNum;

    const { data, queued, error } = await enqueueSupabaseMutation<{ id: string }>({
      kind: 'insert',
      table: 'staff_members',
      payload,
    });

    setSubmitting(false);

    if (error) {
      toast(`직원 등록 실패: ${error}`, 'error');
      return;
    }
    if (queued) {
      toast('오프라인 — 직원 등록 대기 중', 'info');
      onBack();
      return;
    }
    toast('직원이 등록되었습니다.', 'success');
    const row = Array.isArray(data)
      ? (data as { id: string }[])[0]
      : (data as { id: string } | null);
    const newId = String(row?.id ?? '');
    if (onCreated && newId) onCreated(newId);
    else onBack();
  };

  return (
    <div className="m-screen">
      <MFormHeader
        onCancel={onBack}
        title="구성원 등록"
        sub={`${step + 1}/3 · ${STEP_TITLES[step] ?? ''}`}
        saveLabel={submitting ? '등록 중...' : step < 2 ? '다음' : '등록'}
        onSave={() => void handleSave()}
        saveDisabled={
          (step === 0 && form.name.trim() === '') ||
          submitting ||
          (step === 2 && !canSubmit)
        }
      />
      <MStepDots total={3} cur={step} />
      {!canSubmit && (
        <div
          role="alert"
          style={{
            margin: '12px 16px 0',
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--m-warning-soft)',
            color: 'var(--m-warning)',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <MIcon name="alertTri" size={18} color="var(--m-warning)" />
          <span style={{ flex: 1 }}>
            {!canRegister
              ? '직원 등록 권한이 없습니다. 등록은 인사 권한 보유자만 가능합니다.'
              : '회사가 특정되지 않아 등록할 수 없습니다. PC에서 회사를 선택해 등록하세요.'}
          </span>
        </div>
      )}
      <div className="m-scroll" aria-busy={submitting}>
        {step === 0 && <Step0 form={form} update={update} fieldId={fieldId} />}
        {step === 1 && <Step1 form={form} update={update} fieldId={fieldId} />}
        {step === 2 && <Step2 form={form} update={update} />}
      </div>
      {step > 0 && (
        <div className="m-sticky-foot">
          <MBtn block onClick={() => setStep(step - 1)} disabled={submitting}>
            이전
          </MBtn>
          <MBtn
            block
            variant="primary"
            onClick={() => void handleSave()}
            disabled={submitting || (step === 2 && !canSubmit)}
          >
            {submitting ? '등록 중...' : step < 2 ? '다음' : '등록 완료'}
          </MBtn>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 0 — 기본 정보
// ─────────────────────────────────────────────────────────────
function Step0({
  form,
  update,
  fieldId,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  fieldId: (k: string) => string;
}) {
  return (
    <>
      <div
        style={{
          padding: '18px 16px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: 'var(--z-100)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--z-400)',
          }}
          aria-hidden="true"
        >
          <MIcon name="user" size={28} />
        </div>
        <div style={{ flex: 1 }}>
          <MBtn icon="plus" onClick={() => toast('사진 첨부는 PC에서 지원됩니다.', 'info')}>
            사진 추가
          </MBtn>
          <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 6, fontWeight: 600 }}>
            선택사항 · 최대 4MB
          </div>
        </div>
      </div>
      <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
        <MField label="이름" required htmlFor={fieldId('name')}>
          <MInput
            id={fieldId('name')}
            value={form.name}
            onChange={(v) => update('name', v)}
            placeholder="홍길동"
            autoFocus
          />
        </MField>
        <MField label="사번" htmlFor={fieldId('emp')} sub="비워두면 자동 생성됩니다">
          <MInput
            id={fieldId('emp')}
            value={form.emp}
            onChange={(v) => update('emp', v)}
            placeholder="자동 — 예: 0033"
            kind="numeric"
          />
        </MField>
        <MField label="연락처" htmlFor={fieldId('phone')}>
          <MInput
            id={fieldId('phone')}
            value={form.phone}
            onChange={(v) => update('phone', v)}
            placeholder="010-0000-0000"
            kind="tel"
          />
        </MField>
        <MField label="이메일" htmlFor={fieldId('email')}>
          <MInput
            id={fieldId('email')}
            value={form.email}
            onChange={(v) => update('email', v)}
            placeholder="user@hospital.kr"
            kind="email"
          />
        </MField>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 1 — 계약·근무
// ─────────────────────────────────────────────────────────────
function Step1({
  form,
  update,
  fieldId,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  fieldId: (k: string) => string;
}) {
  return (
    <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
      <MField label="부서">
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {DEPT_OPTIONS.map((d) => {
            const active = form.dept === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => update('dept', d)}
                aria-pressed={active}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: active ? 'var(--m-accent)' : 'var(--m-bg)',
                  color: active ? '#fff' : 'var(--z-700)',
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </MField>
      <MField label="직급" htmlFor={fieldId('role')}>
        <MInput
          id={fieldId('role')}
          value={form.role}
          onChange={(v) => update('role', v)}
          placeholder="사원 / 대리 / 팀장 / 이사"
        />
      </MField>
      <MField label="계약 형태">
        <MSegRow
          value={form.type}
          onPick={(t) => update('type', t)}
          options={[
            { id: '정규직', label: '정규직' },
            { id: '계약직', label: '계약직' },
            { id: '시간제', label: '시간제' },
          ]}
          ariaLabel="계약 형태"
        />
      </MField>
      <MField label="입사일" htmlFor={fieldId('start')}>
        <MInput
          id={fieldId('start')}
          value={form.start}
          onChange={(v) => update('start', v)}
          placeholder="YYYY.MM.DD"
        />
      </MField>
      <MField
        label="연봉 (선택)"
        htmlFor={fieldId('salary')}
        sub="입력 시 자동으로 월급여 산출"
      >
        <MInput
          id={fieldId('salary')}
          value={form.salary}
          onChange={(v) => update('salary', v)}
          placeholder="₩ 36,000,000"
          kind="decimal"
        />
      </MField>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 2 — 권한
// ─────────────────────────────────────────────────────────────
function Step2({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  const AUTH_OPTIONS: ReadonlyArray<{
    id: AuthLevel;
    title: string;
    desc: string;
    tone: '' | 'accent' | 'success' | 'danger';
  }> = [
    { id: 'employee', title: '일반 직원', desc: '본인 결재·명세서·근태만 접근', tone: '' },
    {
      id: 'team',
      title: '팀장',
      desc: '1차 결재 + HR 조회 + 재고 입출고',
      tone: 'success',
    },
    {
      id: 'manager',
      title: '경영지원 이사',
      desc: '결재·HR·재고·회사관리 전체',
      tone: 'accent',
    },
    {
      id: 'admin',
      title: '대표',
      desc: '전체 권한 (감사 로그 남음)',
      tone: 'danger',
    },
  ];

  return (
    <>
      <div style={{ padding: '16px 16px 0', fontSize: 13, color: 'var(--z-700)' }}>
        <b>{form.name || '신규 직원'}</b>의 권한을 설정하세요. 입사 후 권한 관리
        화면에서 변경할 수 있습니다.
      </div>
      <div
        className="m-card flush"
        style={{ borderRadius: 0, border: 'none', marginTop: 14 }}
      >
        {AUTH_OPTIONS.map((opt) => {
          const checked = form.auth === opt.id;
          return (
            <label
              key={opt.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr',
                gap: 12,
                padding: '14px 16px',
                borderBottom: '1px solid var(--m-border)',
                alignItems: 'flex-start',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="auth"
                value={opt.id}
                checked={checked}
                onChange={() => update('auth', opt.id)}
                style={{ width: 22, height: 22, accentColor: 'var(--m-accent)', marginTop: 1 }}
              />
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {opt.title} <MChip tone={opt.tone}>권한</MChip>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--z-500)',
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {opt.desc}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div style={{ padding: '14px 16px 0' }}>
        <div
          className="m-card"
          style={{
            padding: '12px 14px',
            background: 'var(--m-warning-soft)',
            borderColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <MIcon name="alertTri" size={18} color="var(--m-warning)" />
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--m-warning)' }}>
            대표 / 경영지원 이사 권한 부여는 감사 로그가 남습니다.
          </div>
        </div>
      </div>
      <div style={{ height: 80 }} />
    </>
  );
}
