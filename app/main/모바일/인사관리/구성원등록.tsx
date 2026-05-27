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
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MIcon from '../공통/MIcon';
import { toast } from '@/lib/toast';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  MStepDots,
  useFieldIdPrefix,
} from './form-helpers';

export type SFormMemberProps = {
  onBack: () => void;
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

export default function 구성원등록({ onBack }: SFormMemberProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    name: '',
    emp: '',
    phone: '',
    email: '',
    dept: '경영지원팀',
    role: '사원',
    type: '정규직',
    start: new Date().toLocaleDateString('en-CA').replaceAll('-', '.'),
    salary: '',
    auth: 'employee',
  });
  const fieldId = useFieldIdPrefix('form-member');

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    // 마지막 단계: PC 안내 후 닫기. (모바일에서 권한 부여 미허용 — JM5)
    toast('구성원 등록은 PC에서 최종 확정해주세요.', 'info');
    onBack();
  };

  return (
    <div className="m-screen">
      <MFormHeader
        onCancel={onBack}
        title="구성원 등록"
        sub={`${step + 1}/3 · ${STEP_TITLES[step] ?? ''}`}
        saveLabel={step < 2 ? '다음' : '등록'}
        onSave={handleSave}
        saveDisabled={step === 0 && form.name.trim() === ''}
      />
      <MStepDots total={3} cur={step} />
      <div className="m-scroll">
        {step === 0 && <Step0 form={form} update={update} fieldId={fieldId} />}
        {step === 1 && <Step1 form={form} update={update} fieldId={fieldId} />}
        {step === 2 && <Step2 form={form} update={update} />}
      </div>
      {step > 0 && (
        <div className="m-sticky-foot">
          <MBtn block onClick={() => setStep(step - 1)}>
            이전
          </MBtn>
          <MBtn block variant="primary" onClick={handleSave}>
            {step < 2 ? '다음' : '등록 완료'}
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
