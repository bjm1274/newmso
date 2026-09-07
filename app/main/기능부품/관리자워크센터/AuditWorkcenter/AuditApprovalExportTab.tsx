'use client';

/**
 * 감사 워크센터 — 전자결재 결재함 백업 및 파일 내려받기 탭
 *
 * 주요 기능:
 * 1. 전자결재 결재함 전체 자료 조회 (기간, 양식, 결재상태, 키워드 필터링)
 * 2. 테넌트 격리 준수 (일반 관리자는 본인 회사 데이터만 노출, 마스터는 전사 선택 가능)
 * 3. 엑셀 내려받기 (.xlsx): SheetJS 기반 실무 결재 분석/보관용 정형 시트
 * 4. JSON 원본 내려받기 (.json): 감사 및 재해복구(DR)용 완전한 메타데이터 보존 파일
 * 5. 다운로드 시 감사 로그(audit_logs) 자동 기록
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, FileCode, Search, RefreshCw, CheckSquare, Square, Filter } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import type { ChipTone } from '../admin-types';

export interface ApprovalAuditRow {
  id: string;
  doc_number: string | null;
  title: string;
  content: string | null;
  type: string | null;
  doc_type: string | null;
  status: string | null;
  sender_id: string | null;
  sender_name: string | null;
  sender_department: string | null;
  sender_company: string | null;
  company_id: string | null;
  current_approver_id: string | null;
  approver_line: string | null;
  approval_line: string | null;
  meta_data: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AuditApprovalExportTabProps {
  user?: unknown;
}

const STATUS_OPTIONS = ['전체', '대기', '승인', '반려', '회수'] as const;

const FORM_TYPE_OPTIONS = [
  '전체',
  '업무기안',
  '연차/휴가',
  '물품신청',
  '보고서작성',
  '공문발송',
  '연장근무',
  '수리요청서',
  '업무협조',
  '출결정정',
  '사직서',
  '증명서발급',
] as const;

function getToneForStatus(status: string | null): ChipTone {
  const s = String(status || '').trim();
  if (s.includes('승인')) return 'success';
  if (s.includes('반려')) return 'danger';
  if (s.includes('회수')) return 'muted';
  return 'warn';
}

function parseApproverLineSummary(rawLine: string | null | undefined): string {
  if (!rawLine) return '-';
  try {
    const parsed = typeof rawLine === 'string' ? JSON.parse(rawLine) : rawLine;
    if (Array.isArray(parsed)) {
      return parsed
        .map((step: Record<string, unknown>, idx: number) => {
          const name = String(step.name || step.user_name || step.staff_name || `결재자${idx + 1}`);
          const pos = step.position ? `(${step.position})` : '';
          const status = step.status ? `[${step.status}]` : '';
          return `${name}${pos}${status}`;
        })
        .join(' → ');
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(parsed);
    }
  } catch {
    // raw string 폴백
  }
  return String(rawLine);
}

function extractContentSummary(content: string | null, metaData: string | null): string {
  if (content && content.trim()) {
    // HTML 태그 제거 및 1줄 요약
    const clean = content.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
  }
  if (metaData) {
    try {
      const meta = typeof metaData === 'string' ? JSON.parse(metaData) : metaData;
      if (meta && typeof meta === 'object') {
        if (meta.reason) return String(meta.reason);
        if (meta.description) return String(meta.description);
        if (meta.leave_type) return `[${meta.leave_type}] ${meta.start_date || ''} ~ ${meta.end_date || ''}`;
      }
    } catch {
      // 무시
    }
  }
  return '-';
}

export default function AuditApprovalExportTab({ user }: AuditApprovalExportTabProps) {
  const sessionUser = (user || {}) as Record<string, unknown>;
  const isMaster =
    sessionUser.employee_no === '9999' ||
    Boolean((sessionUser.permissions as Record<string, boolean> | undefined)?.system_master);
  const userCompany = String(sessionUser.company || '').trim();

  const [rows, setRows] = useState<ApprovalAuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // 필터 상태
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [typeFilter, setTypeFilter] = useState<string>('전체');
  const [periodPreset, setPeriodPreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [companyFilter, setCompanyFilter] = useState<string>(isMaster ? '전체' : userCompany);

  // 기간 프리셋 변경
  useEffect(() => {
    const today = new Date();
    const toStr = today.toISOString().slice(0, 10);

    if (periodPreset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (periodPreset === 'today') {
      setStartDate(toStr);
      setEndDate(toStr);
    } else if (periodPreset === 'week') {
      const prevWeek = new Date(today);
      prevWeek.setDate(prevWeek.getDate() - 7);
      setStartDate(prevWeek.toISOString().slice(0, 10));
      setEndDate(toStr);
    } else if (periodPreset === 'month') {
      const prevMonth = new Date(today);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      setStartDate(prevMonth.toISOString().slice(0, 10));
      setEndDate(toStr);
    }
  }, [periodPreset]);

  // 데이터 조회
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== '전체') params.set('status', statusFilter);
      if (typeFilter !== '전체') params.set('type', typeFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (isMaster && companyFilter && companyFilter !== '전체') {
        params.set('company', companyFilter);
      }

      const res = await fetch(`/api/admin/audit/approvals?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as { rows?: ApprovalAuditRow[] };
      const nextRows = Array.isArray(json?.rows) ? json.rows : [];
      setRows(nextRows);
      // 선택 목록 초기화
      setSelectedIds([]);
    } catch (err) {
      console.error('[AuditApprovalExportTab fetch error]:', err);
      toast('전자결재 자료를 불러오는 중 오류가 발생했습니다.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, startDate, endDate, searchQuery, isMaster, companyFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // 전체 선택 / 해제
  const handleToggleSelectAll = () => {
    if (selectedIds.length === rows.length && rows.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
    }
  };

  // 단일 선택 토글
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 다운로드 대상 데이터 확정 (선택된 항목 우선, 없으면 전체 필터링된 행)
  const targetRows = useMemo(() => {
    if (selectedIds.length > 0) {
      const idSet = new Set(selectedIds);
      return rows.filter((r) => idSet.has(r.id));
    }
    return rows;
  }, [rows, selectedIds]);

  // 엑셀 다운로드 실행
  const handleExportExcel = async () => {
    if (targetRows.length === 0) {
      toast('내려받을 전자결재 자료가 없습니다.', 'warning');
      return;
    }

    setExporting(true);
    try {
      const dataToExport = targetRows.map((r, idx) => ({
        '순번': idx + 1,
        '문서번호': r.doc_number || r.id,
        '기안일시': r.created_at ? r.created_at.slice(0, 19).replace('T', ' ') : '-',
        '소속회사': r.sender_company || '-',
        '기안부서': r.sender_department || '-',
        '기안자': r.sender_name || '-',
        '문서양식': r.type || r.doc_type || '일반',
        '제목': r.title || '제목 없음',
        '결재상태': r.status || '대기',
        '결재선': parseApproverLineSummary(r.approver_line || r.approval_line),
        '최종처리일시': r.updated_at ? r.updated_at.slice(0, 19).replace('T', ' ') : '-',
        '내용요약': extractContentSummary(r.content, r.meta_data),
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);

      // 열 너비 지정
      worksheet['!cols'] = [
        { wch: 6 },  // 순번
        { wch: 18 }, // 문서번호
        { wch: 20 }, // 기안일시
        { wch: 14 }, // 소속회사
        { wch: 14 }, // 기안부서
        { wch: 12 }, // 기안자
        { wch: 14 }, // 문서양식
        { wch: 32 }, // 제목
        { wch: 10 }, // 결재상태
        { wch: 36 }, // 결재선
        { wch: 20 }, // 최종처리일시
        { wch: 45 }, // 내용요약
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '전자결재_결재함');

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '');
      const filename = `전자결재_결재함_백업_${dateStr}_${timeStr}.xlsx`;

      XLSX.writeFile(workbook, filename);

      // 서버에 다운로드 감사 로그 기록
      await fetch('/api/admin/audit/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: targetRows.length,
          exportType: 'excel',
          filterDescription: `상태: ${statusFilter}, 양식: ${typeFilter}, 기간: ${startDate || '시작'}~${endDate || '종료'}, 검색어: ${searchQuery || '없음'}`,
        }),
      });

      toast(`${targetRows.length}건의 전자결재 자료가 엑셀로 저장되었습니다.`, 'success');
    } catch (err) {
      console.error('[Excel export error]:', err);
      toast('엑셀 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // JSON 원본 다운로드 실행
  const handleExportJson = async () => {
    if (targetRows.length === 0) {
      toast('내려받을 전자결재 자료가 없습니다.', 'warning');
      return;
    }

    setExporting(true);
    try {
      const backupPayload = {
        exported_at: new Date().toISOString(),
        exported_by: sessionUser.name || '관리자',
        total_records: targetRows.length,
        filter_meta: {
          status: statusFilter,
          type: typeFilter,
          startDate,
          endDate,
          searchQuery,
          company: isMaster ? companyFilter : userCompany,
        },
        records: targetRows,
      };

      const jsonBlob = new Blob([JSON.stringify(backupPayload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(jsonBlob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '');
      link.download = `전자결재_원본백업_${dateStr}_${timeStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // 서버 감사 로그 기록
      await fetch('/api/admin/audit/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: targetRows.length,
          exportType: 'json',
          filterDescription: `원본 백업 (상태: ${statusFilter}, 양식: ${typeFilter})`,
        }),
      });

      toast(`${targetRows.length}건의 전자결재 원본 백업 파일이 저장되었습니다.`, 'success');
    } catch (err) {
      console.error('[JSON export error]:', err);
      toast('JSON 백업 파일 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // KPI 집계
  const stats = useMemo(() => {
    const total = rows.length;
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    for (const r of rows) {
      const s = String(r.status || '');
      if (s.includes('승인')) approved++;
      else if (s.includes('반려')) rejected++;
      else pending++;
    }
    return { total, approved, pending, rejected };
  }, [rows]);

  return (
    <div className="space-y-3">
      {/* 상단 KPI 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-center">
          <div className="text-[10.5px] font-bold text-[var(--toss-gray-4)]">조회된 결재 문서</div>
          <div className="text-xl font-extrabold text-[var(--foreground)] mt-0.5">{stats.total.toLocaleString()}건</div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-center">
          <div className="text-[10.5px] font-bold text-emerald-600">승인 완료</div>
          <div className="text-xl font-extrabold text-emerald-600 mt-0.5">{stats.approved.toLocaleString()}건</div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-center">
          <div className="text-[10.5px] font-bold text-amber-600">결재 대기/진행</div>
          <div className="text-xl font-extrabold text-amber-600 mt-0.5">{stats.pending.toLocaleString()}건</div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-center">
          <div className="text-[10.5px] font-bold text-red-600">반려/회수</div>
          <div className="text-xl font-extrabold text-red-600 mt-0.5">{stats.rejected.toLocaleString()}건</div>
        </div>
      </div>

      {/* 필터 컨트롤 카드 */}
      <Card title="검색 및 필터 조건" action={
        <SmBtn onClick={() => void fetchData()} ariaLabel="새로고침">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </SmBtn>
      }>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[12px]">
          {/* 상태 필터 */}
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1">결재 상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-8 px-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[12px] font-medium text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
              aria-label="결재 상태 선택"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* 양식 필터 */}
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1">문서 양식</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full h-8 px-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[12px] font-medium text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
              aria-label="문서 양식 선택"
            >
              {FORM_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* 기간 프리셋 */}
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1">기안 기간</label>
            <div className="flex gap-1">
              {(['today', 'week', 'month', 'all'] as const).map((p) => {
                const labels = { today: '오늘', week: '1주', month: '1개월', all: '전체' };
                const active = periodPreset === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodPreset(p)}
                    className={`flex-1 h-8 rounded-[var(--radius-md)] text-[11px] font-bold border transition-colors ${
                      active
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                        : 'bg-[var(--card)] text-[var(--toss-gray-4)] border-[var(--border)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 검색어 */}
          <div>
            <label className="block text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1">통합 검색</label>
            <div className="relative">
              <input
                type="text"
                placeholder="제목, 기안자, 문서번호…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void fetchData(); }}
                className="w-full h-8 pl-8 pr-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[12px] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] focus:outline-none focus:border-[var(--accent)]"
                aria-label="통합 검색어 입력"
              />
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--toss-gray-3)] pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 날짜 직접 입력 (필요시) 및 회사 필터 */}
        <div className="mt-2.5 pt-2.5 border-t border-[var(--border)]/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-[var(--toss-gray-4)] font-bold">일자 지정:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="h-7 px-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[11px]"
              aria-label="시작 일자"
            />
            <span className="text-[var(--toss-gray-4)]">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="h-7 px-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] text-[11px]"
              aria-label="종료 일자"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[var(--toss-gray-4)] font-bold">테넌트:</span>
            {isMaster ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700">
                시스템마스터 (전사 조회 가능)
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-700">
                {userCompany || '본인 회사'} (데이터 격리 적용)
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* 다운로드 액션 바 & 목록 */}
      <Card
        title={`전자결재 문서 목록 (${rows.length.toLocaleString()}건${selectedIds.length > 0 ? ` · ${selectedIds.length}건 선택` : ''})`}
        action={
          <div className="flex items-center gap-1.5">
            {/* 엑셀 내려받기 버튼 */}
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={exporting || rows.length === 0}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-md)] bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm disabled:opacity-50 transition-colors"
              aria-label="엑셀 파일 내려받기"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{selectedIds.length > 0 ? `선택 항목 엑셀 (${selectedIds.length})` : '엑셀 내려받기 (.xlsx)'}</span>
            </button>

            {/* JSON 원본 백업 버튼 */}
            <button
              type="button"
              onClick={() => void handleExportJson()}
              disabled={exporting || rows.length === 0}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--foreground)] text-[11px] font-bold shadow-sm disabled:opacity-50 transition-colors"
              aria-label="JSON 백업 파일 내려받기"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>JSON 백업</span>
            </button>
          </div>
        }
        className="p-0 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" aria-label="전자결재 결재함 백업 목록">
            <thead>
              <tr className="text-left text-[10.5px] font-bold text-[var(--toss-gray-4)] border-b border-[var(--border)] bg-[var(--muted)]/40">
                <th scope="col" className="w-10 px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    aria-label="전체 선택 토글"
                    className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)]"
                  >
                    {selectedIds.length > 0 && selectedIds.length === rows.length ? (
                      <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th scope="col" className="w-12 px-2 py-2">No</th>
                <th scope="col" className="px-2 py-2">문서번호</th>
                <th scope="col" className="px-2 py-2">기안일시</th>
                <th scope="col" className="px-2 py-2">소속 / 기안자</th>
                <th scope="col" className="px-2 py-2">양식</th>
                <th scope="col" className="px-3 py-2">문서 제목</th>
                <th scope="col" className="px-2 py-2">상태</th>
                <th scope="col" className="px-2 py-2">결재선 요약</th>
                <th scope="col" className="px-2 py-2">내용 요약</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-[var(--toss-gray-4)]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
                      <span>전자결재 데이터를 불러오는 중입니다…</span>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-[var(--toss-gray-4)]">
                    조건에 해당하는 전자결재 결재함 문서가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const isChecked = selectedIds.includes(row.id);
                  const tone = getToneForStatus(row.status);
                  const lineSummary = parseApproverLineSummary(row.approver_line || row.approval_line);
                  const contentSummary = extractContentSummary(row.content, row.meta_data);

                  return (
                    <tr
                      key={row.id}
                      onClick={() => handleToggleSelect(row.id)}
                      className={`border-b border-[var(--border)]/60 cursor-pointer transition-colors ${
                        isChecked ? 'bg-[var(--accent-soft)]/20' : 'hover:bg-[var(--muted)]/40'
                      }`}
                    >
                      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(row.id)}
                          aria-label={`행 선택 (${row.title})`}
                          className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)]"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-2 py-2 tabular-nums text-[10.5px] text-[var(--toss-gray-4)]">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-2 font-mono text-[10.5px] text-[var(--toss-gray-4)] truncate max-w-[110px]">
                        {row.doc_number || row.id.slice(0, 8)}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-[10.5px] text-[var(--toss-gray-4)] whitespace-nowrap">
                        {row.created_at ? row.created_at.slice(0, 10) : '-'}
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-bold text-[11px] text-[var(--foreground)]">{row.sender_name || '미지정'}</div>
                        <div className="text-[10px] text-[var(--toss-gray-4)] truncate max-w-[100px]">
                          {[row.sender_company, row.sender_department].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-700 border border-blue-200/50">
                          {row.type || row.doc_type || '일반'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-[12px] text-[var(--foreground)] max-w-[220px]">
                        <div className="truncate" title={row.title}>{row.title}</div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Chip tone={tone}>{row.status || '대기'}</Chip>
                      </td>
                      <td className="px-2 py-2 text-[10.5px] text-[var(--toss-gray-4)] max-w-[180px]">
                        <div className="truncate" title={lineSummary}>{lineSummary}</div>
                      </td>
                      <td className="px-2 py-2 text-[10.5px] text-[var(--toss-gray-4)] max-w-[200px]">
                        <div className="truncate" title={contentSummary}>{contentSummary}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
