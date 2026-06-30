'use client';

/**
 * 게시판 수술/MRI 일정용 "사람 모형으로 부위 선택" 모달.
 * 게시판.tsx 인라인 JSX를 동작 보존 그대로 추출한 프레젠테이션 컴포넌트.
 * 로직/상태는 부모(게시판.tsx)가 소유하고 props로만 주입한다.
 */

import Image from 'next/image';
import { BODY_PARTS } from '../게시판/post-helpers';
import type { BoardTemplateRow } from '../게시판-view-utils';

/** 사람 모형 위 부위 클릭 영역 좌표 (2:3 비율 이미지 기준 고정) */
const BODY_SPOTS: { id: string; top: string; left: string; areaClass: string }[] = [
  { id: 'cervical', top: '12.5%', left: '50%', areaClass: 'w-11 h-11 md:w-12 md:h-12' }, // 목/경추
  { id: 'chest', top: '24.5%', left: '50%', areaClass: 'w-12 h-12 md:w-14 md:h-14' }, // 흉부
  { id: 'lumbar', top: '39%', left: '50%', areaClass: 'w-12 h-12 md:w-14 md:h-14' }, // 요추/허리
  { id: 'hip', top: '55%', left: '50%', areaClass: 'w-12 h-12 md:w-14 md:h-14' }, // 골반/고관절
  { id: 'shoulder', top: '20.5%', left: '34%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 좌 어깨
  { id: 'shoulder', top: '20.5%', left: '66%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 우 어깨
  { id: 'upper_arm', top: '31.5%', left: '28%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 좌 위팔
  { id: 'upper_arm', top: '31.5%', left: '72%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 우 위팔
  { id: 'forearm', top: '49%', left: '23%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 좌 아래팔
  { id: 'forearm', top: '49%', left: '77%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 우 아래팔
  { id: 'knee', top: '78%', left: '50%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 무릎
  { id: 'ankle', top: '92.5%', left: '50%', areaClass: 'w-10 h-10 md:w-12 md:h-12' }, // 발목/발
];

interface BoardBodyPickerModalProps {
  activeBoard: string;
  resolvedBodyPart: string;
  filteredTemplates: BoardTemplateRow[];
  onSelectBodyPart: (id: string) => void;
  onSelectTemplate: (name: string) => void;
  /** 배경(오버레이) 클릭 시: 닫기 + 잘못된 부위면 'all' 보정 */
  onBackdropClose: () => void;
  /** 우측 상단 '닫기' 버튼: 단순 닫기만 */
  onClose: () => void;
}

export default function BoardBodyPickerModal({
  activeBoard,
  resolvedBodyPart,
  filteredTemplates,
  onSelectBodyPart,
  onSelectTemplate,
  onBackdropClose,
  onClose }: BoardBodyPickerModalProps) {
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-3 md:p-4"
      onClick={onBackdropClose}
    >
      <div
        className="w-full max-w-[calc(100vw-24px)] md:max-w-7xl max-h-[94vh] bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm border border-[var(--border)] p-3 md:p-4 flex flex-col md:flex-row gap-3 md:gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 왼쪽: 생성된 전신 이미지 + 부위 클릭 (이미지와 동일 비율 박스 안에서 좌표 고정) */}
        <div className="flex-1 flex items-center justify-center min-h-[280px] md:min-h-[400px] max-h-[50vh] md:max-h-[640px] bg-[#020617] rounded-[var(--radius-xl)] border border-slate-800 overflow-hidden p-2">
          <div className="relative w-full max-w-[280px] md:max-w-[400px] aspect-[2/3] max-h-[45vh] md:max-h-[600px] shrink-0 -translate-y-6">
            <Image
              src="/human-body-mri.png"
              alt="사람 전신 모형"
              width={400}
              height={600}
              className="w-full h-full object-contain object-center pointer-events-none select-none"
              priority={false}
            />
            {/* 부위 클릭 영역: 아래 좌표는 위 이미지(2:3 비율)에 맞춰 고정됨 */}
            <div className="absolute inset-0">
              {BODY_SPOTS.map((spot, idx) => {
                const isActive = resolvedBodyPart === spot.id;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectBodyPart(spot.id)}
                    aria-label={`${spot.id} 선택`}
                    style={{ top: spot.top, left: spot.left }}
                    className={`
                        group absolute -translate-x-1/2 -translate-y-1/2
                        flex items-center justify-center
                        ${spot.areaClass} rounded-full border-none bg-transparent
                      `}
                  >
                    {/* 호버/선택 시에만 부위 전체가 은은하게 빛나는 하이라이트 (기본 상태에서는 사람 사진만 보임) */}
                    <span
                      className={`
                          absolute inset-0 rounded-full bg-sky-400/30 blur-lg opacity-0
                          transition-opacity duration-200
                          group-hover:opacity-100
                          ${isActive ? 'opacity-100' : ''}
                        `}
                    />
                    <span
                      className={`
                          relative w-2.5 h-2.5 md:w-3 md:h-3 rounded-full
                          border border-white/80 bg-sky-400/90
                          shadow-[0_0_0_3px_rgba(14,165,233,0.22)]
                          transition-transform duration-200
                          group-hover:scale-110
                          ${isActive ? 'scale-110' : ''}
                        `}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 오른쪽: 선택된 부위에 해당하는 수술/검사명 목록 */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                {activeBoard === '수술일정' ? '수술명 선택' : '검사명 선택'}
              </p>
              <p className="text-xs font-bold text-[var(--toss-gray-4)] mt-1">
                {BODY_PARTS.find((b) => b.id === resolvedBodyPart)?.label || '전체'} 기준 추천 목록
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
            >
              닫기
            </button>
          </div>
          <div className="flex-1 mt-2 bg-[var(--page-bg)] border border-[var(--border)] rounded-[var(--radius-md)] p-2 overflow-y-auto custom-scrollbar">
            {filteredTemplates.length === 0 ? (
              <p className="text-[11px] text-[var(--toss-gray-3)] font-bold py-4 text-center">
                선택한 부위에 해당하는 등록된 수술·검사명이 없습니다.<br />
                관리자 메뉴의 “수술·검사명”에서 템플릿을 추가해주세요.
              </p>
            ) : (
              <ul className="space-y-1">
                {filteredTemplates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onSelectTemplate(t.name || '')}
                      className="w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-[12px] font-bold text-[var(--foreground)] hover:bg-[var(--card)] hover:shadow-sm flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                      <span className="flex-1 truncate">{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
