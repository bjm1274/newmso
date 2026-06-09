'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import { toast } from '@/lib/toast';

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

interface DisciplinaryBoardProps {
  staffs: StaffMember[];
  selectedCo?: string;
  user?: Record<string, unknown> | null;
}

export default function DisciplinaryBoard({ staffs, selectedCo, user }: DisciplinaryBoardProps) {
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

  // 의결 폼 상태 (상세 모달용)
  const [editStatus, setEditStatus] = useState<'대기' | '진행중' | '의결완료' | '취소'>('대기');
  const [editResultType, setEditResultType] = useState('');
  const [editResultDetails, setEditResultDetails] = useState('');

  // 징계위원회 목록 조회
  const fetchCommittees = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('disciplinary_committees')
        .select('*')
        .order('created_at', { ascending: false });

      if (selectedCo && selectedCo !== '전체') {
        query = query.eq('company', selectedCo);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCommittees((data || []) as DisciplinaryCommittee[]);
    } catch (err) {
      console.error('[DisciplinaryBoard] 징계위원회 조회 실패:', err);
      // 첫 로드 시 테이블 자동 프로비저닝이 완료될 때까지 지연 후 재로드할 수도 있습니다.
    } finally {
      setLoading(false);
    }
  }, [selectedCo]);

  useEffect(() => {
    void fetchCommittees();
  }, [fetchCommittees]);

  // 대상자 매핑
  const targetStaff = useMemo(() => staffs.find(s => s.id === newTargetId) || null, [staffs, newTargetId]);

  // 징계위원회 신규 생성 제출
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
        .filter(s => newMemberIds.includes(String(s.id)))
        .map(s => ({ id: s.id, name: s.name, department: s.department || '', position: s.position || '' }));

      const insertData = {
        title: newTitle.trim(),
        meeting_date: newMeetingDate || null,
        target_staff_id: newTargetId,
        target_staff_name: targetStaff?.name || '미지정',
        reason: newReason.trim(),
        committee_members: JSON.stringify(selectedMembers),
        status: '대기',
        company: selectedCo && selectedCo !== '전체' ? selectedCo : (targetStaff?.company || '전체'),
      };

      const { error } = await supabase
        .from('disciplinary_committees')
        .insert([insertData]);

      if (error) throw error;

      toast('징계위원회가 등록되었습니다.', 'success');
      setShowCreateModal(false);
      // 폼 초기화
      setNewTitle('');
      setNewMeetingDate('');
      setNewTargetId('');
      setNewReason('');
      setNewMemberIds([]);
      void fetchCommittees();
    } catch (err) {
      console.error('[DisciplinaryBoard] 등록 오류:', err);
      toast('징계위원회 등록에 실패했습니다.', 'error');
    }
  };

  // 상세 보기 모달 오픈
  const handleOpenDetail = (com: DisciplinaryCommittee) => {
    setSelectedCommittee(com);
    setEditStatus(com.status);
    setEditResultType(com.result_type || '선택 안함');
    setEditResultDetails(com.result_details || '');
    setShowDetailModal(true);
  };

  // 진행 상태 및 의결정보 업데이트
  const handleUpdateCommittee = async () => {
    if (!selectedCommittee) return;

    try {
      const updateData: Record<string, any> = {
        status: editStatus,
        result_type: editStatus === '의결완료' ? editResultType : null,
        result_details: editStatus === '의결완료' ? editResultDetails.trim() : null,
      };

      const { error } = await supabase
        .from('disciplinary_committees')
        .update(updateData)
        .eq('id', selectedCommittee.id);

      if (error) throw error;

      toast('징계위원회 정보가 업데이트되었습니다.', 'success');
      setShowDetailModal(false);
      void fetchCommittees();
    } catch (err) {
      console.error('[DisciplinaryBoard] 업데이트 오류:', err);
      toast('정보 업데이트에 실패했습니다.', 'error');
    }
  };

  return (
    <section className="app-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">징계위원회 현황</h3>
          <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
            {committees.length}건
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
          <span>＋</span>
          <span>새 징계위원회 등록</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-4 md:py-3">
        {loading && committees.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-3)]">
            징계위원회 내역을 불러오는 중…
          </div>
        ) : committees.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
            진행 예정이거나 의결된 징계위원회가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--toss-gray-4)] font-bold">
                  <th className="py-2.5 px-3">진행 상태</th>
                  <th className="py-2.5 px-3">위원회 명칭 / 안건</th>
                  <th className="py-2.5 px-3">개최일</th>
                  <th className="py-2.5 px-3">징계 대상자</th>
                  <th className="py-2.5 px-3">의결 결과</th>
                  <th className="py-2.5 px-3">등록일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {committees.map((com) => {
                  const statusColors: Record<string, string> = {
                    대기: 'bg-amber-100 text-amber-800',
                    진행중: 'bg-blue-100 text-blue-800',
                    의결완료: 'bg-emerald-100 text-emerald-800',
                    취소: 'bg-slate-100 text-slate-500',
                  };

                  return (
                    <tr
                      key={com.id}
                      onClick={() => handleOpenDetail(com)}
                      className="hover:bg-[var(--tab-bg)]/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[com.status]}`}>
                          {com.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-[var(--foreground)] truncate max-w-[200px]" title={com.title}>
                        {com.title}
                      </td>
                      <td className="py-3 px-3 text-[var(--toss-gray-4)]">
                        {com.meeting_date || '미정'}
                      </td>
                      <td className="py-3 px-3 font-bold text-[var(--foreground)]">
                        {com.target_staff_name}
                      </td>
                      <td className="py-3 px-3 font-semibold">
                        {com.status === '의결완료' ? (
                          <span className="text-rose-600 font-bold">[{com.result_type || '미결'}]</span>
                        ) : (
                          <span className="text-[var(--toss-gray-3)]">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[var(--toss-gray-3)]">
                        {com.created_at ? com.created_at.slice(0, 10) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 징계위원회 등록 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-[var(--border)] overflow-hidden">
            <header className="p-4 border-b border-[var(--border)] flex justify-between items-center">
              <h4 className="text-sm font-bold text-[var(--foreground)]">새 징계위원회 등록</h4>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </header>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[var(--toss-gray-4)]">위원회 명칭 / 안건</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-[var(--card)] focus:outline-blue-500"
                  placeholder="예: 제1차 징계위원회 (무단결근 건)"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-[var(--toss-gray-4)]">개최일시</label>
                <input
                  type="date"
                  value={newMeetingDate}
                  onChange={(e) => setNewMeetingDate(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-[var(--card)] focus:outline-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-[var(--toss-gray-4)]">징계 대상자</label>
                <select
                  value={newTargetId}
                  onChange={(e) => setNewTargetId(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-[var(--card)] focus:outline-blue-500 font-semibold"
                >
                  <option value="">직원을 선택하세요</option>
                  {staffs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.position} / {s.department || '부서 미지정'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-[var(--toss-gray-4)]">참석 위원 (다중 선택)</label>
                <div className="border rounded-lg bg-[var(--card)] max-h-32 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                  {staffs.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer font-medium text-[var(--toss-gray-5)]">
                      <input
                        type="checkbox"
                        checked={newMemberIds.includes(String(s.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewMemberIds(prev => [...prev, String(s.id)]);
                          } else {
                            setNewMemberIds(prev => prev.filter(id => id !== String(s.id)));
                          }
                        }}
                        className="w-3.5 h-3.5 accent-blue-600"
                      />
                      <span>{s.name} ({s.position})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-[var(--toss-gray-4)]">징계 청구 사유</label>
                <textarea
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full h-24 p-2.5 border rounded-lg bg-[var(--card)] focus:outline-blue-500 resize-none leading-relaxed"
                  placeholder="구체적인 청구 사유 및 위반 사실을 기록해 주세요."
                />
              </div>
            </div>
            <footer className="p-3 bg-slate-50 border-t border-[var(--border)] flex gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 border rounded-lg font-bold text-slate-500 bg-white hover:bg-slate-50 text-xs"
              >
                취소
              </button>
              <button
                onClick={handleCreateCommittee}
                className="flex-1 py-2 rounded-lg font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-xs"
              >
                등록하기
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 징계위원회 상세 및 상태/의결 변경 모달 */}
      {showDetailModal && selectedCommittee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-[var(--border)] overflow-hidden">
            <header className="p-4 border-b border-[var(--border)] flex justify-between items-center">
              <h4 className="text-sm font-bold text-[var(--foreground)]">징계위원회 상세 / 의결 진행</h4>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </header>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar text-xs leading-relaxed">
              <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200">
                <p><strong>위원회 명칭:</strong> {selectedCommittee.title}</p>
                <p><strong>개최일자:</strong> {selectedCommittee.meeting_date || '미정'}</p>
                <p><strong>징계 대상자:</strong> {selectedCommittee.target_staff_name}</p>
                <div>
                  <strong>참석 위원:</strong>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(() => {
                      try {
                        const members = JSON.parse(selectedCommittee.committee_members || '[]');
                        return members.map((m: any) => (
                          <span key={m.id} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                            {m.name} ({m.position})
                          </span>
                        ));
                      } catch {
                        return <span className="text-[var(--toss-gray-3)]">없음</span>;
                      }
                    })()}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <strong>징계 청구 사유</strong>
                <p className="bg-[var(--muted)]/50 p-2.5 rounded-lg border text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {selectedCommittee.reason}
                </p>
              </div>

              <div className="space-y-2 border-t pt-3">
                <div className="space-y-1">
                  <label className="font-bold text-[var(--toss-gray-4)]">진행 상태 변경</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full p-2.5 border rounded-lg bg-[var(--card)] focus:outline-blue-500 font-bold"
                  >
                    <option value="대기">대기</option>
                    <option value="진행중">진행중</option>
                    <option value="의결완료">의결완료</option>
                    <option value="취소">취소</option>
                  </select>
                </div>

                {editStatus === '의결완료' && (
                  <div className="space-y-3 animate-in slide-in-from-top-2">
                    <div className="space-y-1">
                      <label className="font-bold text-[var(--toss-gray-4)]">의결 징계 종류</label>
                      <select
                        value={editResultType}
                        onChange={(e) => setEditResultType(e.target.value)}
                        className="w-full p-2.5 border rounded-lg bg-[var(--card)] focus:outline-blue-500 font-bold text-rose-600"
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
                    <div className="space-y-1">
                      <label className="font-bold text-[var(--toss-gray-4)]">의결 및 조치 상세 내역</label>
                      <textarea
                        value={editResultDetails}
                        onChange={(e) => setEditResultDetails(e.target.value)}
                        className="w-full h-24 p-2.5 border rounded-lg bg-[var(--card)] focus:outline-blue-500 resize-none leading-relaxed"
                        placeholder="의결 주문 및 징계 양정의 구체적 내용을 입력해 주세요."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <footer className="p-3 bg-slate-50 border-t border-[var(--border)] flex gap-2">
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 py-2 border rounded-lg font-bold text-slate-500 bg-white hover:bg-slate-50 text-xs"
              >
                닫기
              </button>
              <button
                onClick={handleUpdateCommittee}
                className="flex-1 py-2 rounded-lg font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-xs"
              >
                저장하기
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
