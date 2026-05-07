'use client';

import type { HandoverRoomConfig } from '@/lib/handover-notes';
import type { RoomStatus } from './handover-types';
import { fullDateLabel } from './handover-types';

export type RoomConfigPanelProps = {
  selectedDate: Date;
  roomConfigs: HandoverRoomConfig[];
  roomStatus: RoomStatus;
  roomDirty: boolean;
  newRoomNumber: string;
  newRoomCapacity: number;
  onSave: () => void;
  onClose: () => void;
  onAddRoom: () => void;
  onReplaceRooms: (rooms: HandoverRoomConfig[]) => void;
  onRoomNumberChange: (roomId: string, value: string) => void;
  onRoomCapacityChange: (roomId: string, value: number) => void;
  onBedPatientChange: (roomId: string, bedNumber: number, patientName: string) => void;
  onBedAdmissionDateChange: (roomId: string, bedNumber: number, value: string) => void;
  onNewRoomNumberChange: (value: string) => void;
  onNewRoomCapacityChange: (value: number) => void;
};

export default function RoomConfigPanel({
  selectedDate,
  roomConfigs,
  roomStatus,
  roomDirty,
  newRoomNumber,
  newRoomCapacity,
  onSave,
  onClose,
  onAddRoom,
  onReplaceRooms,
  onRoomNumberChange,
  onRoomCapacityChange,
  onBedPatientChange,
  onBedAdmissionDateChange,
  onNewRoomNumberChange,
  onNewRoomCapacityChange,
}: RoomConfigPanelProps) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 py-4"
      data-testid="handover-bed-settings-modal"
    >
      <div className="max-h-[82vh] w-full max-w-[720px] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">병상 설정</h3>
            <p className="mt-0.5 text-[11px] text-[var(--toss-gray-3)]">{fullDateLabel(selectedDate)}</p>
          </div>
          <div className="flex items-center gap-2">
            {roomDirty ? (
              <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground)]">
                수정됨
              </span>
            ) : null}
            {roomStatus === 'saving' ? (
              <span className="rounded-[var(--radius-md)] bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                저장 중
              </span>
            ) : null}
            {roomStatus === 'saved' ? (
              <span className="rounded-[var(--radius-md)] bg-[var(--success-light)] px-2.5 py-1 text-[11px] font-semibold text-[var(--success)]">
                저장됨
              </span>
            ) : null}
            {roomStatus === 'error' ? (
              <span className="rounded-[var(--radius-md)] bg-red-500/20 px-2.5 py-1 text-[11px] font-semibold text-red-600">
                저장 실패
              </span>
            ) : null}
            <button
              type="button"
              onClick={onSave}
              data-testid="handover-bed-settings-save"
              disabled={roomStatus === 'saving' || !roomDirty}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={onClose}
              data-testid="handover-bed-settings-close"
              className="rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="max-h-[calc(82vh-62px)] overflow-y-auto px-3 py-2.5">
          <div className="grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-1.5 sm:grid-cols-[72px_72px_auto]">
            <input
              type="text"
              value={newRoomNumber}
              onChange={(event) => onNewRoomNumberChange(event.target.value)}
              placeholder="예: 101"
              data-testid="handover-new-room-number"
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
            />
            <select
              value={newRoomCapacity}
              onChange={(event) => onNewRoomCapacityChange(Number(event.target.value))}
              data-testid="handover-new-room-capacity"
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--accent)]"
            >
              {[1, 2, 3, 4].map((capacity) => (
                <option key={capacity} value={capacity}>
                  {capacity}인실
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onAddRoom}
              data-testid="handover-add-room"
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              병실 추가
            </button>
          </div>

          {roomConfigs.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
              등록된 병상 설정이 없습니다.
            </div>
          ) : (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {roomConfigs.map((room, roomIndex) => (
                <div
                  key={room.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-2 shadow-sm"
                >
                  <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_68px_auto] sm:items-center">
                    <input
                      type="text"
                      value={room.roomNumber}
                      onChange={(event) => onRoomNumberChange(room.id, event.target.value)}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--accent)]"
                    />
                    <select
                      value={room.capacity}
                      onChange={(event) => onRoomCapacityChange(room.id, Number(event.target.value))}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[var(--accent)]"
                    >
                      {[1, 2, 3, 4].map((capacity) => (
                        <option key={capacity} value={capacity}>
                          {capacity}인실
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onReplaceRooms(roomConfigs.filter((item) => item.id !== room.id))}
                      className="rounded-[var(--radius-md)] bg-red-500/10 px-2 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-500/20"
                    >
                      호수 삭제
                    </button>
                  </div>

                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    {room.beds.map((bed, bedIndex) => (
                      <div
                        key={`${room.id}-${bed.bedNumber}`}
                        className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-2"
                      >
                        <div className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                          {room.roomNumber}호 {bed.bedNumber}번
                        </div>
                        <input
                          type="text"
                          value={bed.patientName}
                          onChange={(event) => onBedPatientChange(room.id, bed.bedNumber, event.target.value)}
                          placeholder="환자 이름"
                          data-testid={`handover-room-${roomIndex}-patient-${bedIndex}`}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
                        />
                        <input
                          type="date"
                          value={bed.admissionDate || ''}
                          onChange={(event) => onBedAdmissionDateChange(room.id, bed.bedNumber, event.target.value)}
                          data-testid={`handover-room-${roomIndex}-admission-${bedIndex}`}
                          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
