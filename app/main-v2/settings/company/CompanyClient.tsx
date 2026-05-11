'use client';

/**
 * CompanyClient.tsx — 회사정보 7탭 클라이언트 (#78~#84)
 *
 * JM : 500줄 이내, 탭 콘텐츠 단일 책임
 * JM2: 현재 탭만 렌더 (hidden prop으로 DOM 유지 X → conditional render)
 * JM4: any 금지, CompanyTab union
 * JM6: role="tablist"/"tab"/"tabpanel", ArrowLeft/Right/Home/End, label-input 연결
 */

import React, { useState, useId } from 'react';
import { TabBar } from '../_shared/SettingsTabs';
import type { TabDef } from '../_shared/SettingsTabs';
import {
  COMPANY_BASIC, WORK_TYPES, CORPORATE_CARDS, CONTRACT_TEMPLATES,
  PUBLIC_HOLIDAYS_2026, TAX_RATES, CORPORATE_CARDS as _cards,
  formatKRW, type WorkType,
} from '../_shared/dummy-data';

// ── 탭 정의 ───────────────────────────────────────────────────────────────────

type CompanyTab = 'basic' | 'work-type' | 'card' | 'contract' | 'leave' | 'salary' | 'archive';

const COMPANY_TABS: readonly TabDef<CompanyTab>[] = [
  { id: 'basic',     label: '기본정보 #78'   },
  { id: 'work-type', label: '근무형태 #79'   },
  { id: 'card',      label: '법인카드 #80'   },
  { id: 'contract',  label: '계약템플릿 #81' },
  { id: 'leave',     label: '휴가/공휴일 #82' },
  { id: 'salary',    label: '급여기준 #83'   },
  { id: 'archive',   label: '문서보관 #84'   },
] as const;

// ── 탭 패널 컴포넌트들 ────────────────────────────────────────────────────────

function BasicInfoPanel() {
  const [name, setName]   = useState(COMPANY_BASIC.name);
  const [bizNo]           = useState(COMPANY_BASIC.bizNo);
  const [ceo, setCeo]     = useState(COMPANY_BASIC.ceoName);
  const [phone, setPhone] = useState(COMPANY_BASIC.phone);
  const [addr, setAddr]   = useState(COMPANY_BASIC.address);
  const [nameErr, setNameErr] = useState('');
  const id = useId();

  const validate = () => {
    if (!name.trim()) { setNameErr('병원명은 필수 항목입니다.'); return false; }
    setNameErr('');
    return true;
  };

  return (
    <div className="grid gap-5 max-w-xl">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium text-[var(--foreground)]">
          병원명 <span aria-hidden="true" className="text-red-500">*</span>
          <span className="sr-only">(필수)</span>
        </label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => { setName(e.target.value); if (nameErr) setNameErr(''); }}
          onBlur={validate}
          aria-required="true"
          aria-invalid={nameErr ? 'true' : undefined}
          aria-describedby={nameErr ? `${id}-name-err` : undefined}
          className="input-base"
          placeholder="샘플병원"
        />
        {nameErr && (
          <p id={`${id}-name-err`} role="alert" className="text-xs text-red-500">{nameErr}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-bizno`} className="text-sm font-medium text-[var(--foreground)]">사업자등록번호</label>
        <input id={`${id}-bizno`} readOnly value={bizNo} className="input-base bg-[var(--muted)] cursor-not-allowed" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-ceo`} className="text-sm font-medium text-[var(--foreground)]">대표자명</label>
        <input id={`${id}-ceo`} value={ceo} onChange={(e) => setCeo(e.target.value)} className="input-base" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-phone`} className="text-sm font-medium text-[var(--foreground)]">전화번호</label>
        <input id={`${id}-phone`} value={phone} onChange={(e) => setPhone(e.target.value)} className="input-base" type="tel" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-addr`} className="text-sm font-medium text-[var(--foreground)]">주소</label>
        <input id={`${id}-addr`} value={addr} onChange={(e) => setAddr(e.target.value)} className="input-base" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <UploadBox label="로고 (PNG/JPG, 2MB)" htmlFor={`${id}-logo`} />
        <UploadBox label="직인 (PNG/JPG, 2MB)" htmlFor={`${id}-seal`} />
      </div>
    </div>
  );
}

function UploadBox({ label, htmlFor }: { label: string; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--foreground)]">{label}</label>
      <div
        className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border)] bg-[var(--muted)] text-xs text-[var(--toss-gray-4)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        role="button"
        tabIndex={0}
        aria-label={label}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById(htmlFor)?.click(); }}
      >
        <span aria-hidden="true">↑</span>
        <span>드래그 또는 클릭</span>
      </div>
      <input id={htmlFor} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={label} />
    </div>
  );
}

function WorkTypePanel() {
  const [types, setTypes] = useState<WorkType[]>(WORK_TYPES);
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleStatus = (id: string) => {
    setTypes((prev) =>
      prev.map((t) => t.id === id ? { ...t, status: t.status === 'active' ? 'inactive' : 'active' } : t),
    );
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">근무형태 목록</h3>
        <button className="btn-accent text-xs px-3 py-1.5 rounded-[var(--radius-md)]">+ 추가</button>
      </div>
      <div className="app-card overflow-hidden">
        <table className="w-full text-sm" aria-label="근무형태 목록">
          <thead className="bg-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">이름</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">시작</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">종료</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">휴식(분)</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">상태</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">편집</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr
                key={t.id}
                className={[
                  'border-t border-[var(--border)] transition-opacity',
                  t.status === 'inactive' ? 'opacity-50' : '',
                ].join(' ')}
              >
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">{t.name}</td>
                <td className="px-4 py-3 text-[var(--toss-gray-4)]">{t.startTime}</td>
                <td className="px-4 py-3 text-[var(--toss-gray-4)]">{t.endTime}</td>
                <td className="px-4 py-3 text-[var(--toss-gray-4)]">{t.breakMinutes}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleStatus(t.id)}
                    aria-label={`${t.name} ${t.status === 'active' ? '비활성화' : '활성화'}`}
                    className={[
                      'badge text-xs',
                      t.status === 'active' ? 'badge-green' : 'badge-gray',
                    ].join(' ')}
                  >
                    {t.status === 'active' ? '사용' : '미사용'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                    aria-label={`${t.name} 편집`}
                    className="text-xs text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded"
                  >
                    편집
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardPanel() {
  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">법인카드 ({CORPORATE_CARDS.length}장)</h3>
        <button className="btn-accent text-xs px-3 py-1.5 rounded-[var(--radius-md)]">+ 카드 등록</button>
      </div>
      <div className="grid gap-3">
        {CORPORATE_CARDS.map((card) => (
          <article key={card.id} className={['app-card p-4', !card.active ? 'opacity-50' : ''].join(' ')}>
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-[var(--toss-gray-4)]">{card.bank}</span>
                {/* JM5: 카드번호 항상 마스킹 */}
                <span className="font-mono text-sm font-medium text-[var(--foreground)]" aria-label="카드번호 (마스킹됨)">
                  {card.maskedNumber}
                </span>
                <span className="text-xs text-[var(--toss-gray-4)]">명의: {card.holder} · 유효기간: {card.expiry}</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={['badge text-xs', card.active ? 'badge-green' : 'badge-gray'].join(' ')}>
                  {card.active ? '사용' : '만료'}
                </span>
                <span className="text-xs text-[var(--toss-gray-4)]">한도 {formatKRW(card.limit)}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ContractPanel() {
  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">계약 템플릿 ({CONTRACT_TEMPLATES.length}종)</h3>
        <button className="btn-accent text-xs px-3 py-1.5 rounded-[var(--radius-md)]">+ 업로드</button>
      </div>
      <div className="app-card overflow-hidden">
        <table className="w-full text-sm" aria-label="계약 템플릿 목록">
          <thead className="bg-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">이름</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">유형</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">버전</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">수정일</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">동작</th>
            </tr>
          </thead>
          <tbody>
            {CONTRACT_TEMPLATES.map((ct) => (
              <tr key={ct.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">{ct.name}</td>
                <td className="px-4 py-3"><span className="badge badge-blue text-xs">{ct.type}</span></td>
                <td className="px-4 py-3 text-[var(--toss-gray-4)]">{ct.version}</td>
                <td className="px-4 py-3 text-[var(--toss-gray-4)]">{ct.updatedAt}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button aria-label={`${ct.name} 미리보기`} className="text-xs text-[var(--accent)] hover:underline">미리보기</button>
                  <button aria-label={`${ct.name} 편집`} className="text-xs text-[var(--toss-gray-4)] hover:underline">편집</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeavePanel() {
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced]   = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSyncing(false);
    setSynced(true);
  };

  return (
    <div className="max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">2026년 공휴일</h3>
        <button
          onClick={handleSync}
          disabled={syncing}
          aria-busy={syncing}
          className="btn-accent text-xs px-3 py-1.5 rounded-[var(--radius-md)] disabled:opacity-60"
        >
          {syncing ? '동기화 중…' : synced ? '✓ 동기화 완료' : '공공데이터 동기화'}
        </button>
      </div>
      <div className="app-card overflow-hidden">
        <table className="w-full text-sm" aria-label="공휴일 목록">
          <thead className="bg-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">날짜</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">명칭</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">상태</th>
            </tr>
          </thead>
          <tbody>
            {PUBLIC_HOLIDAYS_2026.map((h) => (
              <tr key={h.date} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-mono text-[var(--toss-gray-4)]">{h.date}</td>
                <td className="px-4 py-3 text-[var(--foreground)]">{h.name}</td>
                <td className="px-4 py-3">
                  <span className={['badge text-xs', h.synced ? 'badge-green' : 'badge-yellow'].join(' ')}>
                    {h.synced ? '동기화됨' : '미동기화'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalaryPanel() {
  return (
    <div className="max-w-xl">
      <p className="mb-3 text-xs text-[var(--toss-gray-4)]">
        법정 고정값은 읽기 전용입니다. 변경이 필요하면 담당 세무사에게 문의하세요.
      </p>
      <div className="app-card overflow-hidden">
        <table className="w-full text-sm" aria-label="급여기준 세율 목록">
          <thead className="bg-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">항목</th>
              <th className="px-4 py-2.5 text-right font-medium text-[var(--toss-gray-4)]">요율(%)</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">비고</th>
            </tr>
          </thead>
          <tbody>
            {TAX_RATES.map((r) => (
              <tr key={r.name} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">{r.name}</td>
                <td className="px-4 py-3 text-right">
                  {r.readonly
                    ? <span className="font-mono text-[var(--toss-gray-4)]">{r.rate}%</span>
                    : <input type="number" defaultValue={r.rate} className="input-base w-24 text-right" aria-label={`${r.name} 요율`} />
                  }
                </td>
                <td className="px-4 py-3 text-xs text-[var(--toss-gray-4)]">
                  {r.note} {r.readonly && <span className="badge badge-gray ml-1">고정</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchivePanel() {
  const [autoDelete, setAutoDelete] = useState(false);
  const [showWarn, setShowWarn]     = useState(false);
  const id = useId();

  const handleToggle = (next: boolean) => {
    if (next) { setShowWarn(true); return; }
    setAutoDelete(false);
  };

  return (
    <div className="max-w-xl">
      <div className="app-card flex items-start justify-between p-4">
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">자동 삭제</p>
          <p className="mt-0.5 text-xs text-[var(--toss-gray-4)]">일정 기간 후 문서를 자동으로 영구 삭제합니다.</p>
        </div>
        <button
          id={`${id}-toggle`}
          role="switch"
          aria-checked={autoDelete}
          aria-label="자동 삭제 활성화"
          onClick={() => handleToggle(!autoDelete)}
          className={[
            'relative h-6 w-11 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
            autoDelete ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
              autoDelete ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </div>

      {showWarn && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${id}-warn-title`}
          aria-describedby={`${id}-warn-desc`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="app-card max-w-sm w-full p-6 flex flex-col gap-4">
            <h2 id={`${id}-warn-title`} className="text-base font-bold text-[var(--foreground)]">⚠ 자동 삭제 활성화</h2>
            <p id={`${id}-warn-desc`} className="text-sm text-[var(--toss-gray-4)]">
              활성화하면 보관 기간이 지난 문서가 영구 삭제됩니다. 계속하시겠습니까?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowWarn(false)} className="btn-ghost text-sm px-4 py-2 rounded-[var(--radius-md)]">취소</button>
              <button
                onClick={() => { setAutoDelete(true); setShowWarn(false); }}
                className="bg-red-500 text-white text-sm px-4 py-2 rounded-[var(--radius-md)] hover:bg-red-600"
              >
                활성화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 클라이언트 ────────────────────────────────────────────────────────────

export default function CompanyClient() {
  const [activeTab, setActiveTab] = useState<CompanyTab>('basic');

  const panelId  = (id: CompanyTab) => `company-panel-${id}`;
  const tabBtnId = (id: CompanyTab) => `company-tab-${id}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
        <h1 className="text-lg font-bold text-[var(--foreground)]">회사정보</h1>
        <button
          className="btn-accent rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold min-h-[44px]"
          aria-label="전체 저장"
        >
          전체 저장
        </button>
      </header>

      {/* 탭 바 */}
      <TabBar
        tabs={COMPANY_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="회사정보 탭"
      />

      {/* 탭 패널 — JM2: 현재 탭만 렌더 */}
      <main className="flex-1 overflow-y-auto p-6">
        {COMPANY_TABS.map((tab) => (
          <div
            key={tab.id}
            id={panelId(tab.id)}
            role="tabpanel"
            aria-labelledby={tabBtnId(tab.id)}
            tabIndex={0}
            hidden={tab.id !== activeTab}
            className="outline-none"
          >
            {tab.id === activeTab && (
              <>
                {tab.id === 'basic'     && <BasicInfoPanel />}
                {tab.id === 'work-type' && <WorkTypePanel />}
                {tab.id === 'card'      && <CardPanel />}
                {tab.id === 'contract'  && <ContractPanel />}
                {tab.id === 'leave'     && <LeavePanel />}
                {tab.id === 'salary'    && <SalaryPanel />}
                {tab.id === 'archive'   && <ArchivePanel />}
              </>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
