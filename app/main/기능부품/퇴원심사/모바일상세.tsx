'use client';

import { useState } from 'react';
import type { DischargeRuleAnalysis } from '@/lib/discharge-review-rules';
import 보완요청시트, { type CompareResult } from './보완요청시트';

export type CheckItem = {
  id: string;
  label: string;
  code: string;
  checked: boolean;
};

export type DischargeReviewDetail = {
  id: string;
  patient_name: string;
  birth_date: string;
  gender: string;
  department: string;
  admission_date: string;
  discharge_date: string;
  diagnosis: string;
  insurance_type: string;
  surgery_name: string;
  surgery_date: string;
  room_grade: string;
  doctor_name: string;
  comorbidities: string;
  disease_codes: string;
  admission_route: string;
  discharge_type: string;
  drg_code: string;
  items: CheckItem[];
  status: string;
  ai_analysis: string;
  created_at: string;
};

export type 퇴원심사모바일상세Props = {
  review: DischargeReviewDetail;
  ruleAnalysis: DischargeRuleAnalysis | null;
  compareResult: CompareResult | null;
  aiResult: string;
  aiLoading: boolean;
  canAutoCompare: boolean;
  onBack: () => void;
  onToggleItem: (itemId: string) => void;
  onToggleAll: (check: boolean) => void;
  onApprove: () => void;
  onDelete: () => void;
  onAutoCompare: () => void;
  onRequestAi: () => void;
};

function stayDays(a: string, d: string): number {
  if (!a || !d) return 0;
  const v = Math.ceil((new Date(d).getTime() - new Date(a).getTime()) / 86400000);
  return v > 0 ? v : 0;
}

/**
 * 퇴원심사 모바일 상세 화면.
 * - 헤더: 뒤로 가기 + 승인 상태 + 삭제.
 * - 본문: 환자 정보 카드 + 체크리스트(전체체크/해제).
 * - 액션: 점검(보완요청시트) · 승인 버튼.
 * - 수정 모드는 데스크탑 전용으로 두고, 모바일은 read + 체크/승인에 집중(JM5: 모바일에서 위험한 수정 흐름 축소).
 */
export default function 퇴원심사모바일상세({
  review,
  ruleAnalysis,
  compareResult,
  aiResult,
  aiLoading,
  canAutoCompare,
  onBack,
  onToggleItem,
  onToggleAll,
  onApprove,
  onDelete,
  onAutoCompare,
  onRequestAi,
}: 퇴원심사모바일상세Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const total = review.items.length;
  const checked = review.items.filter((i) => i.checked).length;
  const ratio = total > 0 ? Math.round((checked / total) * 100) : 0;
  const isApproved = review.status === 'approved';
  const criticalCount = ruleAnalysis?.summary.critical ?? 0;
  const warningCount = ruleAnalysis?.summary.warning ?? 0;
  const issueBadge = criticalCount + warningCount;

  return (
    <div className="space-y-3 pb-24" data-testid="discharge-mobile-detail">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="목록으로 돌아가기"
          className="flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--muted)] rounded-[var(--radius-md)] transition-colors"
        >
          <span aria-hidden="true">←</span> 목록
        </button>
        {!isApproved && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="퇴원심사 삭제"
            className="px-2.5 py-1.5 text-[11px] font-bold text-red-500 bg-red-500/10 rounded-[var(--radius-md)] hover:bg-red-500/20"
          >
            삭제
          </button>
        )}
      </div>

      {/* 환자 정보 카드 */}
      <section className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              isApproved
                ? 'bg-green-500/15 text-green-700'
                : 'bg-orange-500/15 text-orange-700'
            }`}
          >
            {isApproved ? '승인' : '심사 중'}
          </span>
          {review.diagnosis && (
            <span className="text-[10px] font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded">
              {review.diagnosis}
            </span>
          )}
          {review.insurance_type && (
            <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded">
              {review.insurance_type}
            </span>
          )}
        </div>
        <div>
          <h3 className="text-lg font-bold text-[var(--foreground)]">
            {review.patient_name}
            {review.gender && (
              <span className="text-sm font-medium text-[var(--toss-gray-3)] ml-1">
                ({review.gender})
              </span>
            )}
          </h3>
          <p className="text-xs font-medium text-[var(--toss-gray-3)]">
            {review.department}
            {review.doctor_name ? ` · 주치의 ${review.doctor_name}` : ''}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-[var(--tab-bg)] rounded-[var(--radius-md)] p-2">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-0.5">입원일</p>
            <p className="text-xs font-bold text-[var(--toss-gray-5)]">
              {review.admission_date || '-'}
            </p>
          </div>
          <div className="bg-[var(--tab-bg)] rounded-[var(--radius-md)] p-2">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-0.5">퇴원일</p>
            <p className="text-xs font-bold text-[var(--toss-gray-5)]">
              {review.discharge_date || '-'}
            </p>
          </div>
          <div className="bg-[var(--tab-bg)] rounded-[var(--radius-md)] p-2">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-0.5">입원 기간</p>
            <p className="text-xs font-bold text-[var(--accent)]">
              {stayDays(review.admission_date, review.discharge_date)}일
            </p>
          </div>
          <div className="bg-[var(--tab-bg)] rounded-[var(--radius-md)] p-2">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-0.5">병실</p>
            <p className="text-xs font-bold text-[var(--toss-gray-5)]">
              {review.room_grade || '-'}
            </p>
          </div>
        </div>
        {(review.surgery_name || review.comorbidities) && (
          <div className="grid grid-cols-1 gap-2">
            {review.surgery_name && (
              <div className="bg-[var(--tab-bg)] rounded-[var(--radius-md)] p-2">
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-0.5">수술/시술</p>
                <p className="text-xs font-bold text-[var(--toss-gray-5)]">
                  {review.surgery_name}
                  {review.surgery_date ? ` (${review.surgery_date})` : ''}
                </p>
              </div>
            )}
            {review.comorbidities && (
              <div className="bg-[var(--tab-bg)] rounded-[var(--radius-md)] p-2">
                <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-0.5">동반질환</p>
                <p className="text-xs font-bold text-[var(--toss-gray-5)]">
                  {review.comorbidities}
                </p>
              </div>
            )}
          </div>
        )}
        {review.disease_codes && (
          <div className="bg-purple-500/10 p-2 rounded-[var(--radius-md)]">
            <p className="text-[10px] font-bold text-purple-500 mb-0.5">상병명</p>
            <p className="text-[11px] font-mono text-[var(--toss-gray-5)] whitespace-pre-line">
              {review.disease_codes}
            </p>
          </div>
        )}
      </section>

      {/* 체크리스트 */}
      <section className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[var(--foreground)]">
            체크리스트 ({checked}/{total})
          </h4>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--accent)]">{ratio}%</span>
            {!isApproved && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onToggleAll(true)}
                  aria-label="전체 체크"
                  className="px-1.5 py-0.5 text-[10px] font-bold text-green-600 bg-green-500/10 rounded"
                >
                  전체
                </button>
                <button
                  type="button"
                  onClick={() => onToggleAll(false)}
                  aria-label="전체 해제"
                  className="px-1.5 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)] bg-[var(--tab-bg)] rounded"
                >
                  해제
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="h-1.5 bg-[var(--tab-bg)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
            style={{ width: `${ratio}%` }}
          />
        </div>
        <ul className="space-y-1 max-h-[50vh] overflow-y-auto custom-scrollbar">
          {review.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => !isApproved && onToggleItem(item.id)}
                disabled={isApproved}
                aria-pressed={item.checked}
                className={`w-full flex items-center gap-2 p-2 rounded text-left transition-all ${
                  item.checked
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-[var(--tab-bg)] border border-transparent'
                } ${isApproved ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span
                  aria-hidden="true"
                  className={`w-4 h-4 rounded-full flex items-center justify-center border-2 shrink-0 text-[10px] ${
                    item.checked
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-[var(--border)]'
                  }`}
                >
                  {item.checked && '✓'}
                </span>
                {item.code && (
                  <span className="font-mono text-[10px] text-[var(--toss-gray-3)] shrink-0 truncate max-w-[60px]">
                    {item.code}
                  </span>
                )}
                <span
                  className={`text-[11px] font-medium flex-1 ${
                    item.checked
                      ? 'text-green-700 line-through'
                      : 'text-[var(--toss-gray-5)]'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 하단 고정 액션 */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-[var(--card)] border-t border-[var(--border)] px-3 py-3 flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="심사 점검 / 보완 요청 열기"
          className="relative flex-1 py-2.5 text-xs font-bold text-[var(--accent)] bg-blue-500/10 rounded-[var(--radius-md)] active:scale-[0.98] transition-all"
        >
          심사 점검
          {issueBadge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {issueBadge}
            </span>
          )}
        </button>
        {!isApproved && (
          <button
            type="button"
            onClick={onApprove}
            data-testid="discharge-mobile-approve"
            className="flex-[1.2] py-2.5 text-xs font-bold text-white bg-green-600 rounded-[var(--radius-md)] active:scale-[0.98] transition-all"
          >
            퇴원 승인
          </button>
        )}
      </div>

      {/* 점검 시트 */}
      <보완요청시트
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        compareResult={compareResult}
        ruleAnalysis={ruleAnalysis}
        aiResult={aiResult}
        aiLoading={aiLoading}
        onRequestAi={onRequestAi}
        onAutoCompare={onAutoCompare}
        canAutoCompare={canAutoCompare}
      />
    </div>
  );
}
