'use client';

/**
 * OperationClient.tsx — 운영설정 4섹션 클라이언트 (#85 #86 #90 #91~92)
 *
 * 섹션: 권한 매트릭스 / 일반설정 / 팝업관리 / 결재양식
 *
 * JM : 500줄 이내
 * JM3: 스위치 낙관적 업데이트 + 실패 시 롤백
 * JM4: any 금지, union 타입
 * JM6: 확인 모달 alertdialog, 스위치 role="switch"/aria-checked
 */

import React, { useState, useId } from 'react';
import {
  PERM_ROWS, GENERAL_SETTINGS, POPUP_ITEMS, APPROVAL_FORMS,
  ROLE_LABELS, type PermRow, type PermLevel, type GeneralSetting,
  type PopupItem, type ApprovalForm,
} from '../_shared/dummy-data';

// ── 권한 셀렉트 ───────────────────────────────────────────────────────────────

const PERM_OPTIONS: { value: PermLevel; label: string }[] = [
  { value: 'none',  label: '없음'    },
  { value: 'read',  label: '읽기'    },
  { value: 'write', label: '읽기+쓰기' },
];

function PermBadge({ level }: { level: PermLevel }) {
  const cls =
    level === 'write' ? 'badge-blue'
    : level === 'read'  ? 'badge-green'
    : 'badge-gray';
  return <span className={`badge text-xs ${cls}`}>{PERM_OPTIONS.find((o) => o.value === level)?.label ?? level}</span>;
}

// ── 섹션 1: 권한 매트릭스 (#85) ───────────────────────────────────────────────

function PermissionMatrix() {
  const [rows, setRows]      = useState<PermRow[]>(PERM_ROWS);
  const [confirm, setConfirm] = useState<{ rowId: string; field: keyof PermRow; next: PermLevel } | null>(null);
  const id = useId();

  const applyChange = () => {
    if (!confirm) return;
    setRows((prev) =>
      prev.map((r) =>
        r.employeeId === confirm.rowId ? { ...r, [confirm.field]: confirm.next } : r,
      ),
    );
    setConfirm(null);
  };

  const PERM_FIELDS: { field: keyof PermRow; label: string }[] = [
    { field: 'permCompany', label: '회사정보' },
    { field: 'permHR',      label: '인사'     },
    { field: 'permOps',     label: '운영'     },
    { field: 'permMgmt',    label: '경영'     },
  ];

  return (
    <section aria-labelledby="perm-heading">
      <h2 id="perm-heading" className="section-title mb-3">직원 권한 매트릭스 #85</h2>
      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm" aria-label="직원 권한 매트릭스">
          <thead className="bg-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">직원</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">역할</th>
              {PERM_FIELDS.map((pf) => (
                <th key={pf.field} className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">{pf.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">{r.name}</td>
                <td className="px-4 py-3">
                  <span className="badge badge-gray text-xs">{ROLE_LABELS[r.role]}</span>
                </td>
                {PERM_FIELDS.map((pf) => (
                  <td key={pf.field} className="px-4 py-3">
                    <select
                      aria-label={`${r.name} ${pf.label} 권한`}
                      value={r[pf.field] as PermLevel}
                      onChange={(e) =>
                        setConfirm({
                          rowId: r.employeeId,
                          field: pf.field,
                          next: e.target.value as PermLevel,
                        })
                      }
                      className="text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 focus:outline-2 focus:outline-[var(--accent)]"
                    >
                      {PERM_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${id}-perm-title`}
          aria-describedby={`${id}-perm-desc`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="app-card max-w-sm w-full p-6 flex flex-col gap-4">
            <h3 id={`${id}-perm-title`} className="text-base font-bold text-[var(--foreground)]">권한 변경 확인</h3>
            <p id={`${id}-perm-desc`} className="text-sm text-[var(--toss-gray-4)]">
              즉시 전 직원에게 적용됩니다. 계속하시겠습니까?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="btn-ghost text-sm px-4 py-2 rounded-[var(--radius-md)]">취소</button>
              <button onClick={applyChange} className="btn-accent text-sm px-4 py-2 rounded-[var(--radius-md)]">적용</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── 섹션 2: 일반설정 (#86) ────────────────────────────────────────────────────

function GeneralSettingsSection() {
  const [settings, setSettings] = useState<GeneralSetting[]>(GENERAL_SETTINGS);

  // JM3: 낙관적 업데이트 + 실패 시 롤백
  const toggle = (key: string) => {
    const prev = settings;
    setSettings((s) => s.map((item) => item.key === key ? { ...item, enabled: !item.enabled } : item));
    // 더미: 항상 성공, 실제에서는 API 호출 후 실패 시 setSettings(prev)
    void prev;
  };

  return (
    <section aria-labelledby="general-heading">
      <h2 id="general-heading" className="section-title mb-3">일반설정 #86</h2>
      <div className="app-card divide-y divide-[var(--border)]">
        {settings.map((s) => (
          <div key={s.key} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{s.label}</p>
              <p className="text-xs text-[var(--toss-gray-4)]">{s.description}</p>
            </div>
            <button
              role="switch"
              aria-checked={s.enabled}
              aria-label={`${s.label} ${s.enabled ? '비활성화' : '활성화'}`}
              onClick={() => toggle(s.key)}
              className={[
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
                'min-h-[44px] min-w-[44px] flex items-center',
                s.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                  s.enabled ? 'translate-x-5' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 섹션 3: 팝업관리 (#90) ────────────────────────────────────────────────────

const POPUP_STATUS_LABEL: Record<PopupItem['status'], string> = {
  active:    '게시중',
  scheduled: '예정',
  expired:   '종료',
};
const POPUP_STATUS_CLASS: Record<PopupItem['status'], string> = {
  active:    'badge-green',
  scheduled: 'badge-blue',
  expired:   'badge-gray',
};

function PopupManagement() {
  const [popups, setPopups]       = useState<PopupItem[]>(POPUP_ITEMS);
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const id = useId();

  const confirmDelete = () => {
    if (deleteId) setPopups((p) => p.filter((x) => x.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <section aria-labelledby="popup-heading">
      <h2 id="popup-heading" className="section-title mb-3">팝업 관리 #90</h2>
      <div className="mb-3 flex justify-end">
        <button className="btn-accent text-xs px-3 py-1.5 rounded-[var(--radius-md)]">+ 팝업 등록</button>
      </div>
      <div className="app-card overflow-hidden">
        <table className="w-full text-sm" aria-label="팝업 목록">
          <thead className="bg-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">제목</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">기간</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">대상</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">상태</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--toss-gray-4)]">삭제</th>
            </tr>
          </thead>
          <tbody>
            {popups.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">{p.title}</td>
                <td className="px-4 py-3 text-xs text-[var(--toss-gray-4)]">{p.startDate} ~ {p.endDate}</td>
                <td className="px-4 py-3"><span className="badge badge-gray text-xs">{p.target}</span></td>
                <td className="px-4 py-3">
                  <span className={`badge text-xs ${POPUP_STATUS_CLASS[p.status]}`}>{POPUP_STATUS_LABEL[p.status]}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setDeleteId(p.id)}
                    aria-label={`"${p.title}" 팝업 삭제`}
                    className="text-xs text-red-500 hover:underline focus-visible:outline-2 focus-visible:outline-red-500 rounded"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteId && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${id}-del-title`}
          aria-describedby={`${id}-del-desc`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="app-card max-w-sm w-full p-6 flex flex-col gap-4">
            <h3 id={`${id}-del-title`} className="text-base font-bold text-[var(--foreground)]">팝업 삭제 확인</h3>
            <p id={`${id}-del-desc`} className="text-sm text-[var(--toss-gray-4)]">
              삭제한 팝업은 복구할 수 없습니다. 계속하시겠습니까?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="btn-ghost text-sm px-4 py-2 rounded-[var(--radius-md)]">취소</button>
              <button onClick={confirmDelete} className="bg-red-500 text-white text-sm px-4 py-2 rounded-[var(--radius-md)] hover:bg-red-600">삭제</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── 섹션 4: 결재양식 (#91~#92) ───────────────────────────────────────────────

function ApprovalForms() {
  const [forms] = useState<ApprovalForm[]>(APPROVAL_FORMS);

  return (
    <section aria-labelledby="approval-heading">
      <h2 id="approval-heading" className="section-title mb-3">결재양식 #91~#92</h2>
      <div className="grid gap-3 max-w-2xl">
        {forms.map((form) => (
          <article key={form.id} className="app-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">{form.name}</span>
                <span className="badge badge-blue text-xs">{form.category}</span>
              </div>
              <button
                aria-label={`${form.name} 편집`}
                className="text-xs text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded"
              >
                편집
              </button>
            </div>
            <ol className="flex items-center gap-2 flex-wrap" aria-label={`${form.name} 결재선`}>
              {form.steps.map((step, i) => (
                <React.Fragment key={step.order}>
                  <li className="flex flex-col items-center gap-0.5">
                    <span className="badge badge-gray text-xs">{step.type}</span>
                    <span className="text-xs text-[var(--toss-gray-4)]">{step.roleName}</span>
                  </li>
                  {i < form.steps.length - 1 && (
                    <span aria-hidden="true" className="text-[var(--toss-gray-4)]">→</span>
                  )}
                </React.Fragment>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── 메인 클라이언트 ────────────────────────────────────────────────────────────

export default function OperationClient() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
        <h1 className="text-lg font-bold text-[var(--foreground)]">운영설정</h1>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-10">
        <PermissionMatrix />
        <GeneralSettingsSection />
        <PopupManagement />
        <ApprovalForms />
      </main>
    </div>
  );
}
