'use client';

/**
 * SApprovalOvertimeForm — 연장근무 신청 (모바일 인라인).
 *
 * 기안자 본인의 연장근무 이력을 "조회" 버튼으로 attendances에서 불러와(overtime_minutes>0)
 * 그중 신청할 날짜를 선택 → 선택 내역을 기준으로 기안 상신.
 *
 * 데이터: @/lib/db = D1 shim. JM: 단일 책임, JM3(try/catch+toast), JM4(any 금지)
 */

import { useCallback, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import type { ErpUser } from '@/types';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import MIcon from '../공통/MIcon';
import MCard from '../공통/MCard';
import { MFormHeader } from '../인사관리/form-helpers';
import { useApproverLine } from './useApproverLine';
import ApproverLineSection from './ApproverLineSection';
import AttachmentPicker, { type AttachmentEntry } from './AttachmentPicker';
import { submitApprovalDraft } from './기안상신';

type OvertimeRow = {
  date: string;
  minutes: number;
  checkIn: string | null;
  checkOut: string | null;
};

function hrs(min: number): string {
  return (min / 60).toFixed(1);
}
function timeOnly(ts: string | null): string {
  if (!ts) return '-';
  const m = /T(\d{2}:\d{2})/.exec(ts);
  return m ? m[1] : ts.slice(11, 16) || '-';
}

export default function SApprovalOvertimeForm({
  user,
  formSlug,
  formName,
  onCancel,
  onSubmitted }: {
  user: ErpUser;
  formSlug: string;
  formName: string;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const staffId = typeof user.id === 'string' && user.id.trim() !== '' ? user.id : null;
  const company = typeof user.company === 'string' ? user.company.trim() : '';

  const [records, setRecords] = useState<OvertimeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const approver = useApproverLine(staffId, company);

  const loadOvertime = useCallback(async () => {
    if (!staffId) {
      toast('계정 정보를 확인할 수 없습니다.', 'error');
      return;
    }
    setLoading(true);
    try {
      // 최근 120일 연장근무 이력
      const start = new Date();
      start.setDate(start.getDate() - 120);
      const startStr = formatKoreanDateKey(start);
      const { data, error } = await db
        .from('attendances')
        .select('work_date, overtime_minutes, check_in_at, check_out_at')
        .eq('staff_id', staffId)
        .gte('work_date', startStr)
        .order('work_date', { ascending: false });
      if (error) throw error;
      const rows: OvertimeRow[] = ((data ?? []) as Record<string, unknown>[])
        .map((r) => ({
          date: String(r.work_date ?? ''),
          minutes: Number(r.overtime_minutes ?? 0),
          checkIn: (r.check_in_at as string) ?? null,
          checkOut: (r.check_out_at as string) ?? null }))
        .filter((r) => r.date && r.minutes > 0);
      setRecords(rows);
      setLoaded(true);
      if (rows.length === 0) {
        toast('최근 120일 내 연장근무 이력이 없습니다.', 'warning');
      }
    } catch (err) {
      console.error('[mobile-approval] overtime load failed', err);
      toast('연장근무 이력 조회 실패', 'error');
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  const toggle = useCallback((date: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const selectedRows = useMemo(
    () => records.filter((r) => selected.has(r.date)),
    [records, selected],
  );
  const totalMinutes = selectedRows.reduce((acc, r) => acc + r.minutes, 0);

  const canSubmit = Boolean(staffId) && selectedRows.length > 0 && approver.approverLine.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!staffId) return;
    if (selectedRows.length === 0) {
      toast('신청할 연장근무 날짜를 선택해 주세요. (조회 후 선택)', 'warning');
      return;
    }
    if (approver.approverLine.length === 0) {
      toast('결재자를 한 명 이상 지정해 주세요. (상단 "변경")', 'error');
      return;
    }
    setSubmitting(true);
    const title = `연장근무 신청 (${selectedRows.length}건 · 총 ${hrs(totalMinutes)}시간)`;
    const content = selectedRows
      .map((r) => `· ${r.date}  ${timeOnly(r.checkIn)}~${timeOnly(r.checkOut)}  연장 ${hrs(r.minutes)}h`)
      .join('\n');
    try {
      const { queued, queuedAttachments } = await submitApprovalDraft({
        user,
        staffId,
        company,
        formSlug,
        formName,
        title,
        content,
        approverLine: approver.approverLine,
        approverManual: approver.approverManual,
        attachments,
        extraMeta: {
          overtime_records: selectedRows.map((r) => ({
            date: r.date,
            minutes: r.minutes,
            check_in: r.checkIn,
            check_out: r.checkOut })),
          overtime_total_minutes: totalMinutes } });
      if (queued) {
        toast('오프라인 — 기안이 동기화 대기 중입니다.', 'warning');
      } else if (queuedAttachments > 0) {
        toast(`기안이 상신되었습니다. 첨부 ${queuedAttachments}개는 온라인 복귀 시 업로드됩니다.`, 'warning');
      } else {
        toast('연장근무 신청이 결재선에 올라갔습니다.', 'success');
      }
      onSubmitted();
    } catch (err) {
      console.error('[mobile-approval] overtime submit failed', err);
      toast(`결재 상신 실패: ${err instanceof Error ? err.message : '오류'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [staffId, selectedRows, totalMinutes, approver, attachments, user, company, formSlug, formName, onSubmitted]);

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MFormHeader
        onCancel={onCancel}
        title={formName}
        sub="연장근무 이력 기반 작성"
        saveLabel={submitting ? '상신 중...' : '상신'}
        onSave={handleSubmit}
        saveDisabled={!canSubmit || submitting}
      />
      <div className="m-scroll" style={{ background: 'transparent' }}>
        {/* 조회 */}
        <div className="m-section" style={{ background: 'transparent' }}>
          <div className="m-section-h" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', padding: '8px 16px 4px' }}>
            <div className="lbl" style={{ flex: 1, fontSize: 13, fontWeight: 900, color: 'var(--z-700)' }}>연장근무 이력</div>
            <button
              type="button"
              className="transition-all active:scale-95"
              onClick={loadOvertime}
              disabled={loading}
              aria-label="연장근무 이력 조회"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 900,
                color: 'var(--m-accent)',
                padding: '4px 8px',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none' }}
            >
              <span style={{ display: 'inline-flex' }}><MIcon name="refresh" size={14} /></span>
              {loading ? '조회 중...' : '조회'}
            </button>
          </div>
          <MCard
            className="macos-glass macos-squircle"
            style={{
              overflow: 'hidden',
              margin: '0 16px',
              padding: 0 }}
          >
            {!loaded ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
                "조회"를 눌러 본인의 연장근무 이력을 불러오세요.
              </div>
            ) : records.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
                최근 120일 내 연장근무 이력이 없습니다.
              </div>
            ) : (
              <ul style={{ listStyle: 'none' }} aria-label="연장근무 이력 목록">
                {records.map((r, i) => {
                  const isSel = selected.has(r.date);
                  return (
                    <li key={r.date}>
                      <button
                        type="button"
                        onClick={() => toggle(r.date)}
                        aria-pressed={isSel}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          display: 'grid',
                          gridTemplateColumns: '24px 1fr auto',
                          gap: 12,
                          alignItems: 'center',
                          padding: '12px 16px',
                          borderBottom: i < records.length - 1 ? '1px solid rgba(0, 0, 0, 0.04)' : 'none',
                          background: isSel ? 'rgba(0, 122, 255, 0.06)' : 'transparent',
                          cursor: 'pointer',
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderTop: 'none' }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            border: isSel ? 'none' : '2px solid var(--z-300)',
                            background: isSel ? '#007AFF' : 'transparent',
                            display: 'grid',
                            placeItems: 'center' }}
                        >
                          {isSel && <MIcon name="check" size={14} color="#fff" />}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 900, color: 'var(--z-900)' }}>{r.date}</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--z-500)', marginTop: 1, fontWeight: 800 }}>
                            {timeOnly(r.checkIn)}~{timeOnly(r.checkOut)}
                          </span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--m-accent)' }}>
                          {hrs(r.minutes)}h
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </MCard>
          {selectedRows.length > 0 && (
            <div style={{ padding: '8px 20px 0', fontSize: 12, fontWeight: 800, color: 'var(--z-700)' }}>
              선택 {selectedRows.length}건 · 총 {hrs(totalMinutes)}시간
            </div>
          )}
        </div>

        <ApproverLineSection approver={approver} staffId={staffId} company={company} />

        <div className="m-section" style={{ background: 'transparent', padding: '0 16px' }}>
          <AttachmentPicker onChange={setAttachments} />
        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
