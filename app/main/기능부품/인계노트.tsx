'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

interface HandoverNote {
    id: string;
    content: string;
    author_id: string;
    author_name: string;
    shift: string; // Day, Evening, Night
    priority: string; // High, Normal
    created_at: string;
    is_completed: boolean;
}

export default function HandoverNotes({ user }: { user: any }) {
    const [notes, setNotes] = useState<HandoverNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Calendar State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [isCalendarVisible, setIsCalendarVisible] = useState(true);

    // Form State
    const [isComposing, setIsComposing] = useState(false);
    const [newContent, setNewContent] = useState('');
    const [newShift, setNewShift] = useState('Day');
    const [newPriority, setNewPriority] = useState('Normal');

    useEffect(() => {
        fetchNotes();
    }, []);

    const fetchNotes = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('handover_notes')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500); // 달력에 뿌리기 위해 조금 더 많이 가져옵니다.

            if (error) {
                console.warn('Supabase fetch failed:', error.message);
                setNotes([]);
            } else {
                setNotes(data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newContent.trim()) return;

        // 선택된 날짜의 현재 시간으로 작성 (또는 단순히 선택된 날짜의 09:00 등으로 고정할 수도 있으나, 여기선 실제 시간 사용하되 날짜는 선택된 날짜로)
        const now = new Date();
        const created_at = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();

        const newNote = {
            content: newContent,
            author_id: user?.id || 'unknown',
            author_name: user?.name || '알 수 없음',
            shift: newShift,
            priority: newPriority,
            is_completed: false,
            created_at: created_at
        };

        try {
            const { data, error } = await supabase
                .from('handover_notes')
                .insert([newNote])
                .select();

            if (error) {
                alert('저장에 실패했습니다.');
                const mockNote = { ...newNote, id: crypto.randomUUID() };
                setNotes([mockNote as HandoverNote, ...notes]);
            } else if (data) {
                setNotes([data[0] as HandoverNote, ...notes]);
            }
        } catch (err) {
            console.error(err);
        }

        setNewContent('');
        setIsComposing(false);
    };

    const toggleComplete = async (id: string, currentStatus: boolean) => {
        setNotes(notes.map(n => n.id === id ? { ...n, is_completed: !currentStatus } : n));
        try {
            await supabase
                .from('handover_notes')
                .update({ is_completed: !currentStatus })
                .eq('id', id);
        } catch (err) {
            console.error(err);
        }
    };

    // Calendar Helpers
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
        setIsCalendarVisible(true);
    };
    const handleNextMonth = () => {
        setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
        setIsCalendarVisible(true);
    };

    const isSameDate = (d1: Date, stringDate: string) => {
        const d2 = new Date(stringDate);
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    // Filter Logic
    const isSearching = searchQuery.trim().length > 0;

    const filteredNotes = useMemo(() => {
        if (isSearching) {
            const q = searchQuery.toLowerCase();
            return notes.filter(n => n.content.toLowerCase().includes(q) || n.author_name.toLowerCase().includes(q));
        } else {
            return notes.filter(n => isSameDate(selectedDate, n.created_at));
        }
    }, [notes, isSearching, searchQuery, selectedDate]);

    // Calendar Cells Generation
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const checkNotesForDay = (day: number) => {
        const d = new Date(currentYear, currentMonth, day);
        return notes.filter(n => isSameDate(d, n.created_at));
    };

    return (
        <div className="bg-[var(--page-bg)] animate-in fade-in duration-300">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-white border-b border-[var(--toss-border)] shrink-0 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span>📝</span> 병동 인계노트
                    </h2>
                    <p className="text-[12px] text-[var(--toss-gray-3)] mt-1 font-medium">3교대 근무자를 위한 일별 핵심 전달사항</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input
                            type="text"
                            placeholder="내용 또는 작성자 검색..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                if (e.target.value.trim().length > 0) setIsCalendarVisible(false);
                            }}
                            className="w-full pl-9 pr-4 py-2 text-sm font-medium bg-gray-100 border-none rounded-2xl focus:ring-2 focus:ring-[var(--toss-blue)]/50 outline-none transition-all placeholder:text-gray-400"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold">✕</button>
                        )}
                    </div>
                </div>
            </div>

            <div>
                {/* 1. Calendar View */}
                {!isSearching && (
                    <div className="p-1 md:p-2 bg-gray-50/50">
                        <div className="flex justify-between items-center mb-1">
                            <button onClick={handlePrevMonth} className="px-3 py-1 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 font-bold transition-colors">⟵</button>
                            <h3 className="text-base font-bold text-gray-800 tracking-tight">{currentYear}년 {currentMonth + 1}월</h3>
                            <button onClick={handleNextMonth} className="px-3 py-1 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 font-bold transition-colors">⟶</button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 flex-1">
                            {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                                <div key={day} className="text-center text-[10px] font-bold text-gray-400 py-2 uppercase tracking-widest">{day}</div>
                            ))}

                            {blanks.map(b => <div key={`blank-${b}`} className="min-h-[20px] md:min-h-0 bg-transparent rounded-xl border border-transparent"></div>)}

                            {days.map(day => {
                                const dateObj = new Date(currentYear, currentMonth, day);
                                const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth && selectedDate.getFullYear() === currentYear;
                                const today = new Date();
                                const isToday = today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;

                                const dayNotes = checkNotesForDay(day);
                                const uncompletedHtml = dayNotes.filter(n => !n.is_completed).length;
                                const hasHighPriority = dayNotes.some(n => n.priority === 'High' && !n.is_completed);

                                return (
                                    <button
                                        key={day}
                                        onClick={() => {
                                            setSelectedDate(dateObj);
                                        }}
                                        className={`
                                                relative p-0.5 md:p-1 flex flex-col items-center md:items-start min-h-[24px] md:min-h-[28px] overflow-hidden rounded-lg border transition-all
                                                ${isSelected ? 'bg-blue-50/80 border-[var(--toss-blue)]/50 ring-1 ring-[var(--toss-blue)]/20 shadow-sm z-10' : 'bg-white border-transparent hover:border-gray-200 hover:bg-gray-50/80 hover:shadow-sm'}
                                                ${isToday && !isSelected ? 'border-blue-100 bg-blue-50/20' : ''}
                                            `}
                                    >
                                        <span className={`text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full mb-0 ${isToday ? 'bg-[var(--toss-blue)] text-white shadow-sm' : isSelected ? 'text-[var(--toss-blue)]' : 'text-gray-700'}`}>
                                            {day}
                                        </span>

                                        <div className="flex gap-1 flex-wrap mt-auto w-full justify-center md:justify-start px-0.5">
                                            {hasHighPriority && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 shadow-sm shadow-red-500/30"></span>}
                                            {uncompletedHtml > 0 && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 shadow-sm shadow-orange-400/30"></span>}
                                            {dayNotes.length > 0 && uncompletedHtml === 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 shadow-sm shadow-green-400/30"></span>}
                                        </div>

                                        {/* PC 뷰 전용 텍스트 지시자 (공간 확보를 위해 아주 작게 하거나 생략) */}
                                        <div className="hidden md:block w-full text-[7px] font-bold text-gray-400 mt-0 truncate px-0.5">
                                            {uncompletedHtml > 0 ? `${uncompletedHtml}개` : dayNotes.length > 0 ? '완료' : ''}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 2. Detail & Search Results View */}
                <div className="bg-white relative">
                    <div className="p-4 md:p-4 pb-2 shrink-0 border-b border-[var(--toss-border)] bg-white sticky top-0 z-20 flex justify-between items-end">
                        <div className="space-y-1">
                            {isSearching ? (
                                <>
                                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">검색 결과</h3>
                                    <p className="text-sm font-semibold text-[var(--toss-blue)]">"{searchQuery}"에 대한 인계사항</p>
                                </>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col space-y-1">
                                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                                            {selectedDate.getDate()}일 <span className="text-lg text-gray-400 font-bold ml-1">{['일', '월', '화', '수', '목', '금', '토'][selectedDate.getDay()]}요일</span>
                                        </h3>
                                        <p className="text-xs font-bold text-gray-400 tracking-widest uppercase">{selectedDate.getFullYear()}. {String(selectedDate.getMonth() + 1).padStart(2, '0')}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        {!isSearching && (
                            <button
                                onClick={() => setIsComposing(!isComposing)}
                                className={`px-4 py-2.5 text-[12px] font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 ${isComposing ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-gray-900 text-white hover:bg-black hover:scale-105 active:scale-95'}`}
                            >
                                {isComposing ? '작성 취소' : '✍️ 새 인계사항'}
                            </button>
                        )}
                    </div>

                    <div className="bg-gray-50/30 p-4 md:p-6 relative z-10 inner-shadow-sm">
                        {isComposing && !isSearching && (
                            <form onSubmit={handleCreateNote} className="bg-white p-5 rounded-3xl border border-gray-200/60 shadow-lg shadow-gray-200/50 space-y-4 mb-6 animate-in slide-in-from-top-4">
                                <div className="flex gap-2">
                                    <select
                                        value={newShift}
                                        onChange={(e) => setNewShift(e.target.value)}
                                        className="py-2.5 px-4 bg-gray-50 border-none font-bold rounded-xl text-xs outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 text-gray-700 cursor-pointer"
                                    >
                                        <option value="Day">☀️ Day 근무조</option>
                                        <option value="Evening">🌆 Evening 근무조</option>
                                        <option value="Night">🌙 Night 근무조</option>
                                    </select>
                                    <select
                                        value={newPriority}
                                        onChange={(e) => setNewPriority(e.target.value)}
                                        className={`py-2.5 px-4 border-none font-bold rounded-xl text-xs outline-none focus:ring-2 cursor-pointer transition-colors ${newPriority === 'High' ? 'bg-red-50 text-red-700 focus:ring-red-200' : 'bg-gray-50 text-gray-700 focus:ring-[var(--toss-blue)]/30'}`}
                                    >
                                        <option value="Normal">🟢 일반 전달사항</option>
                                        <option value="High">🔥 병동 중요사항</option>
                                    </select>
                                </div>
                                <textarea
                                    value={newContent}
                                    onChange={(e) => setNewContent(e.target.value)}
                                    placeholder="다음 근무자가 반드시 알아야 할 환자 특이사항, 처방 변경, 비품 부족 등의 내용을 상세히 입력하세요..."
                                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[var(--toss-blue)]/20 transition-all resize-none h-32 custom-scrollbar placeholder:text-gray-400"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
                                    <button
                                        type="submit"
                                        disabled={!newContent.trim() || loading}
                                        className="px-6 py-3 bg-[var(--toss-blue)] text-white text-xs font-black tracking-wide rounded-xl disabled:opacity-50 disabled:bg-gray-300 transition-all active:scale-95 shadow-md shadow-blue-500/20"
                                    >
                                        {loading ? '저장 중...' : '작성 완료'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {loading ? (
                            <div className="flex justify-center py-20">
                                <div className="w-10 h-10 border-4 border-gray-100 border-t-[var(--toss-blue)] rounded-full animate-spin"></div>
                            </div>
                        ) : filteredNotes.length === 0 ? (
                            <div className="text-center py-24 px-4 h-full flex flex-col items-center justify-center">
                                <div className="text-6xl mb-6 opacity-30 grayscale saturate-0 animate-pulse">📋</div>
                                <h4 className="text-lg font-bold text-gray-800 mb-1">{isSearching ? '검색 결과가 없습니다' : '전달된 인계사항이 없습니다'}</h4>
                                <p className="text-sm font-medium text-gray-400 max-w-xs leading-relaxed">
                                    {isSearching ? '다른 검색어를 입력해보세요.' : '평화로운 하루네요! 특이사항이 발생하면 새 인계사항을 작성해주세요.'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredNotes.map((note) => (
                                    <div
                                        key={note.id}
                                        className={`p-5 rounded-3xl border transition-all duration-300 relative overflow-hidden group 
                                            ${note.is_completed
                                                ? 'bg-gray-50/50 border-gray-200'
                                                : note.priority === 'High'
                                                    ? 'bg-white border-red-200 shadow-sm shadow-red-100/50 hover:shadow-md hover:shadow-red-200/50 hover:-translate-y-0.5'
                                                    : 'bg-white border-gray-200 shadow-sm shadow-gray-100/50 hover:border-gray-300 hover:shadow-md hover:shadow-gray-200/50 hover:-translate-y-0.5'
                                            }`}
                                    >
                                        {/* Status Line */}
                                        <div className={`absolute top-0 left-0 w-1.5 h-full ${note.is_completed ? 'bg-gray-300' : note.priority === 'High' ? 'bg-red-500' : 'bg-blue-400'}`}></div>

                                        <div className="flex justify-between items-start mb-3 ml-2">
                                            <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
                                                <span className={`px-2.5 py-1 rounded-lg ${note.is_completed ? 'bg-gray-200 text-gray-500' : note.shift === 'Day' ? 'bg-orange-100 text-orange-700' : note.shift === 'Evening' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                    {note.shift === 'Day' ? '☀️ Day' : note.shift === 'Evening' ? '🌆 Ev' : '🌙 Night'}
                                                </span>
                                                {note.priority === 'High' && !note.is_completed && (
                                                    <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-600 animate-pulse">
                                                        🔥 중요
                                                    </span>
                                                )}
                                                <span className="text-gray-800 flex items-center gap-1.5 ml-1">
                                                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500">{note.author_name[0]}</div>
                                                    {note.author_name}
                                                </span>
                                                <span className="text-gray-400 font-medium ml-1 flex items-center gap-1">
                                                    {isSearching && (
                                                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] mr-1 text-gray-500 font-bold">
                                                            {new Date(note.created_at).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                    {new Date(note.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            <button
                                                onClick={() => toggleComplete(note.id, note.is_completed)}
                                                className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center border-2 transition-all ${note.is_completed
                                                    ? 'bg-green-500 border-green-500 text-white shadow-inner scale-95'
                                                    : 'border-gray-300 text-transparent hover:border-green-400 hover:bg-green-50 group-hover:shadow-sm'
                                                    }`}
                                                title={note.is_completed ? '미완료로 변경' : '완료 처리'}
                                            >
                                                ✓
                                            </button>
                                        </div>
                                        <p className={`text-sm leading-relaxed whitespace-pre-wrap ml-2 ${note.is_completed ? 'line-through text-gray-400 decoration-gray-300' : 'text-gray-700 font-medium'}`}>
                                            {note.content}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
