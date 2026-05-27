'use client';

/**
 * 메시지 템플릿 탭 — 12종 카드 그리드
 *
 * JM: 단일 책임(탭 컨테이너 + fetch), 300줄 이내
 * JM2: 단발 fetch 후 캐시, 컴포넌트 외부의 STATIC 상수로 fallback 즉시 렌더
 * JM3: fetch 실패는 정상 흐름으로 처리 — 콘솔 경고 + fallback 사용
 * JM4: any 금지, supabase row를 안전하게 좁히는 가드 사용
 * JM6: 카드 그리드는 role=list, 카드 각각이 listitem
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import MessageTemplateCard, {
  type MessageChannel,
  type MessageTemplate,
} from './MessageTemplateCard';

// ─── fallback 12종 (reference 명세 + 사용자 요청 통합) ─────────────
const FALLBACK_TEMPLATES: MessageTemplate[] = [
  { id: 'tmpl-attendance', name: '출퇴근 알림', channel: '푸시', sendCount: 1840, lastSentLabel: '오늘', status: '활성' },
  { id: 'tmpl-approval-req', name: '결재 요청 알림', channel: '카카오', sendCount: 142, lastSentLabel: '5/26', status: '활성' },
  { id: 'tmpl-approval-ok', name: '결재 승인 알림', channel: '카카오', sendCount: 98, lastSentLabel: '5/26', status: '활성' },
  { id: 'tmpl-payroll', name: '급여 명세서', channel: '이메일', sendCount: 27, lastSentLabel: '5/25', status: '활성' },
  { id: 'tmpl-annual-ok', name: '연차 승인', channel: '카카오', sendCount: 64, lastSentLabel: '5/24', status: '활성' },
  { id: 'tmpl-annual-notify', name: '연차 알림', channel: '푸시', sendCount: 48, lastSentLabel: '5/23', status: '활성' },
  { id: 'tmpl-dinner', name: '회식 안내', channel: '웍스', sendCount: 12, lastSentLabel: '5/20', status: '활성' },
  { id: 'tmpl-condolence', name: '경조사', channel: '카카오', sendCount: 18, lastSentLabel: '5/18', status: '활성' },
  { id: 'tmpl-emergency', name: '비상 호출', channel: 'SMS', sendCount: 3, lastSentLabel: '5/12', status: '활성' },
  { id: 'tmpl-patient-arrive', name: '환자 도착', channel: '푸시', sendCount: 412, lastSentLabel: '오늘', status: '활성' },
  { id: 'tmpl-clinic-close', name: '진료 마감', channel: '슬랙', sendCount: 31, lastSentLabel: '5/26', status: '활성' },
  { id: 'tmpl-notice', name: '일반 공지', channel: '이메일', sendCount: 86, lastSentLabel: '5/26', status: '활성' },
];

// ─── supabase row 좁히기 (JM4: any 금지, unknown → 검증) ──────────
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
  return { id, name, channel, sendCount, lastSentLabel, status };
}

// ─── fetch hook: supabase 우선, 실패·빈 결과 시 fallback ─────────
function useMessageTemplates(): {
  templates: MessageTemplate[];
  loading: boolean;
  source: 'supabase' | 'fallback';
} {
  const [templates, setTemplates] = useState<MessageTemplate[]>(FALLBACK_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'supabase' | 'fallback'>('fallback');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('message_templates')
          .select('id, name, channel, send_count, last_sent_label, status')
          .order('name', { ascending: true });
        if (!alive) return;
        if (error || !Array.isArray(data) || data.length === 0) {
          setSource('fallback');
        } else {
          const parsed = data.map(toTemplate).filter((t): t is MessageTemplate => t !== null);
          if (parsed.length > 0) {
            setTemplates(parsed);
            setSource('supabase');
          }
        }
      } catch {
        // 정상 흐름: 테이블 미존재·네트워크 오류는 fallback 유지
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { templates, loading, source };
}

interface MessageTemplatesTabProps {
  onEditTemplate?: (template: MessageTemplate) => void;
  onPreviewTemplate?: (template: MessageTemplate) => void;
}

export default function MessageTemplatesTab({
  onEditTemplate,
  onPreviewTemplate,
}: MessageTemplatesTabProps) {
  const { templates, loading, source } = useMessageTemplates();
  const totalSends = useMemo(
    () => templates.reduce((sum, t) => sum + t.sendCount, 0),
    [templates],
  );

  return (
    <section aria-label="메시지 템플릿" className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-[var(--toss-gray-4)]">
          템플릿 <b className="text-[var(--foreground)] tabular-nums">{templates.length}</b>종 · 누적 발송{' '}
          <b className="text-[var(--foreground)] tabular-nums">{totalSends.toLocaleString('ko-KR')}</b>회
        </p>
        <p className="text-[10.5px] text-[var(--toss-gray-3)]" aria-live="polite">
          {loading ? '동기화 중…' : source === 'supabase' ? '실데이터' : '샘플 표시'}
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
              onEdit={onEditTemplate}
              onPreview={onPreviewTemplate}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
