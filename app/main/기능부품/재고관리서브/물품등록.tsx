'use client';
import { toast } from '@/lib/toast';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import SmartDatePicker from '../공통/SmartDatePicker';

export default function ProductRegistration({ user: _user, suppliers: _suppliers, fetchInventory: _fetchInventory, fetchSuppliers }: Record<string, unknown>) {
  const user = (_user ?? {}) as Record<string, unknown>;
  const suppliers = (_suppliers ?? []) as Record<string, unknown>[];
  const fetchInventory = _fetchInventory as (() => void) | undefined;
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>(['박철홍정형외과', '수연의원', 'SY INC.']);
  const [productForm, setProductForm] = useState({
    item_name: '',
    category: '',
    quantity: 0,
    min_quantity: 0,
    unit_price: 0,
    supplier_name: '',
    expiry_date: '',
    lot_number: '',
    serial_number: '',
    insurance_code: '',
    spec: '',
    is_udi: false,
    company: (user?.company as string) || '박철홍정형외과',
    department: (user?.department as string) || ''
  });

  // 수연의원 / SY INC. / 병원 전체의 부서명을 staff_members에서 동적으로 수집
  useEffect(() => {
    const loadDeptsAndComps = async () => {
      try {
        const { data: deptData, error: deptError } = await supabase
          .from('staff_members')
          .select('department, company');
        if (!deptError && deptData) {
          const list = deptData.map((s: any) => (s.department || '').trim()).filter(Boolean);
          const unique = Array.from(new Set(list)).sort();
          setDepartments(unique);
        }

        const { data: compData, error: compError } = await supabase
          .from('companies')
          .select('name')
          .eq('is_active', true);
        if (!compError && compData) {
          setCompanies(compData.map((c: any) => c.name));
        }

      } catch (_) {
        // 실패해도 치명적이지 않으므로 무시
      }
    };
    loadDeptsAndComps();
  }, []);

  const handleRegisterProduct = async () => {
    if (!productForm.item_name || !productForm.category) return toast('제품명과 분류를 입력해주세요.', 'warning');
    setLoading(true);
    try {
      // 선택적 필드 처리: 빈 문자열은 null로 변환하여 저장
      const buildSubmissionData = (omittedColumns: ReadonlySet<string>) => {
        const submissionData: Record<string, any> = {
        ...productForm,
        unit_price: productForm.unit_price || 0,
        expiry_date: productForm.expiry_date || null,
        lot_number: productForm.lot_number || null,
        serial_number: productForm.serial_number || null,
        insurance_code: productForm.insurance_code || null,
        spec: productForm.spec || null,
        // 재고 테이블에서 stock 컬럼을 함께 사용하므로 초기 재고 = quantity 로 맞춤
        stock: productForm.quantity || 0,
        };

        if (omittedColumns.has('department')) {
          delete submissionData.department;
        }

        return submissionData;
      };

      const { error, data: insertedData } = await withMissingColumnsFallback(
        (omittedColumns) => supabase.from('inventory').insert([buildSubmissionData(omittedColumns)]).select('id'),
        ['department'],
      );
      if (error) {
        console.error('inventory insert error:', error);
        throw error;
      }
      if (!insertedData || (Array.isArray(insertedData) && insertedData.length === 0)) {
        throw new Error('저장에 실패했습니다. 테이블 권한을 확인해 주세요.');
      }
      toast(`${productForm.item_name} 등록이 완료되었습니다.`, 'success');
      fetchInventory?.();
      // 폼 초기화
      setProductForm({
        item_name: '',
        category: '',
        quantity: 0,
        min_quantity: 0,
        unit_price: 0,
        supplier_name: '',
        expiry_date: '',
        lot_number: '',
        serial_number: '',
        insurance_code: '',
        spec: '',
        is_udi: false,
        company: (user?.company as string) || '박철홍정형외과',
        department: (user?.department as string) || ''
      });
    } catch (err: unknown) {
      console.warn('등록 실패:', err);
      const errObj = err as { message?: string; error_description?: string; details?: string };
      const message =
        typeof errObj?.message === 'string'
          ? errObj.message
          : (errObj?.error_description || errObj?.details || '').toString();
      toast(`등록 실패\n\n${message || '데이터베이스 제약 조건 때문에 저장에 실패했습니다. 필수 항목을 다시 확인해 주세요.'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500" data-testid="inventory-registration-view">
      <div className="bg-[var(--card)] p-4 md:p-5 border border-[var(--border)] shadow-sm rounded-2xl">
        <div className="mb-5">
          <h2 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">신규 물품 자산 등록</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* 기본 정보 */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">제품명 *</label>
            <input data-testid="inventory-registration-item-name" value={productForm.item_name} onChange={e => setProductForm({ ...productForm, item_name: e.target.value })} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20" placeholder="제품명을 입력하세요" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">분류 *</label>
            <select data-testid="inventory-registration-category" value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20">
              <option value="">분류 선택</option>
              <option value="의료기기">의료기기</option>
              <option value="소모품">소모품</option>
              <option value="약품">약품</option>
              <option value="사무용품">사무용품</option>
            </select>
          </div>

          {/* 수량 및 단가 */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">현재 수량</label>
            <input data-testid="inventory-registration-quantity" type="number" value={productForm.quantity} onChange={e => setProductForm({ ...productForm, quantity: parseInt(e.target.value) || 0 })} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">단가 (원)</label>
            <input type="number" value={productForm.unit_price} onChange={e => setProductForm({ ...productForm, unit_price: parseInt(e.target.value) || 0 })} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20" placeholder="0" />
          </div>

          {/* 유효기간 및 LOT */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">유효기간 (선택)</label>
            <SmartDatePicker value={productForm.expiry_date} onChange={val => setProductForm({ ...productForm, expiry_date: val })} className="w-full h-12 px-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] font-bold text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">LOT 번호 (선택)</label>
            <input value={productForm.lot_number} onChange={e => setProductForm({ ...productForm, lot_number: e.target.value })} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20" placeholder="LOT-0000-00" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">시리얼 번호 (선택)</label>
            <input
              value={productForm.serial_number}
              onChange={e => setProductForm({ ...productForm, serial_number: e.target.value })}
              className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="SERIAL-0000"
            />
          </div>

          {/* 기타 설정 */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">안전 재고</label>
            <input type="number" value={productForm.min_quantity} onChange={e => setProductForm({ ...productForm, min_quantity: parseInt(e.target.value) || 0 })} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">공급 업체</label>
            <select value={productForm.supplier_name} onChange={e => setProductForm({ ...productForm, supplier_name: e.target.value })} className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20">
              <option value="">업체 선택</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          {/* 보험코드 · 규격 */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">보험코드 (선택)</label>
            <input
              value={productForm.insurance_code}
              onChange={e => setProductForm({ ...productForm, insurance_code: e.target.value })}
              className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="예: B0741301"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">규격 (선택)</label>
            <input
              value={productForm.spec}
              onChange={e => setProductForm({ ...productForm, spec: e.target.value })}
              className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="예: 1/0(고), 30매/BOX"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">귀속 회사 *</label>
            <select
              data-testid="inventory-registration-company"
              value={productForm.company}
              onChange={e => setProductForm({ ...productForm, company: e.target.value })}
              className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">배정 부서 (부서별 현황에 표시)</label>
            <select
              data-testid="inventory-registration-department"
              value={productForm.department}
              onChange={e => setProductForm({ ...productForm, department: e.target.value })}
              className="w-full p-4 bg-[var(--input-bg)] rounded-[var(--radius-md)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              <option value="">미지정</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold tracking-widest invisible">UDI 대상 여부</label>
            <div className="flex items-center h-[52px]">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={productForm.is_udi} onChange={e => setProductForm({ ...productForm, is_udi: e.target.checked })} className="w-6 h-6 accent-blue-600 rounded-[var(--radius-md)]" />
                <span className="text-xs font-bold text-[var(--toss-gray-4)] group-hover:text-[var(--accent)] transition-colors">UDI 공급내역 보고 대상</span>
              </label>
            </div>
          </div>
        </div>

        <button data-testid="inventory-registration-submit" onClick={handleRegisterProduct} disabled={loading} className="w-full py-5 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] font-bold text-sm shadow-sm hover:scale-[0.98] transition-all">✅ 물품 자산 등록하기</button>
      </div>
    </div>
  );
}
