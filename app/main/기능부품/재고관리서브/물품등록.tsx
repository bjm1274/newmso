'use client';

import { toast } from '@/lib/toast';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import SmartDatePicker from '../공통/SmartDatePicker';

type InventoryUnit = 'EA' | 'BOX';

type ProductFormState = {
  item_name: string;
  category: string;
  quantity: number;
  min_quantity: number;
  unit_price: number;
  supplier_name: string;
  expiry_date: string;
  lot_number: string;
  serial_number: string;
  insurance_code: string;
  spec: string;
  unit: InventoryUnit;
  is_udi: boolean;
  company: string;
  department: string;
};

function createInitialProductForm(user: Record<string, unknown>): ProductFormState {
  return {
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
    unit: 'EA',
    is_udi: false,
    company: (user?.company as string) || 'SY INC.',
    department: (user?.department as string) || '',
  };
}

export default function ProductRegistration({
  user: _user,
  suppliers: _suppliers,
  fetchInventory: _fetchInventory,
  fetchSuppliers: _fetchSuppliers,
}: Record<string, unknown>) {
  const user = (_user ?? {}) as Record<string, unknown>;
  const suppliers = (_suppliers ?? []) as Record<string, unknown>[];
  const fetchInventory = _fetchInventory as (() => void) | undefined;
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>(['백정형외과', '서울한의원', 'SY INC.']);
  const [productForm, setProductForm] = useState<ProductFormState>(() => createInitialProductForm(user));

  useEffect(() => {
    const loadDeptsAndComps = async () => {
      try {
        const { data: deptData, error: deptError } = await supabase.from('staff_members').select('department, company');
        if (!deptError && deptData) {
          const list = deptData.map((staff: any) => String(staff?.department || '').trim()).filter(Boolean);
          setDepartments(Array.from(new Set(list)).sort((left, right) => left.localeCompare(right, 'ko')));
        }

        const { data: compData, error: compError } = await supabase
          .from('companies')
          .select('name')
          .eq('is_active', true);

        if (!compError && compData) {
          setCompanies(compData.map((company: any) => String(company?.name || '').trim()).filter(Boolean));
        }
      } catch {
        // Optional lookup only
      }
    };

    void loadDeptsAndComps();
  }, []);

  const updateForm = (patch: Partial<ProductFormState>) => {
    setProductForm((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const handleRegisterProduct = async () => {
    if (!productForm.item_name.trim() || !productForm.category.trim() || !productForm.spec.trim()) {
      toast('제품명, 분류, 규격은 필수입니다.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const buildSubmissionData = (omittedColumns: ReadonlySet<string>) => {
        const submissionData: Record<string, any> = {
          ...productForm,
          item_name: productForm.item_name.trim(),
          category: productForm.category.trim(),
          spec: productForm.spec.trim(),
          supplier_name: productForm.supplier_name || null,
          unit_price: productForm.unit_price || 0,
          expiry_date: productForm.expiry_date || null,
          lot_number: productForm.lot_number || null,
          serial_number: productForm.serial_number || null,
          insurance_code: productForm.insurance_code || null,
          stock: productForm.quantity || 0,
        };

        if (omittedColumns.has('department')) {
          delete submissionData.department;
        }
        if (omittedColumns.has('unit')) {
          delete submissionData.unit;
        }

        return submissionData;
      };

      const { error, data: insertedData } = await withMissingColumnsFallback(
        (omittedColumns) => supabase.from('inventory').insert([buildSubmissionData(omittedColumns)]).select('id'),
        ['department', 'unit'],
      );

      if (error) {
        console.error('inventory insert error:', error);
        throw error;
      }

      if (!insertedData || (Array.isArray(insertedData) && insertedData.length === 0)) {
        throw new Error('등록에 실패했습니다. inventory 테이블 권한을 확인해주세요.');
      }

      toast(`${productForm.item_name.trim()} 등록이 완료되었습니다.`, 'success');
      fetchInventory?.();
      setProductForm(createInitialProductForm(user));
    } catch (error: unknown) {
      console.warn('등록 실패:', error);
      const errObj = error as { message?: string; error_description?: string; details?: string };
      const message =
        typeof errObj?.message === 'string'
          ? errObj.message
          : (errObj?.error_description || errObj?.details || '').toString();
      toast(`등록 실패\n\n${message || '데이터베이스 제약 조건 때문에 등록하지 못했습니다.'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500" data-testid="inventory-registration-view">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm md:p-5">
        <div className="mb-5">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">신규 물품 자산 등록</h2>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">제품명 *</label>
            <input
              data-testid="inventory-registration-item-name"
              value={productForm.item_name}
              onChange={(event) => updateForm({ item_name: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="제품명을 입력하세요"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">분류 *</label>
            <select
              data-testid="inventory-registration-category"
              value={productForm.category}
              onChange={(event) => updateForm({ category: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              <option value="">분류 선택</option>
              <option value="의료기기">의료기기</option>
              <option value="소모품">소모품</option>
              <option value="약품">약품</option>
              <option value="사무용품">사무용품</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">현재 수량</label>
            <input
              data-testid="inventory-registration-quantity"
              type="number"
              value={productForm.quantity}
              onChange={(event) => updateForm({ quantity: parseInt(event.target.value, 10) || 0 })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">단위 *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['EA', 'BOX'] as const).map((unit) => {
                const active = productForm.unit === unit;
                return (
                  <button
                    key={unit}
                    type="button"
                    data-testid={`inventory-registration-unit-${unit.toLowerCase()}`}
                    aria-pressed={active}
                    onClick={() => updateForm({ unit })}
                    className={`flex min-h-[52px] items-center justify-between rounded-[var(--radius-md)] border px-4 py-3 text-left transition ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--input-bg)] text-[var(--foreground)]'
                    }`}
                  >
                    <span className="text-sm font-black">{unit}</span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-black ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                          : 'border-[var(--border)] text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">규격 *</label>
            <input
              data-testid="inventory-registration-spec"
              value={productForm.spec}
              onChange={(event) => updateForm({ spec: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="예: 4x4 / 30매 / 1BOX"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">단가 (원)</label>
            <input
              type="number"
              value={productForm.unit_price}
              onChange={(event) => updateForm({ unit_price: parseInt(event.target.value, 10) || 0 })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">유효기간 (선택)</label>
            <SmartDatePicker
              value={productForm.expiry_date}
              onChange={(value) => updateForm({ expiry_date: value })}
              className="h-12 w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] px-4 text-sm font-bold"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">LOT 번호 (선택)</label>
            <input
              value={productForm.lot_number}
              onChange={(event) => updateForm({ lot_number: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="LOT-0000-00"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">시리얼 번호 (선택)</label>
            <input
              value={productForm.serial_number}
              onChange={(event) => updateForm({ serial_number: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="SERIAL-0000"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">안전 재고</label>
            <input
              type="number"
              value={productForm.min_quantity}
              onChange={(event) => updateForm({ min_quantity: parseInt(event.target.value, 10) || 0 })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">공급 업체</label>
            <select
              value={productForm.supplier_name}
              onChange={(event) => updateForm({ supplier_name: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              <option value="">업체 선택</option>
              {suppliers.map((supplier: any) => (
                <option key={supplier.id} value={supplier.name}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">보험코드 (선택)</label>
            <input
              value={productForm.insurance_code}
              onChange={(event) => updateForm({ insurance_code: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="예: B0741301"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">보유 회사 *</label>
            <select
              data-testid="inventory-registration-company"
              value={productForm.company}
              onChange={(event) => updateForm({ company: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">배정 부서</label>
            <select
              data-testid="inventory-registration-department"
              value={productForm.department}
              onChange={(event) => updateForm({ department: event.target.value })}
              className="w-full rounded-[var(--radius-md)] bg-[var(--input-bg)] p-4 text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              <option value="">미지정</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="invisible text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">UDI</label>
            <div className="flex h-[52px] items-center">
              <label className="group flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={productForm.is_udi}
                  onChange={(event) => updateForm({ is_udi: event.target.checked })}
                  className="h-6 w-6 rounded-[var(--radius-md)] accent-blue-600"
                />
                <span className="text-xs font-bold text-[var(--toss-gray-4)] transition-colors group-hover:text-[var(--accent)]">
                  UDI 공급내역 보고 대상
                </span>
              </label>
            </div>
          </div>
        </div>

        <button
          data-testid="inventory-registration-submit"
          onClick={handleRegisterProduct}
          disabled={loading}
          className="w-full rounded-[var(--radius-lg)] bg-[var(--accent)] py-5 text-sm font-bold text-white shadow-sm transition-all hover:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          ✅ 물품 자산 등록하기
        </button>
      </div>
    </div>
  );
}
