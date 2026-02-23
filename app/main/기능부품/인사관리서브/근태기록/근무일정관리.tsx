'use client';
import { useState } from 'react';

export default function ScheduleManager({ schedules, onAdd, onEdit, onDelete }: any) {
  return (
    <div className="bg-white rounded-[16px] border border-[var(--toss-border)] shadow-sm p-8 h-full overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-end mb-8 border-b pb-4">
            <div>
                <h3 className="font-semibold text-xl text-[var(--foreground)]">근무 형태 설정</h3>
                <p className="text-sm text-[var(--toss-gray-3)] mt-1">병원 내 다양한 근무 규칙(3교대, 상근, 야간 등)을 상세하게 정의합니다.</p>
            </div>
            <button onClick={onAdd} className="bg-black text-white px-5 py-3 rounded-[12px] text-sm font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
                <span>+</span> 새 근무형태 만들기
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {schedules.map((s: any) => (
                <div key={s.id} className="border border-[var(--toss-border)] p-6 rounded-[16px] bg-white hover:shadow-xl hover:border-blue-500 transition-all group relative flex flex-col justify-between min-h-[200px]">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <h4 className="font-bold text-lg text-[var(--foreground)]">{s.name}</h4>
                                {s.is_default && <span className="bg-[var(--toss-blue-light)] text-[var(--toss-blue)] text-[11px] px-2 py-1 rounded-full font-bold">기본값</span>}
                            </div>
                            
                            {/* [수정] 근무 유형별 뱃지 디자인 */}
                            <span className={`px-2 py-1 rounded-[12px] text-xs font-bold 
                                ${s.shift_type === '3교대' ? 'bg-purple-100 text-purple-600' : 
                                  s.shift_type === '나이트전담' ? 'bg-gray-800 text-yellow-300' : 
                                  s.shift_type === '데이전담' ? 'bg-sky-100 text-sky-600' :
                                  s.shift_type === '이브전담' ? 'bg-pink-100 text-pink-600' :
                                  s.shift_type === '식당' ? 'bg-orange-100 text-orange-600' :
                                  s.shift_type === '청소' ? 'bg-teal-100 text-teal-600' :
                                  'bg-green-100 text-green-600'}`}>
                                {s.shift_type === '식당' ? '🍚 식당' : 
                                 s.shift_type === '청소' ? '🧹 청소' : 
                                 s.shift_type || '상근직'}
                            </span>
                        </div>
                        <p className="text-xs text-[var(--toss-gray-3)] mb-4">{s.description || '설명 없음'}</p>

                        {/* 시간 정보 그리드 */}
                        <div className="bg-[var(--toss-gray-1)] rounded-[16px] p-3 space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-[var(--toss-gray-3)] font-bold">근무시간</span>
                                <span className="font-mono font-bold text-[var(--foreground)]">{s.start_time.slice(0,5)} ~ {s.end_time.slice(0,5)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-[var(--toss-gray-3)] font-bold">점심시간</span>
                                <span className="font-mono font-bold text-[var(--toss-gray-4)]">
                                    {s.break_start_time ? `${s.break_start_time.slice(0,5)}~${s.break_end_time.slice(0,5)}` : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs border-t pt-2 mt-1">
                                <span className="text-[var(--toss-gray-3)] font-bold">근무일수</span>
                                <span className="font-bold text-[var(--foreground)]">주 {s.weekly_work_days || 5}일 {s.is_weekend_work ? '(주말포함)' : '(평일)'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onEdit(s)} className="flex-1 py-2.5 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-[16px] text-xs font-bold hover:bg-[var(--toss-gray-2)]">수정</button>
                        <button onClick={() => onDelete(s.id)} className="flex-1 py-2.5 bg-red-50 text-red-500 rounded-[16px] text-xs font-bold hover:bg-red-100">삭제</button>
                    </div>
                </div>
            ))}
            
            {/* 추가 안내 카드 */}
            <button onClick={onAdd} className="border-2 border-dashed border-[var(--toss-border)] p-6 rounded-[16px] flex flex-col items-center justify-center text-center text-[var(--toss-gray-3)] hover:border-[var(--toss-border)] hover:text-[var(--toss-gray-4)] transition-all min-h-[200px]">
                <span className="text-3xl mb-2">+</span>
                <span className="text-sm font-bold">새 근무 형태 추가</span>
                <span className="text-[11px] mt-1">수술실, 응급실, 당직 등<br/>다양한 패턴을 등록하세요.</span>
            </button>
        </div>
    </div>
  );
}