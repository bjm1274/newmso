'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

// ---- 타입 정의 ----
interface VendorItem {
  name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface VendorRow {
  vendor_name: string;
  total_purchase_amount: number;
  total_quantity: number;
  item_count: number;
  items: VendorItem[];
}

interface PrescriptionRow {
  _idx: number;
  patient_name?: string;
  patient_id?: string;
  item_name?: string;
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
  prescription_date?: string;
}

export default function VendorAnalysis() {
  const [vendorData, setVendorData] = useState<VendorRow[]>([]);
  const [prescriptionData, setPrescriptionData] = useState<PrescriptionRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    fetchVendorData();
  }, [selectedMonth]);

  const fetchVendorData = async () => {
    // 업체별 구매 현황
    const { data: purchases } = await supabase
      .from('inventory_logs')
      .select('*')
      .like('date', `${selectedMonth}%`)
      .eq('type', 'purchase');

    if (purchases) {
      const vendorSales: Record<string, VendorRow> = {};
      (purchases as { vendor_name: string; quantity: number; unit_price: number; item_name: string }[]).forEach((purchase) => {
        if (!vendorSales[purchase.vendor_name]) {
          vendorSales[purchase.vendor_name] = {
            vendor_name: purchase.vendor_name,
            total_purchase_amount: 0,
            total_quantity: 0,
            item_count: 0,
            items: [],
          };
        }
        vendorSales[purchase.vendor_name].total_purchase_amount += (purchase.quantity * purchase.unit_price) || 0;
        vendorSales[purchase.vendor_name].total_quantity += purchase.quantity || 0;
        vendorSales[purchase.vendor_name].item_count += 1;
        vendorSales[purchase.vendor_name].items.push({
          name: purchase.item_name,
          quantity: purchase.quantity,
          unit_price: purchase.unit_price,
          amount: purchase.quantity * purchase.unit_price,
        });
      });

      setVendorData(Object.values(vendorSales));
    }

    // 환자 처방 현황
    const { data: prescriptions } = await supabase
      .from('patient_prescriptions')
      .select('*')
      .like('date', `${selectedMonth}%`);

    if (prescriptions) {
      setPrescriptionData(
        (prescriptions as Omit<PrescriptionRow, '_idx'>[]).map((p, idx) => ({ ...p, _idx: idx }))
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);

    // 엑셀 파일 파싱 (간단한 CSV 예제)
    const text = await file.text();
    const lines = text.split('\n');
    const headers = lines[0].split(',');

    type PrescriptionInsert = {
      patient_name: string | undefined;
      patient_id: string | undefined;
      item_name: string | undefined;
      quantity: number;
      unit_price: number;
      total_amount: number;
      prescription_date: string;
      status: string;
    };
    const prescriptions: PrescriptionInsert[] = lines.slice(1).map((line) => {
      const values = line.split(',');
      return {
        patient_name: values[0]?.trim(),
        patient_id: values[1]?.trim(),
        item_name: values[2]?.trim(),
        quantity: parseInt(values[3] ?? '0') || 0,
        unit_price: parseInt(values[4] ?? '0') || 0,
        total_amount: (parseInt(values[3] ?? '0') || 0) * (parseInt(values[4] ?? '0') || 0),
        prescription_date: selectedMonth,
        status: '분류완료',
      };
    });

    // 데이터베이스에 저장
    const { error } = await supabase
      .from('patient_prescriptions')
      .insert(prescriptions.filter(p => p.patient_name && p.item_name));

    if (!error) {
      toast('환자 처방 데이터가 자동 분류되었습니다.');
      setShowUploadModal(false);
      setUploadFile(null);
      fetchVendorData();
    }
  };

  const downloadVendorReport = () => {
    const csv = [
      ['업체명', '총 구매액', '총 수량', '품목 수'].join(','),
      ...vendorData.map((v) => [
        v.vendor_name,
        v.total_purchase_amount,
        v.total_quantity,
        v.item_count,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `업체별현황_${selectedMonth}.csv`;
    link.click();
  };

  const downloadPrescriptionReport = () => {
    const csv = [
      ['환자명', '환자ID', '품목명', '수량', '단가', '합계', '처방일'].join(','),
      ...prescriptionData.map((p) => [
        p.patient_name,
        p.patient_id,
        p.item_name,
        p.quantity,
        p.unit_price,
        p.total_amount,
        p.prescription_date,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `환자처방_${selectedMonth}.csv`;
    link.click();
  };

  // ---- 컬럼 정의 ----
  const vendorColumns = useMemo((): Column<VendorRow>[] => [
    { key: 'vendor_name', label: '업체명', primary: true },
    {
      key: 'total_purchase_amount',
      label: '총 구매액',
      align: 'right',
      render: (v) => (
        <span className="font-semibold text-[var(--accent)]">
          ₩{v.total_purchase_amount.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'total_quantity',
      label: '총 수량',
      align: 'right',
      render: (v) => `${v.total_quantity}개`,
    },
    {
      key: 'item_count',
      label: '품목 수',
      align: 'right',
      showOnMobile: false,
      render: (v) => `${v.item_count}개`,
    },
    {
      key: 'items',
      label: '상세',
      align: 'center',
      showOnMobile: false,
      render: (v) => (
        <details className="cursor-pointer">
          <summary className="px-3 py-1 bg-[var(--muted)] rounded text-xs font-semibold hover:opacity-90">
            보기
          </summary>
          <div className="mt-3 p-3 bg-[var(--muted)] rounded text-xs space-y-1">
            {v.items.map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{item.name}</span>
                <span className="font-bold">
                  {item.quantity}개 × ₩{item.unit_price.toLocaleString()} = ₩{item.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </details>
      ),
    },
  ], []);

  const prescriptionColumns = useMemo((): Column<PrescriptionRow>[] => [
    { key: 'patient_name', label: '환자명', primary: true, render: (p) => p.patient_name ?? '-' },
    {
      key: 'patient_id',
      label: '환자ID',
      showOnMobile: false,
      render: (p) => <span className="text-[var(--toss-gray-4)]">{p.patient_id ?? '-'}</span>,
    },
    { key: 'item_name', label: '품목명', render: (p) => p.item_name ?? '-' },
    {
      key: 'quantity',
      label: '수량',
      align: 'right',
      render: (p) => String(p.quantity ?? 0),
    },
    {
      key: 'unit_price',
      label: '단가',
      align: 'right',
      showOnMobile: false,
      render: (p) => `₩${p.unit_price?.toLocaleString() ?? 0}`,
    },
    {
      key: 'total_amount',
      label: '합계',
      align: 'right',
      render: (p) => (
        <span className="font-semibold text-green-600">
          ₩{p.total_amount?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      key: 'prescription_date',
      label: '처방일',
      align: 'center',
      showOnMobile: false,
      render: (p) => p.prescription_date ? new Date(p.prescription_date).toLocaleDateString('ko-KR') : '-',
    },
  ], []);

  return (
    <div className="space-y-4">
      {/* 월 선택 */}
      <div className="flex gap-4 items-center">
        <label className="font-semibold text-[var(--foreground)]">조회 월:</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-4 py-2 border border-[var(--border)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[var(--muted)] rounded-[var(--radius-md)] p-1 w-fit border-b border-[var(--border)] pb-0 mb-0">
        <button className="px-3 py-1.5 font-bold text-xs bg-[var(--accent)] text-white rounded-[var(--radius-md)]">
          업체별 현황
        </button>
        <button className="px-3 py-1.5 font-bold text-xs text-[var(--toss-gray-3)] rounded-[var(--radius-md)] hover:bg-[var(--border)]">
          환자 처방
        </button>
      </div>

      {/* 업체별 현황 */}
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--toss-blue-light)] p-3 rounded-[var(--radius-md)] border border-[var(--accent)]/30">
            <p className="text-xs font-bold text-[var(--accent)] mb-0.5">총 구매액</p>
            <p className="text-lg font-bold text-[var(--foreground)]">
              ₩{vendorData.reduce((sum, v) => sum + v.total_purchase_amount, 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-purple-500/10 p-3 rounded-[var(--radius-md)] border border-purple-500/20">
            <p className="text-xs font-bold text-purple-600 mb-0.5">거래 업체</p>
            <p className="text-lg font-bold text-purple-800">{vendorData.length}개</p>
          </div>
          <div className="bg-green-500/10 p-3 rounded-[var(--radius-md)] border border-green-500/20">
            <p className="text-xs font-bold text-green-600 mb-0.5">총 품목 수</p>
            <p className="text-lg font-bold text-green-800">
              {vendorData.reduce((sum, v) => sum + v.item_count, 0)}개
            </p>
          </div>
        </div>

        {/* 업체별 테이블 */}
        <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
            <h3 className="text-sm font-bold text-[var(--foreground)]">업체별 구매 현황</h3>
            <button
              onClick={downloadVendorReport}
              className="px-4 py-2 bg-[var(--foreground)] text-white rounded-[var(--radius-md)] text-sm font-semibold hover:opacity-90 transition-all"
            >
              📥 CSV 다운로드
            </button>
          </div>

          <ResponsiveTable<VendorRow>
            columns={vendorColumns}
            rows={vendorData}
            keyField="vendor_name"
            emptyMessage="이 달의 업체별 구매 내역이 없습니다."
          />
        </div>
      </div>

      {/* 환자 처방 섹션 */}
      <div className="space-y-4 pt-4 border-t border-[var(--border)]">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-[var(--foreground)]">환자 처방 금액 현황</h3>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-semibold hover:opacity-90 transition-all"
          >
            📤 엑셀 업로드
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-500/10 p-3 rounded-[var(--radius-md)] border border-green-500/20">
            <p className="text-xs font-bold text-green-600 mb-0.5">총 처방액</p>
            <p className="text-lg font-bold text-green-800">
              ₩{prescriptionData.reduce((sum, p) => sum + (p.total_amount || 0), 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-orange-500/10 p-3 rounded-[var(--radius-md)] border border-orange-500/20">
            <p className="text-xs font-bold text-orange-600 mb-0.5">환자 수</p>
            <p className="text-lg font-bold text-orange-800">
              {new Set(prescriptionData.map(p => p.patient_id)).size}명
            </p>
          </div>
          <div className="bg-pink-500/10 p-3 rounded-[var(--radius-md)] border border-pink-500/20">
            <p className="text-xs font-bold text-pink-600 mb-0.5">처방 건수</p>
            <p className="text-lg font-bold text-pink-800">{prescriptionData.length}건</p>
          </div>
        </div>

        {/* 환자 처방 테이블 */}
        <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
            <h4 className="text-sm font-bold text-[var(--foreground)]">처방 내역</h4>
            <button
              onClick={downloadPrescriptionReport}
              className="px-4 py-2 bg-[var(--foreground)] text-white rounded-[var(--radius-md)] text-sm font-semibold hover:opacity-90 transition-all"
            >
              📥 CSV 다운로드
            </button>
          </div>

          <ResponsiveTable<PrescriptionRow>
            columns={prescriptionColumns}
            rows={prescriptionData.slice(0, 20)}
            keyField="_idx"
            emptyMessage="이 달의 처방 내역이 없습니다."
          />
        </div>
      </div>

      {/* 엑셀 업로드 모달 */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 w-full max-w-md shadow-sm">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">환자 처방 데이터 업로드</h3>

            <div className="space-y-4 mb-4">
              <div className="bg-[var(--toss-blue-light)] p-4 rounded-[var(--radius-md)] border border-[var(--accent)]/30">
                <p className="text-sm font-bold text-[var(--accent)] mb-2">📋 파일 형식</p>
                <p className="text-xs text-[var(--toss-gray-4)]">
                  CSV 또는 엑셀 파일 (환자명, 환자ID, 품목명, 수량, 단가)
                </p>
              </div>

              <div className="border-2 border-dashed border-[var(--border)] rounded-[var(--radius-md)] p-4 text-center">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <p className="text-3xl mb-2">📁</p>
                  <p className="font-semibold text-[var(--foreground)]">파일을 선택하거나 드래그하세요</p>
                  <p className="text-xs text-[var(--toss-gray-3)] mt-1">
                    {uploadFile ? uploadFile.name : '지원 형식: CSV, XLSX'}
                  </p>
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex-1 py-2 bg-[var(--muted)] text-[var(--foreground)] rounded-[var(--radius-md)] font-bold hover:opacity-90 transition-all"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById('file-upload') as HTMLInputElement | null;
                  input?.click();
                }}
                disabled={!uploadFile}
                className="flex-1 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-bold hover:opacity-90 transition-all disabled:opacity-50"
              >
                업로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
