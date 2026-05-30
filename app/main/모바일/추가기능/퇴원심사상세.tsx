'use client';

/**
 * 퇴원심사 상세 — 요약 / 진료기록 / 코멘트 + sticky 액션(승인·반려·보완요청).
 * supabase.from('discharge_reviews').update({status}).
 * 🟡 신규 작성은 데스크톱 안내, 코멘트·승인만 모바일에서 가능.
 * 핸드오프 m-screens-addon-details §AD4 (SDischargeDetail) 이식.
 * JM: ~250줄.
 * JM3: 액션 실패 시 toast + 롤백.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ErpUser } from '@/types';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';
import { pickText, type DischargeRow } from './data-hooks';
import { DISCHARGE_STATUS, type DischargeStatus } from '../../기능부품/퇴원심사/공통';

type Tab = 'summary' | 'record' | 'comment';

type Detail = DischargeRow & { items: unknown[] };

export default function 퇴원심사상세({
  user,
  reviewId,
  onBack,
}: {
  user: ErpUser;
  reviewId: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('summary');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('discharge_reviews')
        .select('*')
        .eq('id', reviewId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setDetail(null);
        return;
      }
      const row = data as Record<string, unknown>;
      setDetail({
        id: pickText(row, 'id'),
        patient_name: pickText(row, 'patient_name') || '환자 미지정',
        birth: pickText(row, 'birth_date'),
        gender: pickText(row, 'gender'),
        department: pickText(row, 'department'),
        admission_date: pickText(row, 'admission_date'),
        discharge_date: pickText(row, 'discharge_date'),
        diagnosis: pickText(row, 'diagnosis'),
        status: pickText(row, 'status') || DISCHARGE_STATUS.pending,
        reviewer_id: pickText(row, 'reviewer_id'),
        reviewer_name: pickText(row, 'reviewer_name'),
        created_at: pickText(row, 'created_at'),
        ai_analysis: pickText(row, 'ai_analysis'),
        items: Array.isArray(row.items) ? (row.items as unknown[]) : [],
      });
    } catch (err) {
      console.warn('[mobile-addon] discharge detail load', err);
      toast('퇴원심사 정보를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const performAction = async (
    next: Extract<DischargeStatus, 'approved' | 'rejected' | 'review_requested'>,
  ) => {
    if (!detail || acting) return;
    setActing(true);
    const prevStatus = detail.status;
    setDetail({ ...detail, status: next });
    try {
      const { error } = await supabase
        .from('discharge_reviews')
        .update({ status: next, reviewer_id: user.id, reviewer_name: user.name })
        .eq('id', detail.id);
      if (error) throw error;
      toast(
        next === 'approved' ? '승인되었습니다' : next === 'rejected' ? '반려되었습니다' : '보완 요청을 보냈습니다',
        'success',
      );
    } catch (err) {
      setDetail({ ...detail, status: prevStatus });
      console.warn('[mobile-addon] discharge action', err);
      toast('상태 변경에 실패했습니다.', 'error');
    } finally {
      setActing(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="m-screen">
        <MobileHeader title="퇴원심사" back={onBack} />
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          {loading ? '불러오는 중…' : '심사 정보를 찾을 수 없습니다.'}
        </div>
      </div>
    );
  }

  const meta = [
    { l: '환자번호', v: detail.id.slice(0, 8) },
    { l: '입원일', v: detail.admission_date || '-' },
    { l: '퇴원 예정', v: detail.discharge_date || '-' },
    { l: '재원일수', v: detail.admission_date && detail.discharge_date
        ? `${Math.max(
            1,
            Math.floor(
              (new Date(detail.discharge_date).getTime() -
                new Date(detail.admission_date).getTime()) /
                86400000,
            ),
          )}일`
        : '-' },
    { l: '진단', v: detail.diagnosis || '-' },
    { l: '심사자', v: detail.reviewer_name || '-' },
  ];

  return (
    <div className="m-screen">
      <MobileHeader
        title="퇴원심사"
        sub={`${detail.patient_name}${detail.gender ? ` · ${detail.gender}` : ''} · ${detail.department}`}
        back={onBack}
      />

      <div
        style={{
          padding: '10px 16px 0',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg">
          <button type="button" className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>요약</button>
          <button type="button" className={tab === 'record' ? 'on' : ''} onClick={() => setTab('record')}>진료기록</button>
          <button type="button" className={tab === 'comment' ? 'on' : ''} onClick={() => setTab('comment')}>코멘트</button>
        </div>
      </div>

      <div className="m-scroll">
        {tab === 'summary' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div className="m-card" style={{ padding: '14px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {meta.map((r) => (
                  <div key={r.l}>
                    <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{r.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{r.v}</div>
                  </div>
                ))}
              </div>
            </div>
            {detail.ai_analysis && (
              <div
                className="m-card"
                style={{
                  marginTop: 12,
                  padding: '14px 16px',
                  background: 'var(--m-accent-soft)',
                  borderColor: 'transparent',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--m-accent)',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                  }}
                >
                  AI 분석
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--z-800)',
                    marginTop: 6,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {detail.ai_analysis}
                </div>
              </div>
            )}
            <div style={{ height: 24 }} />
          </div>
        )}

        {tab === 'record' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div
              style={{
                padding: '16px',
                background: 'var(--m-warning-soft)',
                borderRadius: 'var(--m-radius-lg)',
                color: 'var(--m-warning)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <MIcon name="info" size={16} />
              풀 진료기록(EMR)은 데스크톱에서 — 모바일은 요약만 노출
            </div>
            <div className="m-card flush" style={{ marginTop: 12 }}>
              {detail.items.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
                  등록된 진료 항목이 없습니다.
                </div>
              )}
              {detail.items.slice(0, 30).map((item, i) => {
                const it = item as Record<string, unknown>;
                return (
                  <div key={i} className="m-list-row">
                    <div className="ico-tile">
                      <MIcon name="fileText" size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="lbl">{pickText(it, 'label', 'name') || '항목'}</div>
                      <div className="sub">{pickText(it, 'code') || ''}</div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: it.checked ? 'var(--m-success)' : 'var(--z-500)',
                        fontWeight: 700,
                      }}
                    >
                      {it.checked ? '확인' : '미확인'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'comment' && (
          <div style={{ padding: '14px 16px 0' }}>
            <div
              style={{
                padding: 20,
                textAlign: 'center',
                color: 'var(--z-500)',
                fontSize: 12,
                background: 'var(--m-card)',
                borderRadius: 'var(--m-radius-lg)',
                border: '1px solid var(--m-border)',
              }}
            >
              코멘트 모듈은 데스크톱에서 작성하세요.
            </div>
          </div>
        )}
      </div>

      <div className="m-sticky-foot">
        <MBtn block onClick={() => void performAction(DISCHARGE_STATUS.reviewRequested)} disabled={acting}>
          보완요청
        </MBtn>
        <MBtn block variant="danger" onClick={() => void performAction(DISCHARGE_STATUS.rejected)} disabled={acting}>
          반려
        </MBtn>
        <MBtn block variant="primary" onClick={() => void performAction(DISCHARGE_STATUS.approved)} disabled={acting}>
          승인
        </MBtn>
      </div>
    </div>
  );
}
