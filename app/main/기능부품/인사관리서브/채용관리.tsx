'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type RecruitmentTab = 'pipeline' | 'postings' | 'applicants' | 'interviews';

type JobPosting = {
  id: string;
  title: string;
  department: string;
  position: string;
  status: string;
  created_at: string;
  applicant_count?: number;
};

type Applicant = {
  id: string;
  job_posting_id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  applied_at: string;
  notes: string;
  job_title?: string;
};

type Interview = {
  id: string;
  applicant_id: string;
  applicant_name?: string;
  scheduled_at: string;
  type: string;
  status: string;
  notes: string;
};

const PIPELINE_STAGES = ['지원', '서류심사', '면접예정', '면접완료', '합격', '불합격'] as const;
const STAGE_COLORS: Record<string, string> = {
  지원: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  서류심사: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  면접예정: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  면접완료: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  합격: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  불합격: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export default function RecruitmentManager({ user }: { user: Record<string, unknown> }) {
  const [activeTab, setActiveTab] = useState<RecruitmentTab>('pipeline');
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  // 새 공고 폼
  const [showNewPosting, setShowNewPosting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // 새 지원자 폼
  const [showNewApplicant, setShowNewApplicant] = useState(false);
  const [appName, setAppName] = useState('');
  const [appEmail, setAppEmail] = useState('');
  const [appPhone, setAppPhone] = useState('');
  const [appPostingId, setAppPostingId] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [postRes, appRes, intRes] = await Promise.all([
        supabase.from('job_postings').select('*').order('created_at', { ascending: false }),
        supabase.from('applicants').select('*, job_postings(title)').order('applied_at', { ascending: false }),
        supabase.from('interviews').select('*, applicants(name)').order('scheduled_at', { ascending: false }),
      ]);
      setPostings((postRes.data || []) as JobPosting[]);
      setApplicants(
        ((appRes.data || []) as any[]).map((a) => ({
          ...a,
          job_title: a.job_postings?.title || '',
        })),
      );
      setInterviews(
        ((intRes.data || []) as any[]).map((i) => ({
          ...i,
          applicant_name: i.applicants?.name || '',
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const createPosting = async () => {
    if (!newTitle.trim()) return;
    await supabase.from('job_postings').insert({
      title: newTitle.trim(),
      department: newDept.trim(),
      position: newPosition.trim(),
      description: newDescription.trim(),
      status: '진행중',
      created_by: user?.id || null,
    });
    setNewTitle(''); setNewDept(''); setNewPosition(''); setNewDescription('');
    setShowNewPosting(false);
    void fetchData();
  };

  const createApplicant = async () => {
    if (!appName.trim() || !appPostingId) return;
    await supabase.from('applicants').insert({
      job_posting_id: appPostingId,
      name: appName.trim(),
      email: appEmail.trim(),
      phone: appPhone.trim(),
      status: '지원',
    });
    setAppName(''); setAppEmail(''); setAppPhone(''); setAppPostingId('');
    setShowNewApplicant(false);
    void fetchData();
  };

  const updateApplicantStatus = async (id: string, status: string) => {
    await supabase.from('applicants').update({ status }).eq('id', id);
    void fetchData();
  };

  const TABS: { id: RecruitmentTab; label: string; icon: string }[] = [
    { id: 'pipeline', label: '채용 파이프라인', icon: '📋' },
    { id: 'postings', label: '채용공고', icon: '📢' },
    { id: 'applicants', label: '지원자', icon: '👤' },
    { id: 'interviews', label: '면접일정', icon: '🗓️' },
  ];

  // 파이프라인별 지원자 수
  const pipelineCounts = PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = applicants.filter((a) => a.status === stage).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      {/* 탭 */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
            }`}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--accent)]/20 border-t-[var(--accent)]" />
        </div>
      ) : (
        <>
          {/* 파이프라인 뷰 */}
          {activeTab === 'pipeline' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
                {PIPELINE_STAGES.map((stage) => (
                  <div
                    key={stage}
                    className={`rounded-[var(--radius-lg)] border border-[var(--border)] p-3 ${STAGE_COLORS[stage]?.split(' ')[0] || 'bg-[var(--muted)]'}`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{stage}</div>
                    <div className="mt-1 text-2xl font-black">{pipelineCounts[stage] || 0}</div>
                  </div>
                ))}
              </div>

              {/* 칸반 보드 */}
              <div className="flex gap-3 overflow-x-auto pb-2">
                {PIPELINE_STAGES.map((stage) => {
                  const stageApplicants = applicants.filter((a) => a.status === stage);
                  return (
                    <div key={stage} className="min-w-[220px] flex-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/50 p-2">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold text-[var(--foreground)]">{stage}</span>
                        <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-3)]">
                          {stageApplicants.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {stageApplicants.map((app) => (
                          <div
                            key={app.id}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-sm"
                          >
                            <p className="text-xs font-bold text-[var(--foreground)]">{app.name}</p>
                            <p className="mt-0.5 text-[10px] text-[var(--toss-gray-3)]">{app.job_title}</p>
                            {stage !== '합격' && stage !== '불합격' && (
                              <div className="mt-2 flex gap-1">
                                {stage === '지원' && (
                                  <button type="button" onClick={() => void updateApplicantStatus(app.id, '서류심사')} className="rounded bg-[var(--accent)]/10 px-2 py-0.5 text-[9px] font-bold text-[var(--accent)]">심사</button>
                                )}
                                {stage === '서류심사' && (
                                  <button type="button" onClick={() => void updateApplicantStatus(app.id, '면접예정')} className="rounded bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold text-purple-600 dark:text-purple-400">면접</button>
                                )}
                                {stage === '면접예정' && (
                                  <button type="button" onClick={() => void updateApplicantStatus(app.id, '면접완료')} className="rounded bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold text-indigo-600 dark:text-indigo-400">완료</button>
                                )}
                                {stage === '면접완료' && (
                                  <>
                                    <button type="button" onClick={() => void updateApplicantStatus(app.id, '합격')} className="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-600">합격</button>
                                    <button type="button" onClick={() => void updateApplicantStatus(app.id, '불합격')} className="rounded bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-500">불합격</button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {stageApplicants.length === 0 && (
                          <p className="py-4 text-center text-[10px] text-[var(--toss-gray-3)]">없음</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 채용공고 탭 */}
          {activeTab === 'postings' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewPosting(!showNewPosting)}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white"
                >
                  {showNewPosting ? '취소' : '새 공고 작성'}
                </button>
              </div>

              {showNewPosting && (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-2">
                    <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="채용 제목" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none" />
                    <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="부서" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none" />
                    <input value={newPosition} onChange={(e) => setNewPosition(e.target.value)} placeholder="직위" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none" />
                    <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="상세 설명" rows={3} className="col-span-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none" />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={() => void createPosting()} className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white">공고 등록</button>
                  </div>
                </div>
              )}

              <div className="grid gap-3">
                {postings.map((posting) => (
                  <div key={posting.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--foreground)]">{posting.title}</h4>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                          {posting.department} · {posting.position} · {new Date(posting.created_at).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <span className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${posting.status === '진행중' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>
                        {posting.status}
                      </span>
                    </div>
                  </div>
                ))}
                {postings.length === 0 && (
                  <div className="py-16 text-center">
                    <div className="mb-2 text-3xl">📢</div>
                    <p className="text-sm font-bold text-[var(--foreground)]">등록된 채용공고가 없습니다</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 지원자 탭 */}
          {activeTab === 'applicants' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewApplicant(!showNewApplicant)}
                  className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white"
                >
                  {showNewApplicant ? '취소' : '지원자 등록'}
                </button>
              </div>

              {showNewApplicant && (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-2">
                    <select value={appPostingId} onChange={(e) => setAppPostingId(e.target.value)} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none">
                      <option value="">채용공고 선택</option>
                      {postings.filter((p) => p.status === '진행중').map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                    <input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="성명" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none" />
                    <input value={appEmail} onChange={(e) => setAppEmail(e.target.value)} placeholder="이메일" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none" />
                    <input value={appPhone} onChange={(e) => setAppPhone(e.target.value)} placeholder="연락처" className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none" />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={() => void createApplicant()} className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white">등록</button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                      <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">성명</th>
                      <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">지원 공고</th>
                      <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">연락처</th>
                      <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">상태</th>
                      <th className="px-4 py-2.5 text-left font-bold text-[var(--toss-gray-4)]">지원일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicants.map((app) => (
                      <tr key={app.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-2.5 font-semibold text-[var(--foreground)]">{app.name}</td>
                        <td className="px-4 py-2.5 text-[var(--toss-gray-3)]">{app.job_title || '-'}</td>
                        <td className="px-4 py-2.5 text-[var(--toss-gray-3)]">{app.phone || app.email || '-'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-[var(--radius-md)] px-2 py-0.5 text-[10px] font-bold ${STAGE_COLORS[app.status] || 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>
                            {app.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--toss-gray-3)]">{new Date(app.applied_at).toLocaleDateString('ko-KR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {applicants.length === 0 && (
                  <div className="py-12 text-center text-sm text-[var(--toss-gray-3)]">등록된 지원자가 없습니다.</div>
                )}
              </div>
            </div>
          )}

          {/* 면접일정 탭 */}
          {activeTab === 'interviews' && (
            <div className="space-y-3">
              {interviews.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mb-2 text-3xl">🗓️</div>
                  <p className="text-sm font-bold text-[var(--foreground)]">예정된 면접이 없습니다</p>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">지원자 상태를 &quot;면접예정&quot;으로 변경하면 면접 일정을 등록할 수 있습니다.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {interviews.map((intv) => (
                    <div key={intv.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-[var(--foreground)]">{intv.applicant_name}</h4>
                          <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                            {intv.type} · {new Date(intv.scheduled_at).toLocaleString('ko-KR')}
                          </p>
                        </div>
                        <span className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${intv.status === '완료' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-blue-500/10 text-blue-700'}`}>
                          {intv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
