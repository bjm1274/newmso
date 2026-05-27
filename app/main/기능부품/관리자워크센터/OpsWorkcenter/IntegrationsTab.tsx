'use client';

/**
 * 외부 연동 탭 — 6개 벤더 카드 그리드
 *
 * JM: 단일 책임(탭 컨테이너 + fetch), 250줄 이내
 * JM3: fetch 실패는 정상 흐름 — fallback 유지, 사용자에게 "샘플 표시" 노출
 * JM4: any 금지, supabase row 검증
 * JM6: 카드 그리드 role=list / listitem
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import IntegrationCard, {
  type Integration,
  type IntegrationStatus,
  type IntegrationVendor,
} from './IntegrationCard';

// ─── fallback 6개 (사용자 명세) ───────────────────────────────────
const FALLBACK_INTEGRATIONS: Integration[] = [
  {
    id: 'int-kakao',
    vendor: 'kakao',
    name: '카카오 알림톡',
    sub: '발송 12,840건/월 · 발신 프로필 sy_inc',
    status: 'connected',
    lastSyncedLabel: '5분 전',
  },
  {
    id: 'int-naver-works',
    vendor: 'naver-works',
    name: '네이버웍스',
    sub: '메시지 4,210건/월 · OAuth 활성',
    status: 'connected',
    lastSyncedLabel: '12분 전',
  },
  {
    id: 'int-slack',
    vendor: 'slack',
    name: '슬랙',
    sub: '채널 6개 연결 · #mso-알림 외 5',
    status: 'connected',
    lastSyncedLabel: '1분 전',
  },
  {
    id: 'int-hometax',
    vendor: 'hometax',
    name: '홈택스',
    sub: '세금계산서 발송 · 원천징수 자동화',
    status: 'connected',
    lastSyncedLabel: '오늘 09:00',
  },
  {
    id: 'int-edi',
    vendor: 'edi',
    name: 'EDI 4대보험',
    sub: 'EDI 신고 자동화 · 국민·건강·고용·산재',
    status: 'connected',
    lastSyncedLabel: '오늘 08:30',
  },
  {
    id: 'int-bank',
    vendor: 'bank',
    name: '시중은행',
    sub: '자동 이체 · 펌뱅킹 — 설정 필요',
    status: 'disconnected',
    lastSyncedLabel: '연결 안됨',
  },
];

// ─── 검증 헬퍼 (JM4) ──────────────────────────────────────────────
const ALLOWED_VENDORS: ReadonlySet<IntegrationVendor> = new Set<IntegrationVendor>([
  'kakao',
  'naver-works',
  'slack',
  'hometax',
  'edi',
  'bank',
]);
const ALLOWED_STATUS: ReadonlySet<IntegrationStatus> = new Set<IntegrationStatus>([
  'connected',
  'disconnected',
  'pending',
]);

function isVendor(value: unknown): value is IntegrationVendor {
  return typeof value === 'string' && ALLOWED_VENDORS.has(value as IntegrationVendor);
}
function isStatus(value: unknown): value is IntegrationStatus {
  return typeof value === 'string' && ALLOWED_STATUS.has(value as IntegrationStatus);
}

function toIntegration(row: unknown): Integration | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : typeof r.id === 'number' ? String(r.id) : null;
  const vendor = isVendor(r.vendor) ? r.vendor : null;
  const name = typeof r.name === 'string' ? r.name : null;
  const sub = typeof r.sub === 'string' ? r.sub : '';
  const status = isStatus(r.status) ? r.status : 'connected';
  if (!id || !vendor || !name) return null;
  const lastSyncedLabel =
    typeof r.last_synced_label === 'string' ? r.last_synced_label : undefined;
  return { id, vendor, name, sub, status, lastSyncedLabel };
}

// ─── fetch hook: supabase 우선, 실패·빈 결과 시 fallback ─────────
function useIntegrations(): {
  integrations: Integration[];
  loading: boolean;
  source: 'supabase' | 'fallback';
} {
  const [integrations, setIntegrations] = useState<Integration[]>(FALLBACK_INTEGRATIONS);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'supabase' | 'fallback'>('fallback');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('external_integrations')
          .select('id, vendor, name, sub, status, last_synced_label')
          .order('vendor', { ascending: true });
        if (!alive) return;
        if (error || !Array.isArray(data) || data.length === 0) {
          setSource('fallback');
        } else {
          const parsed = data.map(toIntegration).filter((i): i is Integration => i !== null);
          if (parsed.length > 0) {
            setIntegrations(parsed);
            setSource('supabase');
          }
        }
      } catch {
        // 정상 흐름: 테이블 미존재시 fallback 유지
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { integrations, loading, source };
}

interface IntegrationsTabProps {
  onConfigure?: (integration: Integration) => void;
  onConnect?: (integration: Integration) => void;
  onDisconnect?: (integration: Integration) => void;
}

export default function IntegrationsTab({
  onConfigure,
  onConnect,
  onDisconnect,
}: IntegrationsTabProps) {
  const { integrations, loading, source } = useIntegrations();
  const connectedCount = integrations.filter((i) => i.status === 'connected').length;

  return (
    <section aria-label="외부 연동" className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-[var(--toss-gray-4)]">
          연동 <b className="text-[var(--foreground)] tabular-nums">{integrations.length}</b>개 · 활성{' '}
          <b className="text-[var(--foreground)] tabular-nums">{connectedCount}</b>개
        </p>
        <p className="text-[10.5px] text-[var(--toss-gray-3)]" aria-live="polite">
          {loading ? '동기화 중…' : source === 'supabase' ? '실데이터' : '샘플 표시'}
        </p>
      </div>

      <div
        role="list"
        aria-label="외부 연동 목록"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5"
      >
        {integrations.map((it) => (
          <div key={it.id} role="listitem">
            <IntegrationCard
              integration={it}
              onConfigure={onConfigure}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
