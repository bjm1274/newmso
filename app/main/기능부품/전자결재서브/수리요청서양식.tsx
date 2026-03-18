'use client';

import { useState } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';

export default function RepairRequestForm({ setExtraData }: any) {
  const [localDesiredDate, setLocalDesiredDate] = useState('');

  return (
    <div
      data-testid="repair-request-view"
      className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-in fade-in duration-300"
    >
      <div className="border-b border-amber-100 bg-amber-50/50 p-3">
        <h4 className="text-sm font-bold text-amber-700">수리/정비 요청서</h4>
        <p className="mt-0.5 text-[11px] font-semibold text-amber-600/70">
          장비와 시설의 고장 또는 불편 사항을 접수하는 전자결재 양식입니다.
        </p>
      </div>

      <div className="space-y-4 bg-[var(--tab-bg)]/30 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
              장비/시설명
            </label>
            <input
              type="text"
              data-testid="repair-request-equipment-name"
              placeholder="예: 체외충격기, 접수창구 PC, 복합기"
              className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-amber-200"
              onChange={(event) =>
                setExtraData((prev: any) => ({ ...prev, equipmentName: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
              위치
            </label>
            <input
              type="text"
              data-testid="repair-request-location"
              placeholder="예: 3층 수술실, 1층 원무과"
              className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-amber-200"
              onChange={(event) =>
                setExtraData((prev: any) => ({ ...prev, location: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
              희망 수리일
            </label>
            <SmartDatePicker
              value={localDesiredDate}
              onChange={(value) => {
                setLocalDesiredDate(value);
                setExtraData((prev: any) => ({ ...prev, desiredDate: value }));
              }}
              data-testid="repair-request-desired-date"
              inputClassName="w-full h-10 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
              긴급도
            </label>
            <select
              data-testid="repair-request-urgency"
              className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-semibold outline-none shadow-sm focus:ring-2 focus:ring-amber-200"
              onChange={(event) =>
                setExtraData((prev: any) => ({ ...prev, urgency: event.target.value }))
              }
            >
              <option value="일반">일반</option>
              <option value="긴급">긴급</option>
              <option value="매우긴급">매우긴급</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
            요청 내용
          </label>
          <textarea
            data-testid="repair-request-content"
            placeholder="고장 증상이나 불편 사항을 자세히 입력해주세요."
            className="h-24 w-full resize-none rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-amber-200"
            onChange={(event) =>
              setExtraData((prev: any) => ({ ...prev, repairContent: event.target.value }))
            }
          />
        </div>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--card)] p-3 text-center">
        <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">
          하단 본문에 추가 사항이 있으면 함께 작성해주세요.
        </p>
      </div>
    </div>
  );
}
