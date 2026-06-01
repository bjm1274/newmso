'use client';

/**
 * MemberWorkcenter — 직원 프로필 드로어 (우측)
 *
 * - 직원 헤더 (이름·부서·직급·고용)
 * - 인사 이력 타임라인 (`인사이력타임라인.tsx` 재사용)
 * - 빠른 액션 (서류보관함 진입)
 *
 * JM2: 타임라인 컴포넌트는 lazy mount (선택된 직원이 있을 때만 로드)
 * JM6: role="dialog" + aria-labelledby + 닫기 버튼 키보드 접근
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import {
  formatJoinDate,
  formatTenure,
  pickHireDate,
  pickToneForStaff,
} from './data';
import { computeLicenseStatus } from '@/lib/license-renewal-policy';

const StaffHistoryTimeline = dynamic(
  () => import('../../인사관리서브/인사이력타임라인'),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-6 text-center text-[12px] text-[var(--toss-gray-4)]">
        인사 이력을 불러오는 중…
      </div>
    ),
  },
);

const TONE_BG: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  warn: 'bg-amber-500/15 text-amber-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

interface StaffDrawerProps {
  staff: StaffMember | null;
  onClose?: () => void;
  onOpenDocumentRepoForStaff?: (staff: StaffMember) => void;
  onEditStaff?: (staff: StaffMember) => void;
  canRegisterNewStaff?: boolean;
}

export default function StaffDrawer({
  staff,
  onClose,
  onOpenDocumentRepoForStaff,
  onEditStaff,
  canRegisterNewStaff = false,
}: StaffDrawerProps) {
  if (!staff) {
    return (
      <aside className="app-card flex h-full items-center justify-center px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
        좌측에서 직원을 선택하면<br />상세 프로필이 표시됩니다.
      </aside>
    );
  }
  return (
    <StaffDrawerInner
      staff={staff}
      onClose={onClose}
      onOpenDocumentRepoForStaff={onOpenDocumentRepoForStaff}
      onEditStaff={onEditStaff}
      canRegisterNewStaff={canRegisterNewStaff}
    />
  );
}

function StaffDrawerInner({
  staff,
  onClose,
  onOpenDocumentRepoForStaff,
  onEditStaff,
  canRegisterNewStaff,
}: {
  staff: StaffMember;
  onClose?: () => void;
  onOpenDocumentRepoForStaff?: (staff: StaffMember) => void;
  onEditStaff?: (staff: StaffMember) => void;
  canRegisterNewStaff?: boolean;
}) {
  const tone = pickToneForStaff(staff.name ?? '');
  const hire = pickHireDate(staff);
  const initial = (staff.name ?? '?').charAt(0);

  const labelId = useMemo(() => `member-drawer-title-${staff.id}`, [staff.id]);
  const status = staff.status ?? '재직';
  const employ = (() => {
    const raw = (staff as Record<string, unknown>).employ_type;
    return typeof raw === 'string' ? raw : '정규직';
  })();
  const licenseSummary = (() => {
    const raw = (staff as Record<string, unknown>).license_name;
    return typeof raw === 'string' ? raw : null;
  })();

  return (
    <aside
      role="dialog"
      aria-labelledby={labelId}
      className="app-card flex h-full min-h-0 flex-col overflow-hidden"
    >
      <header className="flex items-start gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-[20px] font-bold ${TONE_BG[tone]}`}
          aria-hidden="true"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={labelId} className="truncate text-[15px] font-bold text-[var(--foreground)]">
            {staff.name}
            {staff.employee_no && (
              <span className="ml-2 text-[11px] font-medium text-[var(--toss-gray-4)]">
                · {staff.employee_no}
              </span>
            )}
          </h3>
          <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--toss-gray-4)]">
            {staff.department || '부서 미지정'} · {staff.position || '직급 미지정'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip tone={status === '퇴사' ? 'warn' : 'success'}>{status}</Chip>
            <Chip tone="accent">{employ}</Chip>
            {licenseSummary && <Chip tone="muted">{licenseSummary}</Chip>}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="프로필 닫기"
            className="rounded-[var(--radius-md)] p-1 text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3 md:px-4 md:py-4">
        <dl className="grid grid-cols-3 gap-3 rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-2.5">
          <MetaCell label="입사일" value={formatJoinDate(hire)} />
          <MetaCell label="근속" value={formatTenure(hire)} />
          <MetaCell label="소속" value={staff.department || '-'} />
        </dl>

        <RecentActivitySection staffId={String(staff.id)} />

        <StaffLicensesSection staffId={String(staff.id)} />

        <section>
          <div className="section-title mb-2">인사 이력 타임라인</div>
          <StaffHistoryTimeline staffId={String(staff.id)} staffName={staff.name ?? ''} />
        </section>

        {(onOpenDocumentRepoForStaff || (canRegisterNewStaff && onEditStaff)) && (
          <section>
            <div className="section-title mb-2">빠른 액션</div>
            <div className="flex flex-col gap-2">
              {canRegisterNewStaff && onEditStaff && (
                <button
                  type="button"
                  onClick={() => onEditStaff(staff)}
                  className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:bg-[var(--accent-hover)] shadow-sm"
                >
                  ✏️ 정보 수정하기
                </button>
              )}
              {onOpenDocumentRepoForStaff && (
                <button
                  type="button"
                  onClick={() => onOpenDocumentRepoForStaff(staff)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  서류보관함 열기 →
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

// ─── 최근 활동 (근태/연차/서류) — reference §781~787 ─────────────────────
interface RecentActivityState {
  attend: { label: string; meta: string; tone: ChipTone } | null;
  leave: { label: string; meta: string; tone: ChipTone } | null;
  document: { label: string; meta: string; tone: ChipTone } | null;
  loading: boolean;
}

function formatDateShort(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}`;
}

function RecentActivitySection({ staffId }: { staffId: string }) {
  const [state, setState] = useState<RecentActivityState>({
    attend: null,
    leave: null,
    document: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setState((prev) => ({ ...prev, loading: true }));
      // JM3: 각 도메인은 독립 try, 한 곳이 실패해도 나머지 표시
      const safeQuery = async (p: any) => {
        try {
          const { data } = await p;
          return data ?? null;
        } catch {
          return null;
        }
      };
      const cleanStaffId = String(staffId || '').toLowerCase().trim();
      const [att, lv, doc] = await Promise.all([
        safeQuery(
          supabase
            .from('attendances')
            .select('work_date, status, check_in_time')
            .eq('staff_id', cleanStaffId)
            .order('work_date', { ascending: false })
            .limit(1)
            .maybeSingle() as unknown as PromiseLike<{
              data: { work_date?: string; status?: string; check_in_time?: string } | null;
              error: unknown;
            }>,
        ),
        safeQuery(
          supabase
            .from('leave_requests')
            .select('start_date, end_date, leave_type, status, created_at')
            .eq('staff_id', cleanStaffId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle() as unknown as PromiseLike<{
              data: {
                start_date?: string;
                end_date?: string;
                leave_type?: string;
                status?: string;
                created_at?: string;
              } | null;
              error: unknown;
            }>,
        ),
        safeQuery(
          supabase
            .from('document_repository')
            .select('category, file_url, created_at, updated_at')
            .eq('created_by', cleanStaffId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle() as unknown as PromiseLike<{
              data: {
                category?: string;
                file_url?: string;
                created_at?: string;
                updated_at?: string;
              } | null;
              error: unknown;
            }>,
        ),
      ]);
      if (cancelled) return;

      const attendDisplay = att
        ? {
            label: '근태',
            meta:
              `${formatDateShort(att.work_date)} · ${att.status || '기록'}` +
              (att.check_in_time ? ` · ${String(att.check_in_time).slice(0, 5)}` : ''),
            tone: (att.status === '지각' ? 'warn' : att.status === '결근' ? 'warn' : 'success') as ChipTone,
          }
        : null;

      const leaveDisplay = lv
        ? {
            label: '연차',
            meta:
              `${lv.leave_type || '연차'} · ${formatDateShort(lv.start_date)}` +
              (lv.end_date && lv.end_date !== lv.start_date ? `~${formatDateShort(lv.end_date)}` : '') +
              ` · ${lv.status || '신청'}`,
            tone: (lv.status === '반려' ? 'warn' : lv.status === '승인' ? 'success' : 'accent') as ChipTone,
          }
        : null;

      const docDisplay = doc
        ? {
            label: '서류',
            meta:
              `${doc.category || '문서'} · ${formatDateShort(doc.updated_at ?? doc.created_at)}` +
              (doc.file_url ? ' · 제출완료' : ' · 미제출'),
            tone: (doc.file_url ? 'success' : 'muted') as ChipTone,
          }
        : null;

      setState({
        attend: attendDisplay,
        leave: leaveDisplay,
        document: docDisplay,
        loading: false,
      });
    };

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const items = [state.attend, state.leave, state.document].filter(Boolean) as Array<
    NonNullable<RecentActivityState['attend']>
  >;

  return (
    <section>
      <div className="section-title mb-2">최근 활동</div>
      {state.loading ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          최근 활동을 불러오는 중…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          최근 활동 기록이 없습니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((row) => (
            <li
              key={row.label}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5"
            >
              <Chip tone={row.tone}>{row.label}</Chip>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--foreground)]">
                {row.meta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface StaffLicense {
  id: string;
  license_type: string | null;
  license_name: string;
  license_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  renewed_date: string | null;
  issuing_body: string | null;
  memo: string | null;
}

const LICENSE_STATUS_COLORS: Record<string, string> = {
  valid: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  expiring: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  expired: 'bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
  unknown: 'bg-gray-500/15 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400',
};

const LICENSE_STATUS_LABELS: Record<string, string> = {
  valid: '유효',
  expiring: '만료 임박',
  expired: '만료',
  unknown: '확인 필요',
};

function StaffLicensesSection({ staffId }: { staffId: string }) {
  const [licenses, setLicenses] = useState<StaffLicense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchLicenses = async () => {
      setLoading(true);
      const cleanStaffId = String(staffId || '').toLowerCase().trim();
      try {
        const { data, error } = await supabase
          .from('staff_licenses')
          .select('*')
          .eq('staff_id', cleanStaffId)
          .order('expiry_date', { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          setLicenses((data as StaffLicense[]) ?? []);
        }
      } catch (err) {
        console.error('[StaffLicensesSection] failed to fetch licenses:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchLicenses();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (loading) {
    return (
      <section>
        <div className="section-title mb-2">면허 및 자격 정보</div>
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          면허 및 자격 정보를 불러오는 중…
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="section-title mb-2">면허 및 자격 정보</div>
      {licenses.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          등록된 면허/자격 정보가 없습니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {licenses.map((lic) => {
            const computed = computeLicenseStatus({
              license_type: lic.license_type,
              expiry_date: lic.expiry_date,
              renewed_date: lic.renewed_date,
              issued_date: lic.issued_date,
            });
            const statusLabel = LICENSE_STATUS_LABELS[computed.status] || '확인 필요';
            const statusColor = LICENSE_STATUS_COLORS[computed.status] || 'bg-gray-500/15 text-gray-700';

            return (
              <li
                key={lic.id}
                className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[var(--foreground)]">
                    {lic.license_name}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
                {lic.license_number && (
                  <div className="text-[11px] font-medium text-[var(--toss-gray-4)]">
                    면허번호:{' '}
                    <span className="font-semibold text-[var(--foreground)]">
                      {lic.license_number}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-2 text-[10px] text-[var(--toss-gray-4)] border-t border-[var(--border)] pt-1.5 mt-0.5">
                  {lic.issued_date && <span>발급: {lic.issued_date}</span>}
                  {lic.renewed_date && <span>· 갱신: {lic.renewed_date}</span>}
                  {computed.effective.date && (
                    <span className="font-semibold text-[var(--foreground)]">
                      · 만료: {computed.effective.date}
                    </span>
                  )}
                  {lic.issuing_body && <span>· {lic.issuing_body}</span>}
                </div>
                {lic.memo && (
                  <div className="text-[10px] italic text-[var(--toss-gray-4)] bg-[var(--muted)]/50 px-2 py-1 rounded-[var(--radius-sm)] mt-1">
                    {lic.memo}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12px] font-semibold text-[var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}

type ChipTone = 'success' | 'warn' | 'accent' | 'muted';
const CHIP_CLS: Record<ChipTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  warn: 'bg-amber-500/15 text-amber-700',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};
function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP_CLS[tone]}`}>
      {children}
    </span>
  );
}
