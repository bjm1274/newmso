'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MAvatar from '../공통/MAvatar';
import { pickAvatarTone } from './data-hooks';

interface DisciplinaryCommittee {
  id: string;
  company: string | null;
  title: string;
  meeting_date: string | null;
  target_staff_id: string;
  target_staff_name: string;
  status: '대기' | '진행중' | '의결완료' | '취소';
  reason: string;
  result_type: string | null;
  result_details: string | null;
  committee_members: string | null; // JSON string
  created_at: string;
}

interface DisciplinaryTabProps {
  staffs: StaffMember[];
  company?: string;
  user: ErpUser;
}

export default function 징계탭({ staffs, company, user }: DisciplinaryTabProps) {
  const [committees, setCommittees] = useState<DisciplinaryCommittee[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCommittee, setSelectedCommittee] = useState<DisciplinaryCommittee | null>(null);

  // 등록 폼 상태
  const [newTitle, setNewTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [newTargetId, setNewTargetId] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);

  // 의결 폼 상태
  const [editStatus, setEditStatus] = useState<'대기' | '진행중' | '의결완료' | '취소'>('대기');
  const [editResultType, setEditResultType] = useState('');
  const [editResultDetails, setEditResultDetails] = useState('');

  const isHrAdmin = useMemo(() => {
    const perms = (user.permissions ?? {}) as Record<string, unknown>;
    return (
      perms.mso === true ||
      perms.menu_인사관리 === true ||
      user.role === '관리자' ||
      user.role === '매니저'
    );
  }, [user]);

  const fetchCommittees = useCallback(async () => {
    setLoading(true);
    try {
      let query = db
        .from('disciplinary_committees')
        .select('*')
        .order('created_at', { ascending: false });

      if (company && company !== '전체') {
        query = query.eq('company', company);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCommittees((data || []) as DisciplinaryCommittee[]);
    } catch (err) {
      console.error('[DisciplinaryTab] 징계위원회 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void fetchCommittees();
  }, [fetchCommittees]);

  const targetStaff = useMemo(() => staffs.find((s) => s.id === newTargetId) || null, [staffs, newTargetId]);

  const handleCreateCommittee = async () => {
    if (!newTitle.trim()) {
      toast('위원회 명칭/안건을 입력해 주세요.', 'warning');
      return;
    }
    if (!newTargetId) {
      toast('징계 대상 직원을 선택해 주세요.', 'warning');
      return;
    }
    if (!newReason.trim()) {
      toast('징계 청구 사유를 입력해 주세요.', 'warning');
      return;
    }

    try {
      const selectedMembers = staffs
        .filter((s) => newMemberIds.includes(String(s.id)))
        .map((s) => ({ id: s.id, name: s.name, department: s.department || '', position: s.position || '' }));

      const insertData = {
        title: newTitle.trim(),
        meeting_date: newMeetingDate || null,
        target_staff_id: newTargetId,
        target_staff_name: targetStaff?.name || '미지정',
        reason: newReason.trim(),
        committee_members: JSON.stringify(selectedMembers),
        status: '대기',
        company: company && company !== '전체' ? company : (targetStaff?.company || '전체') };

      const { error } = await db.from('disciplinary_committees').insert([insertData]);
      if (error) throw error;

      toast('징계위원회가 등록되었습니다.', 'success');
      setShowCreateModal(false);
      setNewTitle('');
      setNewMeetingDate('');
      setNewTargetId('');
      setNewReason('');
      setNewMemberIds([]);
      void fetchCommittees();
    } catch (err) {
      console.error('[DisciplinaryTab] 등록 오류:', err);
      toast('징계위원회 등록에 실패했습니다.', 'error');
    }
  };

  const handleOpenDetail = (com: DisciplinaryCommittee) => {
    setSelectedCommittee(com);
    setEditStatus(com.status);
    setEditResultType(com.result_type || '선택 안함');
    setEditResultDetails(com.result_details || '');
    setShowDetailModal(true);
  };

  const handleUpdateCommittee = async () => {
    if (!selectedCommittee) return;

    try {
      const updateData = {
        status: editStatus,
        result_type: editStatus === '의결완료' ? editResultType : null,
        result_details: editStatus === '의결완료' ? editResultDetails.trim() : null };

      const { error } = await db
        .from('disciplinary_committees')
        .update(updateData)
        .eq('id', selectedCommittee.id);

      if (error) throw error;

      toast('징계위원회 정보가 업데이트되었습니다.', 'success');
      setShowDetailModal(false);
      void fetchCommittees();
    } catch (err) {
      console.error('[DisciplinaryTab] 업데이트 오류:', err);
      toast('정보 업데이트에 실패했습니다.', 'error');
    }
  };

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {isHrAdmin && (
        <div style={{ marginBottom: 12 }}>
          <MBtn variant="primary" icon="plus" block onClick={() => setShowCreateModal(true)}>
            새 징계위원회 등록
          </MBtn>
        </div>
      )}

      {loading && committees.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          불러오는 중...
        </div>
      ) : committees.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
          진행 예정이거나 의결된 징계위원회가 없습니다.
        </div>
      ) : (
        <div className="m-card flush macos-glass macos-squircle">
          {committees.map((com) => {
            const statusTones: Record<string, 'warning' | 'accent' | 'success' | 'danger'> = {
              대기: 'warning',
              진행중: 'accent',
              의결완료: 'success',
              취소: 'danger' };
            return (
              <button
                key={com.id}
                type="button"
                className="m-list-row"
                style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
                onClick={() => handleOpenDetail(com)}
              >
                <MAvatar tone={pickAvatarTone(com.target_staff_name)}>
                  {com.target_staff_name.charAt(0)}
                </MAvatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="truncate">{com.title}</span>
                    <MChip tone={statusTones[com.status] || ''}>{com.status}</MChip>
                  </div>
                  <div className="sub">
                    대상자: {com.target_staff_name} · 개최일: {com.meeting_date || '미정'}
                  </div>
                </div>
                {com.status === '의결완료' && com.result_type && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--m-danger)' }}>
                    [{com.result_type}]
                  </span>
                )}
                <MIcon name="chevR" size={18} color="var(--z-400)" />
              </button>
            );
          })}
        </div>
      )}

      {/* 새 징계위원회 등록 모달 (macOS 아크릴 바텀시트 테마) */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl border-t border-slate-200"
            style={{
              padding: '20px 16px 24px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>새 징계위원회 등록</span>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 16, fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>위원회 명칭 / 안건</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 제1차 징계위원회 (무단결근 건)"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>개최일자</label>
                <input
                  type="date"
                  value={newMeetingDate}
                  onChange={(e) => setNewMeetingDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>징계 대상자</label>
                <select
                  value={newTargetId}
                  onChange={(e) => setNewTargetId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4,
                    background: 'white' }}
                >
                  <option value="">대상 직원을 선택하세요</option>
                  {staffs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.position} / {s.department || '부서 없음'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>참석 위원 (다중 선택)</label>
                <div
                  style={{
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    maxHeight: 100,
                    overflowY: 'auto',
                    padding: 8,
                    marginTop: 4 }}
                >
                  {staffs.map((s) => (
                    <label
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 0',
                        fontSize: 12,
                        cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={newMemberIds.includes(String(s.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewMemberIds((prev) => [...prev, String(s.id)]);
                          } else {
                            setNewMemberIds((prev) => prev.filter((id) => id !== String(s.id)));
                          }
                        }}
                      />
                      <span>
                        {s.name} ({s.position})
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>징계 청구 사유</label>
                <textarea
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="구체적인 사실 관계를 입력해 주세요."
                  style={{
                    width: '100%',
                    height: 80,
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4,
                    resize: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <MBtn block onClick={() => setShowCreateModal(false)}>
                취소
              </MBtn>
              <MBtn block variant="primary" onClick={handleCreateCommittee}>
                등록하기
              </MBtn>
            </div>
          </div>
        </div>
      )}

      {/* 징계위원회 상세 및 의결 상태 변경 모달 */}
      {showDetailModal && selectedCommittee && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl border-t border-slate-200"
            style={{
              padding: '20px 16px 24px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>위원회 상세 및 의결</span>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 16, fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--m-muted)', padding: 12, borderRadius: 12, fontSize: 12 }}>
                <p style={{ margin: '4px 0' }}>
                  <strong>안건명:</strong> {selectedCommittee.title}
                </p>
                <p style={{ margin: '4px 0' }}>
                  <strong>대상자:</strong> {selectedCommittee.target_staff_name}
                </p>
                <p style={{ margin: '4px 0' }}>
                  <strong>개최일:</strong> {selectedCommittee.meeting_date || '미정'}
                </p>
                <div>
                  <strong>참석위원:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {(() => {
                      try {
                        const members = JSON.parse(selectedCommittee.committee_members || '[]');
                        return members.map((m: any) => (
                          <span
                            key={m.id}
                            style={{
                              background: 'white',
                              border: '1px solid var(--m-border)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 10 }}
                          >
                            {m.name} ({m.position})
                          </span>
                        ));
                      } catch {
                        return <span>없음</span>;
                      }
                    })()}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>청구 사유</label>
                <p
                  style={{
                    background: 'var(--m-bg)',
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 13,
                    whiteSpace: 'pre-wrap',
                    marginTop: 4 }}
                >
                  {selectedCommittee.reason}
                </p>
              </div>

              {isHrAdmin ? (
                <>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>진행 상태 변경</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: 10,
                        border: '1px solid var(--m-border)',
                        borderRadius: 8,
                        fontSize: 13,
                        marginTop: 4,
                        background: 'white' }}
                    >
                      <option value="대기">대기</option>
                      <option value="진행중">진행중</option>
                      <option value="의결완료">의결완료</option>
                      <option value="취소">취소</option>
                    </select>
                  </div>

                  {editStatus === '의결완료' && (
                    <>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>의결 징계 종류</label>
                        <select
                          value={editResultType}
                          onChange={(e) => setEditResultType(e.target.value)}
                          style={{
                            width: '100%',
                            padding: 10,
                            border: '1px solid var(--m-border)',
                            borderRadius: 8,
                            fontSize: 13,
                            marginTop: 4,
                            background: 'white',
                            color: 'var(--m-danger)',
                            fontWeight: 800 }}
                        >
                          <option value="">결과를 선택하세요</option>
                          <option value="견책">견책</option>
                          <option value="감봉">감봉</option>
                          <option value="정직">정직</option>
                          <option value="강등">강등</option>
                          <option value="해고">해고</option>
                          <option value="무혐의">무혐의 (처분 없음)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>의결 및 조치 상세</label>
                        <textarea
                          value={editResultDetails}
                          onChange={(e) => setEditResultDetails(e.target.value)}
                          placeholder="의결 주문 및 징계 양정의 구체적 내용"
                          style={{
                            width: '100%',
                            height: 60,
                            padding: 10,
                            border: '1px solid var(--m-border)',
                            borderRadius: 8,
                            fontSize: 13,
                            marginTop: 4,
                            resize: 'none' }}
                        />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div style={{ borderTop: '1px solid var(--m-border)', paddingTop: 12 }}>
                  <p style={{ margin: '4px 0', fontSize: 12 }}>
                    <strong>진행 상태:</strong> {selectedCommittee.status}
                  </p>
                  {selectedCommittee.status === '의결완료' && (
                    <>
                      <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--m-danger)' }}>
                        <strong>의결 결과:</strong> {selectedCommittee.result_type}
                      </p>
                      <p style={{ margin: '4px 0', fontSize: 12 }}>
                        <strong>결과 상세:</strong> {selectedCommittee.result_details || '-'}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <MBtn block onClick={() => setShowDetailModal(false)}>
                닫기
              </MBtn>
              {isHrAdmin && (
                <MBtn block variant="primary" onClick={handleUpdateCommittee}>
                  저장하기
                </MBtn>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
