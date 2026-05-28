'use client';

/**
 * 모바일 관리자 모듈 공용 데이터 훅·헬퍼.
 *
 * 모든 훅은 진입 시 1회 fetch + 실패 시 폴백.
 * 회사 격리 (company 필터) 클라이언트에서도 1차 적용 → JM5.
 *
 * - useAuditSummary : /api/admin/audit/summary 4 KPI
 * - useAuditLogs    : 최근 감사 로그 (제한 N)
 * - useStaffCount   : 회사 직원 수 (KPI 보조)
 * - useShifts/Cards : 회사관리 보조 (실데이터 시도, 실패시 fallback)
 * - useApprovalCustomForms : 추가 결재 양식 fetch (approval_form_types)
 * - toggleApprovalFormActive : 추가 양식 is_active 토글 + audit
 * - toggleMessageTemplateStatus : 메시지 템플릿 status 토글 + audit
 * - chipToneFor*    : 공통 tone 매핑 유틸
 *
 * JM2: 의존성은 primitive 만, cancelled flag 로 race 보호
 * JM3: try/catch + 콘솔 silent + 폴백, mutation은 결과 반환
 * JM4: any 금지, Record<string, unknown> → 안전 좁히기
 * JM5: company 클라이언트 필터 + RLS 의존, mutation은 admin/mso 사전 가드
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import type { ChipTone } from '../../기능부품/관리자워크센터/admin-types';

// ─────────────────────────────────────────────────────────────
// 공용 폴백 (PC fallback과 동일 컨셉)
// ─────────────────────────────────────────────────────────────

export interface AuditSummary {
  todayLogs: number;
  todayLogsSub: string;
  anomalyCount: number;
  anomalySub: string;
  payrollOutlierCount: number;
  payrollOutlierSub: string;
  lastBackupHoursAgo: number;
  lastBackupSub: string;
}

export const FALLBACK_AUDIT_SUMMARY: AuditSummary = {
  todayLogs: 0,
  todayLogsSub: '로그인 0 · 수정 0 · 조회 0',
  anomalyCount: 0,
  anomalySub: '이상 감지 기록 없음',
  payrollOutlierCount: 0,
  payrollOutlierSub: '전월 대비 이상치 없음',
  lastBackupHoursAgo: 0,
  lastBackupSub: '자동 백업 정보 없음',
};

// ─────────────────────────────────────────────────────────────
// useAuditSummary — 4 KPI 헤더용
// ─────────────────────────────────────────────────────────────

export function useAuditSummary(): { summary: AuditSummary; loading: boolean } {
  const [summary, setSummary] = useState<AuditSummary>(FALLBACK_AUDIT_SUMMARY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/audit/summary', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        if (json && typeof json === 'object' && alive) {
          const r = json as Record<string, unknown>;
          const next: AuditSummary = { ...FALLBACK_AUDIT_SUMMARY };
          if (typeof r.todayLogs === 'number') next.todayLogs = r.todayLogs;
          if (typeof r.todayLogsSub === 'string') next.todayLogsSub = r.todayLogsSub;
          if (typeof r.anomalyCount === 'number') next.anomalyCount = r.anomalyCount;
          if (typeof r.anomalySub === 'string') next.anomalySub = r.anomalySub;
          if (typeof r.payrollOutlierCount === 'number') next.payrollOutlierCount = r.payrollOutlierCount;
          if (typeof r.payrollOutlierSub === 'string') next.payrollOutlierSub = r.payrollOutlierSub;
          if (typeof r.lastBackupHoursAgo === 'number') next.lastBackupHoursAgo = r.lastBackupHoursAgo;
          if (typeof r.lastBackupSub === 'string') next.lastBackupSub = r.lastBackupSub;
          setSummary(next);
        }
      } catch {
        // 폴백 유지 — 정상 흐름
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { summary, loading };
}

// ─────────────────────────────────────────────────────────────
// useAuditLogs — 감사로그 (audit_logs 테이블 우선, 실패시 fallback)
// ─────────────────────────────────────────────────────────────

export type AuditSeverity = '심각' | '경고' | '정보';

export interface AuditLogItem {
  id: string;
  severity: AuditSeverity;
  title: string;
  actor: string;
  target: string;
  at: string;
  tone: ChipTone;
}

const FALLBACK_AUDIT_LOGS: AuditLogItem[] = [];

function pickSeverity(value: unknown): AuditSeverity {
  if (value === '심각' || value === 'critical' || value === 'error') return '심각';
  if (value === '경고' || value === 'warning' || value === 'warn') return '경고';
  return '정보';
}

function severityTone(s: AuditSeverity): ChipTone {
  if (s === '심각') return 'danger';
  if (s === '경고') return 'warn';
  return 'muted';
}

export function useAuditLogs(company: string | undefined, limit = 30): {
  logs: AuditLogItem[];
  loading: boolean;
  source: 'supabase' | 'fallback';
} {
  const [logs, setLogs] = useState<AuditLogItem[]>(FALLBACK_AUDIT_LOGS);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'supabase' | 'fallback'>('fallback');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let q = supabase
          .from('audit_logs')
          .select('id, severity, title, actor_name, target, created_at, company')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (company && company !== '전체') q = q.eq('company', company);
        const { data, error } = await q;
        if (!alive) return;
        if (error || !Array.isArray(data) || data.length === 0) {
          setSource('fallback');
        } else {
          const parsed = data.map<AuditLogItem | null>((row) => {
            if (!row || typeof row !== 'object') return null;
            const r = row as Record<string, unknown>;
            const id = typeof r.id === 'string' ? r.id : typeof r.id === 'number' ? String(r.id) : null;
            if (!id) return null;
            const severity = pickSeverity(r.severity);
            const title = typeof r.title === 'string' ? r.title : '(제목 없음)';
            const actor = typeof r.actor_name === 'string' ? r.actor_name : '시스템';
            const target = typeof r.target === 'string' ? r.target : '';
            const at = typeof r.created_at === 'string' ? r.created_at : '';
            return { id, severity, title, actor, target, at, tone: severityTone(severity) };
          }).filter((l): l is AuditLogItem => l !== null);
          if (parsed.length > 0) {
            setLogs(parsed);
            setSource('supabase');
          }
        }
      } catch {
        // 정상 흐름 — 폴백 유지
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [company, limit]);

  return { logs, loading, source };
}

// ─────────────────────────────────────────────────────────────
// useStaffCount — 회사 직원 수 (헤더 sub 등)
// ─────────────────────────────────────────────────────────────

export function useStaffCount(company: string | undefined): { count: number; loading: boolean } {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let q = supabase
          .from('staff_members')
          .select('id', { count: 'exact', head: true });
        if (company && company !== '전체') q = q.eq('company', company);
        const { count: c, error } = await q;
        if (!alive) return;
        if (error || typeof c !== 'number') {
          setCount(0);
        } else {
          setCount(c);
        }
      } catch {
        // 폴백 — 0
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [company]);

  return { count, loading };
}

// ─────────────────────────────────────────────────────────────
// ChipTone → 모바일 MChipTone 매핑 (warn → warning)
// ─────────────────────────────────────────────────────────────

export type MChipTone = '' | 'accent' | 'success' | 'warning' | 'danger';

export function pcToneToMobile(tone: ChipTone | undefined): MChipTone {
  if (!tone) return '';
  if (tone === 'warn') return 'warning';
  if (tone === 'muted') return '';
  return tone;
}

// ─────────────────────────────────────────────────────────────
// 결재 양식 추가분 (approval_form_types) — fetch + 토글
// 빌트인 14종은 코드 고정, 여기서는 추가 양식만 read/toggle
// ─────────────────────────────────────────────────────────────

export interface ApprovalCustomForm {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  updatedAt: string | null;
}

function toApprovalCustomForm(row: unknown): ApprovalCustomForm | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : typeof r.id === 'number' ? String(r.id) : null;
  const name = typeof r.name === 'string' ? r.name : null;
  const slug = typeof r.slug === 'string' ? r.slug : null;
  if (!id || !name || !slug) return null;
  const isActive = r.is_active !== false;
  const updatedAt = typeof r.updated_at === 'string' ? r.updated_at : null;
  return { id, name, slug, isActive, updatedAt };
}

export function useApprovalCustomForms(companyName: string | undefined): {
  forms: ApprovalCustomForm[];
  loading: boolean;
  reload: () => void;
  setLocal: (updater: (prev: ApprovalCustomForm[]) => ApprovalCustomForm[]) => void;
} {
  const [forms, setForms] = useState<ApprovalCustomForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let q = supabase
          .from('approval_form_types')
          .select('id, name, slug, is_active, updated_at, company_name')
          .order('sort_order', { ascending: true });
        if (companyName && companyName !== '전체') q = q.eq('company_name', companyName);
        const { data, error } = await q;
        if (!alive) return;
        if (!error && Array.isArray(data)) {
          const parsed = data
            .map(toApprovalCustomForm)
            .filter((f): f is ApprovalCustomForm => f !== null);
          setForms(parsed);
        }
      } catch {
        // 폴백 — 빈 배열 유지 (테이블 없음/RLS 거부)
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [companyName, version]);

  return {
    forms,
    loading,
    reload: () => setVersion((v) => v + 1),
    setLocal: (updater) => setForms((prev) => updater(prev)),
  };
}

/**
 * 추가 결재 양식 활성/비활성 토글.
 * 호출 측이 낙관적 업데이트를 먼저 적용한 후, 실패 시 롤백한다.
 * audit 로그도 동시에 기록.
 */
export async function toggleApprovalFormActive(
  form: ApprovalCustomForm,
  actor: { userId?: string; userName?: string },
): Promise<{ error: string | null }> {
  const nextActive = !form.isActive;
  try {
    const { error } = await supabase
      .from('approval_form_types')
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq('id', form.id);
    if (error) return { error: error.message };
    // audit (실패해도 사용자 흐름은 정상)
    void logAudit(
      '결재양식 활성 토글',
      'approval_form_types',
      form.id,
      {
        form_name: form.name,
        form_slug: form.slug,
        before: { is_active: form.isActive },
        after: { is_active: nextActive },
      },
      actor.userId,
      actor.userName,
    );
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류' };
  }
}

// ─────────────────────────────────────────────────────────────
// 메시지 템플릿 (message_templates) — status 토글
// PC: MessageTemplate.status: '활성' | '초안' | '보류'
// 모바일: '활성' ↔ '보류' 단순 토글
// ─────────────────────────────────────────────────────────────

export type MessageTemplateStatus = '활성' | '초안' | '보류';

export function nextMessageStatus(current: MessageTemplateStatus): MessageTemplateStatus {
  // 활성 ↔ 보류 (초안은 데스크톱에서만 변경)
  return current === '활성' ? '보류' : '활성';
}

export async function toggleMessageTemplateStatus(
  templateId: string,
  templateName: string,
  before: MessageTemplateStatus,
  actor: { userId?: string; userName?: string },
): Promise<{ error: string | null; next: MessageTemplateStatus }> {
  const after = nextMessageStatus(before);
  try {
    const { error } = await supabase
      .from('message_templates')
      .update({ status: after, updated_at: new Date().toISOString() })
      .eq('id', templateId);
    if (error) return { error: error.message, next: before };
    void logAudit(
      '메시지 템플릿 상태 변경',
      'message_templates',
      templateId,
      {
        template_name: templateName,
        before: { status: before },
        after: { status: after },
      },
      actor.userId,
      actor.userName,
    );
    return { error: null, next: after };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : '알 수 없는 오류',
      next: before,
    };
  }
}
