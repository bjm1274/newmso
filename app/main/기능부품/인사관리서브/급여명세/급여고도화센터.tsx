'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TaxInsuranceRatesPanel from './세율보험요율관리';
import PayrollLockPanel from './급여월마감잠금';
import InterimSettlement from './중간정산';

type BonusItem = {
  id: string;
  staffId: string;
  companyName: string;
  yearMonth: string;
  category: string;
  amount: number;
  note: string;
};

type RetroItem = {
  id: string;
  staffId: string;
  companyName: string;
  startMonth: string;
  endMonth: string;
  beforeBase: number;
  afterBase: number;
  retroTotal: number;
  reason: string;
};

type DeductionItem = {
  id: string;
  staffId: string;
  companyName: string;
  type: string;
  monthlyAmount: number;
  balance: number;
  note: string;
  active: boolean;
};

type FreelancerItem = {
  id: string;
  companyName: string;
  yearMonth: string;
  vendorName: string;
  workType: string;
  paymentDate: string;
  supplyAmount: number;
  taxRate: number;
  withholdingTax: number;
  note: string;
};

type CalendarItem = {
  id: string;
  companyName: string;
  yearMonth: string;
  title: string;
  dueDate: string;
  owner: string;
  status: '대기' | '진행' | '완료';
  sortOrder: number;
};

type ApprovalState = {
  id?: string;
  step1Status: '대기' | '승인' | '보류';
  step2Status: '대기' | '승인' | '보류';
  step1Comment: string;
  step2Comment: string;
  step1ActorId?: string | null;
  step2ActorId?: string | null;
  step1UpdatedAt?: string | null;
  step2UpdatedAt?: string | null;
  updatedAt?: string | null;
};

type ApprovalLog = {
  id: string;
  yearMonth: string;
  company: string;
  actor: string;
  action: string;
  comment: string;
  createdAt: string;
};

const EMPTY_APPROVAL_STATE: ApprovalState = {
  step1Status: '대기',
  step2Status: '대기',
  step1Comment: '',
  step2Comment: '',
};

function getMonthDiff(startMonth: string, endMonth: string) {
  const [startYear, startM] = startMonth.split('-').map(Number);
  const [endYear, endM] = endMonth.split('-').map(Number);
  return Math.max(1, (endYear - startYear) * 12 + (endM - startM) + 1);
}

function downloadCsv(fileName: string, rows: Array<Record<string, string | number>>) {
  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
}

function readStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('erp_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildDefaultCalendarItems(yearMonth: string) {
  return [
    { title: '급여 자료 마감', dueDate: `${yearMonth}-03`, owner: '인사팀', status: '대기' as const, sortOrder: 0 },
    { title: '1차 승인', dueDate: `${yearMonth}-05`, owner: '인사책임자', status: '대기' as const, sortOrder: 1 },
    { title: '2차 승인', dueDate: `${yearMonth}-07`, owner: '대표/재무', status: '대기' as const, sortOrder: 2 },
    { title: '급여 이체', dueDate: `${yearMonth}-10`, owner: '회계팀', status: '대기' as const, sortOrder: 3 },
    { title: '홈택스/EDI 신고', dueDate: `${yearMonth}-12`, owner: '세무담당', status: '대기' as const, sortOrder: 4 },
  ];
}

function mapBonusRow(row: any): BonusItem {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    companyName: row.company_name || '전체',
    yearMonth: row.year_month || '',
    category: row.category || '상여',
    amount: Number(row.amount || 0),
    note: row.note || '',
  };
}

function mapRetroRow(row: any): RetroItem {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    companyName: row.company_name || '전체',
    startMonth: row.start_month || '',
    endMonth: row.end_month || '',
    beforeBase: Number(row.before_base || 0),
    afterBase: Number(row.after_base || 0),
    retroTotal: Number(row.retro_total || 0),
    reason: row.reason || '',
  };
}

function mapDeductionRow(row: any): DeductionItem {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    companyName: row.company_name || '전체',
    type: row.deduction_type || '가압류',
    monthlyAmount: Number(row.monthly_amount || 0),
    balance: Number(row.balance || 0),
    note: row.note || '',
    active: row.is_active !== false,
  };
}

function mapFreelancerRow(row: any): FreelancerItem {
  return {
    id: String(row.id),
    companyName: row.company_name || '전체',
    yearMonth: row.year_month || '',
    vendorName: row.vendor_name || '',
    workType: row.work_type || '',
    paymentDate: row.payment_date || '',
    supplyAmount: Number(row.supply_amount || 0),
    taxRate: Number(row.tax_rate || 0),
    withholdingTax: Number(row.withholding_tax || 0),
    note: row.note || '',
  };
}

function mapCalendarRow(row: any): CalendarItem {
  return {
    id: String(row.id),
    companyName: row.company_name || '전체',
    yearMonth: row.year_month || '',
    title: row.title || '',
    dueDate: row.due_date || '',
    owner: row.owner_label || '',
    status: row.status || '대기',
    sortOrder: Number(row.sort_order || 0),
  };
}

function mapApprovalRow(row: any): ApprovalState {
  return {
    id: String(row.id),
    step1Status: row.step1_status || '대기',
    step2Status: row.step2_status || '대기',
    step1Comment: row.step1_comment || '',
    step2Comment: row.step2_comment || '',
    step1ActorId: row.step1_actor_id || null,
    step2ActorId: row.step2_actor_id || null,
    step1UpdatedAt: row.step1_updated_at || null,
    step2UpdatedAt: row.step2_updated_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapApprovalLogRow(row: any): ApprovalLog {
  return {
    id: String(row.id),
    yearMonth: row.year_month || '',
    company: row.company_name || '전체',
    actor: row.actor_name || '관리자',
    action: row.action || '',
    comment: row.comment || '',
    createdAt: row.created_at || '',
  };
}

export default function PayrollAdvancedCenter({
  staffs = [],
  selectedCo,
  yearMonth,
  payrollRecords = [],
  onRefresh,
}: {
  staffs?: any[];
  selectedCo?: string;
  yearMonth: string;
  payrollRecords?: any[];
  onRefresh?: () => void;
}) {
  const [viewer, setViewer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [bonusItems, setBonusItems] = useState<BonusItem[]>([]);
  const [retroItems, setRetroItems] = useState<RetroItem[]>([]);
  const [deductionItems, setDeductionItems] = useState<DeductionItem[]>([]);
  const [freelancerItems, setFreelancerItems] = useState<FreelancerItem[]>([]);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [approvalState, setApprovalState] = useState<ApprovalState>(EMPTY_APPROVAL_STATE);
  const [approvalLogs, setApprovalLogs] = useState<ApprovalLog[]>([]);
  const [bonusForm, setBonusForm] = useState({ staffId: '', category: '상여', amount: 0, note: '' });
  const [retroForm, setRetroForm] = useState({ staffId: '', startMonth: yearMonth, endMonth: yearMonth, beforeBase: 0, afterBase: 0, reason: '소급 인상' });
  const [deductionForm, setDeductionForm] = useState({ staffId: '', type: '가압류', monthlyAmount: 0, balance: 0, note: '' });
  const [freelancerForm, setFreelancerForm] = useState({ vendorName: '', workType: '', paymentDate: `${yearMonth}-10`, supplyAmount: 0, taxRate: 3.3 });
  const [step1Comment, setStep1Comment] = useState('');
  const [step2Comment, setStep2Comment] = useState('');

  const companyScope = selectedCo && selectedCo.trim() ? selectedCo : '전체';
  const filteredStaffs = useMemo(
    () => (selectedCo === '전체' ? staffs : staffs.filter((staff: any) => staff.company === selectedCo)),
    [selectedCo, staffs]
  );

  useEffect(() => {
    setViewer(readStoredUser());
  }, []);

  useEffect(() => {
    setRetroForm((prev) => ({ ...prev, startMonth: yearMonth, endMonth: yearMonth }));
    setFreelancerForm((prev) => ({ ...prev, paymentDate: `${yearMonth}-10` }));
  }, [yearMonth]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let bonusQuery = supabase.from('payroll_bonus_items').select('*').eq('year_month', yearMonth).order('created_at', { ascending: false });
      let retroQuery = supabase.from('payroll_retro_adjustments').select('*').order('created_at', { ascending: false });
      let deductionQuery = supabase.from('payroll_deduction_controls').select('*').order('created_at', { ascending: false });
      let freelancerQuery = supabase.from('freelancer_payments').select('*').eq('year_month', yearMonth).order('payment_date', { ascending: false });

      if (selectedCo && selectedCo !== '전체') {
        bonusQuery = bonusQuery.eq('company_name', selectedCo);
        retroQuery = retroQuery.eq('company_name', selectedCo);
        deductionQuery = deductionQuery.eq('company_name', selectedCo);
        freelancerQuery = freelancerQuery.eq('company_name', selectedCo);
      }

      const [bonusRes, retroRes, deductionRes, freelancerRes, calendarRes, approvalRes, logRes] = await Promise.all([
        bonusQuery,
        retroQuery,
        deductionQuery,
        freelancerQuery,
        supabase.from('payroll_calendar_items').select('*').eq('company_name', companyScope).eq('year_month', yearMonth).order('sort_order', { ascending: true }),
        supabase.from('payroll_approval_workflows').select('*').eq('company_name', companyScope).eq('year_month', yearMonth).maybeSingle(),
        supabase.from('payroll_approval_logs').select('*').eq('company_name', companyScope).eq('year_month', yearMonth).order('created_at', { ascending: false }).limit(20),
      ]);

      if (bonusRes.error) throw bonusRes.error;
      if (retroRes.error) throw retroRes.error;
      if (deductionRes.error) throw deductionRes.error;
      if (freelancerRes.error) throw freelancerRes.error;
      if (calendarRes.error) throw calendarRes.error;
      if (approvalRes.error) throw approvalRes.error;
      if (logRes.error) throw logRes.error;

      setBonusItems((bonusRes.data || []).map(mapBonusRow));
      setRetroItems((retroRes.data || []).map(mapRetroRow));
      setDeductionItems((deductionRes.data || []).map(mapDeductionRow));
      setFreelancerItems((freelancerRes.data || []).map(mapFreelancerRow));
      setApprovalState(approvalRes.data ? mapApprovalRow(approvalRes.data) : EMPTY_APPROVAL_STATE);
      setApprovalLogs((logRes.data || []).map(mapApprovalLogRow));

      let nextCalendarItems = (calendarRes.data || []).map(mapCalendarRow);
      if (nextCalendarItems.length === 0) {
        const defaults = buildDefaultCalendarItems(yearMonth).map((item) => ({
          company_name: companyScope,
          year_month: yearMonth,
          title: item.title,
          due_date: item.dueDate,
          owner_label: item.owner,
          status: item.status,
          sort_order: item.sortOrder,
          created_by: viewer?.id || null,
          updated_by: viewer?.id || null,
        }));
        const { error: seedError } = await supabase.from('payroll_calendar_items').upsert(defaults, { onConflict: 'company_name,year_month,title' });
        if (seedError) throw seedError;
        const { data: seededCalendar, error: seededCalendarError } = await supabase.from('payroll_calendar_items').select('*').eq('company_name', companyScope).eq('year_month', yearMonth).order('sort_order', { ascending: true });
        if (seededCalendarError) throw seededCalendarError;
        nextCalendarItems = (seededCalendar || []).map(mapCalendarRow);
      }
      setCalendarItems(nextCalendarItems);
    } catch (error) {
      console.error('급여 고도화 데이터 로드 실패:', error);
      setBonusItems([]);
      setRetroItems([]);
      setDeductionItems([]);
      setFreelancerItems([]);
      setCalendarItems([]);
      setApprovalState(EMPTY_APPROVAL_STATE);
      setApprovalLogs([]);
    } finally {
      setLoading(false);
    }
  }, [companyScope, selectedCo, viewer?.id, yearMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setStep1Comment(approvalState.step1Comment || '');
    setStep2Comment(approvalState.step2Comment || '');
  }, [approvalState.step1Comment, approvalState.step2Comment]);

  const currentApproval = approvalState;
  const viewerName = viewer?.name || '관리자';
  const monthBonusItems = useMemo(() => bonusItems.filter((item) => item.yearMonth === yearMonth && filteredStaffs.some((staff: any) => String(staff.id) === item.staffId)), [bonusItems, filteredStaffs, yearMonth]);
  const monthRetroItems = useMemo(() => retroItems.filter((item) => filteredStaffs.some((staff: any) => String(staff.id) === item.staffId)), [filteredStaffs, retroItems]);
  const activeDeductions = useMemo(() => deductionItems.filter((item) => item.active && filteredStaffs.some((staff: any) => String(staff.id) === item.staffId)), [deductionItems, filteredStaffs]);
  const visibleFreelancers = useMemo(() => freelancerItems.filter((item) => item.yearMonth === yearMonth), [freelancerItems, yearMonth]);
  const companySummary = useMemo(() => {
    const staffMap = new Map(staffs.map((staff: any) => [String(staff.id), staff]));
    const summary = new Map<string, { company: string; count: number; taxable: number; deductions: number; net: number }>();

    payrollRecords.forEach((record: any) => {
      const company = staffMap.get(String(record.staff_id))?.company || '미분류';
      if (selectedCo !== '전체' && selectedCo && company !== selectedCo) return;
      if (!summary.has(company)) {
        summary.set(company, { company, count: 0, taxable: 0, deductions: 0, net: 0 });
      }
      const current = summary.get(company)!;
      current.count += 1;
      current.taxable += Number(record.total_taxable || 0);
      current.deductions += Number(record.total_deduction || 0);
      current.net += Number(record.net_pay || 0);
    });

    return Array.from(summary.values()).sort((a, b) => b.net - a.net);
  }, [payrollRecords, selectedCo, staffs]);

  const glRows = useMemo(() => {
    const payrollExpense = payrollRecords.reduce((sum: number, record: any) => sum + Number(record.total_taxable || 0) + Number(record.total_taxfree || 0), 0);
    const withholdingTax = payrollRecords.reduce((sum: number, record: any) => {
      const detail = record.deduction_detail || {};
      return sum + Number(detail.income_tax || 0) + Number(detail.local_income_tax || 0);
    }, 0);
    const deductionTotal = payrollRecords.reduce((sum: number, record: any) => sum + Number(record.total_deduction || 0), 0);
    const netPay = payrollRecords.reduce((sum: number, record: any) => sum + Number(record.net_pay || 0), 0);
    const bonusTotal = monthBonusItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const freelancerSupply = visibleFreelancers.reduce((sum, item) => sum + Number(item.supplyAmount || 0), 0);

    return [
      { 계정: '급여비', 차변: payrollExpense, 대변: 0, 메모: `${yearMonth} 정기 급여` },
      { 계정: '상여/인센티브', 차변: bonusTotal, 대변: 0, 메모: `${yearMonth} 추가 보상` },
      { 계정: '원천세/지방세 예수금', 차변: 0, 대변: withholdingTax, 메모: '홈택스 신고 대상' },
      { 계정: '기타 공제', 차변: 0, 대변: deductionTotal - withholdingTax, 메모: '가압류/상계 포함' },
      { 계정: '미지급급여', 차변: 0, 대변: netPay, 메모: '실지급 예정' },
      { 계정: '프리랜서 용역비', 차변: freelancerSupply, 대변: 0, 메모: `${visibleFreelancers.length}건` },
    ].filter((row) => row.차변 > 0 || row.대변 > 0);
  }, [monthBonusItems, payrollRecords, visibleFreelancers, yearMonth]);

  const monthCount = getMonthDiff(retroForm.startMonth, retroForm.endMonth);
  const retroPreviewTotal = Math.max(0, (retroForm.afterBase - retroForm.beforeBase) * monthCount);

  const addApprovalLog = useCallback(async (action: string, comment: string) => {
    const payload = {
      company_name: companyScope,
      year_month: yearMonth,
      actor_id: viewer?.id || null,
      actor_name: viewerName,
      action,
      comment,
    };
    const { data, error } = await supabase.from('payroll_approval_logs').insert(payload).select('*').single();
    if (error) throw error;
    if (data) {
      setApprovalLogs((prev) => [mapApprovalLogRow(data), ...prev].slice(0, 20));
    }
  }, [companyScope, viewer?.id, viewerName, yearMonth]);

  const updateApproval = async (step: 'step1' | 'step2', status: '대기' | '승인' | '보류', comment: string) => {
    setSavingKey(step);
    try {
      const now = new Date().toISOString();
      const payload = {
        company_name: companyScope,
        year_month: yearMonth,
        step1_status: step === 'step1' ? status : currentApproval.step1Status,
        step2_status: step === 'step2' ? status : currentApproval.step2Status,
        step1_comment: step === 'step1' ? comment : currentApproval.step1Comment,
        step2_comment: step === 'step2' ? comment : currentApproval.step2Comment,
        step1_actor_id: step === 'step1' ? viewer?.id || null : currentApproval.step1ActorId || null,
        step2_actor_id: step === 'step2' ? viewer?.id || null : currentApproval.step2ActorId || null,
        step1_updated_at: step === 'step1' ? now : currentApproval.step1UpdatedAt || null,
        step2_updated_at: step === 'step2' ? now : currentApproval.step2UpdatedAt || null,
        updated_at: now,
      };
      const { data, error } = await supabase
        .from('payroll_approval_workflows')
        .upsert(payload, { onConflict: 'company_name,year_month' })
        .select('*')
        .single();
      if (error) throw error;
      if (data) setApprovalState(mapApprovalRow(data));
      await addApprovalLog(step === 'step1' ? '1차 승인 업데이트' : '2차 승인 업데이트', comment || status);
    } catch (error) {
      console.error('급여 승인 상태 저장 실패:', error);
      alert('급여 승인 상태 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  const toggleCalendarStatus = async (id: string) => {
    const target = calendarItems.find((item) => item.id === id);
    if (!target) return;
    const nextStatus = target.status === '대기' ? '진행' : target.status === '진행' ? '완료' : '대기';
    setSavingKey(id);
    try {
      const { error } = await supabase.from('payroll_calendar_items').update({ status: nextStatus, updated_by: viewer?.id || null }).eq('id', id);
      if (error) throw error;
      setCalendarItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
    } catch (error) {
      console.error('급여 캘린더 상태 저장 실패:', error);
      alert('급여 캘린더 상태 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  const addBonusItem = async () => {
    if (!bonusForm.staffId || bonusForm.amount <= 0) return;
    const targetStaff = staffs.find((staff: any) => String(staff.id) === bonusForm.staffId);
    setSavingKey('bonus');
    try {
      const payload = {
        staff_id: bonusForm.staffId,
        company_name: targetStaff?.company || companyScope,
        year_month: yearMonth,
        category: bonusForm.category,
        amount: Number(bonusForm.amount),
        note: bonusForm.note,
        created_by: viewer?.id || null,
      };
      const { data, error } = await supabase.from('payroll_bonus_items').insert(payload).select('*').single();
      if (error) throw error;
      if (data) setBonusItems((prev) => [mapBonusRow(data), ...prev]);
      setBonusForm({ staffId: '', category: '상여', amount: 0, note: '' });
    } catch (error) {
      console.error('상여/인센티브 저장 실패:', error);
      alert('상여/인센티브 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  const addRetroItem = async () => {
    if (!retroForm.staffId || retroPreviewTotal <= 0) return;
    const targetStaff = staffs.find((staff: any) => String(staff.id) === retroForm.staffId);
    setSavingKey('retro');
    try {
      const payload = {
        staff_id: retroForm.staffId,
        company_name: targetStaff?.company || companyScope,
        start_month: retroForm.startMonth,
        end_month: retroForm.endMonth,
        before_base: Number(retroForm.beforeBase),
        after_base: Number(retroForm.afterBase),
        retro_total: retroPreviewTotal,
        reason: retroForm.reason,
        created_by: viewer?.id || null,
      };
      const { data, error } = await supabase.from('payroll_retro_adjustments').insert(payload).select('*').single();
      if (error) throw error;
      if (data) setRetroItems((prev) => [mapRetroRow(data), ...prev]);
    } catch (error) {
      console.error('소급 급여 저장 실패:', error);
      alert('소급 급여 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  const addDeductionItem = async () => {
    if (!deductionForm.staffId || deductionForm.monthlyAmount <= 0) return;
    const targetStaff = staffs.find((staff: any) => String(staff.id) === deductionForm.staffId);
    setSavingKey('deduction');
    try {
      const payload = {
        staff_id: deductionForm.staffId,
        company_name: targetStaff?.company || companyScope,
        deduction_type: deductionForm.type,
        monthly_amount: Number(deductionForm.monthlyAmount),
        balance: Number(deductionForm.balance),
        note: deductionForm.note,
        is_active: true,
        created_by: viewer?.id || null,
      };
      const { data, error } = await supabase.from('payroll_deduction_controls').insert(payload).select('*').single();
      if (error) throw error;
      if (data) setDeductionItems((prev) => [mapDeductionRow(data), ...prev]);
      setDeductionForm({ staffId: '', type: '가압류', monthlyAmount: 0, balance: 0, note: '' });
    } catch (error) {
      console.error('가압류/상계 저장 실패:', error);
      alert('가압류/상계 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  const addFreelancerItem = async () => {
    if (!freelancerForm.vendorName.trim() || freelancerForm.supplyAmount <= 0) return;
    const itemYearMonth = freelancerForm.paymentDate.slice(0, 7) || yearMonth;
    const withholdingTax = Math.round(Number(freelancerForm.supplyAmount) * (Number(freelancerForm.taxRate) / 100));
    setSavingKey('freelancer');
    try {
      const payload = {
        company_name: companyScope,
        year_month: itemYearMonth,
        vendor_name: freelancerForm.vendorName,
        work_type: freelancerForm.workType,
        payment_date: freelancerForm.paymentDate,
        supply_amount: Number(freelancerForm.supplyAmount),
        tax_rate: Number(freelancerForm.taxRate),
        withholding_tax: withholdingTax,
        created_by: viewer?.id || null,
      };
      const { data, error } = await supabase.from('freelancer_payments').insert(payload).select('*').single();
      if (error) throw error;
      if (data && itemYearMonth === yearMonth) setFreelancerItems((prev) => [mapFreelancerRow(data), ...prev]);
      setFreelancerForm({ vendorName: '', workType: '', paymentDate: `${yearMonth}-10`, supplyAmount: 0, taxRate: 3.3 });
    } catch (error) {
      console.error('프리랜서 지급 저장 실패:', error);
      alert('프리랜서 지급 저장에 실패했습니다.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">급여 고도화 센터</h2>
      </div>

      {loading ? (
        <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-10 text-center text-sm font-semibold text-[var(--toss-gray-3)] shadow-sm">
          급여 고도화 데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">상여·인센티브 엔진</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <select value={bonusForm.staffId} onChange={(event) => setBonusForm({ ...bonusForm, staffId: event.target.value })} className="rounded-[12px] border border-[var(--toss-border)] px-3 py-3 text-sm font-semibold outline-none">
                  <option value="">직원 선택</option>
                  {filteredStaffs.map((staff: any) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                </select>
                <select value={bonusForm.category} onChange={(event) => setBonusForm({ ...bonusForm, category: event.target.value })} className="rounded-[12px] border border-[var(--toss-border)] px-3 py-3 text-sm font-semibold outline-none">
                  <option value="상여">상여</option>
                  <option value="인센티브">인센티브</option>
                </select>
                <input type="number" value={bonusForm.amount} onChange={(event) => setBonusForm({ ...bonusForm, amount: Number(event.target.value) || 0 })} placeholder="지급액" className="rounded-[12px] border border-[var(--toss-border)] px-3 py-3 text-sm font-semibold outline-none" />
                <button onClick={addBonusItem} disabled={savingKey === 'bonus'} className="rounded-[12px] bg-[var(--toss-blue)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">추가</button>
              </div>
              <input type="text" value={bonusForm.note} onChange={(event) => setBonusForm({ ...bonusForm, note: event.target.value })} placeholder="성과 근거 / 산정 메모" className="mt-3 w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-3 text-sm font-semibold outline-none" />
              <div className="mt-4 space-y-2">
                {monthBonusItems.map((item) => {
                  const staff = filteredStaffs.find((row: any) => String(row.id) === item.staffId);
                  return (
                    <div key={item.id} className="flex items-center justify-between rounded-[16px] bg-[var(--toss-gray-1)] px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">{staff?.name || '직원'} · {item.category}</p>
                        <p className="text-[11px] text-[var(--toss-gray-3)]">{item.note || '메모 없음'}</p>
                      </div>
                      <span className="text-sm font-bold text-[var(--toss-blue)]">{Number(item.amount).toLocaleString()}원</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">소급급여 계산 / 가압류·상계 / 프리랜서 지급</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                  <p className="text-sm font-bold text-[var(--foreground)]">소급급여 계산</p>
                  <div className="mt-3 space-y-2">
                    <select value={retroForm.staffId} onChange={(event) => setRetroForm({ ...retroForm, staffId: event.target.value })} className="w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none">
                      <option value="">직원 선택</option>
                      {filteredStaffs.map((staff: any) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="month" value={retroForm.startMonth} onChange={(event) => setRetroForm({ ...retroForm, startMonth: event.target.value })} className="rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                      <input type="month" value={retroForm.endMonth} onChange={(event) => setRetroForm({ ...retroForm, endMonth: event.target.value })} className="rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" value={retroForm.beforeBase} onChange={(event) => setRetroForm({ ...retroForm, beforeBase: Number(event.target.value) || 0 })} placeholder="변경 전 기본급" className="rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                      <input type="number" value={retroForm.afterBase} onChange={(event) => setRetroForm({ ...retroForm, afterBase: Number(event.target.value) || 0 })} placeholder="변경 후 기본급" className="rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                    </div>
                    <input type="text" value={retroForm.reason} onChange={(event) => setRetroForm({ ...retroForm, reason: event.target.value })} className="w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                    <p className="text-[12px] font-semibold text-[var(--toss-blue)]">소급 {monthCount}개월 · 예상 {retroPreviewTotal.toLocaleString()}원</p>
                    <button onClick={addRetroItem} disabled={savingKey === 'retro'} className="w-full rounded-[12px] bg-[var(--toss-blue)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">소급 항목 추가</button>
                  </div>
                </div>

                <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                  <p className="text-sm font-bold text-[var(--foreground)]">가압류 / 상계 공제</p>
                  <div className="mt-3 space-y-2">
                    <select value={deductionForm.staffId} onChange={(event) => setDeductionForm({ ...deductionForm, staffId: event.target.value })} className="w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none">
                      <option value="">직원 선택</option>
                      {filteredStaffs.map((staff: any) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                    </select>
                    <select value={deductionForm.type} onChange={(event) => setDeductionForm({ ...deductionForm, type: event.target.value })} className="w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none">
                      <option value="가압류">가압류</option>
                      <option value="상계">상계</option>
                      <option value="대여금">대여금 상환</option>
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" value={deductionForm.monthlyAmount} onChange={(event) => setDeductionForm({ ...deductionForm, monthlyAmount: Number(event.target.value) || 0 })} placeholder="월 공제액" className="rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                      <input type="number" value={deductionForm.balance} onChange={(event) => setDeductionForm({ ...deductionForm, balance: Number(event.target.value) || 0 })} placeholder="잔액" className="rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                    </div>
                    <input type="text" value={deductionForm.note} onChange={(event) => setDeductionForm({ ...deductionForm, note: event.target.value })} placeholder="사유" className="w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                    <button onClick={addDeductionItem} disabled={savingKey === 'deduction'} className="w-full rounded-[12px] bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">공제 등록</button>
                  </div>
                </div>

                <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                  <p className="text-sm font-bold text-[var(--foreground)]">프리랜서 지급 관리</p>
                  <div className="mt-3 space-y-2">
                    <input type="text" value={freelancerForm.vendorName} onChange={(event) => setFreelancerForm({ ...freelancerForm, vendorName: event.target.value })} placeholder="지급 대상" className="w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                    <input type="text" value={freelancerForm.workType} onChange={(event) => setFreelancerForm({ ...freelancerForm, workType: event.target.value })} placeholder="업무 내용" className="w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={freelancerForm.paymentDate} onChange={(event) => setFreelancerForm({ ...freelancerForm, paymentDate: event.target.value })} className="rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                      <input type="number" value={freelancerForm.supplyAmount} onChange={(event) => setFreelancerForm({ ...freelancerForm, supplyAmount: Number(event.target.value) || 0 })} placeholder="공급가액" className="rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                    </div>
                    <button onClick={addFreelancerItem} disabled={savingKey === 'freelancer'} className="w-full rounded-[12px] bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">지급 항목 추가</button>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-[16px] bg-[var(--toss-gray-1)] p-4">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">소급급여 합계</p>
                  <p className="mt-2 text-xl font-bold text-[var(--foreground)]">{monthRetroItems.reduce((sum, item) => sum + Number(item.retroTotal || 0), 0).toLocaleString()}원</p>
                </div>
                <div className="rounded-[16px] bg-[var(--toss-gray-1)] p-4">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">활성 공제</p>
                  <p className="mt-2 text-xl font-bold text-[var(--foreground)]">{activeDeductions.length}건</p>
                </div>
                <div className="rounded-[16px] bg-[var(--toss-gray-1)] p-4">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">프리랜서 원천세(합계)</p>
                  <p className="mt-2 text-xl font-bold text-[var(--foreground)]">{visibleFreelancers.reduce((sum, item) => sum + Number(item.withholdingTax || 0), 0).toLocaleString()}원</p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">홈택스/EDI 신고파일 고도화 · 회계 GL 전표 연동</h3>
                </div>
                <button onClick={() => downloadCsv(`payroll_gl_${yearMonth}.csv`, glRows)} className="rounded-[12px] bg-[var(--toss-blue)] px-4 py-2 text-sm font-bold text-white">GL CSV 다운로드</button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--toss-border)] text-[11px] font-bold text-[var(--toss-gray-3)]">
                      <th className="py-2">계정</th>
                      <th className="py-2">차변</th>
                      <th className="py-2">대변</th>
                      <th className="py-2">메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {glRows.map((row) => (
                      <tr key={row.계정} className="border-b border-[var(--toss-border)] text-sm font-semibold text-[var(--foreground)]">
                        <td className="py-3">{row.계정}</td>
                        <td className="py-3">{Number(row.차변).toLocaleString()}원</td>
                        <td className="py-3">{Number(row.대변).toLocaleString()}원</td>
                        <td className="py-3 text-[var(--toss-gray-3)]">{row.메모}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => downloadCsv(`tax_summary_${yearMonth}.csv`, companySummary.map((row) => ({ 회사: row.company, 인원: row.count, 과세합계: row.taxable, 공제합계: row.deductions, 실지급: row.net })))} className="rounded-[12px] border border-[var(--toss-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--foreground)]">
                  홈택스/EDI 요약 다운로드
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">급여 캘린더 · 2단계 급여승인 · 변경 승인로그</h3>
              <div className="mt-4 space-y-3">
                {calendarItems.filter((item) => item.yearMonth === yearMonth).map((item) => (
                  <button key={item.id} onClick={() => toggleCalendarStatus(item.id)} disabled={savingKey === item.id} className="flex w-full items-center justify-between rounded-[16px] bg-[var(--toss-gray-1)] px-4 py-3 text-left disabled:opacity-50">
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">{item.title}</p>
                      <p className="text-[11px] text-[var(--toss-gray-3)]">{item.dueDate} · {item.owner}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${item.status === '완료' ? 'bg-emerald-100 text-emerald-600' : item.status === '진행' ? 'bg-blue-100 text-blue-600' : 'bg-zinc-200 text-zinc-600'}`}>{item.status}</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                  <p className="text-sm font-bold text-[var(--foreground)]">1차 급여 승인</p>
                  <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">인사책임자 확인 단계</p>
                  <textarea value={step1Comment} onChange={(event) => setStep1Comment(event.target.value)} placeholder="검토 의견" className="mt-3 h-20 w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => updateApproval('step1', '승인', step1Comment)} disabled={savingKey === 'step1'} className="rounded-[12px] bg-[var(--toss-blue)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">승인</button>
                    <button onClick={() => updateApproval('step1', '보류', step1Comment)} disabled={savingKey === 'step1'} className="rounded-[12px] border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-600 disabled:opacity-50">보류</button>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">현재 상태: {currentApproval.step1Status}</p>
                </div>

                <div className="rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                  <p className="text-sm font-bold text-[var(--foreground)]">2차 급여 승인</p>
                  <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">대표/재무 최종 승인 단계</p>
                  <textarea value={step2Comment} onChange={(event) => setStep2Comment(event.target.value)} placeholder="최종 의견" className="mt-3 h-20 w-full rounded-[12px] border border-[var(--toss-border)] px-3 py-2 text-sm font-semibold outline-none" />
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => updateApproval('step2', '승인', step2Comment)} disabled={savingKey === 'step2'} className="rounded-[12px] bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">승인</button>
                    <button onClick={() => updateApproval('step2', '보류', step2Comment)} disabled={savingKey === 'step2'} className="rounded-[12px] border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-600 disabled:opacity-50">보류</button>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold text-[var(--toss-gray-3)]">현재 상태: {currentApproval.step2Status}</p>
                </div>
              </div>

              <div className="mt-5 rounded-[18px] bg-[var(--toss-gray-1)] p-4">
                <p className="text-sm font-bold text-[var(--foreground)]">급여 변경 승인로그</p>
                <div className="mt-3 space-y-2">
                  {approvalLogs.filter((log) => log.yearMonth === yearMonth && log.company === companyScope).slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-[12px] bg-white px-4 py-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">{log.action}</p>
                      <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{log.actor} · {new Date(log.createdAt).toLocaleString('ko-KR')}</p>
                      <p className="mt-1 text-[11px] text-[var(--foreground)]">{log.comment || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">다법인 통합 급여대장</h3>
              <div className="mt-4 space-y-2">
                {companySummary.map((row) => (
                  <div key={row.company} className="rounded-[16px] bg-[var(--toss-gray-1)] px-4 py-3">
                    <p className="text-sm font-bold text-[var(--foreground)]">{row.company}</p>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{row.count}명 · 과세 {row.taxable.toLocaleString()}원 · 공제 {row.deductions.toLocaleString()}원</p>
                    <p className="mt-2 text-lg font-bold text-[var(--toss-blue)]">{row.net.toLocaleString()}원</p>
                  </div>
                ))}
              </div>
            </div>

            <TaxInsuranceRatesPanel companyName={selectedCo} />
            <PayrollLockPanel yearMonth={yearMonth} companyName={selectedCo} onLockChange={onRefresh} />
            <InterimSettlement staffs={staffs} selectedCo={selectedCo} onRefresh={onRefresh} />
          </div>
        </div>
      )}
    </div>
  );
}
