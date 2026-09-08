'use client';

/**
 * MemberWorkcenter — 직원 표 (좌측 패널) - PC 개선 버전
 *
 * - 다중 체크박스 선택 (일괄 액션용)
 * - 컬럼별 정렬 (이름, 부서, 직급, 입사일, 근속, 고용형태)
 * - PC용 통합 드롭다운 필터 (부서, 고용형태)
 * - 엑셀 다운로드 기능
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import {
  aggregateDepartments,
  formatJoinDate,
  formatTenure,
  isActive,
  pickHireDate,
  pickToneForStaff,
  type DepartmentCount } from './data';

const TONE_BG: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  warn: 'bg-amber-500/15 text-amber-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]' };

const EMPLOY_CHIP: Record<string, string> = {
  정규직: 'bg-emerald-500/15 text-emerald-700',
  계약직: 'bg-amber-500/15 text-amber-700',
  수습: 'bg-[var(--accent-soft)] text-[var(--accent)]' };

export const COMPANY_BADGE_STYLE: Record<string, { bg: string; text: string; label?: string }> = {
  'SY INC.': {
    bg: 'bg-indigo-500/15 dark:bg-indigo-950/40 border border-indigo-500/30',
    text: 'text-indigo-600 dark:text-indigo-400',
    label: 'SY INC.',
  },
  '박철홍정형외과': {
    bg: 'bg-sky-500/15 dark:bg-sky-950/40 border border-sky-500/30',
    text: 'text-sky-700 dark:text-sky-300',
    label: '박철홍정형외과',
  },
  '수연의원': {
    bg: 'bg-emerald-500/15 dark:bg-emerald-950/40 border border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    label: '수연의원',
  },
};

export function getCompanyBadge(company?: string | null) {
  const name = (company || '').trim();
  if (!name) return null;
  return COMPANY_BADGE_STYLE[name] || {
    bg: 'bg-zinc-500/15 dark:bg-zinc-800 border border-zinc-500/30',
    text: 'text-zinc-700 dark:text-zinc-300',
    label: name,
  };
}

interface StaffTableProps {
  staffs: StaffMember[];
  selectedId: string | null;
  onSelect: (staff: StaffMember) => void;
  onDoubleClick?: (staff: StaffMember) => void;
  onOpenNewStaff?: () => void;
  canRegisterNewStaff?: boolean;
  statusFilter?: '재직' | '퇴사';
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  selectedCo?: string;
  onCompanyChange?: (company: string) => void;
  companies?: string[];
}

type SortKey = 'name' | 'company' | 'department' | 'position' | 'joined_at' | 'employment_type';

function StaffTableBase({
  staffs,
  selectedId,
  onSelect,
  onDoubleClick,
  onOpenNewStaff,
  canRegisterNewStaff = false,
  statusFilter = '재직',
  selectedIds,
  onSelectIds,
  selectedCo,
  onCompanyChange,
  companies }: StaffTableProps) {
  const [currentCompany, setCurrentCompany] = useState<string>(selectedCo || '전체');
  const [deptFilter, setDeptFilter] = useState<string>('전체');
  const [employFilter, setEmployFilter] = useState<string>('전체');
  const [query, setQuery] = useState('');

  // 정렬 상태
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (selectedCo) {
      setCurrentCompany(selectedCo);
    }
  }, [selectedCo]);

  const handleCompanySelect = (co: string) => {
    setCurrentCompany(co);
    onCompanyChange?.(co);
  };

  const filteredByStatus = useMemo(() => {
    return staffs.filter((staff) => {
      const active = isActive(staff);
      if (statusFilter === '퇴사') {
        return !active;
      }
      return active;
    });
  }, [staffs, statusFilter]);

  // 회사 목록
  const availableCompanies = useMemo(() => {
    if (companies && companies.length > 0) return companies;
    const set = new Set<string>(['전체']);
    filteredByStatus.forEach((s) => {
      const co = (s as Record<string, unknown>)?.company;
      if (typeof co === 'string' && co.trim()) set.add(co.trim());
    });
    set.add('SY INC.');
    return Array.from(set);
  }, [companies, filteredByStatus]);

  // 부서 목록
  const departments = useMemo(() => aggregateDepartments(filteredByStatus), [filteredByStatus]);

  // 필터링 처리
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return filteredByStatus.filter((staff) => {
      // 회사 필터
      if (currentCompany !== '전체') {
        const co = String((staff as Record<string, unknown>)?.company ?? '').trim();
        if (co !== currentCompany.trim()) return false;
      }
      // 부서 필터
      if (deptFilter !== '전체') {
        const dept = (staff.department ?? '').trim() || '미지정';
        if (dept !== deptFilter) return false;
      }
      // 고용형태 필터
      if (employFilter !== '전체') {
        const empType = ((staff as any).employment_type ?? '정규직').trim();
        if (empType !== employFilter) return false;
      }
      // 검색어 필터
      if (!trimmed) return true;
      const name = (staff.name ?? '').toLowerCase();
      const empNo = (staff.employee_no ?? '').toLowerCase();
      const position = (staff.position ?? '').toLowerCase();
      const company = (staff.company ?? '').toLowerCase();
      return (
        name.includes(trimmed) ||
        empNo.includes(trimmed) ||
        position.includes(trimmed) ||
        company.includes(trimmed)
      );
    });
  }, [filteredByStatus, currentCompany, deptFilter, employFilter, query]);

  // 정렬 처리
  const sortedAndFiltered = useMemo(() => {
    const list = [...filtered];
    if (!sortKey) {
      // 기본 정렬: 사번 숫자 오름차순 (1, 2, 3...)
      return list.sort((a, b) => {
        const noA = Number(a.employee_no) || 999999;
        const noB = Number(b.employee_no) || 999999;
        if (noA !== noB) return noA - noB;
        return (a.name || '').localeCompare(b.name || '', 'ko');
      });
    }

    list.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortKey === 'joined_at') {
        valA = new Date(pickHireDate(a) ?? '').getTime();
        valB = new Date(pickHireDate(b) ?? '').getTime();
      } else if (sortKey === 'employment_type') {
        valA = (a as any).employment_type || '정규직';
        valB = (b as any).employment_type || '정규직';
      } else if (sortKey === 'company') {
        valA = a.company || '';
        valB = b.company || '';
      } else {
        valA = a[sortKey] || '';
        valB = b[sortKey] || '';
      }

      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB, 'ko')
          : valB.localeCompare(valA, 'ko');
      } else {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
    });

    return list;
  }, [filtered, sortKey, sortOrder]);

  // 전체 선택 토글
  const handleAllCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = sortedAndFiltered.map((s) => String(s.id));
      onSelectIds(allIds);
    } else {
      onSelectIds([]);
    }
  };

  // 개별 선택 토글
  const handleSingleCheck = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    e.stopPropagation();
    if (e.target.checked) {
      onSelectIds([...selectedIds, id]);
    } else {
      onSelectIds(selectedIds.filter((x) => x !== id));
    }
  };

  // 정렬 키 셋팅
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // 엑셀 다운로드
  const handleExcelDownload = () => {
    const dataToExport = sortedAndFiltered.map((staff, idx) => ({
      'No': idx + 1,
      '회사': staff.company || '',
      '이름': staff.name || '',
      '사번': staff.employee_no || '',
      '부서': staff.department || '',
      '직급': staff.position || '',
      '입사일': formatJoinDate(pickHireDate(staff)),
      '근속': formatTenure(pickHireDate(staff)),
      '고용형태': (staff as any).employment_type || '정규직',
      '상태': staff.status || '재직',
      '전화번호': staff.phone || '',
      '내선번호': (staff as any).extension || '',
      '이메일': staff.email || '',
      '주소': staff.address || '' }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '구성원명부');
    XLSX.writeFile(workbook, `구성원명부_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const isAllChecked =
    sortedAndFiltered.length > 0 &&
    sortedAndFiltered.every((s) => selectedIds.includes(String(s.id)));

  return (
    <div className="app-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-col gap-2.5 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5 md:px-4 md:py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-[var(--foreground)]">구성원 목록</h3>
            <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
              {sortedAndFiltered.length}명
            </span>
            {selectedIds.length > 0 && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                {selectedIds.length}명 선택됨
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExcelDownload}
              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="엑셀 다운로드"
            >
              <Download size={13} />
              <span>엑셀 다운로드</span>
            </button>
            {canRegisterNewStaff && onOpenNewStaff && (
              <button
                type="button"
                data-testid="new-staff-button"
                onClick={onOpenNewStaff}
                className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
                aria-label="신규 직원 등록"
              >
                <span>＋ 신규 등록</span>
              </button>
            )}
          </div>
        </div>

        {/* 상단 통합 필터 및 검색 바 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)] shrink-0 min-w-[28px]">회사</span>
            <select
              value={currentCompany}
              onChange={(e) => handleCompanySelect(e.target.value)}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              {availableCompanies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)] shrink-0 min-w-[28px]">부서</span>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              <option value="전체">전체 부서 ({filteredByStatus.length}명)</option>
              {departments.map((d: DepartmentCount) => (
                <option key={d.key} value={d.key}>
                  {d.label} ({d.count}명)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)] shrink-0 min-w-[28px]">고용</span>
            <select
              value={employFilter}
              onChange={(e) => setEmployFilter(e.target.value)}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              <option value="전체">전체 고용형태</option>
              <option value="정규직">정규직</option>
              <option value="계약직">계약직</option>
              <option value="수습">수습</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·사번·직급·회사 검색..."
              aria-label="직원 검색"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {sortedAndFiltered.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
            조건에 맞는 직원이 없습니다.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--card)] shadow-[0_1px_0_0_var(--border)]">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
                <th scope="col" className="w-8 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={isAllChecked}
                    onChange={handleAllCheck}
                    aria-label="직원 전체 선택"
                    className="cursor-pointer"
                  />
                </th>
                <th scope="col" className="w-9 px-2 py-2 text-left"></th>
                <th
                  scope="col"
                  onClick={() => handleSort('name')}
                  className="cursor-pointer px-2 py-2 text-left hover:text-[var(--foreground)] select-none"
                >
                  이름 {sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('company')}
                  className="cursor-pointer px-2 py-2 text-left hover:text-[var(--foreground)] select-none"
                >
                  회사 {sortKey === 'company' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('department')}
                  className="cursor-pointer px-2 py-2 text-left hover:text-[var(--foreground)] select-none"
                >
                  부서 {sortKey === 'department' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('position')}
                  className="cursor-pointer px-2 py-2 text-left hover:text-[var(--foreground)] select-none"
                >
                  직급 {sortKey === 'position' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('joined_at')}
                  className="cursor-pointer px-2 py-2 text-left hover:text-[var(--foreground)] select-none"
                >
                  입사일 {sortKey === 'joined_at' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th scope="col" className="px-2 py-2 text-left">근속</th>
                <th
                  scope="col"
                  onClick={() => handleSort('employment_type')}
                  className="cursor-pointer px-2 py-2 text-left hover:text-[var(--foreground)] select-none"
                >
                  고용 {sortKey === 'employment_type' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFiltered.map((staff) => (
                <StaffRow
                  key={String(staff.id)}
                  staff={staff}
                  selected={selectedId === String(staff.id)}
                  isChecked={selectedIds.includes(String(staff.id))}
                  onCheckChange={(e) => handleSingleCheck(e, String(staff.id))}
                  onSelect={onSelect}
                  onDoubleClick={onDoubleClick}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface StaffRowProps {
  staff: StaffMember;
  selected: boolean;
  isChecked: boolean;
  onCheckChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelect: (staff: StaffMember) => void;
  onDoubleClick?: (staff: StaffMember) => void;
}

const StaffRow = memo(function StaffRow({
  staff,
  selected,
  isChecked,
  onCheckChange,
  onSelect,
  onDoubleClick }: StaffRowProps) {
  const tone = pickToneForStaff(staff.name ?? '');
  const hire = pickHireDate(staff);
  const employ = (staff as Record<string, unknown>).employment_type;
  const employText = typeof employ === 'string' ? employ : '정규직';
  const employCls = EMPLOY_CHIP[employText] ?? 'bg-[var(--muted)] text-[var(--toss-gray-4)]';
  const initial = (staff.name ?? '?').charAt(0);
  const companyBadge = getCompanyBadge(staff.company);

  return (
    <tr
      role="row"
      aria-selected={selected}
      onClick={() => onSelect(staff)}
      onDoubleClick={onDoubleClick ? () => onDoubleClick(staff) : undefined}
      className={`cursor-pointer border-b border-[var(--border)] transition-colors ${
        selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--muted)]'
      }`}
    >
      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={onCheckChange}
          aria-label={`${staff.name} 선택`}
          className="cursor-pointer"
        />
      </td>
      <td className="px-2 py-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[11px] font-bold ${TONE_BG[tone]}`}
          aria-hidden="true"
        >
          {initial}
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="font-bold text-[var(--foreground)]">{staff.name}</div>
        {staff.employee_no && (
          <div className="text-[10px] text-[var(--toss-gray-4)]">{staff.employee_no}</div>
        )}
      </td>
      <td className="px-2 py-2">
        {companyBadge ? (
          <span
            className={`inline-flex items-center rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10px] font-bold ${companyBadge.bg} ${companyBadge.text} whitespace-nowrap`}
          >
            {companyBadge.label}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--toss-gray-3)]">-</span>
        )}
      </td>
      <td className="px-2 py-2 text-[var(--toss-gray-4)]">{staff.department || '-'}</td>
      <td className="px-2 py-2 font-semibold text-[var(--foreground)]">{staff.position || '-'}</td>
      <td className="tnum px-2 py-2 text-[var(--toss-gray-4)]">{formatJoinDate(hire)}</td>
      <td className="tnum px-2 py-2 text-[var(--toss-gray-4)]">{formatTenure(hire)}</td>
      <td className="px-2 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${employCls}`}>
          {employText}
        </span>
      </td>
    </tr>
  );
});

export default memo(StaffTableBase);
