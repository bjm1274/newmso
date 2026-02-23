'use client';

/**
 * 수리요청서 전자결재 양식
 * 장비/시설 수리 요청 시 사용 (제목은 사용자가 직접 입력)
 */
export default function RepairRequestForm({ setExtraData }: any) {
  return (
    <div className="bg-gray-25/30 p-8 rounded-[2.5rem] border-2 border-dashed border-gray-100 animate-in fade-in duration-300">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-amber-600 ml-1 uppercase">장비/시설명</label>
            <input
              type="text"
              placeholder="예: 엘리베이터, 에어컨, PC, 복합기"
              className="w-full p-4 rounded-lg border bg-white font-bold text-xs outline-none shadow-sm focus:ring-2 focus:ring-amber-200 border-none"
              onChange={e => setExtraData((p: any) => ({ ...p, equipmentName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-amber-600 ml-1 uppercase">위치</label>
            <input
              type="text"
              placeholder="예: 3층 원장실, 1층 원무과"
              className="w-full p-4 rounded-lg border bg-white font-bold text-xs outline-none shadow-sm focus:ring-2 focus:ring-amber-200 border-none"
              onChange={e => setExtraData((p: any) => ({ ...p, location: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-amber-600 ml-1 uppercase">희망 수리일</label>
            <input
              type="date"
              className="w-full p-4 rounded-lg border bg-white font-bold text-xs shadow-sm outline-none focus:ring-2 focus:ring-amber-200 border-none"
              onChange={e => setExtraData((p: any) => ({ ...p, desiredDate: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-amber-600 ml-1 uppercase">긴급도</label>
            <select
              className="w-full p-4 rounded-lg border bg-white font-semibold text-xs outline-none shadow-sm focus:ring-2 focus:ring-amber-200 border-none"
              onChange={e => setExtraData((p: any) => ({ ...p, urgency: e.target.value }))}
            >
              <option value="일반">일반</option>
              <option value="긴급">긴급</option>
              <option value="매우긴급">매우긴급</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-amber-600 ml-1 uppercase">요청 내용 (고장·불편 사항)</label>
          <textarea
            placeholder="수리 요청 사유 및 상세 내용을 입력하세요."
            className="w-full h-28 p-4 rounded-lg border bg-white font-bold text-xs outline-none shadow-sm focus:ring-2 focus:ring-amber-200 border-none resize-none"
            onChange={e => setExtraData((p: any) => ({ ...p, repairContent: e.target.value }))}
          />
        </div>
      </div>
      <div className="mt-6 text-center border-t border-gray-100 pt-6">
        <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">
          수리요청서 전용 양식입니다. 하단 본문에 추가 사항이 있으면 작성하세요.
        </p>
      </div>
    </div>
  );
}
