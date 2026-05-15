'use client';

/**
 * useOpCheckBoardStream — OP체크 보드 실시간 스트림 훅
 *
 * 모바일 보드용 경량 데이터 소스. 데스크톱 OP체크.tsx 의 풀 데이터 로딩과
 * 별개로, 모바일에서 한 날짜의 일정만 가볍게 보여주기 위한 훅이다.
 *
 * 데이터 소스:
 * - board_posts (board_type='수술일정') → LinkedSchedulePost
 * - op_patient_checks → OpPatientCheck (status, checklist 진행도)
 *
 * 실시간:
 * - supabase realtime 두 채널(board_posts, op_patient_checks) 구독
 * - 변경 감지 시 refresh() 재호출
 * - unmount 시 unsubscribe (JM3 cleanup)
 *
 * JM:  ~180줄 단일 책임 — 보드 스트림만
 * JM3: try/catch + 채널 cleanup, error state 별도 노출
 * JM4: any 금지, 기존 op-check 타입 재사용
 * JM5: PII(환자명/차트번호)는 select 컬럼만 가져와 화이트리스트화
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  isMissingColumnError,
  withMissingColumnsFallback,
} from '@/lib/supabase-compat';
import type { BoardPost, OpPatientCheck } from '@/types';
import {
  OP_CHECK_BOARD_POST_OPTIONAL_COLUMNS,
  OP_CHECK_BOARD_POST_REQUIRED_COLUMNS,
  OP_PATIENT_CHECK_OPTIONAL_COLUMNS,
  OP_PATIENT_CHECK_REQUIRED_COLUMNS,
} from '../main/기능부품/OP체크/constants';
import {
  buildSelectColumns,
  isMissingRelationError,
  isOpCheckSchemaMissing,
  QueryResult,
} from '../main/기능부품/op-check-utils';
import {
  compareSchedules,
  mapSchedulePost,
  type LinkedSchedulePost,
} from '../main/기능부품/OP체크/schedule-helpers';

export type OpCheckBoardFilters = {
  /** YYYY-MM-DD. 빈 문자열이면 전체. */
  date: string;
  /** 회사(법인) ID 필터. 미지정 시 전체. */
  companyId?: string | null;
};

export type OpCheckBoardItem = {
  /** schedule(board_post) id */
  id: string;
  schedule: LinkedSchedulePost;
  /** 매칭된 환자 체크 (없으면 null) */
  patientCheck: OpPatientCheck | null;
};

export type OpCheckBoardState = {
  items: OpCheckBoardItem[];
  loading: boolean;
  error: string | null;
  /** 수동 새로고침 (풀-투-리프레시 / 헤더 버튼) */
  refresh: () => Promise<void>;
};

export function useOpCheckBoardStream(filters: OpCheckBoardFilters): OpCheckBoardState {
  const { date, companyId } = filters;
  const [schedulePosts, setSchedulePosts] = useState<LinkedSchedulePost[]>([]);
  const [patientChecks, setPatientChecks] = useState<OpPatientCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scheduleRes, patientCheckRes] = await Promise.all([
        withMissingColumnsFallback<BoardPost[]>(
          async (omittedColumns): Promise<QueryResult<BoardPost[]>> => {
            let query = supabase
              .from('board_posts')
              .select(
                buildSelectColumns(
                  OP_CHECK_BOARD_POST_REQUIRED_COLUMNS,
                  OP_CHECK_BOARD_POST_OPTIONAL_COLUMNS,
                  omittedColumns,
                ),
              )
              .eq('board_type', '수술일정');
            if (date && !omittedColumns.has('schedule_date')) {
              query = query.eq('schedule_date', date);
            }
            if (companyId && !omittedColumns.has('company_id')) {
              query = query.eq('company_id', companyId);
            }
            const result = await query.order('created_at', { ascending: true });
            return result as unknown as QueryResult<BoardPost[]>;
          },
          [...OP_CHECK_BOARD_POST_OPTIONAL_COLUMNS],
        ),
        withMissingColumnsFallback<OpPatientCheck[]>(
          async (omittedColumns): Promise<QueryResult<OpPatientCheck[]>> => {
            let query = supabase
              .from('op_patient_checks')
              .select(
                buildSelectColumns(
                  OP_PATIENT_CHECK_REQUIRED_COLUMNS,
                  OP_PATIENT_CHECK_OPTIONAL_COLUMNS,
                  omittedColumns,
                ),
              );
            if (date) {
              query = query.eq('schedule_date', date);
            }
            if (companyId) {
              query = query.eq('company_id', companyId);
            }
            const result = await query.order('schedule_time', { ascending: true });
            return result as unknown as QueryResult<OpPatientCheck[]>;
          },
          [...OP_PATIENT_CHECK_OPTIONAL_COLUMNS],
        ),
      ]);

      const firstError = scheduleRes.error || patientCheckRes.error;
      if (firstError) {
        if (isOpCheckSchemaMissing(firstError)) {
          if (aliveRef.current) {
            setSchedulePosts([]);
            setPatientChecks([]);
            setError('OP체크 테이블이 아직 준비되지 않았습니다.');
          }
          return;
        }
        // 관계/컬럼 누락은 빈 배열로 처리하고 사용자에겐 보이지 않게
        const relationMissing =
          isMissingRelationError(firstError, ['board_posts', 'op_patient_checks']) ||
          isMissingColumnError(firstError, 'schedule_date');
        if (!relationMissing) {
          throw firstError instanceof Error ? firstError : new Error(String(firstError));
        }
      }

      const posts = (scheduleRes.data || []).map((post) => mapSchedulePost(post));
      const sorted = [...posts].sort(compareSchedules);
      if (!aliveRef.current) return;
      setSchedulePosts(sorted);
      setPatientChecks(patientCheckRes.data || []);
    } catch (e) {
      if (!aliveRef.current) return;
      const message = e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.';
      setError(message);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [companyId, date]);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const channel = supabase
      .channel(`op_check_board_stream_${date || 'all'}_${companyId || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_posts' },
        () => {
          refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'op_patient_checks' },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      aliveRef.current = false;
      try {
        channel.unsubscribe();
      } catch {
        // 채널이 이미 종료된 경우 무시
      }
    };
  }, [companyId, date, refresh]);

  const items = useMemo<OpCheckBoardItem[]>(() => {
    const checkByScheduleId = new Map<string, OpPatientCheck>();
    for (const pc of patientChecks) {
      const key = String(pc.schedule_post_id || '').trim();
      if (key) checkByScheduleId.set(key, pc);
    }
    return schedulePosts.map((schedule) => ({
      id: schedule.id,
      schedule,
      patientCheck: checkByScheduleId.get(schedule.id) || null,
    }));
  }, [patientChecks, schedulePosts]);

  return { items, loading, error, refresh };
}

export default useOpCheckBoardStream;
