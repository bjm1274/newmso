'use client';
/**
 * JobCategoryTrainingMatrix.tsx
 *
 * 직종 × 필수교육 이수율 매트릭스 카드.
 * 클릭 시 미이수자 목록 모달 표시.
 * JM2: 단일 병렬 쿼리로 전체 데이터 로드 (N+1 없음)
 * JM4: Zod로 모든 Supabase 응답 검증
 * JM6: 키보드 포커스, 텍스트(%) 병행 표시
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { db } from '@/lib/db-client';
import { MatrixTable, type MatrixColumn, type MatrixCellTone } from '@/app/components/MatrixTable';

// ---------------------------------------------------------------------------
// Zod 스키마
// ---------------------------------------------------------------------------
const JobCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  display_order: z.number().optional() });

const RequiredTrainingSchema = z.object({
  id: z.string().uuid(),
  job_category_id: z.string().uuid().nullable(),
  applies_to_all: z.boolean(),
  training_code: z.string(),
  training_name: z.string(),
  mandatory: z.boolean(),
  obligation_type: z.enum(['legal', 'recommended']) });

const StaffJobCatSchema = z.object({
  staff_id: z.string(),
  job_category_id: z.string().uuid() });

const StaffTrainingSchema = z.object({
  staff_id: z.string(),
  training_code: z.string(),
  status: z.string() });

type JobCategory = z.infer<typeof JobCategorySchema>;
type RequiredTraining = z.infer<typeof RequiredTrainingSchema>;

// ---------------------------------------------------------------------------
// 내부 타입
// ---------------------------------------------------------------------------
interface MatrixCell {
  jobCategoryId: string;
  trainingCode: string;
  totalStaff: number;
  completedStaff: number;
  rate: number; // 0~100
  pendingStaffIds: string[];
}

interface NonCompletedStaff {
  staffId: string;
  name: string;
}

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------
function getCellColor(rate: number): string {
  if (rate >= 90) return 'bg-green-500/15 text-green-700 border-green-500/30';
  if (rate >= 70) return 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30';
  return 'bg-red-500/15 text-red-600 border-red-500/30';
}

function getCellAriaLabel(rate: number): string {
  if (rate >= 90) return '양호';
  if (rate >= 70) return '주의';
  return '위험';
}

function getCellTone(rate: number): MatrixCellTone {
  if (rate >= 90) return 'ok';
  if (rate >= 70) return 'warn';
  return 'danger';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  staffs: Record<string, unknown>[];
  selectedCo: string;
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function JobCategoryTrainingMatrix({ staffs, selectedCo }: Props) {
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [trainings, setTrainings] = useState<RequiredTraining[]>([]);
  const [matrix, setMatrix] = useState<MatrixCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 미이수자 모달
  const [modalCell, setModalCell] = useState<MatrixCell | null>(null);
  const [modalPendingStaffs, setModalPendingStaffs] = useState<NonCompletedStaff[]>([]);

  const activeStaffs = staffs.filter(
    (s) => s.status !== '퇴사' && (selectedCo === '전체' || s.company === selectedCo)
  );
  const activeStaffIds = activeStaffs.map((s) => String(s.id));

  const loadMatrix = useCallback(async () => {
    if (activeStaffIds.length === 0) {
      setMatrix([]);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // 단일 병렬 쿼리 — JM2
      const [
        { data: jcData, error: jcErr },
        { data: rtData, error: rtErr },
        { data: sjcData, error: sjcErr },
        { data: stData, error: stErr },
      ] = await Promise.all([
        db.from('job_categories').select('id, code, name, display_order').order('display_order'),
        db
          .from('job_category_required_trainings')
          .select('id, job_category_id, applies_to_all, training_code, training_name, mandatory, obligation_type')
          .eq('mandatory', true),
        db
          .from('staff_job_categories')
          .select('staff_id, job_category_id')
          .in('staff_id', activeStaffIds),
        db
          .from('staff_trainings')
          .select('staff_id, training_code, status')
          .in('staff_id', activeStaffIds),
      ]);

      if (jcErr || rtErr || sjcErr || stErr) {
        const msg = (jcErr ?? rtErr ?? sjcErr ?? stErr)?.message ?? '데이터 로드 실패';
        setError(msg);
        return;
      }

      // Zod 파싱
      const parsedJC = z.array(JobCategorySchema).safeParse(jcData ?? []);
      const parsedRT = z.array(RequiredTrainingSchema).safeParse(rtData ?? []);
      const parsedSJC = z.array(StaffJobCatSchema).safeParse(sjcData ?? []);
      const parsedST = z.array(StaffTrainingSchema).safeParse(stData ?? []);

      if (!parsedJC.success || !parsedRT.success || !parsedSJC.success || !parsedST.success) {
        setError('데이터 파싱 실패');
        return;
      }

      const jcs = parsedJC.data;
      const rts = parsedRT.data;
      const sjcs = parsedSJC.data;
      const sts = parsedST.data;

      setJobCategories(jcs);
      setTrainings(rts);

      // 직원 → 직종 맵
      const staffToJobCats = new Map<string, Set<string>>();
      for (const { staff_id, job_category_id } of sjcs) {
        if (!staffToJobCats.has(staff_id)) staffToJobCats.set(staff_id, new Set());
        staffToJobCats.get(staff_id)!.add(job_category_id);
      }

      // 직종 → 직원 맵
      const jobCatToStaffs = new Map<string, Set<string>>();
      for (const jc of jcs) {
        jobCatToStaffs.set(jc.id, new Set());
      }
      for (const sid of activeStaffIds) {
        const cats = staffToJobCats.get(sid) ?? new Set();
        for (const catId of cats) {
          if (!jobCatToStaffs.has(catId)) jobCatToStaffs.set(catId, new Set());
          jobCatToStaffs.get(catId)!.add(sid);
        }
      }

      // 이수 완료 집합: "staffId_trainingCode"
      const completedSet = new Set<string>();
      for (const { staff_id, training_code, status } of sts) {
        const normalized = status.trim().toLowerCase();
        if (
          normalized.includes('완료') ||
          normalized.includes('이수') ||
          normalized.includes('complete') ||
          normalized.includes('done')
        ) {
          completedSet.add(`${staff_id}_${training_code}`);
        }
      }

      // applies_to_all 교육 목록
      const allTrainings = rts.filter((rt) => rt.applies_to_all);

      // 매트릭스 계산
      const cells: MatrixCell[] = [];

      for (const jc of jcs) {
        // 해당 직종 직원
        const staffInJC = Array.from(jobCatToStaffs.get(jc.id) ?? []);
        if (staffInJC.length === 0) continue;

        // 직종 전용 교육 + 공통 교육
        const jcSpecificTrainings = rts.filter((rt) => rt.job_category_id === jc.id);
        const combinedTrainings = [
          ...allTrainings,
          ...jcSpecificTrainings.filter((t) => !allTrainings.some((a) => a.training_code === t.training_code)),
        ];

        for (const rt of combinedTrainings) {
          const pending: string[] = [];
          let completed = 0;
          for (const sid of staffInJC) {
            if (completedSet.has(`${sid}_${rt.training_code}`)) {
              completed++;
            } else {
              pending.push(sid);
            }
          }
          const total = staffInJC.length;
          cells.push({
            jobCategoryId: jc.id,
            trainingCode: rt.training_code,
            totalStaff: total,
            completedStaff: completed,
            rate: total > 0 ? Math.round((completed / total) * 100) : 0,
            pendingStaffIds: pending });
        }
      }

      setMatrix(cells);
    } catch (err) {
      setError('예기치 못한 오류가 발생했습니다.');
      console.error('[JobCategoryTrainingMatrix] 오류:', err);
    } finally {
      setLoading(false);
    }
  }, [activeStaffIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  const openModal = (cell: MatrixCell) => {
    const pending: NonCompletedStaff[] = cell.pendingStaffIds.map((sid) => {
      const s = activeStaffs.find((st) => String(st.id) === sid);
      return { staffId: sid, name: String(s?.name ?? sid) };
    });
    setModalCell(cell);
    setModalPendingStaffs(pending);
  };

  const closeModal = () => {
    setModalCell(null);
    setModalPendingStaffs([]);
  };

  // 직종별로 그룹화된 교육 코드
  const trainingCodes = useMemo(
    () => Array.from(new Set(matrix.map((c) => c.trainingCode))),
    [matrix]
  );
  const trainingNameMap = useMemo(
    () => new Map(trainings.map((t) => [t.training_code, t.training_name])),
    [trainings]
  );
  const trainingObligationMap = useMemo(
    () => new Map(trainings.map((t) => [t.training_code, t.obligation_type])),
    [trainings]
  );

  // 셀 조회를 O(1)로 (jobCategoryId + trainingCode 키)
  const matrixMap = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of matrix) m.set(`${c.jobCategoryId}_${c.trainingCode}`, c);
    return m;
  }, [matrix]);

  // 표시할 행 (셀이 1개라도 있는 직종만)
  const visibleRows = useMemo(
    () => jobCategories.filter((jc) => matrix.some((c) => c.jobCategoryId === jc.id)),
    [jobCategories, matrix]
  );

  // MatrixTable용 컬럼
  type Col = { code: string };
  const matrixColumns: MatrixColumn<Col>[] = useMemo(
    () =>
      trainingCodes.map((code) => {
        const obligationType = trainingObligationMap.get(code);
        const name = trainingNameMap.get(code) ?? code;
        return {
          id: code,
          label: (
            <div className="flex flex-col items-center gap-0.5">
              <span>{name}</span>
              {obligationType === 'legal' && (
                <span className="badge badge-red text-[8px]">법정의무</span>
              )}
              {obligationType === 'recommended' && (
                <span className="badge badge-gray text-[8px]">권장</span>
              )}
            </div>
          ),
          shortLabel: name,
          data: { code } };
      }),
    [trainingCodes, trainingNameMap, trainingObligationMap]
  );

  if (loading) {
    return (
      <div className="p-5 text-center text-xs text-[var(--toss-gray-3)]">
        직종별 이수율 계산 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 text-center text-xs text-red-500">
        데이터 로드 실패: {error}
      </div>
    );
  }

  if (matrix.length === 0) {
    return (
      <div className="p-5 text-center text-xs text-[var(--toss-gray-3)]">
        직종별 필수교육 데이터가 없습니다. 직종 및 필수교육 항목을 먼저 등록하세요.
      </div>
    );
  }

  return (
    <section aria-label="직종별 필수교육 이수율 매트릭스">
      <MatrixTable<JobCategory, Col>
        rows={visibleRows}
        columns={matrixColumns}
        rowKey={(jc) => jc.id}
        rowHeaderLabel="직종 / 교육"
        rowHeader={(jc) => jc.name}
        ariaLabel="직종별 이수율 표"
        emptyMessage="표시할 데이터가 없습니다."
        cellTone={(jc, col) => {
          const cell = matrixMap.get(`${jc.id}_${col.data.code}`);
          return cell ? getCellTone(cell.rate) : 'normal';
        }}
        renderCell={(jc, col) => {
          const cell = matrixMap.get(`${jc.id}_${col.data.code}`);
          if (!cell) {
            return <span className="text-[10px] text-[var(--toss-gray-3)]">—</span>;
          }
          const colorClass = getCellColor(cell.rate);
          const ariaStatus = getCellAriaLabel(cell.rate);
          const name = trainingNameMap.get(col.data.code) ?? col.data.code;
          return (
            <button
              type="button"
              onClick={() => openModal(cell)}
              className={`w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-center cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${colorClass}`}
              aria-label={`${jc.name} - ${name}: ${cell.rate}% (${ariaStatus}, 클릭하면 미이수자 목록 표시)`}
            >
              <span className="text-[11px] font-bold">{cell.rate}%</span>
              <span className="block text-[9px] opacity-70">
                {cell.completedStaff}/{cell.totalStaff}명
              </span>
            </button>
          );
        }}
      />

      {/* 범례 */}
      <div className="flex gap-3 mt-2 flex-wrap" aria-label="이수율 색상 범례">
        <span className="flex items-center gap-1 text-[10px]">
          <span className="w-3 h-3 rounded-sm bg-green-500/20 border border-green-500/30 inline-block" aria-hidden="true" />
          90% 이상 (양호)
        </span>
        <span className="flex items-center gap-1 text-[10px]">
          <span className="w-3 h-3 rounded-sm bg-yellow-500/20 border border-yellow-500/30 inline-block" aria-hidden="true" />
          70~89% (주의)
        </span>
        <span className="flex items-center gap-1 text-[10px]">
          <span className="w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/30 inline-block" aria-hidden="true" />
          70% 미만 (위험)
        </span>
      </div>

      {/* 미이수자 모달 */}
      {modalCell && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="미이수자 목록"
          onClick={closeModal}
        >
          <div
            className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm w-full max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-bold text-[var(--foreground)]">
                미이수자 목록
              </h4>
              <button
                onClick={closeModal}
                className="text-[var(--toss-gray-3)] text-lg leading-none"
                aria-label="모달 닫기"
              >
                ×
              </button>
            </div>
            <p className="text-[11px] text-[var(--toss-gray-3)] mb-3">
              교육: <strong>{trainingNameMap.get(modalCell.trainingCode) ?? modalCell.trainingCode}</strong>
              {' | '}
              미이수 {modalCell.pendingStaffIds.length}명 / 전체 {modalCell.totalStaff}명
            </p>
            {modalPendingStaffs.length === 0 ? (
              <p className="text-xs text-green-600 font-bold">전원 이수 완료</p>
            ) : (
              <ul className="space-y-1 max-h-60 overflow-y-auto" role="list" aria-label="미이수 직원 목록">
                {modalPendingStaffs.map(({ staffId, name }) => (
                  <li
                    key={staffId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--muted)] rounded-[var(--radius-md)] text-xs"
                  >
                    <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" aria-hidden="true" />
                    {name}
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={closeModal}
              className="mt-4 w-full py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
