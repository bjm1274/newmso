'use client';

/**
 * SAdminMaster — 시스템 마스터 (6 segment)
 *
 * 운영 / 변경이력 / 정합성 / 복구 / 채팅 필터 / 연차 수정
 *  - 운영: 6 KPI + 최근 실행 잡 로그
 *  - 변경이력: 카테고리 칩 + 변경 로그
 *  - 정합성: 통과 배너 + 8개 진단 항목
 *  - 복구: 마지막 백업 카드 + 이력 (read-only; "복구는 데스크톱")
 *  - 채팅 필터: 금지어 / 플래그된 채팅방 (read-only)
 *  - 연차 수정: 최근 수정 이력 (read-only; "수정은 데스크톱+2FA")
 *
 * JM: 본체 400줄 이내 (정적 데이터 + render 분기)
 * JM4: MasterTab union
 * JM5: read-only 명시, mutation 없음
 * JM6: 칩바 role=tablist, aria-current="page"
 */

import { memo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import { DesktopHint, MiniKpi } from './공용UI';

type MasterTab = 'ops' | 'log' | 'check' | 'backup' | 'filter' | 'leave';

const TABS: { id: MasterTab; label: string }[] = [
  { id: 'ops', label: '운영' },
  { id: 'log', label: '변경이력' },
  { id: 'check', label: '정합성' },
  { id: 'backup', label: '복구' },
  { id: 'filter', label: '채팅 필터' },
  { id: 'leave', label: '연차 수정' },
];

export interface 시스템마스터Props {
  user: ErpUser;
  onBack: () => void;
}

export default function 시스템마스터({ user, onBack }: 시스템마스터Props) {
  const [tab, setTab] = useState<MasterTab>('ops');
  return (
    <div className="m-screen">
      <MobileHeader
        title="시스템 마스터"
        sub="MSO 전체 운영 콘솔"
        back={onBack}
        actions={
          <button type="button" aria-label="새로고침">
            <MIcon name="refresh" size={20} />
          </button>
        }
      />
      <div className="m-chip-bar" role="tablist" aria-label="시스템 마스터 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="m-scroll">
        {tab === 'ops' && <OpsTab />}
        {tab === 'log' && <LogTab />}
        {tab === 'check' && <CheckTab />}
        {tab === 'backup' && <BackupTab />}
        {tab === 'filter' && <FilterTab />}
        {tab === 'leave' && <LeaveTab />}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 운영 탭
// ─────────────────────────────────────────────────────────────

const OPS_KPI = [
  { label: 'DAU', value: '29', sub: '활성 32명 중', tone: 'success' as const },
  { label: '채팅 24h', value: '4,892', sub: '전사', tone: 'accent' as const },
  { label: '결재 진행중', value: '14', sub: '24h 초과 2', tone: 'warning' as const },
  { label: '자동 발주', value: '38', sub: '이번 주', tone: 'success' as const },
  { label: '푸시 실패', value: '7', sub: 'iOS 토큰 만료', tone: 'danger' as const },
  { label: '크론 잡', value: '12', sub: '모두 정상', tone: 'success' as const },
];

const CRON_JOBS = [
  { name: 'cron · payroll-monthly', status: '성공', at: '05/01 02:00', tone: 'success' as const },
  { name: 'cron · stock-forecast', status: '성공', at: '매일 03:00', tone: 'success' as const },
  { name: 'cron · push-retry', status: '실패', at: '4분 전', tone: 'danger' as const, message: 'APNs 토큰 만료 7건' },
  { name: 'cron · backup-incr', status: '성공', at: '1시간 전', tone: 'success' as const },
];

const OpsTab = memo(function OpsTab() {
  return (
    <>
      <div
        style={{
          padding: '14px 16px 0',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {OPS_KPI.map((k) => (
          <MiniKpi
            key={k.label}
            label={k.label}
            value={k.value}
            sub={k.sub}
            tone={k.tone}
          />
        ))}
      </div>
      <div className="m-section">
        <div className="m-section-h">
          <div className="lbl">최근 실행 잡</div>
        </div>
        <div className="m-card flush">
          {CRON_JOBS.map((j) => (
            <div key={j.name} className="m-list-row">
              <div className={'ico-tile tone-' + j.tone}>
                <MIcon
                  name={j.tone === 'success' ? 'checkCircle' : 'alertTri'}
                  size={18}
                />
              </div>
              <div>
                <div className="lbl">{j.name}</div>
                <div className="sub">
                  {j.at}
                  {j.message ? ` · ${j.message}` : ''}
                </div>
              </div>
              <MChip tone={j.tone}>{j.status}</MChip>
            </div>
          ))}
        </div>
      </div>
    </>
  );
});

// ─────────────────────────────────────────────────────────────
// 변경이력 탭
// ─────────────────────────────────────────────────────────────

const LOG_ROWS = [
  { cat: '권한', who: '백정민', text: '홍자비 → 결재담당 추가', at: '14:22', tone: 'accent' as const },
  { cat: '급여', who: '박유진', text: '5월 야근수당 정책 변경', at: '13:08', tone: 'warning' as const },
  { cat: '인사', who: '백정민', text: '정수아 부서이동 (영상→경영)', at: '어제', tone: '' as const },
  { cat: '재고', who: '시스템', text: '안전재고 자동 조정 12품목', at: '어제', tone: '' as const },
  { cat: '백업', who: '시스템', text: '증분 백업 완료 (2.4GB)', at: '어제', tone: 'success' as const },
];

const LogTab = memo(function LogTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {LOG_ROWS.map((r, i) => (
          <div key={i} className="m-list-row">
            <MChip tone={r.tone}>{r.cat}</MChip>
            <div>
              <div className="lbl" style={{ fontSize: 13 }}>
                {r.text}
              </div>
              <div className="sub">
                {r.who} · {r.at}
              </div>
            </div>
            <MIcon name="chevR" size={18} color="var(--z-400)" />
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 정합성 탭
// ─────────────────────────────────────────────────────────────

const CHECK_ROWS = [
  { name: 'DB 정합성', status: '정상', tone: 'success' as const },
  { name: '결재 흐름 무결성', status: '정상', tone: 'success' as const },
  { name: '급여 정산 무결성', status: '정상', tone: 'success' as const },
  { name: '근태 시프트 정합성', status: '정상', tone: 'success' as const },
  { name: '재고 장부 정합성', status: '주의 3', tone: 'warning' as const },
  { name: '권한 매트릭스', status: '정상', tone: 'success' as const },
  { name: '외부 연동 (5)', status: '정상', tone: 'success' as const },
  { name: 'iOS 푸시 토큰', status: '심각 7', tone: 'danger' as const },
];

const CheckTab = memo(function CheckTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div
        className="m-card"
        style={{
          padding: '14px 14px',
          marginBottom: 12,
          background: 'var(--m-success-soft)',
          borderColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MIcon name="checkCircle" size={22} color="var(--m-success)" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--m-success)' }}>
              전체 정상 · 진단 8/8 통과
            </div>
            <div
              style={{ fontSize: 11, color: 'var(--z-600)', fontWeight: 600, marginTop: 1 }}
            >
              마지막 점검: 12분 전
            </div>
          </div>
        </div>
      </div>
      <div className="m-card flush">
        {CHECK_ROWS.map((r) => (
          <div key={r.name} className="m-list-row">
            <div className={'ico-tile tone-' + r.tone}>
              <MIcon name={r.tone === 'success' ? 'check' : 'alertTri'} size={18} />
            </div>
            <div className="lbl">{r.name}</div>
            <MChip tone={r.tone}>{r.status}</MChip>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 복구 탭 (read-only)
// ─────────────────────────────────────────────────────────────

const BACKUP_ROWS = [
  { at: '05/11 14:00', kind: '증분', size: '2.4 GB', status: '성공', tone: 'success' as const },
  { at: '05/11 03:00', kind: '증분', size: '1.8 GB', status: '성공', tone: 'success' as const },
  { at: '05/10 03:00', kind: '증분', size: '2.1 GB', status: '성공', tone: 'success' as const },
  { at: '05/04 03:00', kind: '전체', size: '48.2 GB', status: '성공', tone: 'success' as const },
];

const BackupTab = memo(function BackupTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card" style={{ padding: '14px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
              마지막 백업
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>
              1시간 전 · 증분 2.4GB
            </div>
          </div>
          <MChip tone="success" dot>
            정상
          </MChip>
        </div>
      </div>
      <DesktopHint tone="warning">복구는 데스크톱 + 2단계 인증 필수</DesktopHint>
      <div className="m-section-h" style={{ padding: '18px 16px 8px' }}>
        <div className="lbl">백업 이력</div>
      </div>
      <div style={{ padding: '0 16px' }}>
        <div className="m-card flush">
          {BACKUP_ROWS.map((r, i) => (
            <div key={i} className="m-list-row">
              <div className="ico-tile tone-success">
                <MIcon name="download" size={18} />
              </div>
              <div>
                <div className="lbl">
                  {r.kind} · {r.size}
                </div>
                <div className="sub">{r.at}</div>
              </div>
              <MChip tone={r.tone}>{r.status}</MChip>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 채팅 필터 탭 (read-only)
// ─────────────────────────────────────────────────────────────

const BANNED_WORDS = [
  { word: '무능', count: 2, last: '5/11 14:22', tone: 'danger' as const },
  { word: '바보', count: 1, last: '5/10', tone: 'warning' as const },
  { word: 'XX 의료', count: 0, last: '-', tone: '' as const },
  { word: '(개인정보 패턴 · 정규식 4)', count: 0, last: '-', tone: '' as const },
];

const FLAGGED_ROOMS = [
  { room: '경영지원팀', word: '무능', who: '홍자비', at: '5/11 14:22' },
  { room: '영상의학팀', word: '바보', who: '(미상)', at: '5/10 09:18' },
];

const FilterTab = memo(function FilterTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card" style={{ padding: '14px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
          전체 채팅방 실시간 스캔
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <div
            className="m-tnum"
            style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em' }}
          >
            14
          </div>
          <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>
            금지어 / 24h 매칭 <b style={{ color: 'var(--m-danger)' }}>3건</b>
          </div>
        </div>
      </div>
      <div className="m-section-h">
        <div className="lbl">등록된 금지어 14</div>
      </div>
      <div className="m-card flush">
        {BANNED_WORDS.map((b) => (
          <div key={b.word} className="m-list-row">
            <MChip tone={b.tone}>{b.count}</MChip>
            <div>
              <div className="lbl">{b.word}</div>
              <div className="sub">최근 매칭: {b.last}</div>
            </div>
            <MIcon name="x" size={16} color="var(--z-400)" />
          </div>
        ))}
      </div>
      <div className="m-section-h" style={{ padding: '18px 0 8px' }}>
        <div className="lbl">플래그된 채팅방</div>
      </div>
      <div className="m-card flush">
        {FLAGGED_ROOMS.map((r, i) => (
          <div key={i} className="m-list-row">
            <div className="ico-tile tone-danger">
              <MIcon name="alertTri" size={18} />
            </div>
            <div>
              <div className="lbl">
                {r.room}{' '}
                <MChip tone="danger">&quot;{r.word}&quot;</MChip>
              </div>
              <div className="sub">
                {r.who} · {r.at}
              </div>
            </div>
            <MChip tone="warning">대기</MChip>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 연차 수정 탭 (read-only — 이력만)
// ─────────────────────────────────────────────────────────────

const LEAVE_EDITS = [
  { who: '홍자비', change: '잔여 5 → 8', reason: '입사일 정정', by: '백정민', at: '5/3' },
  { who: '정수아', change: '잔여 12 → 11', reason: '4/30 반차 누락 보정', by: '박유진', at: '4/30' },
  { who: '박철홍', change: '잔여 15 → 14', reason: '특별휴가 차감', by: '백정민', at: '4/22' },
];

const AVATAR_TONES = ['pink', 'blue', 'violet'] as const;

const LeaveTab = memo(function LeaveTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <DesktopHint tone="warning">
        연차 수정은 감사 로그가 남습니다 · 2단계 인증 후 실행
      </DesktopHint>
      <div className="m-section-h" style={{ padding: '14px 0 8px' }}>
        <div className="lbl">최근 연차 수정 이력</div>
      </div>
      <div className="m-card flush">
        {LEAVE_EDITS.map((r, i) => (
          <div key={i} className="m-list-row">
            <MAvatar tone={AVATAR_TONES[i % AVATAR_TONES.length]} size="sm">
              {r.who.charAt(0)}
            </MAvatar>
            <div>
              <div className="lbl">
                {r.who}{' '}
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--m-accent)',
                    fontWeight: 700,
                    marginLeft: 4,
                  }}
                >
                  {r.change}
                </span>
              </div>
              <div className="sub">
                {r.reason} · {r.by} · {r.at}
              </div>
            </div>
            <MIcon name="chevR" size={18} color="var(--z-400)" />
          </div>
        ))}
      </div>
    </div>
  );
});
