'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SalaryAutoTransfer() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [transferData, setTransferData] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferStatus, setTransferStatus] = useState('대기');

  useEffect(() => {
    fetchStaffAndSalary();
  }, [selectedMonth]);

  const fetchStaffAndSalary = async () => {
    // 직원 정보 조회
    const { data: staff } = await supabase.from('staffs').select('*');
    setStaffList(staff || []);

    // 급여 정보 조회
    const { data: salaries } = await supabase
      .from('payroll')
      .select('*')
      .like('month', `${selectedMonth}%`);

    if (salaries) {
      const transferList = salaries.map((salary: any) => ({
        id: salary.id,
        staff_id: salary.staff_id,
        staff_name: salary.staff_name,
        bank_name: salary.bank_name || '국민은행',
        account_number: salary.account_number || '****-****-****',
        account_holder: salary.account_holder || salary.staff_name,
        salary_amount: salary.total_salary || 0,
        deduction_amount: salary.total_deduction || 0,
        transfer_amount: (salary.total_salary || 0) - (salary.total_deduction || 0),
        transfer_date: salary.transfer_date || null,
        transfer_status: salary.transfer_status || '대기',
        tax_amount: salary.tax_amount || 0,
        insurance_amount: salary.insurance_amount || 0,
      }));
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

      // 이체 기록 저장
      await supabase.from('payroll').update({
        transfer_status: '완료',
        transfer_date: new Date().toISOString(),
        transfer_payload: transferPayload,
      }).eq('id', item.id);
    }

    setTransferStatus('완료');
    fetchStaffAndSalary();
    alert('급여 이체가 완료되었습니다.');
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

  const downloadTransferFile = () => {
    const table = generateTransferTable();
    const csv = [
      ['순번', '직원명', '은행명', '계좌번호', '예금주명', '급여액', '공제액', '이체금액', '상태'].join(','),
      ...table.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `급여이체_${selectedMonth}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* 월 선택 */}
      <div className="flex gap-4 items-center">
        <label className="font-black text-gray-700">정산 월:</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600"
        />
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
          <p className="text-xs font-bold text-blue-600 mb-2">총 급여액</p>
          <p className="text-2xl font-black text-blue-800">
            ₩{transferData.reduce((sum, item) => sum + item.salary_amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-red-50 p-6 rounded-xl border border-red-200">
          <p className="text-xs font-bold text-red-600 mb-2">총 공제액</p>
          <p className="text-2xl font-black text-red-800">
            ₩{transferData.reduce((sum, item) => sum + item.deduction_amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-green-50 p-6 rounded-xl border border-green-200">
          <p className="text-xs font-bold text-green-600 mb-2">총 이체액</p>
          <p className="text-2xl font-black text-green-800">
            ₩{transferData.reduce((sum, item) => sum + item.transfer_amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-purple-50 p-6 rounded-xl border border-purple-200">
          <p className="text-xs font-bold text-purple-600 mb-2">이체 대상</p>
          <p className="text-2xl font-black text-purple-800">{transferData.length}명</p>
        </div>
      </div>

      {/* 이체 테이블 */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-black text-gray-800">💳 급여 이체 현황</h3>
          <div className="flex gap-2">
            <button
              onClick={downloadTransferFile}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-black hover:bg-gray-700 transition-all"
            >
              📥 CSV 다운로드
            </button>
            <button
              onClick={() => setShowTransferModal(true)}
              disabled={transferStatus === '진행중'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-black hover:bg-blue-700 transition-all disabled:opacity-50"
            >
              {transferStatus === '완료' ? '✓ 완료' : '💳 이체 실행'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left font-black text-gray-700">순번</th>
                <th className="px-6 py-3 text-left font-black text-gray-700">직원명</th>
                <th className="px-6 py-3 text-left font-black text-gray-700">은행</th>
                <th className="px-6 py-3 text-left font-black text-gray-700">계좌번호</th>
                <th className="px-6 py-3 text-left font-black text-gray-700">예금주명</th>
                <th className="px-6 py-3 text-right font-black text-gray-700">급여액</th>
                <th className="px-6 py-3 text-right font-black text-gray-700">공제액</th>
                <th className="px-6 py-3 text-right font-black text-gray-700">이체액</th>
                <th className="px-6 py-3 text-center font-black text-gray-700">상태</th>
              </tr>
            </thead>
            <tbody>
              {transferData.map((item, idx) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4 font-bold text-gray-800">{idx + 1}</td>
                  <td className="px-6 py-4 font-bold text-gray-800">{item.staff_name}</td>
                  <td className="px-6 py-4 font-bold text-gray-800">{item.bank_name}</td>
                  <td className="px-6 py-4 font-mono text-gray-600">{item.account_number}</td>
                  <td className="px-6 py-4 font-bold text-gray-800">{item.account_holder}</td>
                  <td className="px-6 py-4 text-right font-bold text-gray-800">
                    ₩{item.salary_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-red-600">
                    ₩{item.deduction_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-black text-green-600">
                    ₩{item.transfer_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${
                      item.transfer_status === '완료'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-yellow-100 text-yellow-600'
                    }`}>
                      {item.transfer_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 이체 확인 모달 */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-black text-gray-800 mb-6">💳 급여 이체 확인</h3>
            
            <div className="space-y-4 mb-6 bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="font-bold text-gray-700">이체 대상:</span>
                <span className="font-black text-gray-800">{transferData.length}명</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-gray-700">총 이체액:</span>
                <span className="font-black text-green-600">
                  ₩{transferData.reduce((sum, item) => sum + item.transfer_amount, 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-gray-700">이체 월:</span>
                <span className="font-black text-gray-800">{selectedMonth}</span>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              ⚠️ 이체를 실행하면 취소할 수 없습니다. 정보를 다시 확인해주세요.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowTransferModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition-all"
              >
                취소
              </button>
              <button
                onClick={() => {
                  executeTransfer();
                  setShowTransferModal(false);
                }}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all"
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
