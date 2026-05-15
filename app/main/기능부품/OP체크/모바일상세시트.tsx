'use client';

/**
 * OP체크 모바일 상세 시트
 *
 * docs/mobile/MSO_Mobile_Phase3_Screens.md §1 — OP체크 모바일 1장 통합의 상세 편집기.
 * 데스크톱 OP체크.tsx 의 워크스페이스 패널이 PC 폭에 최적화돼 있어 모바일에서는
 * BottomSheet 안에 핵심 액션만 추려 노출한다.
 *
 * 표시 항목:
 *   - 환자/수술 헤더 (읽기 전용)
 *   - 상태 라디오 (준비중·준비완료·수술중·완료) + haptics.selection
 *   - 준비 체크리스트 (checked toggle만)
 *   - 소모품 체크리스트 (checked toggle만)
 *   - 메모(notes) textarea
 *   - 사진 첨부 (CameraInput) + 로컬 프리뷰 (현재 schema 미지원, 저장 시 안내)
 *   - StickyFormFooter: 취소 / 저장
 *
 * 데이터 소스:
 *   - op_patient_checks(by schedule_post_id) 단건 조회 → 기존 행 있으면 그 값 사용
 *   - 없으면 board_posts에서 메타 가져와 기본값 생성
 *   - 저장은 데스크톱과 동일한 upsert 구조 (constants.ts 의 컬럼 화이트리스트)
 *
 * JM:  단일 책임(모바일 OP체크 상세 시트), 약 250줄
 * JM3: try/catch + 사용자 메시지는 toast, 콘솔 로그는 상세 디버그
 * JM4: any 금지, OpPatientCheck/BoardPost 타입 활용
 * JM5: 환자명/차트번호는 화면에만 표시 — 콘솔/URL 노출 없음
 * JM6: BottomSheet 내장 focus trap + label/checkbox/radio aria 처리
 */

import { useCallback, useEffect, useState } from 'react';
import { BottomSheet } from '@/app/components/BottomSheet';
import StickyFormFooter from '@/app/components/StickyFormFooter';
import { CameraInput } from '@/app/components/CameraInput';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { haptics } from '@/app/lib/haptics';
import type { BoardPost, OpPatientCheck } from '@/types';
import {
  OP_PATIENT_CHECK_OPTIONAL_COLUMNS,
  OP_PATIENT_CHECK_REQUIRED_COLUMNS,
  STATUS_OPTIONS,
} from './constants';
import {
  buildSelectColumns,
  QueryResult,
  stripHiddenMetaBlocks,
} from '../op-check-utils';
import {
  formatChecklistItems,
  normalizeChecklistItems,
  type ChecklistItemDraft,
} from './checklist-helpers';
import { mapSchedulePost } from './schedule-helpers';

export type OpCheckMobileDetailSheetProps = {
  open: boolean;
  scheduleId: string | null;
  onClose: () => void;
  /** 저장 성공 시 보드에서 즉시 반영하기 위한 후크 */
  onSaved?: (next: OpPatientCheck) => void;
  /** 현재 사용자 정보 (감사 컬럼) */
  user?: {
    id?: string | null;
    name?: string | null;
    company?: string | null;
    company_id?: string | null;
  } | null;
};

type SheetState = {
  scheduleId: string;
  patientName: string;
  chartNo: string;
  surgeryName: string;
  surgeryRoom: string;
  surgeryTime: string;
  surgeryDate: string;
  company: string;
  companyId: string;
  existingId: string | null;
  status: string;
  notes: string;
  prepItems: ChecklistItemDraft[];
  consumableItems: ChecklistItemDraft[];
  appliedTemplateIds: string[];
  surgeryTemplateId: string;
  anesthesiaType: string;
};

function isOpCheckStatus(value: string): value is (typeof STATUS_OPTIONS)[number] {
  return (STATUS_OPTIONS as readonly string[]).includes(value);
}

async function loadSheetState(scheduleId: string): Promise<SheetState | null> {
  const [postRes, checkRes] = await Promise.all([
    supabase.from('board_posts').select('*').eq('id', scheduleId).maybeSingle(),
    withMissingColumnsFallback<OpPatientCheck | null>(
      async (omittedColumns): Promise<QueryResult<OpPatientCheck | null>> => {
        const result = await supabase
          .from('op_patient_checks')
          .select(
            buildSelectColumns(
              OP_PATIENT_CHECK_REQUIRED_COLUMNS,
              OP_PATIENT_CHECK_OPTIONAL_COLUMNS,
              omittedColumns,
            ),
          )
          .eq('schedule_post_id', scheduleId)
          .maybeSingle();
        return result as unknown as QueryResult<OpPatientCheck | null>;
      },
      [...OP_PATIENT_CHECK_OPTIONAL_COLUMNS],
    ),
  ]);

  if (postRes.error) throw postRes.error;
  if (!postRes.data) return null;
  if (checkRes.error) throw checkRes.error;

  const schedule = mapSchedulePost(postRes.data as BoardPost);
  const existing = checkRes.data;

  return {
    scheduleId: schedule.id,
    patientName: stripHiddenMetaBlocks(existing?.patient_name || schedule.patient_name),
    chartNo: stripHiddenMetaBlocks(existing?.chart_no || schedule.chart_no || ''),
    surgeryName: schedule.surgery_name,
    surgeryRoom: schedule.schedule_room,
    surgeryTime: schedule.schedule_time,
    surgeryDate: schedule.schedule_date,
    company: schedule.company,
    companyId: schedule.company_id,
    existingId: existing?.id ? String(existing.id) : null,
    status: isOpCheckStatus(String(existing?.status || '').trim())
      ? String(existing?.status || '준비중').trim()
      : '준비중',
    notes: String(existing?.notes || '').trim(),
    prepItems: normalizeChecklistItems(existing?.prep_items, 'patient-prep'),
    consumableItems: normalizeChecklistItems(existing?.consumable_items, 'patient-consumable'),
    appliedTemplateIds: Array.isArray(existing?.applied_template_ids)
      ? existing.applied_template_ids.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    surgeryTemplateId: String(existing?.surgery_template_id || '').trim(),
    anesthesiaType: String(existing?.anesthesia_type || '').trim(),
  };
}

type ChecklistKey = 'prepItems' | 'consumableItems';

function ChecklistSection({
  title,
  items,
  onToggle,
}: {
  title: string;
  items: ChecklistItemDraft[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
        <h3 className="text-xs font-bold text-[var(--foreground)]">{title}</h3>
        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">등록된 항목이 없습니다.</p>
      </section>
    );
  }
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
      <h3 className="text-xs font-bold text-[var(--foreground)]">{title}</h3>
      <ul className="mt-2 flex flex-col gap-2" role="group" aria-label={title}>
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2 text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={Boolean(item.checked)}
                onChange={() => onToggle(item.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                aria-label={`${title} 항목 ${item.name || '이름 없음'}`}
              />
              <span className="flex-1 break-words">
                <span className="font-medium">{item.name || '이름 없음'}</span>
                {item.quantity || item.unit ? (
                  <span className="ml-1 text-xs text-[var(--toss-gray-4)]">
                    {item.quantity || ''}{item.unit ? ` ${item.unit}` : ''}
                  </span>
                ) : null}
                {item.note ? (
                  <span className="block text-xs text-[var(--toss-gray-3)]">{item.note}</span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function OpCheckMobileDetailSheet({
  open,
  scheduleId,
  onClose,
  onSaved,
  user,
}: OpCheckMobileDetailSheetProps) {
  const [state, setState] = useState<SheetState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    if (!open || !scheduleId) {
      setState(null);
      setPhotoPreviews([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    loadSheetState(scheduleId)
      .then((next) => {
        if (!alive) return;
        if (!next) setError('수술 일정을 찾을 수 없습니다.');
        else setState(next);
      })
      .catch((e) => {
        if (!alive) return;
        console.error('OP체크 상세 로딩 실패', e);
        setError(e instanceof Error ? e.message : '상세 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
    // photoPreviews 는 cleanup 전용으로만 참조하므로 deps 제외 (JM2: 불필요 리렌더 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scheduleId]);

  const toggleChecklist = useCallback((key: ChecklistKey, itemId: string) => {
    haptics.selection();
    setState((prev) => {
      if (!prev) return prev;
      const list = prev[key];
      return {
        ...prev,
        [key]: list.map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item,
        ),
      };
    });
  }, []);

  const handleStatusChange = useCallback((next: string) => {
    haptics.selection();
    setState((prev) => (prev ? { ...prev, status: next } : prev));
  }, []);

  const handleNotesChange = useCallback((next: string) => {
    setState((prev) => (prev ? { ...prev, notes: next } : prev));
  }, []);

  const handlePhotoCapture = useCallback(async (files: File[]) => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPhotoPreviews((prev) => [...prev, ...urls]);
  }, []);

  const handleSave = useCallback(async () => {
    if (!state) return;
    setSaving(true);
    try {
      const payload = {
        id: state.existingId || undefined,
        schedule_post_id: state.scheduleId,
        company_id: state.companyId || user?.company_id || null,
        company_name: state.company || user?.company || '전체',
        patient_name: state.patientName,
        chart_no: state.chartNo || null,
        surgery_name: state.surgeryName,
        surgery_template_id: state.surgeryTemplateId || null,
        anesthesia_type: state.anesthesiaType || null,
        schedule_date: state.surgeryDate || null,
        schedule_time: state.surgeryTime || null,
        schedule_room: state.surgeryRoom || null,
        prep_items: formatChecklistItems(state.prepItems),
        consumable_items: formatChecklistItems(state.consumableItems),
        notes: state.notes || null,
        status: state.status || '준비중',
        applied_template_ids: state.appliedTemplateIds,
        created_by: user?.id || null,
        created_by_name: user?.name || null,
        updated_by: user?.id || null,
        updated_by_name: user?.name || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error: saveError } = await withMissingColumnsFallback<OpPatientCheck>(
        async (omittedColumns): Promise<QueryResult<OpPatientCheck>> => {
          const result = await supabase
            .from('op_patient_checks')
            .upsert(payload, { onConflict: 'schedule_post_id' })
            .select(
              buildSelectColumns(
                OP_PATIENT_CHECK_REQUIRED_COLUMNS,
                OP_PATIENT_CHECK_OPTIONAL_COLUMNS,
                omittedColumns,
              ),
            )
            .single();
          return result as unknown as QueryResult<OpPatientCheck>;
        },
        [...OP_PATIENT_CHECK_OPTIONAL_COLUMNS],
      );

      if (saveError) throw saveError;
      haptics.success();
      if (photoPreviews.length > 0) {
        toast('OP체크 저장 완료. 사진 저장은 곧 지원됩니다.', 'success');
      } else {
        toast('OP체크를 저장했습니다.', 'success');
      }
      if (data) onSaved?.(data);
      onClose();
    } catch (e) {
      console.error('OP체크 모바일 저장 실패', e);
      haptics.error();
      toast(e instanceof Error ? e.message : 'OP체크 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }, [state, user?.company, user?.company_id, user?.id, user?.name, photoPreviews.length, onSaved, onClose]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      mode="full"
      title="OP체크 상세"
      footer={
        <StickyFormFooter
          withSpacer={false}
          secondary={
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-bold text-[var(--toss-gray-4)] disabled:opacity-50"
            >
              취소
            </button>
          }
          primary={
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !state}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          }
        />
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--toss-gray-4)]" aria-live="polite">
          불러오는 중…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--toss-gray-4)]"
        >
          {error}
        </div>
      ) : !state ? null : (
        <div className="flex flex-col gap-3">
          <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">{state.patientName || '환자 미지정'}</p>
            <p className="text-xs text-[var(--toss-gray-4)]">{state.surgeryName || '수술명 미지정'}</p>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              {state.surgeryDate || '날짜 미정'} · {state.surgeryTime || '시간 미정'} · {state.surgeryRoom || '방 미정'}
            </p>
            {state.chartNo ? (
              <p className="text-xs text-[var(--toss-gray-3)]">차트: {state.chartNo}</p>
            ) : null}
          </section>

          <fieldset className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
            <legend className="px-1 text-xs font-bold text-[var(--foreground)]">상태</legend>
            <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="OP체크 상태">
              {STATUS_OPTIONS.map((opt) => {
                const active = state.status === opt;
                return (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-1 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-bold ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="op-check-status"
                      value={opt}
                      checked={active}
                      onChange={() => handleStatusChange(opt)}
                      className="sr-only"
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <ChecklistSection
            title="준비 체크리스트"
            items={state.prepItems}
            onToggle={(id) => toggleChecklist('prepItems', id)}
          />
          <ChecklistSection
            title="소모품 체크리스트"
            items={state.consumableItems}
            onToggle={(id) => toggleChecklist('consumableItems', id)}
          />

          <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-[var(--foreground)]">
              메모
              <textarea
                value={state.notes}
                onChange={(event) => handleNotesChange(event.target.value)}
                rows={4}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm font-medium text-[var(--foreground)]"
                placeholder="추가 메모를 입력하세요."
              />
            </label>
          </section>

          <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--foreground)]">사진 첨부</h3>
              <CameraInput
                onFiles={handlePhotoCapture}
                multiple
                capture="environment"
                label="촬영"
                ariaLabel="OP체크 사진 촬영"
              />
            </div>
            {photoPreviews.length > 0 ? (
              <ul className="mt-2 grid grid-cols-3 gap-2" aria-label="첨부한 사진 미리보기">
                {photoPreviews.map((url, index) => (
                  <li key={url} className="aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
                    {/* 로컬 데이터 URL — JM5 외부 URL 노출 없음 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`첨부 사진 ${index + 1}`} className="h-full w-full object-cover" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-[var(--toss-gray-3)]">사진 저장은 곧 지원됩니다. 현재는 미리보기만 가능합니다.</p>
            )}
          </section>
        </div>
      )}
    </BottomSheet>
  );
}
