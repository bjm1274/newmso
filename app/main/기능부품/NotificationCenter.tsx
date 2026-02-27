'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { sound } from '@/lib/sounds';

const TYPE_ICONS: Record<string, string> = {
    approval: '📋',
    inventory: '📦',
    payroll: '💰',
    education: '📚',
    mention: '📣',
    message: '💬',
    attendance: '⏰',
    default: '🔔',
};

export default function NotificationCenter({ user }: { user: any }) {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const fetchNotifications = async () => {
        if (!user?.id) return;
        const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);
        setNotifications(data || []);
        setUnreadCount((data || []).filter((n: any) => !n.read_at).length);
    };

    useEffect(() => {
        fetchNotifications();
        const handleNewNoti = () => fetchNotifications();
        window.addEventListener('erp-new-notification', handleNewNoti);
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('erp-new-notification', handleNewNoti);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [user?.id]);

    const markAllAsRead = async () => {
        if (!user?.id) return;
        await supabase
            .from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .is('read_at', null);
        fetchNotifications();
        sound.playSystem();
    };

    const markAsRead = async (id: string) => {
        await supabase
            .from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('id', id);
        fetchNotifications();
    };

    const handleNotiClick = (n: any) => {
        if (!n.read_at) markAsRead(n.id);
        setIsOpen(false);

        const baseUrl = '/main';
        const metadata = n.metadata || {};
        if (n.type === 'message' || n.type === 'mention') {
            const roomId = metadata.room_id;
            router.push(roomId ? `${baseUrl}?open_chat_room=${roomId}` : `${baseUrl}?open_menu=채팅`);
        } else if (n.type === 'approval') {
            router.push(`${baseUrl}?open_menu=전자결재`);
        } else if (n.type === 'inventory') {
            router.push(`${baseUrl}?open_menu=재고관리`);
        } else if (n.type === 'payroll' || n.type === 'education' || n.type === 'attendance') {
            router.push(`${baseUrl}?open_menu=내정보`);
        } else if (n.type === 'board') {
            router.push(`${baseUrl}?open_menu=게시판`);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen) sound.playSystem();
                }}
                className="relative p-2 rounded-[14px] hover:bg-[var(--toss-gray-1)] transition-all group"
            >
                <span className="text-2xl grayscale group-hover:grayscale-0 transition-all">🔔</span>
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-[var(--toss-card)] animate-bounce">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--toss-card)]/80 backdrop-blur-xl border border-[var(--toss-border)] rounded-[24px] shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                    <div className="p-4 border-b border-[var(--toss-border)] flex justify-between items-center">
                        <h3 className="font-bold text-sm">알림</h3>
                        <button
                            onClick={markAllAsRead}
                            className="text-[11px] font-bold text-[var(--toss-blue)] hover:underline"
                        >
                            모두 읽음
                        </button>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="py-20 text-center text-xs text-[var(--toss-gray-3)]">
                                <p className="text-3xl mb-2 opacity-20">📭</p>
                                받은 알림이 없습니다.
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <button
                                    key={n.id}
                                    onClick={() => handleNotiClick(n)}
                                    className={`w-full text-left p-4 flex gap-3 hover:bg-[var(--toss-gray-1)] transition-colors border-b border-[var(--toss-border)] last:border-0 ${!n.read_at ? 'bg-[var(--toss-blue-light)]/30' : ''}`}
                                >
                                    <span className="text-2xl shrink-0">{TYPE_ICONS[n.type] || TYPE_ICONS.default}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <p className="text-[12px] font-bold truncate pr-2">{n.title}</p>
                                            <span className="text-[10px] text-[var(--toss-gray-3)] shrink-0">
                                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-[var(--toss-gray-4)] line-clamp-2 leading-relaxed">
                                            {n.body}
                                        </p>
                                    </div>
                                    {!n.read_at && (
                                        <span className="w-1.5 h-1.5 bg-[var(--toss-blue)] rounded-full mt-2 shrink-0 animate-pulse" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>

                    <div className="p-3 bg-[var(--toss-gray-1)]/50 text-center">
                        <button className="text-[11px] font-bold text-[var(--toss-gray-4)]">
                            알림 설정 보기
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
