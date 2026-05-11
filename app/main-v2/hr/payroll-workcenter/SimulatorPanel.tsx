'use client';

/**
 * SimulatorPanel.tsx — 우측 시뮬레이터 패널 (#47)
 *
 * 탭: 시뮬레이터 | 점검 결과 | 일정
 * 접기/펼치기 aria-expanded
 *
 * JM2: 계산 버튼 클릭 시에만 결과 갱신 (onChange 실시간 X)
 * JM4: any 금지
 * JM6: role="tablist", aria-expanded, aria-label
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, XCircle, Calendar } from 'lucide-react';
import Badge from '@/app/components/v2/Badge';
import Button from '@/app/components/v2/Button';
import Tabs from '@/app/components/v2/Tabs';
import { SCHEDULE_ITEMS, formatKRW } from './dummy-data';

// ── 타입 ───────────────────────────────────────────────────────────────────────

type PanelTab = 'simulator' | 'checker' | 'calendar';

interface SimResult {
  base:     number;
  ot:       number;
  night:    number;
  allow:    number;
  gross:    number;
  net:      number;
}

// ── 초기 계산 ──────────────────────────────────────────────────────────────────

function calcSim(base: number, otHours: number, nightHours: number, allow: number): SimResult {
  const hourly  = base / 209;
  const ot      = Math.round(hourly * 1.5 * otHours);
  const night   = Math.round(hourly * 0.5 * nightHours);
  const gross   = base + ot + night + allow;
  const net     = Math.round(gross * (1 - 0.141));
  return { base, ot, night, allow, gross, net };
}

const INITIAL_RESULT = calcSim(3_000_000, 10, 5, 200_000);

// ── 점검 결과 항목 ─────────────────────────────────────────────────────────────

const CHECK_ITEMS = [
  { type: 'err'  as const, text: '최저임금 미달 1명'       },
  { type: 'warn' as const, text: '4대보험 차이 1건'         },
  { type: 'warn' as const, text: '비과세 한도 초과 1건'     },
  { type: 'ok'   as const, text: '원천징수 집계 정상'       },
  { type: 'ok'   as const, text: '퇴직연금 납입 예정 정상'  },
];

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export default function SimulatorPanel() {
  const [collapsed,  setCollapsed ] = useState(false);
  const [activeTab,  setActiveTab ] = useState<PanelTab>('simulator');

  // 시뮬레이터 입력
  const [base,      setBase     ] = useState(3_000_000);
  const [otHours,   setOtHours  ] = useState(10);
  const [nightHours,setNightHours] = useState(5);
  const [allow,     setAllow    ] = useState(200_000);
  const [result,    setResult   ] = useState<SimResult>(INITIAL_RESULT);

  function handleCalc() {
    setResult(calcSim(base, otHours, nightHours, allow));
  }

  const panelTabs: Array<{ id: PanelTab; label: string }> = [
    { id: 'simulator', label: '시뮬레이터' },
    { id: 'checker',   label: '점검 결과'  },
    { id: 'calendar',  label: '일정'       },
  ];

  // ── 접힌 상태 ──────────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="급여 도구 패널 열기"
        aria-expanded={false}
        className="no-print flex-shrink-0 w-5 flex items-center justify-center
          bg-[var(--accent)] text-white rounded-l-[var(--radius-sm)]
          hover:bg-[var(--accent-hover)] transition-colors self-stretch"
      >
        <span
          aria-hidden="true"
          className="text-[10px] font-bold"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          급여 도구
        </span>
        <ChevronLeft size={12} className="mt-1" aria-hidden="true" />
      </button>
    );
  }

  // ── 펼친 상태 ──────────────────────────────────────────────────────────────

  return (
    <aside
      aria-label="급여 도구 패널"
      aria-expanded={true}
      className="no-print w-[320px] flex-shrink-0 bg-[var(--card)] border-l border-[var(--border)]
        flex flex-col overflow-hidden transition-[width] duration-200"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <span className="text-sm font-bold">급여 도구</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(true)}
          aria-label="패널 닫기"
          aria-expanded={true}
          iconRight={<ChevronRight size={14} />}
        >
          닫기
        </Button>
      </div>

      {/* 탭 */}
      <Tabs
        tabs={panelTabs}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as PanelTab)}
        variant="line"
        size="sm"
        fullWidth
        className="flex-shrink-0 px-1"
      />

      {/* 패널 바디 */}
      <div className="flex-1 overflow-y-auto p-3.5">

        {/* ── 시뮬레이터 탭 ──────────────────────────────────────────── */}
        {activeTab === 'simulator' && (
          <div role="tabpanel" id="panel-simulator" aria-labelledby="tab-simulator">
            <div className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide mb-2">
              급여 시뮬레이터 (#47)
            </div>
            <div className="flex flex-col gap-2.5">
              {[
                { id: 'sim-base',  label: '기본급',        value: base,       setter: setBase,       min: 0 },
                { id: 'sim-ot',    label: '연장근로(h)',    value: otHours,    setter: setOtHours,    min: 0 },
                { id: 'sim-night', label: '야간근로(h)',    value: nightHours, setter: setNightHours, min: 0 },
                { id: 'sim-allow', label: '고정수당',       value: allow,      setter: setAllow,      min: 0 },
              ].map(({ id, label, value, setter, min }) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-xs text-[var(--toss-gray-4)] mb-1">{label}</label>
                  <input
                    id={id}
                    type="number"
                    min={min}
                    value={value}
                    onChange={(e) => setter(Number(e.target.value))}
                    className="w-full h-9 px-3 text-sm border border-[var(--border)] rounded-[var(--radius-md)]
                      bg-[var(--card)] text-[var(--foreground)]
                      focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>
              ))}
              <Button variant="primary" fullWidth onClick={handleCalc} aria-label="급여 계산 실행">
                계산
              </Button>
            </div>

            {/* 결과 */}
            <div
              className="mt-3 rounded-[var(--radius-md)] bg-[var(--accent-light)] p-3"
              aria-live="polite"
              aria-label="급여 시뮬레이터 계산 결과"
            >
              {[
                { label: '기본급',    value: result.base  },
                { label: '연장수당',  value: result.ot    },
                { label: '야간수당',  value: result.night },
                { label: '고정수당',  value: result.allow },
                { label: '총 지급',   value: result.gross },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs py-1 border-b border-[var(--border)] last:border-0">
                  <span className="text-[var(--toss-gray-4)]">{label}</span>
                  <span>{formatKRW(value)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold pt-2 mt-1 border-t border-[var(--border)]">
                <span>실수령 (예상)</span>
                <span>{formatKRW(result.net)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── 점검 결과 탭 ──────────────────────────────────────────── */}
        {activeTab === 'checker' && (
          <div role="tabpanel" id="panel-checker" aria-labelledby="tab-checker">
            <div className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide mb-2">
              자동 점검 요약
            </div>
            <ul className="flex flex-col gap-1.5" role="list">
              {CHECK_ITEMS.map((item, idx) => (
                <li
                  key={idx}
                  className={`flex items-center gap-2 p-2 rounded-[var(--radius-md)] text-xs ${
                    item.type === 'err'  ? 'bg-[var(--danger-light)]'  :
                    item.type === 'warn' ? 'bg-[var(--warning-light)]' : 'bg-[var(--success-light)]'
                  }`}
                >
                  {item.type === 'err'  && <XCircle       size={14} className="text-[var(--danger)]  shrink-0" aria-hidden="true" />}
                  {item.type === 'warn' && <AlertTriangle  size={14} className="text-[var(--warning)] shrink-0" aria-hidden="true" />}
                  {item.type === 'ok'   && <CheckCircle    size={14} className="text-[var(--success)] shrink-0" aria-hidden="true" />}
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── 일정 탭 ───────────────────────────────────────────────── */}
        {activeTab === 'calendar' && (
          <div role="tabpanel" id="panel-calendar" aria-labelledby="tab-calendar">
            <div className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide mb-2 flex items-center gap-1">
              <Calendar size={12} aria-hidden="true" />
              급여 일정 (4월)
            </div>
            <ul className="flex flex-col" role="list">
              {SCHEDULE_ITEMS.map((item, idx) => (
                <li
                  key={idx}
                  className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0 text-xs"
                >
                  <span className="text-[var(--foreground)]">{item.label}</span>
                  <Badge
                    color={
                      item.status === 'done'     ? 'green' :
                      item.status === 'upcoming' ? 'yellow' : 'gray'
                    }
                  >
                    {item.date} {item.status === 'done' ? '완료' : '예정'}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </aside>
  );
}
