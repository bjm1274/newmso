'use client';

/**
 * 운영 설정 — 4탭
 * 일반 설정(토글) / 알림 자동화(실제 NotificationAutomation) /
 * 팝업 관리(실제 PopupManager) / 수술·검사 템플릿(실제 SurgeryExamTemplateManager)
 *
 * JM: 300줄 이내
 * JM2: 실제 서브 컴포넌트는 dynamic import
 * JM6: 토글은 role=switch
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Card, Chip, SmBtn, TabBar, Toggle, WorkcenterHeader } from './admin-workcenter-common';
import { ADMIN_WORKCENTERS, type ChipTone } from './admin-types';

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

const NotificationAutomation = dynamic(
  () => import('../관리자전용서브/알림자동화설정'),
  { ssr: false, loading: Loading }
);
const PopupManager = dynamic(
  () => import('../관리자전용서브/팝업창관리자'),
  { ssr: false, loading: Loading }
);
const SurgeryExamTemplateManager = dynamic(
  () => import('../관리자전용서브/수술검사템플릿관리'),
  { ssr: false, loading: Loading }
);
// 신규 — reference 명세 메시지 템플릿 / 외부 연동.
// 정적 import: Turbopack의 한글 폴더+영문 하위 경로 dynamic panic 회피.
import MessageTemplatesTab from './OpsWorkcenter/MessageTemplatesTab';
import IntegrationsTab from './OpsWorkcenter/IntegrationsTab';

type OpsTabId = 'general' | 'msg' | 'notify' | 'popup' | 'template' | 'int';

const TABS: { id: OpsTabId; label: string; count?: number }[] = [
  { id: 'general', label: '일반 설정' },
  { id: 'msg', label: '메시지 템플릿', count: 12 },
  { id: 'notify', label: '알림 자동화' },
  { id: 'popup', label: '팝업 관리' },
  { id: 'template', label: '수술·검사 템플릿' },
  { id: 'int', label: '외부 연동', count: 6 },
];

const DEFAULT_TOGGLES = [
  { key: 'email', name: '이메일 알림', s: true },
  { key: 'kakao', name: '카카오톡 알림 (알림톡)', s: true },
  { key: 'sms', name: 'SMS 알림', s: false },
  { key: 'push', name: '푸시 알림', s: true },
  { key: 'approval', name: '결재 요청 시 즉시 발송', s: true },
  { key: 'attendance', name: '근태 이상 자동 감지 알림', s: true },
];

// 실연동 전 — 가짜 "연결됨" 금지 (연동 준비 중 / 미연동으로 정직 표기)
const INTEGRATIONS: { name: string; state: string; sub: string; tone: ChipTone }[] = [
  { name: '카카오톡 알림톡', state: '연동 준비 중', sub: '실연동 미구성', tone: 'muted' },
  { name: '네이버웍스', state: '연동 준비 중', sub: '실연동 미구성', tone: 'muted' },
  { name: '슬랙', state: '연동 준비 중', sub: '실연동 미구성', tone: 'muted' },
  { name: '국세청 홈택스', state: '연동 준비 중', sub: '실연동 미구성', tone: 'muted' },
  { name: '4대보험 EDI', state: '연동 준비 중', sub: '실연동 미구성', tone: 'muted' },
  { name: '은행 펌뱅킹', state: '미연동', sub: '급여 자동이체용 — 설정 필요', tone: 'warn' },
];

function SelectField({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <div className="text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1">{label}</div>
      <select className="w-full px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[12px] text-[var(--foreground)]">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function GeneralTab() {
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const setOne = (key: string, v: boolean) =>
    setToggles((prev) => prev.map((t) => (t.key === key ? { ...t, s: v } : t)));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <Card title="알림 채널 설정">
        <div className="space-y-1">
          {toggles.map((t) => (
            <div key={t.key} className="flex items-center justify-between px-2.5 py-2 rounded-[var(--radius-md)] bg-[var(--muted)]">
              <span className="text-[12px]">{t.name}</span>
              <Toggle checked={t.s} onChange={(v) => setOne(t.key, v)} label={t.name} />
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        <Card title="시스템 설정">
          <div className="space-y-2.5">
            <SelectField label="기본 언어" options={['한국어', 'English']} />
            <SelectField label="시간대" options={['Asia/Seoul (UTC+9)']} />
            <SelectField label="통화" options={['KRW (원)']} />
            <SelectField label="세션 만료" options={['4시간', '1시간', '30분']} />
            <div>
              <div className="text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1.5">2단계 인증</div>
              <div className="flex items-center gap-1.5">
                <Chip tone="success">필수</Chip>
                <Chip tone="muted">선택</Chip>
              </div>
            </div>
          </div>
        </Card>

        <Card title="외부 연동">
          <div className="space-y-1.5">
            {INTEGRATIONS.map((it) => (
              <div key={it.name} className="flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)]">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold truncate">{it.name}</div>
                  <div className="text-[10.5px] text-[var(--toss-gray-4)]">{it.sub}</div>
                </div>
                <Chip tone={it.tone}>{it.state}</Chip>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function OpsWorkcenter({ user }: { user?: any }) {
  const meta = ADMIN_WORKCENTERS.ops;
  const [tab, setTab] = useState<OpsTabId>('general');

  return (
    <>
      <WorkcenterHeader
        title={meta.label}
        subtitle="일반 설정·메시지 템플릿·알림 자동화·팝업 관리·수술검사 템플릿·외부 연동 통합"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
        actions={<SmBtn primary onClick={() => setTab('notify')}>알림 자동화 →</SmBtn>}
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'general' && <GeneralTab />}
      {tab === 'msg' && <MessageTemplatesTab />}
      {tab === 'notify' && <NotificationAutomation user={user} />}
      {tab === 'popup' && <PopupManager />}
      {tab === 'template' && <SurgeryExamTemplateManager user={user} />}
      {tab === 'int' && <IntegrationsTab />}
    </>
  );
}
