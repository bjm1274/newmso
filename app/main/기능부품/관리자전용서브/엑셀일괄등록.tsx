'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';

type UploadMode = 'staff' | 'inventory' | 'inventory_ecount';

type ExcelBulkUploadProps = {
  onRefresh?: () => void;
};

type ExcelRow = Record<string, unknown>;

type ParsedSheet = {
  rows: ExcelRow[];
  detectedCompanyName: string;
};

type ExistingInventoryRow = {
  id: string;
  company?: string | null;
  item_name?: string | null;
  name?: string | null;
  spec?: string | null;
  code?: string | null;
  item_code?: string | null;
  internal_code?: string | null;
  product_code?: string | null;
};

type SupplierRow = {
  id: string;
  name?: string | null;
};

type EcountInventoryRow = {
  itemCode: string;
  internalItemCode: string;
  itemName: string;
  spec: string;
  unit: string;
  packUnit: string;
  gradeName: string;
  purchasePrice: number;
  salePrice: number;
  insuranceCode: string;
  supplierName: string;
  manufacturerName: string;
  udiCode: string;
  modelName: string;
  reimbursementYn: string;
  permitNumber: string;
  usage: string;
};

const STAFF_FIELD_ALIASES = {
  employeeNo: ['사번', '직원번호', 'employee_no', 'employee no', 'employeeno'],
  name: ['이름', '성명', 'name'],
  company: ['회사', '회사명', 'company'],
  department: ['부서', 'department'],
  position: ['직급', '직책', 'position'],
  baseSalary: ['기본급', '연봉', 'base_salary', 'basesalary'],
  joinDate: ['입사일', 'join_date', 'joindate', 'hire_date', 'hiredate'],
} as const;

const INVENTORY_FIELD_ALIASES = {
  itemName: ['품목명', '제품명', 'item_name', 'itemname', 'name'],
  quantity: ['수량', '재고', '재고수량', 'quantity', 'qty', 'stock'],
  minQuantity: ['최소재고', '안전재고', 'min_quantity', 'minquantity', 'min_stock', 'minstock'],
  unitPrice: ['단가', '판매단가', 'unit_price', 'unitprice', 'price'],
  company: ['회사', '회사명', 'company'],
  category: ['분류', '카테고리', 'category'],
  unit: ['단위', 'unit'],
  spec: ['규격', '규격정보', 'spec'],
  supplierName: ['공급처명', '공급처', 'supplier_name', 'suppliername', 'supplier'],
  insuranceCode: ['요양급여코드', '보험코드', 'insurance_code', 'insurancecode'],
} as const;

const ECOUNT_FIELD_ALIASES = {
  itemCode: ['품목코드', 'itemcode'],
  internalItemCode: ['자사품목코드', '내부품목코드', 'internalitemcode', 'productcode'],
  itemName: ['품목명', 'itemname', 'name'],
  spec: ['규격정보', '규격', 'spec'],
  unit: ['단위', 'unit'],
  packUnit: ['포장단위', '포장', 'packunit', 'packingunit'],
  gradeName: ['등급명', 'grade', 'gradename'],
  purchasePrice: ['입고단가', '매입단가', 'purchaseprice', 'costprice'],
  salePrice: ['출고단가', '판매단가', 'saleprice', 'sellingprice'],
  insuranceCode: ['요양급여코드', '보험코드', 'insurancecode'],
  supplierName: ['공급처명', '공급처', 'suppliername', 'supplier'],
  manufacturerName: ['제조사명', '제조사', 'manufacturername', 'manufacturer', 'maker'],
  udiCode: ['대표udidi코드', 'udi', 'udicode'],
  modelName: ['식약처모델명', '모델명', 'modelname'],
  reimbursementYn: ['요양급여대상여부', '급여대상여부', 'reimbursementyn'],
  permitNumber: ['품목허가번호', '허가번호', 'permitnumber'],
  usage: ['사용', '사용여부', 'useyn', 'usage'],
} as const;

const OPTIONAL_INVENTORY_COLUMNS = [
  'name',
  'department',
  'unit',
  'spec',
  'stock',
  'min_stock',
  'price',
  'supplier_name',
  'insurance_code',
  'udi_code',
  'supplier_id',
  'code',
  'item_code',
  'internal_code',
  'product_code',
  'manufacturer_name',
  'manufacturer',
  'model_name',
  'permit_number',
  'permit_no',
  'pack_unit',
  'grade_name',
  'usage_yn',
  'reimbursement_yn',
].sort();

function buildReadableErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const messageParts = [
      normalizeText(record.message),
      normalizeText(record.error_description),
      normalizeText(record.details),
      normalizeText(record.hint),
    ].filter(Boolean);

    if (messageParts.length > 0) {
      return messageParts.join(' / ');
    }
  }

  return '알 수 없는 오류';
}

function buildErrorDebugPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      code: record.code ?? null,
      message: record.message ?? null,
      details: record.details ?? null,
      hint: record.hint ?? null,
      error_description: record.error_description ?? null,
      raw: record,
    };
  }

  return { raw: error };
}

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeHeaderKey(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[()\[\]{}:：/\\\-_.]/g, '')
    .replace(/\s+/g, '');
}

function normalizeLookupRecord(row: ExcelRow) {
  return Object.entries(row).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    const normalizedKey = normalizeHeaderKey(key);
    if (normalizedKey) {
      accumulator[normalizedKey] = value;
    }
    return accumulator;
  }, {});
}

function findCellValue(
  row: ExcelRow,
  aliases: readonly string[],
  fallbackAliases: readonly string[] = [],
) {
  const normalizedRow = normalizeLookupRecord(row);
  const normalizedAliases = [...aliases, ...fallbackAliases].map((alias) => normalizeHeaderKey(alias));

  for (const alias of normalizedAliases) {
    if (!alias) continue;
    if (Object.prototype.hasOwnProperty.call(normalizedRow, alias)) {
      return normalizedRow[alias];
    }
  }

  return '';
}

function parseIntegerValue(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const normalized = normalizeText(value).replace(/,/g, '');
  if (!normalized) return fallback;

  const matched = normalized.match(/-?\d+(\.\d+)?/);
  if (!matched) return fallback;

  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function omitColumns<T extends Record<string, unknown>>(payload: T, omittedColumns: ReadonlySet<string>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !omittedColumns.has(key)),
  ) as T;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function detectCompanyName(sheetRows: unknown[][]) {
  for (const row of sheetRows.slice(0, 5)) {
    for (const cell of row) {
      const matched = normalizeText(cell).match(/^회사명\s*[:：]\s*(.+)$/);
      if (matched?.[1]) {
        return matched[1].trim();
      }
    }
  }

  return '';
}

function detectHeaderRowIndex(sheetRows: unknown[][], mode: UploadMode) {
  const targetAliases =
    mode === 'staff'
      ? [...STAFF_FIELD_ALIASES.employeeNo, ...STAFF_FIELD_ALIASES.name]
      : mode === 'inventory'
        ? [...INVENTORY_FIELD_ALIASES.itemName, ...INVENTORY_FIELD_ALIASES.quantity]
        : [...ECOUNT_FIELD_ALIASES.itemCode, ...ECOUNT_FIELD_ALIASES.itemName, ...ECOUNT_FIELD_ALIASES.unit];

  const targetKeys = new Set(targetAliases.map((alias) => normalizeHeaderKey(alias)));
  let bestIndex = 0;
  let bestScore = -1;

  sheetRows.slice(0, 12).forEach((row, index) => {
    const score = row.reduce<number>((count, cell) => {
      return targetKeys.has(normalizeHeaderKey(cell)) ? count + 1 : count;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 2 ? bestIndex : 0;
}

function parseSheetRows(workbook: XLSX.WorkBook, mode: UploadMode): ParsedSheet {
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  const detectedCompanyName = detectCompanyName(matrix);
  const headerRowIndex = detectHeaderRowIndex(matrix, mode);
  const headers = (matrix[headerRowIndex] || []).map((cell, index) => {
    const header = normalizeText(cell);
    return header || `__column_${index}`;
  });

  const rows = matrix
    .slice(headerRowIndex + 1)
    .map((values) => {
      return headers.reduce<ExcelRow>((accumulator, header, index) => {
        accumulator[header] = values[index] ?? '';
        return accumulator;
      }, {});
    })
    .filter((row) => Object.values(row).some((value) => normalizeText(value) !== ''));

  return { rows, detectedCompanyName };
}

function normalizeUploadUsage(value: string) {
  const normalized = normalizeText(value).toUpperCase();
  if (!normalized) return 'YES';
  return ['N', 'NO', 'FALSE', '0', '미사용'].includes(normalized) ? 'NO' : 'YES';
}

function normalizeInventoryUnit(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return 'EA';

  const upper = normalized.toUpperCase();
  if (['BOX', '박스', '갑'].includes(normalized) || ['BOX', 'BX'].includes(upper)) {
    return 'BOX';
  }

  return normalized;
}

function inferEcountCategory(row: EcountInventoryRow) {
  const itemCode = normalizeText(row.itemCode);
  const itemName = normalizeText(row.itemName);
  const codePrefix = itemCode.match(/^[가-힣A-Za-z]+/)?.[0] || '';
  const searchableText = `${itemName} ${row.spec} ${row.packUnit}`.toLowerCase();

  if (codePrefix.startsWith('약')) return '약품';
  if (codePrefix.startsWith('산')) return '소모품';

  if (
    searchableText.includes('정') ||
    searchableText.includes('캡슐') ||
    searchableText.includes('주사') ||
    searchableText.includes('바이알') ||
    searchableText.includes('앰플')
  ) {
    return '약품';
  }

  if (
    codePrefix.startsWith('급') ||
    codePrefix.startsWith('비') ||
    codePrefix.startsWith('수') ||
    row.udiCode ||
    row.insuranceCode ||
    row.modelName ||
    row.permitNumber ||
    row.gradeName
  ) {
    return '의료기기';
  }

  if (
    searchableText.includes('장갑') ||
    searchableText.includes('붕대') ||
    searchableText.includes('거즈') ||
    searchableText.includes('주사침') ||
    searchableText.includes('실린지') ||
    searchableText.includes('마스크') ||
    searchableText.includes('시트')
  ) {
    return '소모품';
  }

  return '소모품';
}

function mapStaffRow(row: ExcelRow) {
  return {
    employee_no: normalizeText(findCellValue(row, STAFF_FIELD_ALIASES.employeeNo)),
    name: normalizeText(findCellValue(row, STAFF_FIELD_ALIASES.name)),
    company: normalizeText(findCellValue(row, STAFF_FIELD_ALIASES.company)),
    department: normalizeText(findCellValue(row, STAFF_FIELD_ALIASES.department)),
    position: normalizeText(findCellValue(row, STAFF_FIELD_ALIASES.position)),
    base_salary: parseIntegerValue(findCellValue(row, STAFF_FIELD_ALIASES.baseSalary)),
    join_date: normalizeText(findCellValue(row, STAFF_FIELD_ALIASES.joinDate)) || null,
  };
}

function mapInventoryRow(row: ExcelRow, defaultCompany: string) {
  return {
    item_name: normalizeText(findCellValue(row, INVENTORY_FIELD_ALIASES.itemName)),
    name: normalizeText(findCellValue(row, INVENTORY_FIELD_ALIASES.itemName)),
    quantity: parseIntegerValue(findCellValue(row, INVENTORY_FIELD_ALIASES.quantity)),
    stock: parseIntegerValue(findCellValue(row, INVENTORY_FIELD_ALIASES.quantity)),
    min_quantity: parseIntegerValue(findCellValue(row, INVENTORY_FIELD_ALIASES.minQuantity), 0),
    min_stock: parseIntegerValue(findCellValue(row, INVENTORY_FIELD_ALIASES.minQuantity), 0),
    unit_price: parseIntegerValue(findCellValue(row, INVENTORY_FIELD_ALIASES.unitPrice)),
    price: parseIntegerValue(findCellValue(row, INVENTORY_FIELD_ALIASES.unitPrice)),
    company: normalizeText(findCellValue(row, INVENTORY_FIELD_ALIASES.company)) || defaultCompany,
    category: normalizeText(findCellValue(row, INVENTORY_FIELD_ALIASES.category)) || '소모품',
    unit: normalizeInventoryUnit(normalizeText(findCellValue(row, INVENTORY_FIELD_ALIASES.unit))),
    spec: normalizeText(findCellValue(row, INVENTORY_FIELD_ALIASES.spec)) || null,
    supplier_name: normalizeText(findCellValue(row, INVENTORY_FIELD_ALIASES.supplierName)) || null,
    insurance_code: normalizeText(findCellValue(row, INVENTORY_FIELD_ALIASES.insuranceCode)) || null,
  };
}

function mapEcountInventoryRow(row: ExcelRow): EcountInventoryRow {
  return {
    itemCode: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.itemCode)),
    internalItemCode: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.internalItemCode)),
    itemName: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.itemName)),
    spec: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.spec)),
    unit: normalizeInventoryUnit(normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.unit))),
    packUnit: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.packUnit)),
    gradeName: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.gradeName)),
    purchasePrice: parseIntegerValue(findCellValue(row, ECOUNT_FIELD_ALIASES.purchasePrice)),
    salePrice: parseIntegerValue(findCellValue(row, ECOUNT_FIELD_ALIASES.salePrice)),
    insuranceCode: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.insuranceCode)),
    supplierName: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.supplierName)),
    manufacturerName: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.manufacturerName)),
    udiCode: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.udiCode)),
    modelName: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.modelName)),
    reimbursementYn: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.reimbursementYn)),
    permitNumber: normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.permitNumber)),
    usage: normalizeUploadUsage(normalizeText(findCellValue(row, ECOUNT_FIELD_ALIASES.usage))),
  };
}

function buildExistingInventoryMatch(
  existingRows: ExistingInventoryRow[],
  company: string,
  mappedRow: EcountInventoryRow,
) {
  const normalizedCompany = normalizeText(company).toLowerCase();
  const companyRows = existingRows.filter(
    (row) => normalizeText(row.company).toLowerCase() === normalizedCompany,
  );

  const candidateCodes = [
    mappedRow.itemCode,
    mappedRow.internalItemCode,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);

  if (candidateCodes.length > 0) {
    const matchedByCode = companyRows.find((row) => {
      const rowCodes = [row.code, row.item_code, row.internal_code, row.product_code]
        .map((value) => normalizeText(value).toLowerCase())
        .filter(Boolean);
      return candidateCodes.some((code) => rowCodes.includes(code));
    });

    if (matchedByCode) return matchedByCode;
  }

  const normalizedName = normalizeText(mappedRow.itemName).toLowerCase();
  const normalizedSpec = normalizeText(mappedRow.spec).toLowerCase();
  if (normalizedName && normalizedSpec) {
    const matchedByNameAndSpec = companyRows.find((row) => {
      const rowName = normalizeText(row.item_name || row.name).toLowerCase();
      const rowSpec = normalizeText(row.spec).toLowerCase();
      return rowName === normalizedName && rowSpec === normalizedSpec;
    });

    if (matchedByNameAndSpec) return matchedByNameAndSpec;
  }

  if (!normalizedName) return null;

  const matchedByName = companyRows.filter((row) => {
    const rowName = normalizeText(row.item_name || row.name).toLowerCase();
    return rowName === normalizedName;
  });

  return matchedByName.length === 1 ? matchedByName[0] : null;
}

export default function ExcelBulkUpload({ onRefresh }: ExcelBulkUploadProps) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<UploadMode>('staff');
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [defaultCompany, setDefaultCompany] = useState('SY INC.');
  const [defaultDepartment, setDefaultDepartment] = useState('');
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [sheetCompanyName, setSheetCompanyName] = useState('');
  const [companyManuallySelected, setCompanyManuallySelected] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    const loadOptions = async () => {
      const [companiesRes, staffRes, inventoryRes] = await Promise.all([
        supabase.from('companies').select('name'),
        supabase.from('staff_members').select('company, department'),
        supabase.from('inventory').select('company, department'),
      ]);

      if (!active) return;

      const companyNames = new Set<string>();
      const departments = new Set<string>();

      (companiesRes.data || []).forEach((row: { name?: string | null }) => {
        const companyName = normalizeText(row?.name);
        if (companyName) companyNames.add(companyName);
      });

      [...(staffRes.data || []), ...(inventoryRes.data || [])].forEach((row: Record<string, unknown>) => {
        const companyName = normalizeText(row?.company);
        const departmentName = normalizeText(row?.department);
        if (companyName) companyNames.add(companyName);
        if (departmentName) departments.add(departmentName);
      });

      const nextCompanies = [...companyNames].sort((left, right) => left.localeCompare(right, 'ko-KR'));
      const nextDepartments = [...departments].sort((left, right) => left.localeCompare(right, 'ko-KR'));

      setCompanyOptions(nextCompanies);
      setDepartmentOptions(nextDepartments);

      setDefaultCompany((previous) => {
        if (normalizeText(previous)) return previous;
        return nextCompanies[0] || 'SY INC.';
      });
    };

    loadOptions().catch((error) => {
      console.error('bulk upload options load failed:', error);
    });

    return () => {
      active = false;
    };
  }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const parsedSheet = parseSheetRows(workbook, mode);
      const effectiveDetectedCompany = parsedSheet.detectedCompanyName;
      const effectiveCompany =
        companyManuallySelected || !effectiveDetectedCompany
          ? normalizeText(defaultCompany) || effectiveDetectedCompany || 'SY INC.'
          : effectiveDetectedCompany;

      if (!companyManuallySelected && effectiveDetectedCompany) {
        setDefaultCompany(effectiveDetectedCompany);
      }
      setSheetCompanyName(effectiveDetectedCompany);

      if (parsedSheet.rows.length === 0) {
        toast('업로드할 데이터가 없습니다.', 'warning');
        return;
      }

      if (mode === 'staff') {
        const payloads = parsedSheet.rows
          .map(mapStaffRow)
          .filter((row) => row.employee_no);

        setPreview(payloads.slice(0, 10));

        if (payloads.length === 0) {
          toast('직원 엑셀에서 사번을 찾지 못했습니다.', 'warning');
          return;
        }

        const { error } = await supabase.from('staff_members').upsert(payloads, {
          onConflict: 'employee_no',
        });

        if (error) throw error;

        toast(`직원 ${payloads.length}건 등록을 완료했습니다.`, 'success');
      } else if (mode === 'inventory') {
        const payloads = parsedSheet.rows
          .map((row) => mapInventoryRow(row, effectiveCompany))
          .filter((row) => row.item_name);

        setPreview(payloads.slice(0, 10));

        if (payloads.length === 0) {
          toast('재고 엑셀에서 품목명을 찾지 못했습니다.', 'warning');
          return;
        }

        for (const batch of chunkArray(payloads, 100)) {
          const { error } = await withMissingColumnsFallback(
            (omittedColumns) =>
              supabase.from('inventory').insert(batch.map((payload) => omitColumns(payload, omittedColumns))),
            OPTIONAL_INVENTORY_COLUMNS,
          );

          if (error) throw error;
        }

        toast(`재고 ${payloads.length}건 등록을 완료했습니다.`, 'success');
      } else {
        const mappedRows = parsedSheet.rows
          .map(mapEcountInventoryRow)
          .filter((row) => row.itemName && row.usage !== 'NO');

        setPreview(
          mappedRows.slice(0, 10).map((row) => ({
            회사: effectiveCompany,
            품목코드: row.itemCode,
            자사품목코드: row.internalItemCode,
            품목명: row.itemName,
            규격: row.spec,
            단위: row.unit,
            공급처: row.supplierName,
            요양급여코드: row.insuranceCode,
          })),
        );

        if (mappedRows.length === 0) {
          toast('이카운트 양식에서 등록 가능한 품목을 찾지 못했습니다.', 'warning');
          return;
        }

        const existingColumns = ['id', 'company', 'item_name', 'name', 'spec', 'code', 'item_code', 'internal_code', 'product_code'];
        const { data: existingInventory, error: existingError } = await withMissingColumnsFallback(
          (omittedColumns) => {
            const selectColumns = existingColumns.filter((column) => !omittedColumns.has(column)).join(', ');
            return supabase.from('inventory').select(selectColumns);
          },
          ['name', 'spec', 'code', 'item_code', 'internal_code', 'product_code'],
        );

        if (existingError) {
          console.warn('ecount upload existing inventory lookup skipped:', buildErrorDebugPayload(existingError));
        }

        const { data: suppliers, error: suppliersError } = await supabase.from('suppliers').select('id, name');
        if (suppliersError) {
          console.warn('ecount upload supplier lookup skipped:', buildErrorDebugPayload(suppliersError));
        }

        const existingRows = (existingInventory || []) as unknown as ExistingInventoryRow[];
        const supplierRows = suppliersError ? [] : ((suppliers || []) as SupplierRow[]);
        const supplierByName = supplierRows.reduce<Record<string, SupplierRow>>((accumulator, row) => {
          const key = normalizeText(row.name).toLowerCase();
          if (key) {
            accumulator[key] = row;
          }
          return accumulator;
        }, {});

        let insertedCount = 0;
        let updatedCount = 0;

        const payloads = mappedRows.map((row) => {
          const matchedRow = buildExistingInventoryMatch(existingRows, effectiveCompany, row);
          const supplierMatch = supplierByName[normalizeText(row.supplierName).toLowerCase()];
          const payload: Record<string, unknown> = {
            id: matchedRow?.id || crypto.randomUUID(),
            item_name: row.itemName,
            name: row.itemName,
            company: effectiveCompany,
            department: normalizeText(defaultDepartment) || null,
            category: inferEcountCategory(row),
            quantity: 0,
            stock: 0,
            min_quantity: 0,
            min_stock: 0,
            unit_price: row.purchasePrice || row.salePrice || 0,
            price: row.salePrice || row.purchasePrice || 0,
            unit: row.unit || 'EA',
            spec: row.spec || null,
            supplier_name: row.supplierName || null,
            supplier_id: supplierMatch?.id || null,
            insurance_code: row.insuranceCode || null,
            udi_code: row.udiCode || null,
            is_udi: Boolean(row.udiCode),
            code: row.itemCode || row.internalItemCode || null,
            item_code: row.itemCode || null,
            internal_code: row.internalItemCode || null,
            product_code: row.internalItemCode || row.itemCode || null,
            manufacturer_name: row.manufacturerName || null,
            manufacturer: row.manufacturerName || null,
            model_name: row.modelName || null,
            permit_number: row.permitNumber || null,
            permit_no: row.permitNumber || null,
            pack_unit: row.packUnit || null,
            grade_name: row.gradeName || null,
            usage_yn: row.usage,
            reimbursement_yn: row.reimbursementYn || null,
          };

          if (matchedRow?.id) {
            updatedCount += 1;
          } else {
            insertedCount += 1;
          }

          return payload;
        });

        for (const batch of chunkArray(payloads, 150)) {
          const { error } = await withMissingColumnsFallback(
            (omittedColumns) =>
              supabase
                .from('inventory')
                .upsert(batch.map((payload) => omitColumns(payload, omittedColumns)), {
                  onConflict: 'id',
                }),
            OPTIONAL_INVENTORY_COLUMNS,
          );

          if (error) throw error;
        }

        toast(
          `이카운트 품목표 반영 완료: 신규 ${insertedCount}건, 업데이트 ${updatedCount}건`,
          'success',
        );
      }

      setPreview([]);
      onRefresh?.();
    } catch (error) {
      const readableError = buildReadableErrorMessage(error);
      console.warn('excel bulk upload failed:', buildErrorDebugPayload(error));
      toast(`엑셀 파일 처리에 실패했습니다.\n\n${readableError}`, 'error');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const isEcount = mode === 'inventory_ecount';
  const mergedCompanyOptions = [...new Set([sheetCompanyName, defaultCompany, ...companyOptions].filter(Boolean))];

  return (
    <div className="max-w-3xl rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <h3 className="mb-2 text-base font-bold text-[var(--foreground)]">엑셀 일괄 등록</h3>
      <p className="mb-3 text-xs font-bold text-[var(--toss-gray-3)]">
        엑셀 양식을 읽어 직원, 재고, 이카운트 품목표를 한 번에 반영합니다.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="excel-bulk-mode-staff"
          onClick={() => setMode('staff')}
          className={`rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold ${
            mode === 'staff'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
          }`}
        >
          직원
        </button>
        <button
          type="button"
          data-testid="excel-bulk-mode-inventory"
          onClick={() => setMode('inventory')}
          className={`rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold ${
            mode === 'inventory'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
          }`}
        >
          재고
        </button>
        <button
          type="button"
          data-testid="excel-bulk-mode-inventory-ecount"
          onClick={() => setMode('inventory_ecount')}
          className={`rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold ${
            mode === 'inventory_ecount'
              ? 'bg-teal-600 text-white'
              : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
          }`}
        >
          이카운트 품목표
        </button>
      </div>

      {isEcount && (
        <div className="mb-4 space-y-3 rounded-[var(--radius-md)] border border-teal-100 bg-teal-50 p-3 text-[11px] text-teal-800">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-bold text-[var(--toss-gray-4)]">등록 회사</span>
              <select
                data-testid="inventory-ecount-company-select"
                value={defaultCompany}
                onChange={(event) => {
                  setCompanyManuallySelected(true);
                  setDefaultCompany(event.target.value);
                }}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-2 py-2 text-sm"
              >
                {mergedCompanyOptions.length === 0 && <option value="SY INC.">SY INC.</option>}
                {mergedCompanyOptions.map((companyName) => (
                  <option key={companyName} value={companyName}>
                    {companyName}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-bold text-[var(--toss-gray-4)]">등록 부서</span>
              <select
                data-testid="inventory-ecount-department-select"
                value={defaultDepartment}
                onChange={(event) => setDefaultDepartment(event.target.value)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-2 py-2 text-sm"
              >
                <option value="">미지정</option>
                {departmentOptions.map((departmentName) => (
                  <option key={departmentName} value={departmentName}>
                    {departmentName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-[var(--radius-md)] bg-white/70 px-3 py-2 text-[11px] text-teal-900">
            <strong>자동 매핑 기준:</strong> 품목명, 품목코드, 자사품목코드, 규격, 단위, 공급처, 요양급여코드,
            UDI, 허가번호를 최대한 보존해서 `inventory`에 등록합니다. 수량/현재고는 품목등록표에 없어서
            `0`으로 넣습니다.
          </div>

          {sheetCompanyName && (
            <p className="text-[11px] text-teal-900">
              양식에서 감지한 회사명: <strong>{sheetCompanyName}</strong>
            </p>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        data-testid="excel-bulk-upload-input"
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFile}
        className="hidden"
      />

      <button
        type="button"
        data-testid="excel-bulk-upload-trigger"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-2 text-sm font-bold text-white hover:bg-[var(--accent)] disabled:opacity-50"
      >
        {loading ? '처리 중...' : '엑셀 파일 선택'}
      </button>

      {preview.length > 0 && (
        <div
          data-testid="excel-bulk-preview"
          className="mt-4 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--muted)] p-4 text-[11px]"
        >
          <p className="mb-2 font-bold">미리보기 (상위 10건)</p>
          <pre>{JSON.stringify(preview, null, 2).slice(0, 1200)}...</pre>
        </div>
      )}
    </div>
  );
}
