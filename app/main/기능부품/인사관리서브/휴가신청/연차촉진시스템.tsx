'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { useState, useEffect, useCallback } from 'react';
import AnnualLeaveDocumentModal from './AnnualLeaveDocumentModal';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { db, d1 } from '@/lib/db-client';
import {
  buildPromotionSentKey,
  clampLeaveRemaining,
  getStaffPromotionSchedule,
  resolveDuePromotionStage,
  resolveHireDateFromStaff,
} from '@/lib/annual-leave-promotion';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type StaffLite = {
  id: string;
  name: string;
  position?: string;
  company?: string;
  department?: string;
  annual_leave_total?: number;
  annual_leave_used?: number;
  join_date?: string | null;
  joined_at?: string | null;
  hire_date?: string | null;
  status?: string | null;
};

type PromotionStage = 1 | 2;

type PromotionTarget = StaffLite & {
  totalLeave: number;
  usedLeave: number;
  remainingLeave: number;
  status: '정상' | '1차 촉진 대상' | '2차 촉진 대상' | '계획 제출 완료' | '소멸';
  actionRequired: boolean;
  promotionStage: PromotionStage | null;
  expiryDateStr: string | null;
};

// 이미 통보된 (staff_id, stage, expiry_date) 조합
type SentKey = string; // `${staffId}|${stage}|${expiryDate}`

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function AnnualLeavePromotion({
  staffs,
  selectedCo }: {
  staffs: StaffLite[];
  selectedCo: string;
}) {
  const { dialog, openConfirm } = useActionDialog();
  const [promotionTargets, setPromotionTargets] = useState<PromotionTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittedPlans, setSubmittedPlans] = useState<{ sender_id: string }[]>([]);
  const [sentKeys, setSentKeys] = useState<Set<SentKey>>(new Set());
  const [printStaff, setPrintStaff] = useState<PromotionTarget | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const fetchSubmittedPlans = useCallback(async () => {
    const { data } = await db
      .from('approvals')
      .select('sender_id, status, type')
      .or('type.eq.연차계획서,type.eq.연차사용계획서')
      .neq('status', '반려');
    if (data) setSubmittedPlans(data);
  }, []);

  // 이미 통보된 로그 조회 (중복 방지)
  const fetchSentLogs = useCallback(async () => {
    const { data } = await db
      .from('annual_leave_promotion_logs')
      .select('staff_id, stage, step, expiry_date');
    if (data) {
      const keys = new Set<SentKey>();
      for (const row of data as Array<{
        staff_id?: string;
        stage?: number | null;
        step?: number | null;
        expiry_date?: string | null;
      }>) {
        const st = Number(row.stage ?? row.step);
        const exp = String(row.expiry_date || '').slice(0, 10);
        if ((st === 1 || st === 2) && exp) {
          keys.add(buildPromotionSentKey(String(row.staff_id), st as 1 | 2, exp));
        }
      }
      setSentKeys(keys);
    }
  }, []);

  useEffect(() => {
    fetchSubmittedPlans();
    fetchSentLogs();
  }, [fetchSubmittedPlans, fetchSentLogs]);

  useEffect(() => {
    const today = new Date();
    const todayKey = formatKoreanDateKey(today);

    const targets: PromotionTarget[] = staffs
      .filter((s) => selectedCo === '전체' || s.company === selectedCo)
      .filter((s) => {
        const st = String(s.status || '재직');
        return st === '재직' || st === '' || st === 'active';
      })
      .filter((s) => {
        const n = String(s.name || '');
        return !n.startsWith('TEST_') && !/팀\d+$/.test(n);
      })
      .map((s) => {
        const totalLeave = Math.max(0, Number(s.annual_leave_total) || 0);
        const usedLeave = Math.max(0, Number(s.annual_leave_used) || 0);
        const remainingLeave = clampLeaveRemaining(s.annual_leave_total, s.annual_leave_used);

        const hasPlan = submittedPlans.some((p) => String(p.sender_id) === String(s.id));

        if (remainingLeave <= 0) {
          return makeTarget(s, totalLeave, usedLeave, remainingLeave, '정상', false, null, null);
        }

        if (hasPlan) {
          return makeTarget(s, totalLeave, usedLeave, remainingLeave, '계획 제출 완료', false, null, null);
        }

        const hireDate = resolveHireDateFromStaff(s);
        const schedule = getStaffPromotionSchedule(hireDate, today);
        if (!schedule || !hireDate) {
          return makeTarget(s, totalLeave, usedLeave, remainingLeave, '정상', false, null, null);
        }

        const expiryDateStr = formatKoreanDateKey(schedule.expiryDate);
        const step1Key = formatKoreanDateKey(schedule.step1Date);
        const step2Key = formatKoreanDateKey(schedule.step2Date);
        const hasStage1 = sentKeys.has(buildPromotionSentKey(s.id, 1, expiryDateStr));
        const hasStage2 = sentKeys.has(buildPromotionSentKey(s.id, 2, expiryDateStr));

        const due = resolveDuePromotionStage({
          todayKey,
          step1Key,
          step2Key,
          expiryKey: expiryDateStr,
          hasStage1,
          hasStage2,
        });

        if (due === 2) {
          return makeTarget(s, totalLeave, usedLeave, remainingLeave, '2차 촉진 대상', true, 2, expiryDateStr);
        }
        if (due === 1) {
          return makeTarget(s, totalLeave, usedLeave, remainingLeave, '1차 촉진 대상', true, 1, expiryDateStr);
        }

        return makeTarget(s, totalLeave, usedLeave, remainingLeave, '정상', false, null, expiryDateStr);
      });

    setPromotionTargets(targets);
  }, [staffs, selectedCo, submittedPlans, sentKeys]);

  // 이미 통보된 항목인지 확인
  const isAlreadySent = (staff: PromotionTarget): boolean => {
    if (!staff.promotionStage || !staff.expiryDateStr) return false;
    return sentKeys.has(
      buildPromotionSentKey(staff.id, staff.promotionStage, staff.expiryDateStr),
    );
  };

  const handleSendPromotion = async (staff: PromotionTarget) => {
    if (isAlreadySent(staff)) {
      toast('이미 해당 직원에게 동일 차수 통보가 발송되었습니다.', 'warning');
      return;
    }

    const stageLabel = staff.promotionStage === 1 ? '1차' : '2차';
    const confirmed = await openConfirm({
      title: `연차사용촉진 ${stageLabel} 통보 발송`,
      description: `${staff.name}님께 연차사용촉진 ${stageLabel} 통보를 발송합니다.\n발송 시 알림과 함께 전자결재 작성이 요청됩니다.`,
      confirmText: '발송',
      tone: 'accent' });
    if (!confirmed) return;

    setLoading(true);
    try {
      // 알림 발송
      const { data: notifData, error: notifError } = await d1.from('notifications')
        .insert([
          {
            user_id: staff.id,
            type: '인사',
            title: `📅 연차사용촉진 ${stageLabel} 통보 및 계획 제출 요청`,
            body: `${staff.name}님, 미사용 연차 ${staff.remainingLeave}일에 대해 근로기준법에 따라 ${stageLabel} 촉진합니다. [전자결재 > 작성하기 > 연차계획서]를 통해 계획을 제출해 주세요.`,
            metadata: {
              type: 'annual_leave_promotion',
              stage: staff.promotionStage,
              remaining: staff.remainingLeave,
              expiry_date: staff.expiryDateStr,
              auto: false,
              link: '/main/전자결재?view=작성하기&type=연차계획서' } },
        ])
        .select('id')
        .single();

      if (notifError) throw notifError;

      // 촉진 로그 INSERT.
      // 정본 스키마: target_year(integer, NOT NULL), step(integer, NOT NULL), id(text PK, NOT NULL).
      const targetYear = staff.expiryDateStr
        ? Number(staff.expiryDateStr.slice(0, 4))
        : new Date().getFullYear();
      const step = staff.promotionStage ?? 1;
      const nowIso = new Date().toISOString();
      await db.from('annual_leave_promotion_logs').upsert(
        {
          // (직원, 대상연도, 단계) 자연키를 그대로 PK 로 쓴다.
          // 예전에는 무작위 UUID + `{ onConflict: 'staff_id,target_year,step' }` 였는데
          // 그 조합에 UNIQUE 제약이 없어(실제 인덱스는 전부 비유니크, 유니크는 PK 뿐)
          // SQLite 가 ON CONFLICT 자체를 거부했다 — 이 로그는 기록될 때마다
          // 실패했다(9차 D1-05). 데이터에 이미 중복이 있어 UNIQUE 인덱스를 새로
          // 걸 수도 없으므로 PK 를 자연키로 만들어 해결한다.
          id: `alp-${staff.id}-${targetYear}-${step}`,
          staff_id: staff.id,
          company_name: staff.company || selectedCo || null,
          target_year: targetYear,
          step,
          stage: step,
          expiry_date: staff.expiryDateStr,
          notified_at: nowIso,
          sent_at: nowIso,
          remain_days: staff.remainingLeave,
          remaining_days_at_notice: staff.remainingLeave,
          notification_id: notifData?.id ?? null,
          meta: JSON.stringify({ action: 'promote', stage: step, auto: false, userConfirmed: true }),
          created_at: nowIso },
      );

      // 3) 문서보관함(document_repository) 저장
      const docTitle = `연차유급휴가 사용촉진 통보서 (${stageLabel}) - ${staff.name}`;
      const docContent = `연차 유급휴가 사용촉진 통보서 (${stageLabel})

성 명: ${staff.name}
소 속: ${staff.department || '인사부'}
직 급: ${staff.position || '사원'}
미사용 연차: ${staff.remainingLeave} 일

귀하의 ${targetYear}년도 발생 연차유급휴가 중 현재까지 사용하지 아니한 휴가는 총 ${staff.remainingLeave}일입니다.

${step === 1 ?
`이에 근로기준법 제61조 제1항에 의거하여, 회사는 귀하에게 미사용 연차유급휴가의 사용을 촉진하오니, 본 서면을 수령한 날로부터 10일 이내에 미사용 연차유급휴가에 대한 구체적인 사용계획서(계획 일자 지정)를 작성하여 전자결재 시스템을 통해 제출해 주시기 바랍니다.

기한 내에 사용 계획을 제출하지 아니할 경우, 근로기준법 제61조 제2항에 의거하여 회사가 임의로 휴가 사용 시기를 지정하여 통보하게 되며, 이에 따른 휴가 미사용에 대하여는 수당이 지급되지 아니함을 알려드립니다.`
:
`회사는 근로기준법 제61조 제1항에 의거하여 귀하에게 미사용 연차유급휴가 사용을 촉진하였으나, 귀하는 기한 내에 사용계획서를 제출하지 아니하였습니다.

이에 회사는 근로기준법 제61조 제2항에 따라 귀하의 미사용 연차유급휴가 총 ${staff.remainingLeave}일에 대하여 아래와 같이 사용 시기를 지정하여 통보합니다.

귀하는 지정된 휴가일에 휴가를 사용하여야 하며, 지정된 휴가일에 출근하여 근로를 제공하더라도 회사는 수령거부 의사를 명확히 할 것이며 이에 따른 연차유급휴가 미사용 수당은 소멸됨을 재차 고지합니다.`}

통보일자: ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
MSO 주식회사 대표이사 (직인생략)`;

      await db.from('document_repository').insert({
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `doc-alp-${staff.id}-${targetYear}-${step}-${Date.now()}`,
        title: docTitle,
        // 정식 분류 — '기타' 저장 시 연차촉진 폴더에서 누락됨
        category: '연차촉진',
        content: docContent,
        company_name: selectedCo || '전체',
        created_by: staff.id,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      toast(`연차사용촉진 ${stageLabel} 통보가 발송되었습니다.`, 'success');
      fetchSubmittedPlans();
      fetchSentLogs();
    } catch (err) {
      console.error('[AnnualLeavePromotion] 통보 발송 실패:', err);
      toast('발송 실패. 잠시 후 다시 시도해 주세요.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const visibleTargets = promotionTargets.filter(
    (t) => t.actionRequired || t.status === '계획 제출 완료',
  );

  const currentStageLabel = (() => {
    const stage2Count = promotionTargets.filter((t) => t.status === '2차 촉진 대상').length;
    const stage1Count = promotionTargets.filter((t) => t.status === '1차 촉진 대상').length;
    if (stage2Count > 0) return '2차 촉진 진행 중';
    if (stage1Count > 0) return '1차 촉진 진행 중';
    return '현재 촉진 기간 외';
  })();

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {dialog}
      <div className="bg-[var(--card)] p-4 border border-[var(--border)] shadow-sm rounded-2xl">
        <div className="flex justify-between items-center mb-4">
          <div className="px-4 py-2 bg-blue-500/10 rounded-[var(--radius-lg)]">
            <p className="text-[11px] font-semibold text-[var(--accent)]">
              현재 촉진 시기:{' '}
              <span className="text-sm">{currentStageLabel}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {visibleTargets.map((staff) => (
            <div
              key={staff.id}
              className={`p-4 border rounded-[var(--radius-lg)] flex flex-col md:flex-row justify-between items-center gap-4 transition-all ${
                staff.status === '계획 제출 완료'
                  ? 'bg-indigo-500/10/30 border-indigo-100 opacity-80'
                  : 'bg-[var(--muted)] border-[var(--border)]'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold shadow-sm border ${
                    staff.status === '계획 제출 완료'
                      ? 'bg-[var(--card)] text-indigo-500 border-indigo-100'
                      : 'bg-[var(--card)] text-[var(--accent)] border-[var(--border)]'
                  }`}
                >
                  {staff.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {staff.name}{' '}
                    <span className="text-[11px] text-[var(--toss-gray-3)] font-bold ml-1">
                      {staff.position}
                    </span>
                  </p>
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                    {staff.company} / {staff.department}
                  </p>
                  {staff.expiryDateStr && (
                    <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">
                      만료일: {staff.expiryDateStr}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">잔여 연차</p>
                  <p
                    className={`text-lg font-semibold ${
                      staff.status === '계획 제출 완료' ? 'text-indigo-600' : 'text-red-600'
                    }`}
                  >
                    {staff.remainingLeave}일
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">상태</p>
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                      staff.status === '계획 제출 완료'
                        ? 'bg-indigo-100 text-indigo-600'
                        : staff.status === '2차 촉진 대상'
                        ? 'bg-red-500/20 text-red-600'
                        : 'bg-orange-500/20 text-orange-600'
                    }`}
                  >
                    {staff.status}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPrintStaff(staff);
                    setIsPrintModalOpen(true);
                  }}
                  className="px-3 py-3 bg-[var(--muted)] text-[var(--toss-gray-4)] border border-[var(--border)] rounded-[var(--radius-lg)] text-[11px] font-semibold hover:bg-[var(--toss-blue-light)] transition-all"
                  title="서면 촉진 통보서 출력"
                >
                  🖨️ 서류 출력
                </button>
                {staff.actionRequired ? (
                  <button
                    onClick={() => handleSendPromotion(staff)}
                    disabled={loading || isAlreadySent(staff)}
                    className="px-4 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] text-[11px] font-semibold shadow-sm hover:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {isAlreadySent(staff) ? '통보 완료' : '⚡ 촉진 통보 발송'}
                  </button>
                ) : (
                  <div className="px-4 py-3 bg-[var(--card)] border border-indigo-100 text-indigo-400 rounded-[var(--radius-lg)] text-[11px] font-semibold flex items-center gap-2">
                    <span>✅ 제출 완료</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {visibleTargets.length === 0 && (
            <div className="text-center py-20 bg-green-500/10 rounded-[var(--radius-lg)] border border-dashed border-green-500/20">
              <p className="text-sm font-semibold text-green-600">
                ✅ 현재 연차사용촉진 대상자가 없습니다.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-orange-500/10 p-4 rounded-[var(--radius-lg)] border border-orange-100">
        <h3 className="text-sm font-semibold text-orange-800 mb-4">
          ⚖️ 근로기준법 제61조 (연차 유급휴가의 사용 촉진)
        </h3>
        <ul className="space-y-3 text-[11px] text-orange-700 font-bold leading-relaxed">
          <li>
            • 1차 촉진: 연차 유급휴가 발생일로부터 1년이 끝나기 6개월 전을 기준으로 10일 이내에
            서면으로 통보
          </li>
          <li>
            • 2차 촉진: 1차 촉진에도 불구하고 사용하지 아니하면 1년이 끝나기 2개월 전까지 사용
            시기를 정하여 서면으로 통보
          </li>
          <li>
            • 효과: 위 조치를 모두 이행하였음에도 근로자가 사용하지 아니한 경우, 미사용 연차에 대한
            보상 의무가 소멸됩니다.
          </li>
        </ul>
      </div>
      
      <AnnualLeaveDocumentModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        staff={printStaff}
      />
    </div>
  );
}

// ─── 내부 팩토리 ──────────────────────────────────────────────────────────────

function makeTarget(
  s: StaffLite,
  totalLeave: number,
  usedLeave: number,
  remainingLeave: number,
  status: PromotionTarget['status'],
  actionRequired: boolean,
  promotionStage: PromotionStage | null,
  expiryDateStr: string | null,
): PromotionTarget {
  return {
    id: String(s.id),
    name: s.name,
    position: s.position,
    company: s.company,
    department: s.department,
    annual_leave_total: s.annual_leave_total,
    annual_leave_used: s.annual_leave_used,
    join_date: s.join_date,
    totalLeave,
    usedLeave,
    remainingLeave,
    status,
    actionRequired,
    promotionStage,
    expiryDateStr };
}
