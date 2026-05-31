'use client';

/**
 * 결재 라우터 — inbox / sent / ref / write / detail 5뷰 + 상세 분기.
 * MobileShell이 tab === 'approval' 일 때 마운트한다.
 * JM: 단일 책임 (분기 + 데이터 호이스팅), ~120줄
 * JM2: useApprovalList 1회 fetch 후 useClassifiedApprovals로 메모리에서 분류 — N+1 방지
 */

import { useCallback, useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import SApproval from './결재함';
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

export type ApprovalView = 'inbox' | 'sent' | 'ref' | 'write' | 'compose' | 'detail';

export type 결재Props = {
  user: ErpUser;
};

export default function 결재({ user }: 결재Props) {
  const staffId = typeof user.id === 'string' && user.id.trim() !== '' ? user.id : null;
  const staffName = typeof user.name === 'string' ? user.name : null;

  const [view, setView] = useState<ApprovalView>('inbox');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [composeForm, setComposeForm] = useState<{ slug: string; name: string } | null>(null);

  const { rows, loading, refetch } = useApprovalList(staffId);
  const { inbox, progress, done, sent, ref } = useClassifiedApprovals(rows, staffId);

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
      onNavSent={() => setView('sent')}
      onNavRef={() => setView('ref')}
      onNavWrite={() => setView('write')}
      onRefresh={refetch}
    />
  );
}
