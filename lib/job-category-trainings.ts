/**
 * job-category-trainings.ts
 *
 * 직종별 필수교육 조회 및 직원별 교육 자동 부여 유틸리티
 *
 * [호출 지점 안내]
 * 구성원현황(W2)에서 직원 등록/수정 완료 후 아래를 호출하세요:
 *
 *   import { syncStaffRequiredTrainings } from '@/lib/job-category-trainings';
 *   await syncStaffRequiredTrainings(staffId);
 *
 * 실제 호출 삽입은 W2(구성원현황 워커) 담당입니다.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// 타입 / Zod 스키마
// ---------------------------------------------------------------------------

export type RequiredTraining = {
  trainingCode: string;
  trainingName: string;
  cycleMonths: number | null;
  mandatory: boolean;
  obligationType: 'legal' | 'recommended';
  legalBasis: string | null;
};

const RequiredTrainingRowSchema = z.object({
  training_code: z.string(),
  training_name: z.string(),
  cycle_months: z.number().nullable(),
  mandatory: z.boolean(),
  obligation_type: z.enum(['legal', 'recommended']),
  legal_basis: z.string().nullable(),
});

const JobCategoryRowSchema = z.object({
  job_category_id: z.string().uuid(),
});

const StaffTrainingRowSchema = z.object({
  training_code: z.string(),
});

// ---------------------------------------------------------------------------
// 내부 유틸
// ---------------------------------------------------------------------------

function toRequiredTraining(row: z.infer<typeof RequiredTrainingRowSchema>): RequiredTraining {
  return {
    trainingCode: row.training_code,
    trainingName: row.training_name,
    cycleMonths: row.cycle_months,
    mandatory: row.mandatory,
    obligationType: row.obligation_type,
    legalBasis: row.legal_basis,
  };
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 특정 직원의 직종에 해당하는 필수교육 항목 반환.
 * applies_to_all=TRUE 항목 포함, 중복 training_code 제거.
 */
export async function getRequiredTrainingsForStaff(staffId: string): Promise<RequiredTraining[]> {
  // 1) 직원 직종 목록 조회
  const { data: jobCatRows, error: jobCatErr } = await supabase
    .from('staff_job_categories')
    .select('job_category_id')
    .eq('staff_id', staffId);

  if (jobCatErr) {
    console.error('[job-category-trainings] staff_job_categories 조회 실패:', jobCatErr);
    return [];
  }

  const parsedJobCats = z
    .array(JobCategoryRowSchema)
    .safeParse(jobCatRows ?? []);

  if (!parsedJobCats.success) {
    console.error('[job-category-trainings] job_category 파싱 실패:', parsedJobCats.error);
    return [];
  }

  const jobCategoryIds = parsedJobCats.data.map((r) => r.job_category_id);

  // 2) 해당 직종의 필수교육 + 전 직종 공통(applies_to_all=TRUE) 교육 단일 쿼리
  let query = supabase
    .from('job_category_required_trainings')
    .select(
      'training_code, training_name, cycle_months, mandatory, obligation_type, legal_basis, applies_to_all, job_category_id'
    );

  if (jobCategoryIds.length > 0) {
    // applies_to_all OR 내 직종 코드
    query = query.or(
      `applies_to_all.eq.true,job_category_id.in.(${jobCategoryIds.join(',')})`
    );
  } else {
    // 직종 미배정 → 공통 항목만
    query = query.eq('applies_to_all', true);
  }

  const { data: trainingRows, error: trainingErr } = await query;

  if (trainingErr) {
    console.error('[job-category-trainings] 필수교육 조회 실패:', trainingErr);
    return [];
  }

  const parsedRows = z
    .array(RequiredTrainingRowSchema)
    .safeParse(trainingRows ?? []);

  if (!parsedRows.success) {
    console.error('[job-category-trainings] 필수교육 파싱 실패:', parsedRows.error);
    return [];
  }

  // 3) training_code 기준 중복 제거
  const seen = new Set<string>();
  const result: RequiredTraining[] = [];
  for (const row of parsedRows.data) {
    if (!seen.has(row.training_code)) {
      seen.add(row.training_code);
      result.push(toRequiredTraining(row));
    }
  }

  return result;
}

/**
 * 직원의 직종 기반 필수교육 항목 중 staff_trainings에 미등록된 항목을 INSERT.
 * status='미이수', assigned_at=NOW()
 *
 * [호출 지점 안내]
 * - 구성원현황(W2): 직원 등록 또는 직종 변경 완료 후 호출
 *   `await syncStaffRequiredTrainings(staffId)`
 */
export async function syncStaffRequiredTrainings(staffId: string): Promise<{
  inserted: number;
  alreadyExists: number;
}> {
  const required = await getRequiredTrainingsForStaff(staffId);

  if (required.length === 0) {
    return { inserted: 0, alreadyExists: 0 };
  }

  // 기존 staff_trainings 조회 (training_code 기준)
  const { data: existingRows, error: existingErr } = await supabase
    .from('staff_trainings')
    .select('training_code')
    .eq('staff_id', staffId);

  if (existingErr) {
    console.error('[job-category-trainings] staff_trainings 조회 실패:', existingErr);
    return { inserted: 0, alreadyExists: 0 };
  }

  const parsedExisting = z
    .array(StaffTrainingRowSchema)
    .safeParse(existingRows ?? []);

  const existingCodes = new Set(
    parsedExisting.success
      ? parsedExisting.data.map((r) => r.training_code)
      : []
  );

  const toInsert = required
    .filter((t) => !existingCodes.has(t.trainingCode))
    .map((t) => ({
      staff_id: staffId,
      training_code: t.trainingCode,
      training_name: t.trainingName,
      status: '미이수' as const,
      mandatory: t.mandatory,
      obligation_type: t.obligationType,
      cycle_months: t.cycleMonths,
      assigned_at: new Date().toISOString(),
    }));

  if (toInsert.length === 0) {
    return { inserted: 0, alreadyExists: required.length };
  }

  const { error: insertErr } = await supabase
    .from('staff_trainings')
    .insert(toInsert);

  if (insertErr) {
    console.error('[job-category-trainings] staff_trainings INSERT 실패:', insertErr);
    return { inserted: 0, alreadyExists: existingCodes.size };
  }

  return {
    inserted: toInsert.length,
    alreadyExists: required.length - toInsert.length,
  };
}
