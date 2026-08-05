'use client';

// OP체크 청구내역(소모품 사용 내역서) 출력 모달
// 순수 프레젠테이션 — 열림 여부/닫기/프린트는 부모가 제어. OP체크.tsx 에서 그대로 추출됨.

import { formatDateLabel } from './schedule-helpers';
import type { PatientCheckState } from './patient-check-helpers';
import { parseDbTimestamp } from '@/lib/date-formatter';

/**
 * D1 타임스탬프 → Date. 공백형은 **UTC**(= `DEFAULT CURRENT_TIMESTAMP` 가 넣는 값)로 읽는다.
 * 예전에는 `+09:00` 으로 읽어 공백형 행이 9시간 이르게 인쇄될 수 있었다(8차 D10-009).
 */
function parseD1KstDate(value: string): Date {
  return parseDbTimestamp(value);
}

type OpCheckPrintModalProps = {
  open: boolean;
  checkForm: PatientCheckState | null;
  chartNo: string;
  scheduleRoom: string;
  onClose: () => void;
};

export function OpCheckPrintModal({
  open,
  checkForm,
  chartNo,
  scheduleRoom,
  onClose }: OpCheckPrintModalProps) {
  if (!open || !checkForm) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-lg">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 print:hidden">
          <h3 className="text-base font-bold text-gray-900">청구내역 출력</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
            >
              프린트
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50"
            >
              닫기
            </button>
          </div>
        </div>
        <div className="p-6 text-gray-900">
          {/* 환자 정보 헤더 */}
          <div className="mb-5 border-b-2 border-gray-800 pb-4">
            <h2 className="text-xl font-bold">수술 소모품 사용 내역서</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div><span className="font-semibold text-gray-500">환자명</span> <span className="ml-2 font-bold">{checkForm.patient_name}</span></div>
              {chartNo && <div><span className="font-semibold text-gray-500">차트번호</span> <span className="ml-2 font-bold">{chartNo}</span></div>}
              <div><span className="font-semibold text-gray-500">수술명</span> <span className="ml-2 font-bold">{checkForm.surgery_name}</span></div>
              {checkForm.anesthesia_type && <div><span className="font-semibold text-gray-500">마취방법</span> <span className="ml-2">{checkForm.anesthesia_type}</span></div>}
              <div><span className="font-semibold text-gray-500">수술일</span> <span className="ml-2">{formatDateLabel(checkForm.schedule_date)}</span></div>
              <div><span className="font-semibold text-gray-500">수술실</span> <span className="ml-2">{scheduleRoom}</span></div>
              {checkForm.surgery_started_at && <div><span className="font-semibold text-gray-500">수술 시작</span> <span className="ml-2">{parseD1KstDate(checkForm.surgery_started_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}</span></div>}
              {checkForm.surgery_ended_at && <div><span className="font-semibold text-gray-500">수술 종료</span> <span className="ml-2">{parseD1KstDate(checkForm.surgery_ended_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}</span></div>}
            </div>
          </div>

          {/* 소모품 테이블 */}
          <h3 className="mb-2 text-base font-bold">사용 소모품 목록</h3>
          {(() => {
            const used = checkForm.consumable_items.filter((i) => i.name && i.checked);
            if (used.length === 0) {
              return <p className="text-sm text-gray-400">체크된 소모품이 없습니다.</p>;
            }
            return (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--muted)]">
                    <th className="border border-[var(--border)] px-3 py-2 text-left font-semibold">품목명</th>
                    <th className="border border-[var(--border)] px-3 py-2 text-center font-semibold w-16">수량</th>
                    <th className="border border-[var(--border)] px-3 py-2 text-center font-semibold w-16">단위</th>
                    <th className="border border-[var(--border)] px-3 py-2 text-left font-semibold">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {used.map((item) => (
                    <tr key={item.id} className="even:bg-gray-50">
                      <td className="border border-gray-300 px-3 py-2">{item.name}</td>
                      <td className="border border-gray-300 px-3 py-2 text-center font-bold">{item.quantity || '-'}</td>
                      <td className="border border-gray-300 px-3 py-2 text-center">{item.unit || '-'}</td>
                      <td className="border border-gray-300 px-3 py-2 text-gray-500">{item.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}

          {checkForm.notes && (
            <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500">메모</p>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{checkForm.notes}</p>
            </div>
          )}

          <div className="mt-6 text-right text-xs text-gray-400">
            출력일시: {new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
          </div>
        </div>
      </div>
    </div>
  );
}
