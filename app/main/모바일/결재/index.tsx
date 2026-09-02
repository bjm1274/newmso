'use client';
 

/**
 * 결재 라우터 — inbox / sent / ref / write / detail 5뷰 + 상세 분기.
 * MobileShell이 tab === 'approval' 일 때 마운트한다.
 * JM: 단일 책임 (분기 + 데이터 호이스팅), ~120줄
 * JM2: useApprovalList 1회 fetch 후 useClassifiedApprovals로 메모리에서 분류 — N+1 방지
 */

import { useCallback, useMemo, useState, useEffect } from 'react';
import type { ErpUser } from '@/types';
import SApproval from './결재함';
import SApprovalDocs from './문서조회';
import SApprovalSent from './기안함';
import SApprovalRef from './참조함';
import SApprovalWrite from './작성하기';
import SApprovalLeaveForm from './연차신청폼';
import SApprovalGenericForm from './일반기안폼';
import SApprovalOvertimeForm from './연장근무폼';
import SApprovalLeavePlanForm from './연차계획폼';
import SApprovalAttendanceFixForm from './출결정정폼';
import SApprovalDetail from './결재상세';
import {
  useApprovalList,
  useClassifiedApprovals,
  type ApprovalRow } from './data-hooks';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

export type ApprovalView = 'inbox' | 'docs' | 'sent' | 'ref' | 'write' | 'compose' | 'detail';

export type 결재Props = {
  user: ErpUser;
  sub?: string;
  initialApprovalId?: string | null;
  initialViewMode?: string | null;
  onConsumeApprovalIntent?: () => void;
};

// id 기준 중복 제거(분류 버킷 합산 시 동일 문서 1회만)
function dedupeById(list: ApprovalRow[]): ApprovalRow[] {
  const seen = new Set<string>();
  const out: ApprovalRow[] = [];
  for (const row of list) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

export default function 결재({ user, sub, initialApprovalId, initialViewMode, onConsumeApprovalIntent }: 결재Props) {
  const staffId = useResolvedStaffId(user as Record<string, unknown>);
  const staffName = typeof user.name === 'string' ? user.name : null;
  const company = typeof user.company === 'string' ? user.company : null;

  const [view, setView] = useState<ApprovalView>(() => {
    if (initialApprovalId || (sub && sub.startsWith('detail:'))) return 'detail';
    const effectiveSub = sub || initialViewMode;
    if (effectiveSub === 'sent' || effectiveSub === '기안함') return 'sent';
    if (effectiveSub === 'ref' || effectiveSub === '참조함') return 'ref';
    if (effectiveSub === 'docs' || effectiveSub === '문서조회') return 'docs';
    if (effectiveSub === 'write' || effectiveSub === '작성하기') return 'write';
    if (effectiveSub && effectiveSub.startsWith('compose:')) return 'compose';
    return 'inbox';
  });
  const [detailId, setDetailId] = useState<string | null>(() => {
    if (initialApprovalId) return initialApprovalId;
    if (sub && sub.startsWith('detail:')) return sub.split(':')[1] || null;
    return null;
  });
  const [composeForm, setComposeForm] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    if (initialApprovalId) {
      setDetailId(initialApprovalId);
      setView('detail');
      onConsumeApprovalIntent?.();
      return;
    }
    if (sub === 'compose:leave' || sub === 'compose:연차') {
      setComposeForm({ slug: 'leave', name: '연차/휴가' });
      setView('compose');
    } else if (sub === 'compose:annual_plan') {
      setComposeForm({ slug: 'annual_plan', name: '연차계획서' });
      setView('compose');
    } else if (sub === 'compose:leave_promotion_notice') {
      setComposeForm({ slug: 'leave_promotion_notice', name: '연차촉진통보서' });
      setView('compose');
    } else if (sub && sub.startsWith('detail:')) {
      const id = sub.split(':')[1];
      if (id) {
        setDetailId(id);
        setView('detail');
      }
    } else if (sub === 'inbox' || sub === 'docs' || sub === 'sent' || sub === 'ref' || sub === 'write') {
      setView(sub as ApprovalView);
    } else if (sub === '결재함') {
      setView('inbox');
    } else if (sub === '기안함') {
      setView('sent');
    } else if (sub === '참조함') {
      setView('ref');
    } else if (sub === '문서조회') {
      setView('docs');
    } else if (sub === '작성하기') {
      setView('write');
    }
  }, [sub, initialApprovalId, onConsumeApprovalIntent]);

  const department = typeof user.department === 'string' ? user.department : null;

  const { rows, loading, refetch } = useApprovalList(staffId, company);
  const { inbox, progress, done, sent, ref } = useClassifiedApprovals(rows, staffId, department);

  // 문서 조회용 — 본인 관여 문서를 진행 중 / 처리 완료로 합산(중복 제거)
  const docProgress = useMemo(() => dedupeById([...inbox, ...progress]), [inbox, progress]);
  const docCompleted = useMemo(
    () =>
      dedupeById([
        ...done,
        ...sent.filter((r) => r.status === '승인' || r.status === '반려'),
      ]),
    [done, sent],
  );

  const handleOpen = useCallback((id: string) => {
    setDetailId(id);
    setView('detail');
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setDetailId(null);
    setView('inbox');
  }, []);

  const initialDetailRow: ApprovalRow | null = useMemo(() => {
    if (!detailId) return null;
    return rows.find((r) => String(r.id) === detailId) ?? null;
  }, [rows, detailId]);

  let contentElement: React.ReactNode;

  if (view === 'detail' && detailId) {
    contentElement = (
      <SApprovalDetail
        staffId={staffId}
        staffName={staffName}
        approvalId={detailId}
        initialRow={initialDetailRow}
        onBack={handleBackFromDetail}
        onChanged={refetch}
      />
    );
  } else if (view === 'docs') {
    contentElement = (
      <SApprovalDocs
        staffId={staffId}
        inProgress={docProgress}
        completed={docCompleted}
        loading={loading}
        onOpen={handleOpen}
        onBack={() => setView('inbox')}
      />
    );
  } else if (view === 'sent') {
    contentElement = (
      <SApprovalSent
        staffId={staffId}
        rows={sent}
        loading={loading}
        onBack={() => setView('inbox')}
        onOpen={handleOpen}
        onWrite={() => setView('write')}
      />
    );
  } else if (view === 'ref') {
    contentElement = (
      <SApprovalRef
        staffId={staffId}
        rows={ref}
        loading={loading}
        onBack={() => setView('inbox')}
        onOpen={handleOpen}
      />
    );
  } else if (view === 'write') {
    contentElement = (
      <SApprovalWrite
        onBack={() => setView('inbox')}
        onPick={(slug, name) => {
          setComposeForm({ slug, name });
          setView('compose');
        }}
      />
    );
  } else if (view === 'compose' && composeForm) {
    const onCancel = () => setView('write');
    const onSubmitted = () => {
      refetch();
      setView('sent');
    };
    if (composeForm.slug === 'leave') {
      contentElement = <SApprovalLeaveForm user={user} onCancel={onCancel} onSubmitted={onSubmitted} />;
    } else if (composeForm.slug === 'attendance_fix') {
      contentElement = <SApprovalAttendanceFixForm user={user} onCancel={onCancel} onSubmitted={onSubmitted} />;
    } else if (composeForm.slug === 'overtime') {
      contentElement = (
        <SApprovalOvertimeForm
          user={user}
          formSlug={composeForm.slug}
          formName={composeForm.name}
          onCancel={onCancel}
          onSubmitted={onSubmitted}
        />
      );
    } else if (composeForm.slug === 'annual_plan' || composeForm.slug === 'leave_promotion_notice') {
      contentElement = (
        <SApprovalLeavePlanForm
          user={user}
          formSlug={composeForm.slug}
          formName={composeForm.name}
          onCancel={onCancel}
          onSubmitted={onSubmitted}
        />
      );
    } else {
      contentElement = (
        <SApprovalGenericForm
          user={user}
          formSlug={composeForm.slug}
          formName={composeForm.name}
          onCancel={onCancel}
          onSubmitted={onSubmitted}
        />
      );
    }
  } else {
    contentElement = (
      <SApproval
        staffId={staffId}
        rows={rows}
        inbox={inbox}
        progress={progress}
        done={done}
        refCount={ref.length}
        sentCount={sent.length}
        loading={loading}
        onOpen={handleOpen}
        onNavDocs={() => setView('docs')}
        onNavSent={() => setView('sent')}
        onNavRef={() => setView('ref')}
        onNavWrite={() => setView('write')}
        onRefresh={refetch}
      />
    );
  }

  return (
    <div
      data-testid="approval-view"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(145deg, #f3ecfc 0%, #f6f0fd 30%, #ecf5fc 70%, #ecfaf4 100%)' }}
    >
      {contentElement}
    </div>
  );
}
