'use client';

/**
 * Step1BasicInfo.tsx — 퇴원심사 스텝 1: 기본 정보 + 진단/퇴원 계획
 * mockup: step-1 (#17 퇴원심사 메인 + #18 새심사(a) 흡수)
 * JM6: label 연결, aria-required, aria-describedby, aria-invalid
 */

import type { DischargeReason, DischargeReview } from '../dummy-data';

const DISCHARGE_REASONS: DischargeReason[] = [
  '완치 퇴원',
  '자의 퇴원',
  '전원',
  '사망',
  '기타',
];

export interface Step1Values {
  dischargeDate: string;
  diagnosis: string;
  dischargeReason: DischargeReason;
  dischargePlan: string;
  specialNote: string;
}

interface Step1Props {
  review: DischargeReview;
  values: Step1Values;
  errors: Partial<Record<keyof Step1Values, string>>;
  onChange: (field: keyof Step1Values, value: string) => void;
}

export default function Step1BasicInfo({
  review,
  values,
  errors,
  onChange,
}: Step1Props) {
  return (
    <div className="space-y-4">
      {/* 환자 기본 정보 */}
      <div className="app-card p-5">
        <h3 className="section-title mb-4">
          <span aria-hidden="true">👤</span> 환자 기본 정보
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <FormField label="환자 번호">
            <input
              id="f-patient-id"
              className="form-input w-full"
              value={review.patientId}
              readOnly
              aria-label="환자 번호 (읽기 전용)"
            />
          </FormField>
          <FormField label="환자명">
            <input
              id="f-patient-name"
              className="form-input w-full"
              value={`${review.patientName} (${review.age}세, ${review.sex})`}
              readOnly
              aria-label="환자명 (읽기 전용)"
            />
          </FormField>
          <FormField label="진료과">
            <input
              id="f-dept"
              className="form-input w-full"
              value={review.department}
              readOnly
              aria-label="진료과 (읽기 전용)"
            />
          </FormField>
          <FormField label="병실">
            <input
              id="f-room"
              className="form-input w-full"
              value={review.room}
              readOnly
              aria-label="병실 (읽기 전용)"
            />
          </FormField>
          <FormField label="입원일">
            <input
              id="f-admit"
              className="form-input w-full"
              type="date"
              value={review.admitDate}
              readOnly
              aria-label="입원일 (읽기 전용)"
            />
          </FormField>
          <FormField
            label="퇴원 예정일"
            htmlFor="f-discharge"
            error={errors.dischargeDate}
          >
            <input
              id="f-discharge"
              className="form-input w-full"
              type="date"
              value={values.dischargeDate}
              onChange={(e) => onChange('dischargeDate', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.dischargeDate}
              aria-describedby={
                errors.dischargeDate ? 'f-discharge-error' : undefined
              }
            />
            {errors.dischargeDate && (
              <p
                id="f-discharge-error"
                role="alert"
                aria-live="polite"
                className="mt-1 text-xs text-red-600"
              >
                {errors.dischargeDate}
              </p>
            )}
          </FormField>
        </div>
      </div>

      {/* 진단 및 퇴원 계획 */}
      <div className="app-card p-5">
        <h3 className="section-title mb-4">
          <span aria-hidden="true">🩺</span> 진단 및 퇴원 계획
        </h3>
        <div className="grid grid-cols-1 gap-3">
          <FormField
            label="주요 진단명"
            htmlFor="f-diagnosis"
            error={errors.diagnosis}
            required
          >
            <input
              id="f-diagnosis"
              className="form-input w-full"
              value={values.diagnosis}
              onChange={(e) => onChange('diagnosis', e.target.value)}
              placeholder="주요 진단명 입력"
              aria-required="true"
              aria-invalid={!!errors.diagnosis}
              aria-describedby={errors.diagnosis ? 'f-diagnosis-error' : undefined}
            />
            {errors.diagnosis && (
              <p
                id="f-diagnosis-error"
                role="alert"
                aria-live="polite"
                className="mt-1 text-xs text-red-600"
              >
                {errors.diagnosis}
              </p>
            )}
          </FormField>

          <FormField label="퇴원 사유" htmlFor="f-reason">
            <select
              id="f-reason"
              className="form-select w-full"
              value={values.dischargeReason}
              onChange={(e) =>
                onChange('dischargeReason', e.target.value as DischargeReason)
              }
            >
              {DISCHARGE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="퇴원 후 계획" htmlFor="f-plan">
            <textarea
              id="f-plan"
              className="form-textarea w-full"
              value={values.dischargePlan}
              onChange={(e) => onChange('dischargePlan', e.target.value)}
              placeholder="외래 추적 일정, 투약 계획, 재활 계획 등을 입력하세요"
              rows={3}
            />
          </FormField>

          <FormField label="특이 사항" htmlFor="f-note">
            <textarea
              id="f-note"
              className="form-textarea w-full"
              value={values.specialNote}
              onChange={(e) => onChange('specialNote', e.target.value)}
              placeholder="보호자 동반 여부, 이동 수단, 기타 특이 사항"
              rows={2}
            />
          </FormField>
        </div>
      </div>
    </div>
  );
}

// ── 내부 폼 필드 래퍼 ─────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FormField({ label, htmlFor, required, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold text-[var(--toss-gray-3)]"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
