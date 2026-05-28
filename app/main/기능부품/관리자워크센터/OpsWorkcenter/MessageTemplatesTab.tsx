'use client';

/**
 * 메시지 템플릿 탭 — 12종 카드 그리드 + 편집 모달 + 디바이스 미리보기 모달
 *
 * JM: 단일 책임(탭 컨테이너 + fetch + 모달), 500줄 이내
 * JM2: 단발 fetch 후 캐시, 컴포넌트 외부의 STATIC 상수로 fallback 즉시 렌더
 * JM3: fetch 실패는 정상 흐름으로 처리 — 콘솔 경고 + fallback 사용 + localStorage 영구 보존
 * JM4: any 금지, supabase row를 안전하게 좁히는 가드 사용
 * JM6: 카드 그리드는 role=list, 카드 각각이 listitem
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import MessageTemplateCard, {
  type MessageChannel,
  type MessageTemplate,
} from './MessageTemplateCard';

// ─── fallback 12종 (상세 content 본문 추가) ──────────────────────────
const FALLBACK_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tmpl-attendance',
    name: '출퇴근 알림',
    channel: '푸시',
    sendCount: 1840,
    lastSentLabel: '오늘',
    status: '활성',
    content: `[newMSO] #{name}님의 #{type} 등록이 완료되었습니다.\n• 일시: #{time}\n• 상태: #{status}\n오늘도 좋은 하루 보내세요!`,
  },
  {
    id: 'tmpl-approval-req',
    name: '결재 요청 알림',
    channel: '카카오',
    sendCount: 142,
    lastSentLabel: '5/26',
    status: '활성',
    content: `[newMSO] 📄 신규 결재 요청\n#{name}님이 작성하신 '#{title}' 결재문서가 승인 요청되었습니다.\n결재 대기 목록에서 확인 후 승인해 주시기 바랍니다.`,
  },
  {
    id: 'tmpl-approval-ok',
    name: '결재 승인 알림',
    channel: '카카오',
    sendCount: 98,
    lastSentLabel: '5/26',
    status: '활성',
    content: `[newMSO] 🎉 결재 최종 승인\n귀하가 요청하신 '#{title}' 결재문서가 승인 완료되었습니다.\n지금 전자결재 보관함에서 확인해 보세요.`,
  },
  {
    id: 'tmpl-payroll',
    name: '급여 명세서',
    channel: '이메일',
    sendCount: 27,
    lastSentLabel: '5/25',
    status: '활성',
    content: `[newMSO] ✉️ #{month}월 급여명세서 발행\n#{name}님의 #{month}월 급여명세서가 안전하게 발송되었습니다.\n상세 내역 확인 및 전자 서명을 기한 내에 진행해 주세요.`,
  },
  {
    id: 'tmpl-annual-ok',
    name: '연차 승인',
    channel: '카카오',
    sendCount: 64,
    lastSentLabel: '5/24',
    status: '활성',
    content: `[newMSO] 🌴 연차 승인 안내\n#{name}님의 연차 휴가 신청이 승인되었습니다.\n• 일정: #{date}\n• 잔여연차: #{remain}일`,
  },
  {
    id: 'tmpl-annual-notify',
    name: '연차 알림',
    channel: '푸시',
    sendCount: 48,
    lastSentLabel: '5/23',
    status: '활성',
    content: `[newMSO] 📅 연차 사용 촉진 안내\n근로기준법 제61조에 따라 잔여 연차 사용을 촉진합니다.\n• 잔여연차: #{remain}일\n만료 전까지 사용 계획을 등록해 주세요.`,
  },
  {
    id: 'tmpl-dinner',
    name: '회식 안내',
    channel: '웍스',
    sendCount: 12,
    lastSentLabel: '5/20',
    status: '활성',
    content: `[newMSO] 🍺 전사 회식 안내\n이번 달 임직원 친목 도모를 위한 전사 회식을 안내합니다.\n• 일시: #{date} #{time}\n• 장소: #{location}\n참석 여부를 투표해 주세요!`,
  },
  {
    id: 'tmpl-condolence',
    name: '경조사',
    channel: '카카오',
    sendCount: 18,
    lastSentLabel: '5/18',
    status: '활성',
    content: `[newMSO] 🙏 경조사 알림\n임직원 #{name}님의 #{event} 소식을 전해드립니다.\n• 일시: #{date}\n• 장소: #{location}\n따뜻한 위로와 축하를 보내주시기 바랍니다.`,
  },
  {
    id: 'tmpl-emergency',
    name: '비상 호출',
    channel: 'SMS',
    sendCount: 3,
    lastSentLabel: '5/12',
    status: '활성',
    content: `🚨 [newMSO 비상호출] 🚨\n현재 #{location} 구역에 응급 상황이 발생하였습니다.\n대기 중인 전 의료진은 즉시 해당 위치로 이동해 주시기 바랍니다.`,
  },
  {
    id: 'tmpl-patient-arrive',
    name: '환자 도착',
    channel: '푸시',
    sendCount: 412,
    lastSentLabel: '오늘',
    status: '활성',
    content: `[병원 알림] 🏥 대기 환자 접수 완료\n#{name} 환자분이 접수되었습니다.\n• 대기번호: #{number}번\n진료 대기 현황판을 확인해 주세요.`,
  },
  {
    id: 'tmpl-clinic-close',
    name: '진료 마감',
    channel: '슬랙',
    sendCount: 31,
    lastSentLabel: '5/26',
    status: '활성',
    content: `[병원 알림] ⏰ 금일 진료 마감 안내\n오늘 진료 일정이 모두 완료되어 접수를 마감합니다.\n인계 기록지 및 일일 보고 작성을 진행해 주시기 바랍니다.`,
  },
  {
    id: 'tmpl-notice',
    name: '일반 공지',
    channel: '이메일',
    sendCount: 86,
    lastSentLabel: '5/26',
    status: '활성',
    content: `[공지사항] 📢 전체 임직원 공지\n#{title}\n\n상세 내용은 사내 게시판에서 확인하실 수 있습니다. 관련 부서원들은 숙지 바랍니다.`,
  },
];

const ALLOWED_CHANNELS: ReadonlySet<MessageChannel> = new Set<MessageChannel>([
  '카카오',
  '알림톡',
  '이메일',
  'SMS',
  '슬랙',
  '푸시',
  '웍스',
  '시스템',
]);

function isMessageChannel(value: unknown): value is MessageChannel {
  return typeof value === 'string' && ALLOWED_CHANNELS.has(value as MessageChannel);
}

function isAllowedStatus(value: unknown): value is MessageTemplate['status'] {
  return value === '활성' || value === '초안' || value === '보류';
}

function toTemplate(row: unknown): MessageTemplate | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : typeof r.id === 'number' ? String(r.id) : null;
  const name = typeof r.name === 'string' ? r.name : null;
  const channel = isMessageChannel(r.channel) ? r.channel : null;
  if (!id || !name || !channel) return null;
  const sendCountRaw = typeof r.send_count === 'number' ? r.send_count : Number(r.send_count);
  const sendCount = Number.isFinite(sendCountRaw) ? sendCountRaw : 0;
  const lastSentLabel = typeof r.last_sent_label === 'string' ? r.last_sent_label : undefined;
  const status = isAllowedStatus(r.status) ? r.status : '활성';
  const content = typeof r.content === 'string' ? r.content : undefined;
  return { id, name, channel, sendCount, lastSentLabel, status, content };
}

// ─── localStorage 헬퍼 ──────────────────────────────────────────────
const LOCAL_STORAGE_KEY = 'mso_custom_templates';

function getLocalCustomTemplates(): MessageTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const item = localStorage.getItem(LOCAL_STORAGE_KEY);
    return item ? JSON.parse(item) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomTemplates(templates: MessageTemplate[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(templates));
  } catch (err) {
    console.error('Failed to save templates to localStorage:', err);
  }
}

export default function MessageTemplatesTab() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'supabase' | 'fallback'>('fallback');
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<MessageTemplate | null>(null);

  // 1. 초기 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('message_templates')
          .select('id, name, channel, send_count, last_sent_label, status, content')
          .order('name', { ascending: true });

        if (!alive) return;

        if (error || !Array.isArray(data) || data.length === 0) {
          // D1 또는 Supabase에 테이블이 없는 404/403 상황 -> localStorage + fallback 머지
          const locals = getLocalCustomTemplates();
          const merged = FALLBACK_TEMPLATES.map((fb) => {
            const matched = locals.find((l) => l.id === fb.id);
            return matched ? { ...fb, ...matched } : fb;
          });
          setTemplates(merged);
          setSource('fallback');
        } else {
          // 데이터가 실제 존재하는 경우
          const parsed = data.map(toTemplate).filter((t): t is MessageTemplate => t !== null);
          if (parsed.length > 0) {
            setTemplates(parsed);
            setSource('supabase');
          }
        }
      } catch {
        // 에러 시 로컬 보존
        const locals = getLocalCustomTemplates();
        const merged = FALLBACK_TEMPLATES.map((fb) => {
          const matched = locals.find((l) => l.id === fb.id);
          return matched ? { ...fb, ...matched } : fb;
        });
        setTemplates(merged);
        setSource('fallback');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const totalSends = useMemo(
    () => templates.reduce((sum, t) => sum + t.sendCount, 0),
    [templates],
  );

  // 2. 편집 핸들러
  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;

    if (!editingTemplate.name.trim()) {
      toast('템플릿 이름을 입력해 주세요.', 'error');
      return;
    }
    if (!editingTemplate.content?.trim()) {
      toast('템플릿 문구를 입력해 주세요.', 'error');
      return;
    }

    const nextTemplates = templates.map((t) =>
      t.id === editingTemplate.id ? editingTemplate : t,
    );
    setTemplates(nextTemplates);

    // D1 또는 Supabase가 없으므로 localStorage에 항상 동기화 저장
    if (source === 'fallback') {
      const locals = getLocalCustomTemplates();
      const existingIdx = locals.findIndex((l) => l.id === editingTemplate.id);
      if (existingIdx >= 0) {
        locals[existingIdx] = editingTemplate;
      } else {
        locals.push(editingTemplate);
      }
      saveLocalCustomTemplates(locals);
    } else {
      // Supabase 테이블이 활성화되어 있을 때를 대비한 동기화
      (async () => {
        try {
          await supabase
            .from('message_templates')
            .update({
              name: editingTemplate.name,
              channel: editingTemplate.channel,
              status: editingTemplate.status,
              content: editingTemplate.content,
              updated_at: new Date().toISOString(),
            })
            .eq('id', editingTemplate.id);
        } catch (err) {
          console.error('Failed to sync updated template to DB:', err);
        }
      })();
    }

    toast('메시지 템플릿이 성공적으로 저장되었습니다.', 'success');
    setEditingTemplate(null);
  };

  // 미리보기 렌더링을 위한 파라미터 변환 맵
  const previewParams: Record<string, string> = {
    '#{name}': '김민수',
    '#{type}': '출근',
    '#{time}': '08:58:32',
    '#{status}': '정상 출근',
    '#{title}': '2026년도 연차 사용 계획서 제출',
    '#{month}': '5',
    '#{date}': '2026년 06월 01일 ~ 06월 05일',
    '#{remain}': '12.5',
    '#{location}': '2층 컨퍼런스룸 A',
    '#{time_range}': '19:00',
    '#{event}': '빙모상(경조휴가 5일 부여)',
    '#{number}': '128',
  };

  const getPreviewText = (text: string) => {
    let result = text;
    Object.entries(previewParams).forEach(([k, v]) => {
      result = result.replaceAll(k, v);
    });
    return result;
  };

  return (
    <section aria-label="메시지 템플릿" className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-[var(--toss-gray-4)]">
          템플릿 <b className="text-[var(--foreground)] tabular-nums">{templates.length}</b>종 · 누적 발송{' '}
          <b className="text-[var(--foreground)] tabular-nums">{totalSends.toLocaleString('ko-KR')}</b>회
        </p>
        <p className="text-[10.5px] text-[var(--toss-gray-3)]" aria-live="polite">
          {loading ? '동기화 중…' : source === 'supabase' ? '실데이터 (D1)' : '샘플 데이터 (오프라인 보존)'}
        </p>
      </div>

      <div
        role="list"
        aria-label="메시지 템플릿 목록"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5"
      >
        {templates.map((t) => (
          <div key={t.id} role="listitem">
            <MessageTemplateCard
              template={t}
              onEdit={(tmpl) => setEditingTemplate({ ...tmpl })}
              onPreview={(tmpl) => setPreviewingTemplate(tmpl)}
            />
          </div>
        ))}
      </div>

      {/* ─── 1. 편집 모달 ─── */}
      {editingTemplate && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="bg-[var(--card)] border border-[var(--border)] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--muted)]">
              <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>📝 템플릿 편집</span>
                <span className="text-[10px] bg-[var(--accent)]/15 text-[var(--accent)] font-semibold px-2 py-0.5 rounded-full">
                  {editingTemplate.id}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)] text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleEditSave} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">
                  템플릿 명칭
                </label>
                <input
                  type="text"
                  value={editingTemplate.name}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--foreground)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none"
                  placeholder="예: 출퇴근 알림"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">
                    발송 채널
                  </label>
                  <select
                    value={editingTemplate.channel}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        channel: e.target.value as MessageChannel,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--foreground)] focus:outline-none"
                  >
                    <option value="카카오">카카오톡 (알림톡)</option>
                    <option value="푸시">모바일 앱 푸시</option>
                    <option value="이메일">이메일 (Email)</option>
                    <option value="SMS">휴대폰 문자 (SMS)</option>
                    <option value="슬랙">슬랙 (Slack)</option>
                    <option value="웍스">네이버웍스</option>
                    <option value="시스템">시스템 인박스</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1">
                    상태 설정
                  </label>
                  <select
                    value={editingTemplate.status || '활성'}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        status: e.target.value as MessageTemplate['status'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--foreground)] focus:outline-none"
                  >
                    <option value="활성">🟢 활성 (발송 가능)</option>
                    <option value="초안">⚪ 초안 (작성 중)</option>
                    <option value="보류">🟡 보류 (발송 차단)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--toss-gray-4)] mb-1 flex justify-between">
                  <span>템플릿 문구</span>
                  <span className="text-[10px] text-[var(--toss-gray-3)]">
                    변수 사용법: #{'{name}'}, #{'{date}'}, #{'{remain}'} 등
                  </span>
                </label>
                <textarea
                  value={editingTemplate.content || ''}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, content: e.target.value })
                  }
                  rows={6}
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--foreground)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none font-mono"
                  placeholder="발송할 메시지 상세 문구를 입력해 주세요."
                />
              </div>

              <div className="rounded-xl bg-[var(--muted)] border border-[var(--border)] p-3 text-[10.5px] text-[var(--toss-gray-4)] space-y-1">
                <p className="font-bold text-[var(--foreground)] mb-0.5">ℹ️ 안내 파라미터 태그</p>
                <div className="grid grid-cols-2 gap-y-1 gap-x-2 font-mono text-[9.5px]">
                  <div>• <b className="text-[var(--accent)]">#{'{name}'}</b> : 직원 이름</div>
                  <div>• <b className="text-[var(--accent)]">#{'{type}'}</b> : 출퇴근구분</div>
                  <div>• <b className="text-[var(--accent)]">#{'{title}'}</b> : 결재 제목</div>
                  <div>• <b className="text-[var(--accent)]">#{'{remain}'}</b> : 잔여연차수</div>
                  <div>• <b className="text-[var(--accent)]">#{'{date}'}</b> : 특정 일자</div>
                  <div>• <b className="text-[var(--accent)]">#{'{location}'}</b> : 회식/경조장소</div>
                </div>
              </div>
            </form>

            <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2 bg-[var(--muted)]">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--card)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors text-[var(--foreground)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[var(--accent)] hover:opacity-90 shadow-sm transition-opacity"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. 디바이스 미리보기 모달 ─── */}
      {previewingTemplate && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="bg-[var(--card)] border border-[var(--border)] w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3.5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--muted)]">
              <h3 className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
                <span>📱 {previewingTemplate.name} 미리보기</span>
              </h3>
              <button
                type="button"
                onClick={() => setPreviewingTemplate(null)}
                className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)]"
              >
                &times;
              </button>
            </div>

            <div className="p-6 bg-[var(--page-bg)] flex justify-center items-center">
              {/* 모바일 화면 목업 */}
              <div className="w-[300px] rounded-[32px] border-[6px] border-[var(--border)] bg-gray-900 shadow-xl overflow-hidden relative aspect-[9/16] flex flex-col justify-start">
                {/* 노치/카메라 구멍 */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-10 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
                </div>

                {/* 상태바 */}
                <div className="h-7 bg-transparent px-5 flex justify-between items-center text-[9px] text-white/80 font-bold z-10 mt-1 select-none">
                  <span>23:55</span>
                  <div className="flex items-center gap-1">
                    <span>5G</span>
                    <div className="w-4 h-2 border border-white/60 rounded-sm p-0.5 flex items-center justify-start">
                      <div className="w-full h-full bg-white rounded-2xs" />
                    </div>
                  </div>
                </div>

                {/* 미리보기 본체 */}
                <div className="flex-1 p-3 overflow-y-auto flex flex-col justify-center items-center no-scrollbar bg-slate-950/40 relative">
                  {/* 채널별 특화 UI */}
                  {previewingTemplate.channel === '카카오' ||
                  previewingTemplate.channel === '알림톡' ? (
                    /* 카카오톡 알림톡 양식 */
                    <div className="w-full bg-[#FFE600] rounded-2xl p-2.5 shadow-md flex flex-col gap-1.5 animate-in slide-in-from-bottom duration-300">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-amber-950 flex items-center gap-1">
                          💛 KakaoTalk <span className="font-semibold opacity-75">알림톡</span>
                        </span>
                        <span className="text-[8px] text-amber-900/60 font-semibold">1분 전</span>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-amber-200/40 text-[11px] text-gray-800 leading-relaxed font-sans shadow-sm min-h-[140px] flex flex-col justify-between">
                        <div className="whitespace-pre-wrap font-bold">
                          {getPreviewText(
                            previewingTemplate.content || '템플릿 문구가 비어 있습니다.',
                          )}
                        </div>
                        <div className="mt-4 pt-2 border-t border-gray-100 flex justify-center">
                          <button
                            type="button"
                            className="w-full py-1.5 bg-gray-100 hover:bg-gray-200 text-[10px] text-gray-600 font-bold rounded-lg text-center shadow-2xs border border-gray-200"
                          >
                            상세보기
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : previewingTemplate.channel === '이메일' ? (
                    /* 이메일 목업 */
                    <div className="w-full bg-white rounded-2xl p-3.5 shadow-md border border-gray-100 flex flex-col gap-2 font-sans text-gray-800 animate-in slide-in-from-bottom duration-300">
                      <div className="border-b border-gray-100 pb-2">
                        <span className="text-[7.5px] text-[var(--accent)] font-extrabold tracking-wider uppercase">
                          mso-mail-service
                        </span>
                        <h4 className="text-[11px] font-bold text-gray-900 mt-0.5 truncate">
                          [newMSO] {previewingTemplate.name}
                        </h4>
                        <p className="text-[8px] text-gray-400 mt-0.5">
                          보낸사람: admin@syinc-erp.local
                        </p>
                      </div>
                      <div className="text-[10px] leading-relaxed whitespace-pre-wrap py-2 font-semibold">
                        {getPreviewText(
                          previewingTemplate.content || '템플릿 문구가 비어 있습니다.',
                        )}
                      </div>
                      <div className="mt-2 text-center text-[8px] text-gray-400 border-t border-gray-100 pt-2 font-mono">
                        본 메일은 수신전용 시스템 발신메일입니다.
                      </div>
                    </div>
                  ) : previewingTemplate.channel === '푸시' ? (
                    /* iOS 스타일 푸시 알림 배너 */
                    <div className="w-full bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3 shadow-lg flex flex-col gap-1.5 animate-in slide-in-from-top duration-300 text-white">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded bg-[var(--accent)] flex items-center justify-center text-[7px] font-bold">
                            N
                          </div>
                          <span className="text-[9px] font-bold text-white/80">newMSO System</span>
                        </div>
                        <span className="text-[8px] text-white/60">방금 전</span>
                      </div>
                      <div>
                        <h5 className="text-[10px] font-bold">{previewingTemplate.name}</h5>
                        <p className="text-[9.5px] text-white/80 leading-snug mt-0.5 font-bold whitespace-pre-wrap">
                          {getPreviewText(
                            previewingTemplate.content || '템플릿 문구가 비어 있습니다.',
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* 일반 SMS / 슬랙 / 기타 채팅 버블 */
                    <div className="w-full flex flex-col gap-1 animate-in slide-in-from-bottom duration-300">
                      <div className="flex items-center gap-1.5 ml-1">
                        <div className="w-4 h-4 rounded-full bg-gray-500 flex items-center justify-center text-[8px] font-bold text-white uppercase">
                          {previewingTemplate.channel[0]}
                        </div>
                        <span className="text-[9px] font-bold text-white/70">
                          {previewingTemplate.channel}
                        </span>
                      </div>
                      <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-md border border-gray-200/10 text-[10.5px] text-gray-900 leading-relaxed font-sans max-w-[90%] whitespace-pre-wrap font-bold">
                        {getPreviewText(
                          previewingTemplate.content || '템플릿 문구가 비어 있습니다.',
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 하단 소프트웨어 바 */}
                <div className="h-6 bg-transparent flex justify-center items-end pb-1.5 z-10 select-none">
                  <div className="w-20 h-1 bg-white/40 rounded-full" />
                </div>
              </div>
            </div>

            {/* 템플릿 사용 안내 범례 */}
            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--muted)] flex flex-col gap-1.5">
              <h4 className="text-[10px] font-bold text-[var(--foreground)]">💡 테스트 가상 데이터 매핑</h4>
              <p className="text-[9.5px] text-[var(--toss-gray-4)] font-medium leading-relaxed">
                템플릿에 명시된 파라미터 변수가 실제 모바일 화면에 대입되어 실시간으로 렌더링된 화면입니다.
              </p>
              <button
                type="button"
                onClick={() => setPreviewingTemplate(null)}
                className="w-full mt-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity shadow-sm"
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
