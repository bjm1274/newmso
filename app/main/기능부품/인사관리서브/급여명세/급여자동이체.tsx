'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

type TransferRow = {
  id: string;
  staff_id: string | number;
  staff_name: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  salary_amount: number;
  deduction_amount: number;
  transfer_amount: number;
  transfer_date: string | null;
  transfer_status: string;
  tax_amount: number;
  insurance_amount: number;
};

export default function SalaryAutoTransfer() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [transferData, setTransferData] = useState<TransferRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferStatus, setTransferStatus] = useState('대기');

  useEffect(() => {
    fetchStaffAndSalary();
  }, [selectedMonth]);

  const fetchStaffAndSalary = async () => {
    // 직원 정보 조회
    const { data: staff } = await supabase
      .from('staff_members')
      .select('id, name, bank_name, bank_account');
    setStaffList(staff || []);
    const staffById = new Map((staff || []).map((row: any) => [String(row.id), row]));

    // 급여 정보 조회
    const { data: salaries } = await supabase
      .from('payroll_records')
      .select('id, staff_id, year_month, base_salary, total_taxable, total_taxfree, total_deduction, net_pay, status')
      .eq('year_month', selectedMonth);

    if (salaries) {
      const transferList = salaries.map((salary: any) => {
        const staffInfo = staffById.get(String(salary.staff_id)) || {};
        const salaryAmount = Number(salary.total_taxable ?? 0) + Number(salary.total_taxfree ?? 0);
        const deductionAmount = Number(salary.total_deduction ?? 0);
        const transferAmount = Number(salary.net_pay ?? Math.max(0, salaryAmount - deductionAmount));
        return {
          id: salary.id,
          staff_id: salary.staff_id,
          staff_name: staffInfo.name || salary.staff_name || '',
          bank_name: staffInfo.bank_name || '국민은행',
          account_number: staffInfo.bank_account || '****-****-****',
          account_holder: staffInfo.name || salary.staff_name || '',
          salary_amount: salaryAmount || Number(salary.base_salary ?? 0),
          deduction_amount: deductionAmount,
          transfer_amount: transferAmount,
          transfer_date: null,
          transfer_status: String(salary.status || '').trim() === 'transfer_complete' ? '완료' : '대기',
          tax_amount: 0,
          insurance_amount: deductionAmount,
        };
      });
      setTransferData(transferList);
    }
  };

  const generateTransferTable = () => {
    return transferData.map((item, idx) => ({
      순번: idx + 1,
      직원명: item.staff_name,
      은행명: item.bank_name,
      계좌번호: item.account_number,
      예금주명: item.account_holder,
      급여액: item.salary_amount,
      공제액: item.deduction_amount,
      이체금액: item.transfer_amount,
      상태: item.transfer_status,
    }));
  };

  const executeTransfer = async () => {
    setTransferStatus('진행중');
    
    for (const item of transferData) {
      // 실제 은행 API 연동 (예: 우리은행 API)
      const transferPayload = {
        bank_code: getBankCode(item.bank_name),
        account_number: item.account_number,
        account_holder: item.account_holder,
        amount: item.transfer_amount,
        transfer_date: new Date().toISOString(),
      };

      setTransferData((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, transfer_status: '완료', transfer_date: transferPayload.transfer_date }
            : row
        )
      );
    }

    setTransferStatus('완료');
    toast('급여 이체가 완료되었습니다.', 'success');
  };

  const getBankCode = (bankName: string) => {
    const bankCodes: any = {
      '국민은행': '004',
      '우리은행': '020',
      '신한은행': '088',
      '하나은행': '081',
      '농협': '011',
      '기업은행': '003',
      '카카오뱅크': '090',
    };
    return bankCodes[bankName] || '004';
  };

  const rowsWithIndex = useMemo(
    () => transferData.map((row, idx) => ({ ...row, _idx: idx + 1 })),
    [transferData],
  );

  const columns = useMemo(
    (): Column<TransferRow & { _idx: number }>[] => [
      { key: '_idx', label: '순번', showOnMobile: false },
      {
        key: 'staff_name',
        label: '직원명',
        primary: true,
        render: (row) => row.staff_name || '—',
      },
      {
        key: 'bank_name',
        label: '은행',
        render: (row) => row.bank_name || '—',
      },
      {
        key: 'account_number',
        label: '계좌번호',
        render: (row) => (
          <span className="font-mono text-[var(--toss-gray-4)]">{row.account_number || '—'}</span>
        ),
      },
      {
        key: 'account_holder',
        label: '예금주명',
        showOnMobile: false,
        render: (row) => row.account_holder || '—',
      },
      {
        key: 'salary_amount',
        label: '급여액',
        align: 'right',
        render: (row) => `₩${Number(row.salary_amount || 0).toLocaleString()}`,
      },
      {
        key: 'deduction_amount',
        label: '공제액',
        align: 'right',
        showOnMobile: false,
        render: (row) => (
          <span className="font-medium text-red-600">
            ₩{Number(row.deduction_amount || 0).toLocaleString()}
          </span>
        ),
      },
      {
        key: 'transfer_amount',
        label: '이체액',
        align: 'right',
        render: (row) => (
          <span className="font-semibold text-emerald-600">
            ₩{Number(row.transfer_amount || 0).toLocaleString()}
          </span>
        ),
      },
      {
        key: 'transfer_status',
        label: '상태',
        align: 'center',
        render: (row) => (
          <span
            className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-medium ${
              row.transfer_status === '완료'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {row.transfer_status}
          </span>
        ),
      },
    ],
    [],
  );

  const downloadTransferFile = () => {
    const table = generateTransferTable();
    const csv = [
      ['순번', '직원명', '은행명', '계좌번호', '예금주명', '급여액', '공제액', '이체금액', '상태'].join(','),
      ...table.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `급여이체_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 월 선택 */}
      <div className="flex gap-4 items-center">
        <label className="text-sm font-medium text-[var(--foreground)]">정산 월</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-9 px-3 border border-[var(--border)] rounded-md text-sm font-medium focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 급여액</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">
            ₩{transferData.reduce((sum, item) => sum + item.salary_amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 공제액</p>
          <p className="text-lg font-semibold text-red-600">
            ₩{transferData.reduce((sum, item) => sum + item.deduction_amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">총 이체액</p>
          <p className="text-lg font-semibold text-emerald-600">
            ₩{transferData.reduce((sum, item) => sum + item.transfer_amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-xs font-medium text-[var(--toss-gray-3)] mb-1">이체 대상</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">{transferData.length}명</p>
        </div>
      </div>

      {/* 이체 테이블 */}
      <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-md)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--tab-bg)] flex justify-between items-center">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">급여 이체 현황</h3>
          <div className="flex gap-2">
            <button
              onClick={downloadTransferFile}
              className="px-3 py-2 bg-[var(--foreground)] text-white rounded-[var(--radius-md)] text-xs font-medium hover:opacity-90"
            >
              CSV 다운로드
            </button>
            <button
              onClick={() => setShowTransferModal(true)}
              disabled={transferStatus === '진행중'}
              className="px-3 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {transferStatus === '완료' ? '완료' : '이체 실행'}
            </button>
          </div>
        </div>

        <div className="p-2 sm:p-3">
          <ResponsiveTable<TransferRow & { _idx: number }>
            columns={columns}
            rows={rowsWithIndex}
            keyField="id"
            emptyMessage="이체 대상 직원이 없습니다."
          />
        </div>
      </div>

      {/* 이체 확인 모달 */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
          <div className="bg-[var(--card)] rounded-[var(--radius-md)] p-4 w-full max-w-md shadow-sm">
            <h3 className="text-base font-semibold text-[var(--foreground)] mb-4">급여 이체 확인</h3>
            
            <div className="space-y-2 mb-4 bg-[var(--page-bg)] p-4 rounded-[var(--radius-md)] border border-[var(--border)]">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[var(--toss-gray-4)]">이체 대상</span>
                <span className="font-semibold text-[var(--foreground)]">{transferData.length}명</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[var(--toss-gray-4)]">총 이체액</span>
                <span className="font-semibold text-emerald-600">
                  ₩{transferData.reduce((sum, item) => sum + item.transfer_amount, 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[var(--toss-gray-4)]">이체 월</span>
                <span className="font-semibold text-[var(--foreground)]">{selectedMonth}</span>
              </div>
            </div>

            <p className="text-xs text-[var(--toss-gray-3)] mb-4">
              이체를 실행하면 취소할 수 없습니다. 정보를 다시 확인해주세요.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowTransferModal(false)}
                className="flex-1 py-2.5 bg-[var(--muted)] text-[var(--foreground)] rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90"
              >
                취소
              </button>
              <button
                onClick={() => {
                  executeTransfer();
                  setShowTransferModal(false);
                }}
                className="flex-1 py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90"
              >
                이체 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
