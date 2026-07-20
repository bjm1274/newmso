'use client';

import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import dynamic from 'next/dynamic';
import { buildStorageDownloadUrl } from '@/lib/object-storage-url';
import type { AttachmentItem } from '@/types';
import {
  getBoardStatusTone,
  isScheduleBoardType,
  normalizeBoardPostStatus,
  type BoardTemplateRow,
} from '../게시판-view-utils';
import { VALID_BODY_IDS } from '../게시판/post-helpers';

const SmartDatePicker = dynamic(() => import('../공통/SmartDatePicker'), {
  ssr: false,
});

export type BoardComposePanelProps = {
  activeBoard: string;
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
  content: string;
  setContent: Dispatch<SetStateAction<string>>;
  familyEventType: string;
  setFamilyEventType: Dispatch<SetStateAction<string>>;
  familyEventTarget: string;
  setFamilyEventTarget: Dispatch<SetStateAction<string>>;
  familyEventDate: string;
  setFamilyEventDate: Dispatch<SetStateAction<string>>;
  familyEventLocation: string;
  setFamilyEventLocation: Dispatch<SetStateAction<string>>;
  familyEventAccount: string;
  setFamilyEventAccount: Dispatch<SetStateAction<string>>;
  familyEventDetail: string;
  setFamilyEventDetail: Dispatch<SetStateAction<string>>;
  tagsInput: string;
  setTagsInput: Dispatch<SetStateAction<string>>;
  scheduledPublishAt: string;
  setScheduledPublishAt: Dispatch<SetStateAction<string>>;
  postStatus: string;
  setPostStatus: Dispatch<SetStateAction<string>>;
  scheduleDate: string;
  setScheduleDate: Dispatch<SetStateAction<string>>;
  schedulePeriod: string;
  setSchedulePeriod: Dispatch<SetStateAction<string>>;
  scheduleHour: string;
  setScheduleHour: Dispatch<SetStateAction<string>>;
  scheduleMinute: string;
  setScheduleMinute: Dispatch<SetStateAction<string>>;
  scheduleRoom: string;
  setScheduleRoom: Dispatch<SetStateAction<string>>;
  schedulePatient: string;
  setSchedulePatient: Dispatch<SetStateAction<string>>;
  scheduleChartNo: string;
  setScheduleChartNo: Dispatch<SetStateAction<string>>;
  scheduleFasting: boolean;
  setScheduleFasting: Dispatch<SetStateAction<boolean>>;
  scheduleInpatient: boolean;
  setScheduleInpatient: Dispatch<SetStateAction<boolean>>;
  scheduleGuardian: boolean;
  setScheduleGuardian: Dispatch<SetStateAction<boolean>>;
  scheduleCaregiver: boolean;
  setScheduleCaregiver: Dispatch<SetStateAction<boolean>>;
  scheduleTransfusion: boolean;
  setScheduleTransfusion: Dispatch<SetStateAction<boolean>>;
  scheduleContrastRequired: boolean;
  setScheduleContrastRequired: Dispatch<SetStateAction<boolean>>;
  scheduleSide: '좌' | '우' | '';
  setScheduleSide: Dispatch<SetStateAction<'좌' | '우' | ''>>;
  isAnonymous: boolean;
  setIsAnonymous: Dispatch<SetStateAction<boolean>>;
  hasPoll: boolean;
  setHasPoll: Dispatch<SetStateAction<boolean>>;
  pollQuestion: string;
  setPollQuestion: Dispatch<SetStateAction<string>>;
  pollOptions: string[];
  setPollOptions: Dispatch<SetStateAction<string[]>>;
  pollAnonymous: boolean;
  setPollAnonymous: Dispatch<SetStateAction<boolean>>;
  pollMultiple: boolean;
  setPollMultiple: Dispatch<SetStateAction<boolean>>;
  pollPrizeEnabled: boolean;
  setPollPrizeEnabled: Dispatch<SetStateAction<boolean>>;
  pollPrizeWinnerCount: number;
  setPollPrizeWinnerCount: Dispatch<SetStateAction<number>>;
  pollPrizeName: string;
  setPollPrizeName: Dispatch<SetStateAction<string>>;
  attachmentFiles: File[];
  setAttachmentFiles: Dispatch<SetStateAction<File[]>>;
  existingAttachmentItems: AttachmentItem[];
  setExistingAttachmentItems: Dispatch<SetStateAction<AttachmentItem[]>>;
  selectedBodyPart: string;
  setSelectedBodyPart: Dispatch<SetStateAction<string>>;
  setShowBodyPicker: Dispatch<SetStateAction<boolean>>;
  filteredTemplates: BoardTemplateRow[];
  canScheduleNoticePost: boolean;
  isScheduleBoard: boolean;
  isScheduleDraftReady: boolean;
  normalizedDraftScheduleDate: string;
  loading: boolean;
  updateScheduleTime: (period: string, hour: string, minute: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  handleAttachmentDownloadClick: (
    event: ReactMouseEvent<HTMLAnchorElement>,
    url: string,
    fileName: string,
  ) => void | Promise<void>;
};

export default function BoardComposePanel({
  activeBoard,
  title,
  setTitle,
  content,
  setContent,
  familyEventType,
  setFamilyEventType,
  familyEventTarget,
  setFamilyEventTarget,
  familyEventDate,
  setFamilyEventDate,
  familyEventLocation,
  setFamilyEventLocation,
  familyEventAccount,
  setFamilyEventAccount,
  familyEventDetail,
  setFamilyEventDetail,
  tagsInput,
  setTagsInput,
  scheduledPublishAt,
  setScheduledPublishAt,
  postStatus,
  setPostStatus,
  scheduleDate,
  setScheduleDate,
  schedulePeriod,
  setSchedulePeriod,
  scheduleHour,
  setScheduleHour,
  scheduleMinute,
  setScheduleMinute,
  scheduleRoom,
  setScheduleRoom,
  schedulePatient,
  setSchedulePatient,
  scheduleChartNo,
  setScheduleChartNo,
  scheduleFasting,
  setScheduleFasting,
  scheduleInpatient,
  setScheduleInpatient,
  scheduleGuardian,
  setScheduleGuardian,
  scheduleCaregiver,
  setScheduleCaregiver,
  scheduleTransfusion,
  setScheduleTransfusion,
  scheduleContrastRequired,
  setScheduleContrastRequired,
  scheduleSide,
  setScheduleSide,
  isAnonymous,
  setIsAnonymous,
  hasPoll,
  setHasPoll,
  pollQuestion,
  setPollQuestion,
  pollOptions,
  setPollOptions,
  pollAnonymous,
  setPollAnonymous,
  pollMultiple,
  setPollMultiple,
  pollPrizeEnabled,
  setPollPrizeEnabled,
  pollPrizeWinnerCount,
  setPollPrizeWinnerCount,
  pollPrizeName,
  setPollPrizeName,
  attachmentFiles,
  setAttachmentFiles,
  existingAttachmentItems,
  setExistingAttachmentItems,
  selectedBodyPart,
  setSelectedBodyPart,
  setShowBodyPicker,
  filteredTemplates,
  canScheduleNoticePost,
  isScheduleBoard,
  isScheduleDraftReady,
  normalizedDraftScheduleDate,
  loading,
  updateScheduleTime,
  onCancel,
  onSubmit,
  handleAttachmentDownloadClick,
}: BoardComposePanelProps) {
  return (
<div data-testid="board-new-post-form" className="bg-[var(--card)] p-4 md:p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <h3 className="text-lg font-bold text-[var(--foreground)]">새 게시물 작성</h3>
    {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
      <button
        type="button"
        onClick={() => {
          if (!VALID_BODY_IDS.has(selectedBodyPart)) setSelectedBodyPart('all');
          setShowBodyPicker(true);
        }}
        className="px-4 py-2 rounded-full bg-[var(--card)] border border-[var(--border)] text-base font-bold text-[var(--accent)] hover:bg-[var(--toss-blue-light)] shrink-0"
      >
        👤 사람 모형으로 선택
      </button>
    )}
  </div>

  <div className="space-y-4">
    {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)]/60 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[var(--toss-gray-3)]">기본 정보</p>
          </div>
          <span className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-white">필수</span>
        </div>
        <div>
          <div className="space-y-3">
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setTitle(v);
              }}
              className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              <option value="">
                {activeBoard === '수술일정'
                  ? '자주 쓰는 수술명 선택 (부위 선택 또는 사람 모형에서 선택 가능)'
                  : '자주 쓰는 검사명 선택 (부위 선택 또는 사람 모형에서 선택 가능)'}
              </option>
              {filteredTemplates.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2 items-stretch">
              <input
                data-testid="board-schedule-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  activeBoard === '수술일정'
                    ? '수술명을 입력하거나 위에서 선택하세요.'
                    : '검사명을 입력하거나 위에서 선택하세요.'
                }
                className="flex-1 min-w-0 p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden bg-[var(--muted)] shrink-0 min-w-[120px]">
                <button
                  type="button"
                  onClick={() => setScheduleSide(scheduleSide === '좌' ? '' : '좌')}
                  className={`flex-1 min-w-[56px] px-4 py-3 text-sm font-bold transition-colors ${scheduleSide === '좌' ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-4)] hover:bg-[var(--border)]'}`}
                >
                  좌
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleSide(scheduleSide === '우' ? '' : '우')}
                  className={`flex-1 min-w-[56px] px-4 py-3 text-sm font-bold transition-colors ${scheduleSide === '우' ? 'bg-[var(--accent)] text-white' : 'text-[var(--toss-gray-4)] hover:bg-[var(--border)]'}`}
                >
                  우
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)]/60 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[var(--toss-gray-3)]">일정</p>
          </div>
          <span className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-white">필수</span>
        </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="board-schedule-date" className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">날짜 (YYYY-MM-DD)</label>
            <SmartDatePicker
              data-testid="board-schedule-date"
              value={scheduleDate}
              onChange={setScheduleDate}
              placeholder="0000-00-00"
              inputClassName="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <div>
            <span id="board-schedule-time-label" className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">시간</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="board-schedule-time-label">
              <select
                data-testid="board-schedule-period"
                aria-label="오전/오후"
                value={schedulePeriod}
                onChange={(e) => {
                  const v = e.target.value;
                  setSchedulePeriod(v);
                  updateScheduleTime(v, scheduleHour, scheduleMinute);
                }}
                className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value="">오전/오후</option>
                <option value="오전">오전</option>
                <option value="오후">오후</option>
              </select>
              <select
                data-testid="board-schedule-hour"
                aria-label="시간"
                value={scheduleHour}
                onChange={(e) => {
                  const v = e.target.value;
                  setScheduleHour(v);
                  updateScheduleTime(schedulePeriod, v, scheduleMinute);
                }}
                className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value="">시간</option>
                {Array.from({ length: 12 }).map((_, idx) => {
                  const h = idx + 1;
                  const v = String(h).padStart(2, '0');
                  return (
                    <option key={v} value={v}>{v}시</option>
                  );
                })}
              </select>
              <select
                data-testid="board-schedule-minute"
                aria-label="분"
                value={scheduleMinute}
                onChange={(e) => {
                  const v = e.target.value;
                  setScheduleMinute(v);
                  updateScheduleTime(schedulePeriod, scheduleHour, v);
                }}
                className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value="">분</option>
                <option value="00">00분</option>
                <option value="30">30분</option>
              </select>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="board-schedule-room" className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">수술실/검사실</label>
            <input id="board-schedule-room" value={scheduleRoom} onChange={e => setScheduleRoom(e.target.value)} placeholder="예: 수술실 1" className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20" />
          </div>
          <div>
            <label htmlFor="board-schedule-patient" className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">환자명</label>
            <input id="board-schedule-patient" value={schedulePatient} onChange={e => setSchedulePatient(e.target.value)} placeholder="환자명 입력" className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20" />
          </div>
          <div>
            <label htmlFor="board-schedule-chart" className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">차트번호</label>
            <input id="board-schedule-chart" value={scheduleChartNo} onChange={e => setScheduleChartNo(e.target.value)} placeholder="예: 12345" className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20" />
          </div>
        </div>
        {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
          <div className="space-y-3">
            <label className="text-[15px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-1.5 block">
              {activeBoard === '수술일정' ? '수술 관련 체크' : '촬영 관련 체크'}
            </label>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-base font-bold text-[var(--toss-gray-4)]">
              <label className="inline-flex items-center gap-3 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={scheduleFasting}
                  onChange={(e) => setScheduleFasting(e.target.checked)}
                  className="w-6 h-6 rounded border-[var(--border)]"
                />
                <span>금식 필요</span>
              </label>
              <span className="inline-flex items-center gap-x-6 shrink-0 flex-nowrap">
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleInpatient}
                    onChange={(e) => setScheduleInpatient(e.target.checked)}
                    className="w-6 h-6 rounded border-[var(--border)]"
                  />
                  <span>입원 예정</span>
                </label>
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleGuardian}
                    onChange={(e) => setScheduleGuardian(e.target.checked)}
                    className="w-6 h-6 rounded border-[var(--border)]"
                  />
                  <span>보호자 동반</span>
                </label>
              </span>
              <label className="inline-flex items-center gap-3 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={scheduleCaregiver}
                  onChange={(e) => setScheduleCaregiver(e.target.checked)}
                  className="w-6 h-6 rounded border-[var(--border)]"
                />
                <span>간병인 배치</span>
              </label>
              <label className="inline-flex items-center gap-3 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={scheduleTransfusion}
                  onChange={(e) => setScheduleTransfusion(e.target.checked)}
                  className="w-6 h-6 rounded border-[var(--border)]"
                />
                <span>수혈 필요</span>
              </label>
            </div>
          </div>
        )}
        {activeBoard === 'MRI일정' && (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
            <label className="inline-flex items-center gap-3 cursor-pointer text-sm font-bold text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={scheduleContrastRequired}
                onChange={(e) => setScheduleContrastRequired(e.target.checked)}
                className="h-5 w-5 rounded border-[var(--border)]"
              />
              <span>조영제 필요</span>
            </label>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-semibold ${getBoardStatusTone(postStatus)}`}>
            {normalizeBoardPostStatus(postStatus)}
          </span>
        </div>
      </div>
      </div>
    ) : (
      <>
        {activeBoard === '경조사' ? (
          // ─── [경조사 소식 전용 폼] ───
          <div className="space-y-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)]/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--toss-gray-3)]">경조사 소식 입력</p>
                </div>
                <span className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-white">필수</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">경조사 구분</label>
                  <select
                    value={familyEventType}
                    onChange={(e) => setFamilyEventType(e.target.value)}
                    className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                  >
                    <option value="결혼">결혼 (축하)</option>
                    <option value="부고">부고 (장례/위로)</option>
                    <option value="출산">출산 (축하)</option>
                    <option value="승진">승진 (축하)</option>
                    <option value="기타">기타 경조사</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">대상 직원 (부서/이름/직급)</label>
                  <input
                    value={familyEventTarget}
                    onChange={(e) => setFamilyEventTarget(e.target.value)}
                    placeholder="예: 인사팀 홍길동 대리"
                    className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">일시 및 시간</label>
                  <input
                    value={familyEventDate}
                    onChange={(e) => setFamilyEventDate(e.target.value)}
                    placeholder="예: 2026년 6월 15일 (월) 낮 12시"
                    className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>
                
                <div>
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">장소 (식장/장례식장)</label>
                  <input
                    value={familyEventLocation}
                    onChange={(e) => setFamilyEventLocation(e.target.value)}
                    placeholder="예: 행복 웨딩홀 2층 / 사랑 장례식장 특1호실"
                    className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">마음 전하실 곳 (계좌번호/연락처 - 선택)</label>
                <input
                  value={familyEventAccount}
                  onChange={(e) => setFamilyEventAccount(e.target.value)}
                  placeholder="예: 신한은행 110-123-456789 (홍길동)"
                  className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)]/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--toss-gray-3)]">상세 메시지</p>
                </div>
                <span className="rounded-[var(--radius-sm)] bg-[var(--muted)] px-2 py-1 text-[10px] font-black text-[var(--toss-gray-3)]">선택</span>
              </div>
              <textarea
                value={familyEventDetail}
                onChange={(e) => setFamilyEventDetail(e.target.value)}
                placeholder="예: 많은 축하와 따뜻한 격려 부탁드립니다."
                className="w-full h-32 p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold leading-relaxed focus:ring-2 focus:ring-[var(--accent)]/20 resize-none"
              />
            </div>

            <div className="flex flex-wrap gap-4 items-center py-2">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-[var(--toss-gray-4)]">
                <input
                  type="checkbox"
                  checked={hasPoll}
                  onChange={(e) => setHasPoll(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]"
                />
                <span>📊 투표 추가</span>
              </label>
            </div>
          </div>
        ) : activeBoard === '공지사항' ? (
          // ─── [공지사항 전용 폼] ───
          <div className="space-y-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)]/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--toss-gray-3)]">공지사항 기본 정보</p>
                </div>
                <span className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-white">필수</span>
              </div>
              
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">제목</label>
                <input
                  data-testid="board-new-post-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="공지사항 제목을 입력하세요."
                  className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-4 items-center py-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-[var(--toss-gray-4)]">
                  <input
                    type="checkbox"
                    checked={postStatus === '중요'}
                    onChange={(e) => setPostStatus(e.target.checked ? '중요' : '게시중')}
                    className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]"
                  />
                  <span>📌 중요 공지로 등록 (최상단 고정 및 강조)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-[var(--toss-gray-4)]">
                  <input
                    type="checkbox"
                    checked={hasPoll}
                    onChange={(e) => setHasPoll(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]"
                  />
                  <span>📊 투표 추가</span>
                </label>
              </div>

              {canScheduleNoticePost && (
                <div className="mt-4">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">예약 게시 시간</label>
                  <input
                    type="datetime-local"
                    value={scheduledPublishAt}
                    onChange={(e) => setScheduledPublishAt(e.target.value)}
                    className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                  <p className="mt-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    비워두면 즉시 게시되고, 지정하면 해당 시각 전까지는 관리자 이상에게만 보입니다.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)]/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--toss-gray-3)]">공지 내용</p>
                </div>
                <span className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-white">필수</span>
              </div>
              <textarea
                data-testid="board-new-post-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="공지 내용을 입력하세요."
                className="w-full h-48 p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold leading-relaxed focus:ring-2 focus:ring-[var(--accent)]/20 resize-none"
              />
            </div>
          </div>
        ) : (
          // ─── [일반 게시판 (자유게시판 등)] ───
          <div className="space-y-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)]/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--toss-gray-3)]">게시글 기본 정보</p>
                </div>
                <span className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-white">필수</span>
              </div>
              
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">제목</label>
                <input
                  data-testid="board-new-post-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="제목을 입력하세요."
                  className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>

              <div className="mt-4">
                <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">태그 (쉼표로 구분)</label>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="예: 일상, 질문, 추천"
                  className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)]/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-[var(--toss-gray-3)]">게시글 내용</p>
                </div>
                <span className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-white">필수</span>
              </div>
              <textarea
                data-testid="board-new-post-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="내용을 입력하세요."
                className="w-full h-48 p-4 bg-[var(--muted)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-sm font-bold leading-relaxed focus:ring-2 focus:ring-[var(--accent)]/20 resize-none"
              />
            </div>

            <div className="flex flex-wrap gap-4 items-center py-2">
              {activeBoard === '자유게시판' && (
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-[var(--toss-gray-4)]">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]"
                  />
                  <span>👤 익명 작성</span>
                </label>
              )}
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-bold text-[var(--toss-gray-4)]">
                <input
                  type="checkbox"
                  checked={hasPoll}
                  onChange={(e) => setHasPoll(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]"
                />
                <span>📊 투표 추가</span>
              </label>
            </div>
          </div>
        )}
        
        {/* 투표 설정 폼 (투표 추가가 켜진 경우에만) */}
        {hasPoll && !isScheduleBoardType(activeBoard) && (
          <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--toss-blue-light)]/30 p-4 space-y-3">
            <p className="text-xs font-bold text-[var(--accent)]">투표 설정</p>
            <input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="투표 질문 (비워두면 게시글 제목 사용)"
              className="w-full p-3 bg-[var(--card)] rounded-lg border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--toss-gray-3)] w-5 text-center">{i + 1}</span>
                  <input
                    value={opt}
                    onChange={(e) => setPollOptions((prev) => prev.map((o, idx) => idx === i ? e.target.value : o))}
                    placeholder={`항목 ${i + 1}`}
                    className="flex-1 p-2.5 bg-[var(--card)] rounded-lg border border-[var(--border)] outline-none text-sm font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                  {pollOptions.length > 2 && (
                    <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 text-xs font-bold hover:text-red-700">삭제</button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 10 && (
              <button type="button" onClick={() => setPollOptions((prev) => [...prev, ''])} className="text-xs font-bold text-[var(--accent)] hover:underline">+ 항목 추가</button>
            )}
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--toss-gray-4)]">
                <input type="checkbox" checked={pollAnonymous} onChange={(e) => setPollAnonymous(e.target.checked)} className="w-4 h-4 rounded accent-[var(--accent)]" />
                익명 투표
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--toss-gray-4)]">
                <input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} className="w-4 h-4 rounded accent-[var(--accent)]" />
                복수 선택 허용
              </label>
            </div>
            {/* 상품 추첨 섹션 */}
            <div className="pt-1 border-t border-[var(--border)]">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--toss-gray-4)]">
                <input
                  type="checkbox"
                  id="board-poll-prize-enabled"
                  checked={pollPrizeEnabled}
                  onChange={(e) => setPollPrizeEnabled(e.target.checked)}
                  className="w-4 h-4 rounded accent-[var(--accent)]"
                />
                상품 추첨 진행
              </label>
              {pollPrizeEnabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="board-poll-prize-count" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">당첨 인원</label>
                    <input
                      id="board-poll-prize-count"
                      type="number"
                      min={1}
                      value={pollPrizeWinnerCount}
                      onChange={(e) => setPollPrizeWinnerCount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full p-2.5 bg-[var(--card)] rounded-lg border border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="board-poll-prize-name" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">상품명</label>
                    <input
                      id="board-poll-prize-name"
                      type="text"
                      value={pollPrizeName}
                      onChange={(e) => setPollPrizeName(e.target.value)}
                      placeholder="예: 아메리카노 쿠폰"
                      className="w-full p-2.5 bg-[var(--card)] rounded-lg border border-[var(--border)] outline-none text-xs font-bold focus:ring-2 focus:ring-[var(--accent)]/20"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-2 block">사진·동영상·파일 첨부</label>
          <input
            type="file"
            multiple
            accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.avif,video/*,.mp4,.mov,.webm,.m4v,.pdf,.doc,.docx,.xls,.xlsx,.hwp,.hwpx,.zip"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              setAttachmentFiles((prev) => [...prev, ...files].slice(0, 10));
              e.target.value = '';
            }}
            className="w-full text-sm font-bold text-[var(--toss-gray-4)] file:mr-3 file:py-2 file:px-4 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--toss-blue-light)] file:text-[var(--accent)] file:font-bold"
          />
          {(existingAttachmentItems.length > 0 || attachmentFiles.length > 0) && (
            <div className="mt-3 space-y-3">
              {existingAttachmentItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    기존 첨부파일 {existingAttachmentItems.length}개
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {existingAttachmentItems.map((att, i) => (
                      <div
                        key={`${att.url}-${i}`}
                        className="flex max-w-full items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                      >
                        <a
                          href={buildStorageDownloadUrl(att.url, att.name ?? '')}
                          onClick={(event) => void handleAttachmentDownloadClick(event, att.url, att.name ?? '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={att.name ?? 'download'}
                          className="max-w-[240px] truncate text-xs font-bold text-[var(--accent)] hover:underline"
                          title={att.name}
                        >
                          {att.type === 'image' ? '🖼️ ' : att.type === 'video' ? '🎬 ' : '📎 '}
                          {att.name}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setExistingAttachmentItems((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="shrink-0 rounded border border-red-500/20 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-500/10"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {attachmentFiles.map((f, i) => {
                  const isImg = f.type.startsWith('image/');
                  const isVideo = f.type.startsWith('video/');
                  const url = typeof URL !== 'undefined' ? URL.createObjectURL(f) : '';
                  return (
                    <div key={i} className="relative group">
                      {isImg && (
                        <img src={url} alt={f.name} className="w-24 h-24 object-cover rounded-[var(--radius-lg)] border border-[var(--border)]" />
                      )}
                      {isVideo && (
                        <video src={url} className="w-40 h-24 object-cover rounded-[var(--radius-lg)] border border-[var(--border)]" muted playsInline />
                      )}
                      {!isImg && !isVideo && (
                        <div className="w-24 h-24 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] flex items-center justify-center text-[11px] font-bold text-[var(--toss-gray-4)] truncate px-1">
                          📎 {f.name}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setAttachmentFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500/100 text-white text-xs font-semibold flex items-center justify-center shadow hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <ul className="space-y-1">
                {attachmentFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs font-bold text-[var(--toss-gray-4)]">
                    <span className="truncate flex-1">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachmentFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 px-2.5 py-1.5 rounded border border-red-500/20 text-red-600 hover:bg-red-500/10 text-[11px]"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </>
    )}
  </div>

  {isScheduleBoard && !normalizedDraftScheduleDate && (
    <p className="text-[11px] font-semibold text-red-500">
      날짜를 선택해야만 수술일정/MRI일정을 등록할 수 있습니다.
    </p>
  )}

  <div className="flex gap-2">
    <button
      type="button"
      onClick={onCancel}
      className="flex-1 py-4 bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] font-bold text-sm transition-all"
    >
      취소
    </button>
    <button
      type="button"
      data-testid="board-new-post-submit"
      onClick={onSubmit}
      disabled={loading || !isScheduleDraftReady}
      className="flex-[2] py-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-bold text-sm shadow-sm hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
    >
      {loading ? '등록 중...' : '게시물 등록'}
    </button>
  </div>
</div>
  );
}
