'use client';
/* eslint-disable react-hooks/rules-of-hooks */

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
import SApprovalDetail from './결재상세';
import {
  useApprovalList,
  useClassifiedApprovals,
  type ApprovalRow,
} from './data-hooks';

export type ApprovalView = 'inbox' | 'docs' | 'sent' | 'ref' | 'write' | 'compose' | 'detail';

export type 결재Props = {
  user: ErpUser;
  sub?: string;
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

export default function 결재({ user, sub }: 결재Props) {
  const staffId = typeof user.id === 'string' && user.id.trim() !== '' ? user.id : null;
  const staffName = typeof user.name === 'string' ? user.name : null;
  const company = typeof user.company === 'string' ? user.company : null;

  const [view, setView] = useState<ApprovalView>('inbox');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [composeForm, setComposeForm] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    if (sub === 'compose:annual_plan') {
      setComposeForm({ slug: 'annual_plan', name: '연차계획서' });
      setView('compose');
    } else if (sub === 'compose:leave_promotion_notice') {
      setComposeForm({ slug: 'leave_promotion_notice', name: '연차촉진동의서' });
      setView('compose');
    } else if (sub && sub.startsWith('detail:')) {
      const id = sub.split(':')[1];
      if (id) {
        setDetailId(id);
        setView('detail');
      }
    } else if (sub === 'inbox' || sub === 'docs' || sub === 'sent' || sub === 'ref' || sub === 'write') {
      setView(sub as ApprovalView);
    }
  }, [sub]);

  const { rows, loading, refetch } = useApprovalList(staffId, company);
  const { inbox, progress, done, sent, ref } = useClassifiedApprovals(rows, staffId);

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

  if (view === 'detail' && detailId) {
    return (
      <SApprovalDetail
        staffId={staffId}
        staffName={staffName}
        approvalId={detailId}
        initialRow={initialDetailRow}
        onBack={handleBackFromDetail}
        onChanged={refetch}
      />
    );
  }

  if (view === 'docs') {
    return (
      <SApprovalDocs
        staffId={staffId}
        inProgress={docProgress}
        completed={docCompleted}
        loading={loading}
        onOpen={handleOpen}
        onNavInbox={() => setView('inbox')}
        onNavSent={() => setView('sent')}
        onNavRef={() => setView('ref')}
        onNavWrite={() => setView('write')}
      />
    );
  }

  if (view === 'sent') {
    return (
      <SApprovalSent
        staffId={staffId}
        rows={sent}
        loading={loading}
        onBack={() => setView('inbox')}
        onOpen={handleOpen}
        onWrite={() => setView('write')}
      />
    );
  }

  if (view === 'ref') {
    return (
      <SApprovalRef
        staffId={staffId}
        rows={ref}
        loading={loading}
        onBack={() => setView('inbox')}
        onOpen={handleOpen}
      />
    );
  }

  if (view === 'write') {
    return (
      <SApprovalWrite
        onBack={() => setView('inbox')}
        onPick={(slug, name) => {
          setComposeForm({ slug, name });
          setView('compose');
        }}
      />
    );
  }

  if (view === 'compose' && composeForm) {
    const onCancel = () => setView('write');
    const onSubmitted = () => {
      refetch();
      setView('sent');
    };
    if (composeForm.slug === 'leave') {
      return <SApprovalLeaveForm user={user} onCancel={onCancel} onSubmitted={onSubmitted} />;
    }
    if (composeForm.slug === 'overtime') {
      return (
        <SApprovalOvertimeForm
          user={user}
          formSlug={composeForm.slug}
          formName={composeForm.name}
          onCancel={onCancel}
          onSubmitted={onSubmitted}
        />
      );
    }
    if (composeForm.slug === 'annual_plan' || composeForm.slug === 'leave_promotion_notice') {
      return (
        <SApprovalLeavePlanForm
          user={user}
          formSlug={composeForm.slug}
          formName={composeForm.name}
          onCancel={onCancel}
          onSubmitted={onSubmitted}
        />
      );
    }
    return (
      <SApprovalGenericForm
        user={user}
        formSlug={composeForm.slug}
        formName={composeForm.name}
        onCancel={onCancel}
        onSubmitted={onSubmitted}
      />
    );
  }

  return (
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
