'use client';
import { toast } from '@/lib/toast';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import { buildChatNotificationMetadata } from '@/lib/notification-metadata';
import { supabase } from '@/lib/supabase';
import { isActiveChatMember, isMessageReadByCursor, NOTICE_ROOM_ID, NOTICE_ROOM_NAME } from './메신저유틸';
import {
  CHAT_NOTICE_SCHEDULE_EVENT,
  cancelScheduledNoticeJob,
  readScheduledNoticeJobs,
  removeScheduledNoticeJob,
  saveScheduledNoticeJob,
  type NoticeScheduleJob,
} from './메신저공지스케줄';
const DEFAULT_DRIVE_LINKS = [
  { name: 'OneDrive 공유문서', url: '', sort_order: 0 },
  { name: '병원 NAS', url: '', sort_order: 1 },
];

type DriveLink = {
  id: string;
  company_name?: string;
  name: string;
  url: string;
  sort_order?: number;
};

type NoticeMessage = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
};

function normalizeFileKey(url: string) {
  const fileName = decodeURIComponent(url.split('/').pop() || '파일');
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]v?\d+$/i, '')
    .replace(/\(\d+\)$/i, '')
    .toLowerCase();
}

function extractFileName(url: string) {
  return decodeURIComponent(url.split('/').pop() || '파일');
}

function formatHoursAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60)));
}

function formatDateLabel(dateString: string) {
  return new Date(dateString).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeReminderInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((token) => Number(token.trim()))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .map((entry) => Math.min(7 * 24 * 60, Math.floor(entry))),
    ),
  ).sort((left, right) => left - right);
}

export default function MessengerOperationsCenter({
  user,
  staffs = [],
  selectedRoomId,
  onClose,
}: {
  user?: unknown;
  staffs?: Record<string, unknown>[];
  selectedRoomId?: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [noticeMessages, setNoticeMessages] = useState<NoticeMessage[]>([]);
  const [noticeReadCursors, setNoticeReadCursors] = useState<Array<{ user_id: string; last_read_at: string | null }>>([]);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<any[]>([]);
  const [driveLinks, setDriveLinks] = useState<DriveLink[]>([]);
  const [newDriveName, setNewDriveName] = useState('');
  const [newDriveUrl, setNewDriveUrl] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleContent, setScheduleContent] = useState('');
  const [scheduleSendAt, setScheduleSendAt] = useState('');
  const [scheduleReminderInput, setScheduleReminderInput] = useState('60, 240');
  const [scheduledNotices, setScheduledNotices] = useState<NoticeScheduleJob[]>([]);

  const activeStaffs = useMemo(
    () => (staffs as unknown as StaffMember[]).filter((staff) => isActiveChatMember(staff)),
    [staffs]
  );
  const _user = (user ?? {}) as Record<string, unknown>;
  const companyScope = (_user.company as string) || '전체';
  const scheduleActorId = String(_user.id || '').trim() || null;

  const loadDriveLinks = useCallback(async () => {
    const { data, error } = await supabase
      .from('messenger_drive_links')
      .select('id, company_name, name, url, sort_order')
      .eq('company_name', companyScope)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    if ((data || []).length > 0) {
      setDriveLinks((data || []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        company_name: (row.company_name as string) || companyScope,
        name: (row.name as string) || '',
        url: (row.url as string) || '',
        sort_order: Number(row.sort_order || 0),
      })));
      return;
    }

    const defaults = DEFAULT_DRIVE_LINKS.map((item) => ({
      company_name: companyScope,
      name: item.name,
      url: item.url,
      sort_order: item.sort_order,
      created_by: (_user.id as string) || null,
      updated_by: (_user.id as string) || null,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('messenger_drive_links')
      .insert(defaults)
      .select('id, company_name, name, url, sort_order');

    if (insertError) throw insertError;
    setDriveLinks((inserted || []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      company_name: (row.company_name as string) || companyScope,
      name: (row.name as string) || '',
      url: (row.url as string) || '',
      sort_order: Number(row.sort_order || 0),
    })));
  }, [companyScope, _user.id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [noticeRes, fileRes, attendanceRes, shiftRes] = await Promise.all([
          supabase
            .from('messages')
            .select('id, content, created_at, sender_id')
            .eq('room_id', NOTICE_ROOM_ID)
            .order('created_at', { ascending: false })
            .limit(40),
          selectedRoomId
            ? supabase
              .from('messages')
              .select('id, content, created_at, file_url, sender_id')
              .eq('room_id', selectedRoomId)
              .not('file_url', 'is', null)
              .order('created_at', { ascending: false })
              .limit(60)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('attendances')
            .select('staff_id, status, work_date')
            .eq('work_date', today),
          supabase
            .from('shift_assignments')
            .select('staff_id, shift_id, work_date')
            .eq('work_date', today),
        ]);

        const notices = noticeRes.data || [];
        setNoticeMessages(notices);
        setRoomFiles(fileRes.data || []);
        setAttendanceRows(attendanceRes.data || []);
        setShiftAssignments(shiftRes.data || []);
        await loadDriveLinks();

        if (notices.length > 0 && activeStaffs.length > 0) {
          const { data: readCursors } = await supabase
            .from('room_read_cursors')
            .select('user_id, last_read_at')
            .eq('room_id', NOTICE_ROOM_ID)
            .in('user_id', activeStaffs.map((staff) => String(staff.id)));
          setNoticeReadCursors(
            (readCursors || []).map((cursor) => ({
              user_id: String(cursor.user_id || ''),
              last_read_at: typeof cursor.last_read_at === 'string' ? cursor.last_read_at : null,
            }))
          );
        } else {
          setNoticeReadCursors([]);
        }
      } catch (error) {
        console.error('메신저 운영센터 로드 실패:', error);
        setNoticeMessages([]);
        setNoticeReadCursors([]);
        setRoomFiles([]);
        setAttendanceRows([]);
        setShiftAssignments([]);
        setDriveLinks([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [activeStaffs, loadDriveLinks, selectedRoomId]);

  useEffect(() => {
    const syncSchedules = () => {
      setScheduledNotices(readScheduledNoticeJobs(scheduleActorId));
    };

    syncSchedules();
    if (typeof window === 'undefined') return;

    window.addEventListener(CHAT_NOTICE_SCHEDULE_EVENT, syncSchedules as EventListener);
    return () => {
      window.removeEventListener(CHAT_NOTICE_SCHEDULE_EVENT, syncSchedules as EventListener);
    };
  }, [scheduleActorId]);

  const importantNotices = useMemo(
    () => noticeMessages.filter((message) => String(message.content || '').startsWith('[중요공지]')),
    [noticeMessages]
  );

  const noticeReadCursorMap = useMemo(() => {
    const map = new Map<string, string>();
    noticeReadCursors.forEach((cursor) => {
      const userId = String(cursor.user_id || '').trim();
      const lastReadAt = String(cursor.last_read_at || '').trim();
      if (!userId || !lastReadAt) return;
      map.set(userId, lastReadAt);
    });
    return map;
  }, [noticeReadCursors]);

  const noticeRows = useMemo(() => {
    return noticeMessages.map((message) => {
      const readers = activeStaffs
        .filter((staff) =>
          isMessageReadByCursor(message.created_at, noticeReadCursorMap.get(String(staff.id)) || null)
        )
        .map((staff) => String(staff.id));
      const readRate = activeStaffs.length > 0 ? Math.round((readers.length / activeStaffs.length) * 100) : 0;
      const hoursAgo = formatHoursAgo(message.created_at);
      const isOverSla = hoursAgo >= 4 && readRate < 100;

      return {
        ...message,
        readers,
        readRate,
        hoursAgo,
        isOverSla,
        isImportant: String(message.content || '').startsWith('[중요공지]'),
      };
    });
  }, [activeStaffs, noticeMessages, noticeReadCursorMap]);

  const presenceRows = useMemo(() => {
    const attendanceMap = new Map(attendanceRows.map((row: Record<string, unknown>) => [String(row.staff_id), row.status]));
    const shiftMap = new Map(shiftAssignments.map((row: Record<string, unknown>) => [String(row.staff_id), row.shift_id]));

    return activeStaffs.map((staff) => {
      const attendanceStatus = attendanceMap.get(String(staff.id));
      let status = '오프라인';
      if (attendanceStatus === 'present' || attendanceStatus === 'late') status = '근무중';
      else if (attendanceStatus === 'annual_leave' || attendanceStatus === 'sick_leave' || attendanceStatus === 'absent') status = '부재중';
      else if (shiftMap.has(String(staff.id))) status = '근무예정';
      return { staff, status };
    });
  }, [activeStaffs, attendanceRows, shiftAssignments]);

  const fileGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    roomFiles.forEach((fileRow: any) => {
      const fileUrl = fileRow.file_url;
      if (!fileUrl) return;
      const key = normalizeFileKey(fileUrl);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(fileRow);
    });

    return Array.from(groups.entries())
      .map(([key, items]) => ({
        key,
        name: extractFileName(items[0].file_url),
        versions: items.length,
        latest: items[0],
      }))
      .sort((a, b) => b.versions - a.versions || new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
  }, [roomFiles]);

  const stats = useMemo(() => {
    const overdue = noticeRows.filter((row) => row.isOverSla).length;
    const averageReadRate = noticeRows.length > 0
      ? Math.round(noticeRows.reduce((sum, row) => sum + row.readRate, 0) / noticeRows.length)
      : 0;
    const busyStaff = presenceRows.filter((row) => row.status === '근무중').length;
    const awayStaff = presenceRows.filter((row) => row.status === '부재중').length;
    const scheduledCount = scheduledNotices.filter((job) => job.status === 'scheduled').length;
    const pendingReminderCount = scheduledNotices
      .filter((job) => job.status === 'sent' && job.sentMessageId && job.sentAt)
      .reduce((sum, job) => sum + Math.max(0, job.reminderMinutes.length - job.reminderLog.length), 0);

    return {
      overdue,
      averageReadRate,
      importantCount: importantNotices.length,
      busyStaff,
      awayStaff,
      scheduledCount,
      pendingReminderCount,
    };
  }, [importantNotices.length, noticeRows, presenceRows, scheduledNotices]);

  const markAsImportant = async (message: NoticeMessage) => {
    const trimmed = String(message.content || '').trim();
    if (!trimmed || trimmed.startsWith('[중요공지]')) return;
    setBusyId(message.id);
    try {
      const { error } = await supabase
        .from('messages')
        .update({ content: `[중요공지] ${trimmed}` })
        .eq('id', message.id);
      if (error) throw error;
      setNoticeMessages((prev) =>
        prev.map((item) => (item.id === message.id ? { ...item, content: `[중요공지] ${trimmed}` } : item))
      );
    } catch (error) {
      console.error('중요공지 지정 실패:', error);
      toast('중요공지 지정에 실패했습니다.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  type NoticeRow = (typeof noticeRows)[number];

  const sendReminder = async (row: NoticeRow) => {
    const nonReaders = activeStaffs.filter((staff) => !row.readers.includes(String(staff.id)));
    if (nonReaders.length === 0) {
      toast('이미 전원이 확인했습니다.', 'warning');
      return;
    }

    setBusyId(row.id);
    try {
      const payload = nonReaders.map((staff) => ({
        user_id: staff.id,
        type: 'message',
        title: '중요 공지 확인 요청',
        body: `${formatDateLabel(row.created_at)} 공지를 아직 확인하지 않았습니다. 즉시 확인해 주세요.`,
        read_at: null,
        metadata: buildChatNotificationMetadata({
          roomId: NOTICE_ROOM_ID,
          messageId: String(row.id),
          notificationType: 'message',
          extra: {
            reminder_kind: 'notice_ops',
            room_name: NOTICE_ROOM_NAME,
          },
        }),
      }));
      const { error } = await supabase.from('notifications').insert(payload);
      if (error) throw error;
      toast(`${nonReaders.length}명에게 공지 확인 알림을 보냈습니다.`, 'warning');
    } catch (error) {
      console.error('공지 리마인드 실패:', error);
      toast('공지 리마인드 발송에 실패했습니다.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const createScheduledNotice = () => {
    const content = scheduleContent.trim();
    const sendAt = scheduleSendAt.trim();
    if (!scheduleActorId) {
      toast('예약 공지를 저장할 계정 정보를 찾지 못했습니다.', 'error');
      return;
    }
    if (!content || !sendAt) {
      toast('예약 공지 내용과 발송 시각을 입력해 주세요.', 'warning');
      return;
    }

    const reminderMinutes = normalizeReminderInput(scheduleReminderInput);
    saveScheduledNoticeJob(scheduleActorId, {
      actorName: String(_user.name || '알 수 없음'),
      content,
      sendAt: new Date(sendAt).toISOString(),
      reminderMinutes,
    });
    setScheduleContent('');
    setScheduleSendAt('');
    setScheduleReminderInput(reminderMinutes.join(', '));
    toast('예약 공지를 등록했습니다.', 'success');
  };

  const scheduleNow = (job: NoticeScheduleJob) => {
    if (!scheduleActorId) return;
    saveScheduledNoticeJob(scheduleActorId, {
      id: job.id,
      actorName: job.actorName,
      content: job.content,
      sendAt: new Date().toISOString(),
      reminderMinutes: job.reminderMinutes,
    });
    toast('예약 공지를 즉시 발송 대상으로 전환했습니다.', 'success');
  };

  const cancelSchedule = (jobId: string) => {
    if (!scheduleActorId) return;
    cancelScheduledNoticeJob(scheduleActorId, jobId);
    toast('예약 공지를 취소했습니다.', 'warning');
  };

  const removeSchedule = (jobId: string) => {
    if (!scheduleActorId) return;
    removeScheduledNoticeJob(scheduleActorId, jobId);
    toast('예약 공지를 목록에서 제거했습니다.', 'success');
  };

  const addDriveLink = async () => {
    const name = newDriveName.trim();
    const url = newDriveUrl.trim();
    if (!name || !url) return;
    setBusyId('drive-add');
    try {
      const nextSortOrder = driveLinks.length > 0
        ? Math.max(...driveLinks.map((item) => Number(item.sort_order || 0))) + 1
        : 0;
      const { data, error } = await supabase
        .from('messenger_drive_links')
        .insert({
          company_name: companyScope,
          name,
          url,
          sort_order: nextSortOrder,
          created_by: (_user.id as string) || null,
          updated_by: (_user.id as string) || null,
        })
        .select('id, company_name, name, url, sort_order')
        .single();
      if (error) throw error;
      if (data) {
        setDriveLinks((prev) => [...prev, {
          id: String(data.id),
          company_name: data.company_name || companyScope,
          name: data.name || '',
          url: data.url || '',
          sort_order: Number(data.sort_order || 0),
        }].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)));
      }
      setNewDriveName('');
      setNewDriveUrl('');
    } catch (error) {
      console.error('드라이브 링크 추가 실패:', error);
      toast('드라이브 링크 추가에 실패했습니다.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const updateDriveLink = (id: string, patch: Partial<DriveLink>) => {
    setDriveLinks((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const persistDriveLink = async (id: string) => {
    const target = driveLinks.find((item) => item.id === id);
    if (!target) return;
    setBusyId(id);
    try {
      const { error } = await supabase
        .from('messenger_drive_links')
        .update({
          name: target.name.trim(),
          url: target.url.trim(),
          updated_by: (_user.id as string) || null,
        })
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('드라이브 링크 저장 실패:', error);
      toast('드라이브 링크 저장에 실패했습니다.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const removeDriveLink = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await supabase
        .from('messenger_drive_links')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setDriveLinks((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error('드라이브 링크 삭제 실패:', error);
      toast('드라이브 링크 삭제에 실패했습니다.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div data-testid="chat-ops-center" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-[var(--card)] p-4 shadow-sm custom-scrollbar"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div>
            <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">메신저 운영센터</h2>
          </div>
          <button data-testid="chat-ops-center-close" onClick={onClose} className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-sm font-bold text-[var(--toss-gray-4)]">
            닫기
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm font-semibold text-[var(--toss-gray-3)]">운영 데이터를 불러오는 중입니다.</div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-7">
              {[
                { label: 'SLA 초과', value: `${stats.overdue}건`, tone: 'text-red-600' },
                { label: '평균 읽음률', value: `${stats.averageReadRate}%`, tone: 'text-[var(--accent)]' },
                { label: '중요 공지', value: `${stats.importantCount}건`, tone: 'text-orange-600' },
                { label: '근무중', value: `${stats.busyStaff}명`, tone: 'text-emerald-600' },
                { label: '부재중', value: `${stats.awayStaff}명`, tone: 'text-[var(--toss-gray-4)]' },
                { label: '예약 공지', value: `${stats.scheduledCount}건`, tone: 'text-violet-600' },
                { label: '남은 리마인드', value: `${stats.pendingReminderCount}건`, tone: 'text-indigo-600' },
              ].map((card) => (
                <div key={card.label} className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--toss-gray-3)]">{card.label}</p>
                  <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
              <div className="rounded-[var(--radius-xl)] border border-[var(--border)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--foreground)]">공지 읽음률 리포트 / 읽음 SLA</h3>
                    <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">4시간 이상 지나도 미확인 인원이 있으면 SLA 초과로 표시합니다.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {noticeRows.length === 0 ? (
                    <div className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-5 text-sm font-semibold text-[var(--toss-gray-3)]">
                      {NOTICE_ROOM_NAME} 채널에 분석할 메시지가 없습니다.
                    </div>
                  ) : (
                    noticeRows.slice(0, 12).map((row) => (
                      <div key={row.id} className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {row.isImportant && <span className="rounded-[var(--radius-md)] bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-600">중요공지</span>}
                              {row.isOverSla && <span className="rounded-[var(--radius-md)] bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-600">SLA 초과</span>}
                              <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">{formatDateLabel(row.created_at)}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm font-semibold text-[var(--foreground)]">{row.content}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-[var(--foreground)]">{row.readRate}%</p>
                            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">{row.readers.length}/{activeStaffs.length} 확인</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--card)]">
                          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${row.readRate}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {!row.isImportant && (
                            <button
                              type="button"
                              onClick={() => markAsImportant(row)}
                              disabled={busyId === row.id}
                              className="rounded-[var(--radius-md)] border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-[11px] font-bold text-orange-600 disabled:opacity-50"
                            >
                              중요공지 지정
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => sendReminder(row)}
                            disabled={busyId === row.id}
                            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)] disabled:opacity-50"
                          >
                            미확인자 리마인드
                          </button>
                          <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                            게시 후 {row.hoursAgo}시간 경과
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] p-5">
                  <h3 className="text-base font-bold text-[var(--foreground)]">부재중/근무중 상태 자동 연동</h3>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">오늘 출근 기록과 당일 근무표를 기준으로 메신저 운영 상태를 자동 산출합니다.</p>
                  <div className="mt-4 space-y-2">
                    {presenceRows.slice(0, 12).map((row) => (
                      <div key={row.staff.id} className="flex items-center justify-between rounded-[var(--radius-lg)] bg-[var(--muted)] px-4 py-3">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{row.staff.name}</p>
                          <p className="text-[11px] text-[var(--toss-gray-3)]">{row.staff.department} · {row.staff.position}</p>
                        </div>
                        <span
                          className={`rounded-[var(--radius-md)] px-3 py-1 text-[11px] font-bold ${
                            row.status === '근무중'
                              ? 'bg-emerald-100 text-emerald-600'
                              : row.status === '부재중'
                                ? 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
                                : 'bg-blue-500/20 text-blue-600'
                          }`}
                        >
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[var(--radius-xl)] border border-[var(--border)] p-5">
                  <h3 className="text-base font-bold text-[var(--foreground)]">파일 버전 관리</h3>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">현재 채팅방 첨부파일을 묶어서 동일 문서의 버전 증가를 빠르게 확인합니다.</p>
                  <div className="mt-4 space-y-2">
                    {fileGroups.length === 0 ? (
                      <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                        현재 채팅방에 분석할 첨부파일이 없습니다.
                      </div>
                    ) : (
                      fileGroups.slice(0, 8).map((group) => (
                        <div key={group.key} className="rounded-[var(--radius-lg)] bg-[var(--muted)] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[var(--foreground)]">{group.name}</p>
                              <p className="text-[11px] text-[var(--toss-gray-3)]">{formatDateLabel(group.latest.created_at)} 최신 업로드</p>
                            </div>
                            <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                              {group.versions}개 버전
                            </span>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <a
                              href={group.latest.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                            >
                              최신본 열기
                            </a>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">공지 예약 발송 / 자동 리마인드</h3>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
                    예약 공지는 앱이 열려 있을 때 자동 발송되며, 설정한 분 단위로 미열람자 리마인드를 보냅니다.
                  </p>
                </div>
                <div className="grid min-w-[320px] flex-1 gap-2 md:grid-cols-[1.6fr_0.9fr_0.8fr_auto]">
                  <textarea
                    data-testid="chat-ops-schedule-content"
                    value={scheduleContent}
                    onChange={(event) => setScheduleContent(event.target.value)}
                    rows={2}
                    placeholder="예약 공지 내용을 입력하세요."
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-semibold outline-none"
                  />
                  <input
                    data-testid="chat-ops-schedule-send-at"
                    type="datetime-local"
                    value={scheduleSendAt}
                    onChange={(event) => setScheduleSendAt(event.target.value)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-semibold outline-none"
                  />
                  <input
                    data-testid="chat-ops-schedule-reminders"
                    type="text"
                    value={scheduleReminderInput}
                    onChange={(event) => setScheduleReminderInput(event.target.value)}
                    placeholder="60, 240"
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-semibold outline-none"
                  />
                  <button
                    type="button"
                    data-testid="chat-ops-schedule-create"
                    onClick={createScheduledNotice}
                    className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
                  >
                    예약 등록
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {scheduledNotices.length === 0 ? (
                  <div className="rounded-[var(--radius-lg)] bg-[var(--muted)] p-4 text-sm font-semibold text-[var(--toss-gray-3)]">
                    등록된 예약 공지가 없습니다.
                  </div>
                ) : (
                  scheduledNotices.map((job) => (
                    <div
                      key={job.id}
                      data-testid={`chat-ops-schedule-${job.id}`}
                      className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-[var(--radius-md)] px-2 py-0.5 text-[10px] font-bold ${
                              job.status === 'sent'
                                ? 'bg-emerald-500/15 text-emerald-700'
                                : job.status === 'cancelled'
                                  ? 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'
                                  : 'bg-violet-500/15 text-violet-700'
                            }`}>
                              {job.status === 'sent' ? '발송 완료' : job.status === 'cancelled' ? '취소됨' : '예약중'}
                            </span>
                            <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                              {new Date(job.sendAt).toLocaleString('ko-KR')}
                            </span>
                            <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                              리마인드 {job.reminderMinutes.join(', ')}분
                            </span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-[var(--foreground)]">
                            {job.content}
                          </p>
                          {job.reminderLog.length > 0 ? (
                            <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                              리마인드 로그: {job.reminderLog.map((entry) => `${entry.offsetMinutes}분 후 ${entry.unreadCount}명`).join(' · ')}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {job.status === 'scheduled' ? (
                            <>
                              <button
                                type="button"
                                data-testid={`chat-ops-schedule-now-${job.id}`}
                                onClick={() => scheduleNow(job)}
                                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                              >
                                지금 발송
                              </button>
                              <button
                                type="button"
                                data-testid={`chat-ops-schedule-cancel-${job.id}`}
                                onClick={() => cancelSchedule(job.id)}
                                className="rounded-[var(--radius-md)] border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-[11px] font-bold text-orange-600"
                              >
                                취소
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            data-testid={`chat-ops-schedule-remove-${job.id}`}
                            onClick={() => removeSchedule(job.id)}
                            className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-600"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">대용량 드라이브 연동</h3>
                  <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">자주 쓰는 외부 저장소 링크를 채팅 운영 메뉴에 고정합니다.</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDriveName}
                    onChange={(event) => setNewDriveName(event.target.value)}
                    placeholder="링크명"
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-semibold outline-none"
                  />
                  <input
                    type="url"
                    value={newDriveUrl}
                    onChange={(event) => setNewDriveUrl(event.target.value)}
                    placeholder="https://..."
                    className="min-w-[280px] rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm font-semibold outline-none"
                  />
                  <button
                    type="button"
                    onClick={addDriveLink}
                    disabled={busyId === 'drive-add'}
                    className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    추가
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {driveLinks.map((link) => (
                  <div key={link.id} className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
                    <input
                      type="text"
                      value={link.name}
                      onChange={(event) => updateDriveLink(link.id, { name: event.target.value })}
                      onBlur={() => persistDriveLink(link.id)}
                      className="w-full bg-transparent text-sm font-bold text-[var(--foreground)] outline-none"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(event) => updateDriveLink(link.id, { url: event.target.value })}
                      onBlur={() => persistDriveLink(link.id)}
                      className="mt-2 w-full bg-transparent text-[12px] font-semibold text-[var(--toss-gray-3)] outline-none"
                    />
                    <div className="mt-3 flex gap-2">
                      <a
                        href={link.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)]"
                      >
                        열기
                      </a>
                      <button
                        type="button"
                        onClick={() => removeDriveLink(link.id)}
                        disabled={busyId === link.id}
                        className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
