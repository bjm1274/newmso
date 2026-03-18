'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
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

export default function MessengerOperationsCenter({
  user,
  staffs = [],
  selectedRoomId,
  onClose,
}: {
  user?: any;
  staffs?: any[];
  selectedRoomId?: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [noticeMessages, setNoticeMessages] = useState<NoticeMessage[]>([]);
  const [messageReads, setMessageReads] = useState<any[]>([]);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<any[]>([]);
  const [driveLinks, setDriveLinks] = useState<DriveLink[]>([]);
  const [newDriveName, setNewDriveName] = useState('');
  const [newDriveUrl, setNewDriveUrl] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeStaffs = useMemo(
    () => staffs.filter((staff: any) => staff?.status !== '퇴사'),
    [staffs]
  );
  const companyScope = user?.company || '전체';

  const loadDriveLinks = useCallback(async () => {
    const { data, error } = await supabase
      .from('messenger_drive_links')
      .select('id, company_name, name, url, sort_order')
      .eq('company_name', companyScope)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    if ((data || []).length > 0) {
      setDriveLinks((data || []).map((row: any) => ({
        id: String(row.id),
        company_name: row.company_name || companyScope,
        name: row.name || '',
        url: row.url || '',
        sort_order: Number(row.sort_order || 0),
      })));
      return;
    }

    const defaults = DEFAULT_DRIVE_LINKS.map((item) => ({
      company_name: companyScope,
      name: item.name,
      url: item.url,
      sort_order: item.sort_order,
      created_by: user?.id || null,
      updated_by: user?.id || null,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('messenger_drive_links')
      .insert(defaults)
      .select('id, company_name, name, url, sort_order');

    if (insertError) throw insertError;
    setDriveLinks((inserted || []).map((row: any) => ({
      id: String(row.id),
      company_name: row.company_name || companyScope,
      name: row.name || '',
      url: row.url || '',
      sort_order: Number(row.sort_order || 0),
    })));
  }, [companyScope, user?.id]);

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

        if (notices.length > 0) {
          const { data: reads } = await supabase
            .from('message_reads')
            .select('message_id, user_id, read_at')
            .in('message_id', notices.map((notice) => notice.id));
          setMessageReads(reads || []);
        } else {
          setMessageReads([]);
        }
      } catch (error) {
        console.error('메신저 운영센터 로드 실패:', error);
        setNoticeMessages([]);
        setMessageReads([]);
        setRoomFiles([]);
        setAttendanceRows([]);
        setShiftAssignments([]);
        setDriveLinks([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [loadDriveLinks, selectedRoomId]);

  const importantNotices = useMemo(
    () => noticeMessages.filter((message) => String(message.content || '').startsWith('[중요공지]')),
    [noticeMessages]
  );

  const readMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    messageReads.forEach((read: any) => {
      if (!map.has(read.message_id)) map.set(read.message_id, new Set());
      map.get(read.message_id)?.add(String(read.user_id));
    });
    return map;
  }, [messageReads]);

  const noticeRows = useMemo(() => {
    return noticeMessages.map((message) => {
      const readers = Array.from(readMap.get(message.id) || []);
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
  }, [activeStaffs.length, noticeMessages, readMap]);

  const presenceRows = useMemo(() => {
    const attendanceMap = new Map(attendanceRows.map((row: any) => [String(row.staff_id), row.status]));
    const shiftMap = new Map(shiftAssignments.map((row: any) => [String(row.staff_id), row.shift_id]));

    return activeStaffs.map((staff: any) => {
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

    return {
      overdue,
      averageReadRate,
      importantCount: importantNotices.length,
      busyStaff,
      awayStaff,
    };
  }, [importantNotices.length, noticeRows, presenceRows]);

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
      alert('중요공지 지정에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const sendReminder = async (row: any) => {
    const nonReaders = activeStaffs.filter((staff: any) => !row.readers.includes(String(staff.id)));
    if (nonReaders.length === 0) {
      alert('이미 전원이 확인했습니다.');
      return;
    }

    setBusyId(row.id);
    try {
      const payload = nonReaders.map((staff: any) => ({
        user_id: staff.id,
        type: 'notice_reminder',
        title: '중요 공지 확인 요청',
        body: `${formatDateLabel(row.created_at)} 공지를 아직 확인하지 않았습니다. 즉시 확인해 주세요.`,
        read_at: null,
      }));
      const { error } = await supabase.from('notifications').insert(payload);
      if (error) throw error;
      alert(`${nonReaders.length}명에게 공지 확인 알림을 보냈습니다.`);
    } catch (error) {
      console.error('공지 리마인드 실패:', error);
      alert('공지 리마인드 발송에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
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
          created_by: user?.id || null,
          updated_by: user?.id || null,
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
      alert('드라이브 링크 추가에 실패했습니다.');
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
          updated_by: user?.id || null,
        })
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('드라이브 링크 저장 실패:', error);
      alert('드라이브 링크 저장에 실패했습니다.');
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
      alert('드라이브 링크 삭제에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-[var(--card)] p-4 shadow-sm custom-scrollbar"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">Messenger Ops</p>
            <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">메신저 운영센터</h2>
            <p className="mt-2 text-[12px] text-[var(--toss-gray-3)]">
              읽음 SLA, 중요공지 확인, 공지 읽음률, 근무 상태, 파일 버전, 대용량 드라이브 링크를 한 화면에서 관리합니다.
            </p>
          </div>
          <button onClick={onClose} className="rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-2 text-sm font-bold text-[var(--toss-gray-4)]">
            닫기
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm font-semibold text-[var(--toss-gray-3)]">운영 데이터를 불러오는 중입니다.</div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              {[
                { label: 'SLA 초과', value: `${stats.overdue}건`, tone: 'text-red-600' },
                { label: '평균 읽음률', value: `${stats.averageReadRate}%`, tone: 'text-[var(--accent)]' },
                { label: '중요 공지', value: `${stats.importantCount}건`, tone: 'text-orange-600' },
                { label: '근무중', value: `${stats.busyStaff}명`, tone: 'text-emerald-600' },
                { label: '부재중', value: `${stats.awayStaff}명`, tone: 'text-[var(--toss-gray-4)]' },
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
                      공지메시지 채널에 분석할 메시지가 없습니다.
                    </div>
                  ) : (
                    noticeRows.slice(0, 12).map((row) => (
                      <div key={row.id} className="rounded-[var(--radius-xl)] bg-[var(--muted)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {row.isImportant && <span className="rounded-[var(--radius-md)] bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600">중요공지</span>}
                              {row.isOverSla && <span className="rounded-[var(--radius-md)] bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">SLA 초과</span>}
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
                              className="rounded-[var(--radius-md)] border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-bold text-orange-600 disabled:opacity-50"
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
                                : 'bg-blue-100 text-blue-600'
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
                        className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600"
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
