// item 워크센터 — Supabase fetch 훅
//
// inventory → 카탈로그 / 자산 / UDI
// inventory_categories → 6 대분류 카드 (parent_id 기준)

'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { INVENTORY_SELECT_COLUMNS } from '@/app/main/inventory-utils';
import type { AssetRow, CatalogRow, CategoryCard, Tone, UdiRow } from './stock-types';
import {
  asString,
  fetchAllRowsPaged,
  pickNumber,
  pickString,
  toMonthString,
  type Row } from './data-helpers';

function mapCatalogRow(r: Row): CatalogRow {
  return {
    sku: pickString(r, ['code', 'sku', 'item_code', 'barcode'], pickString(r, ['id'], '-').slice(0, 8)),
    name: pickString(r, ['name', 'item_name'], '(미명칭)'),
    cat: pickString(r, ['category', 'category_name'], '미분류'),
    unit: pickString(r, ['unit'], 'EA'),
    price: pickNumber(r, ['price', 'unit_price']),
    date: toMonthString(r['last_updated'] ?? r['created_at']),
    who: pickString(r, ['created_by_name', 'created_by'], '-') };
}

function buildCategoryCards(categories: Row[], inventory: Row[]): CategoryCard[] {
  const parents = categories.filter((c) => !c['parent_id']);
  const itemCountByCat = new Map<string, number>();
  for (const item of inventory) {
    const cat = pickString(item, ['category'], '');
    if (!cat) continue;
    itemCountByCat.set(cat, (itemCountByCat.get(cat) ?? 0) + 1);
  }
  return parents.slice(0, 6).map((p) => {
    const pid = asString(p['id']);
    const pname = pickString(p, ['name'], '-');
    const kids = categories
      .filter((c) => asString(c['parent_id']) === pid)
      .map((c) => pickString(c, ['name'], '-'));
    const items = itemCountByCat.get(pname) ?? 0;
    return { parent: pname, items, kids };
  });
}

function mapAssetRow(r: Row): AssetRow {
  const hasQr = Boolean(r['qr_code'] ?? r['barcode'] ?? r['serial_number']);
  const broken = Boolean(r['needs_repair']);
  const status: AssetRow['status'] = broken ? '수리 필요' : !hasQr ? 'QR 미부착' : '정상';
  const tone: Tone = broken ? 'danger' : !hasQr ? 'warn' : 'success';
  return {
    id: pickString(r, ['code', 'asset_id', 'id'], '-').slice(0, 16),
    name: pickString(r, ['name', 'item_name'], '(미명칭)'),
    loc: pickString(r, ['location', 'department'], '-'),
    date: toMonthString(r['purchase_date'] ?? r['last_updated'] ?? r['created_at']),
    qr: hasQr,
    status,
    tone };
}

function mapUdiRow(r: Row): UdiRow {
  return {
    udi: pickString(r, ['udi', 'udi_code', 'barcode'], '-'),
    name: pickString(r, ['name', 'item_name'], '-'),
    mfr: pickString(r, ['manufacturer', 'maker', 'supplier_name', 'supplier'], '-'),
    model: pickString(r, ['model', 'model_name', 'spec'], '-'),
    lot: pickString(r, ['lot_number', 'lot'], '-'),
    date: toMonthString(r['last_updated'] ?? r['created_at']) };
}

export type ItemWorkcenterData = {
  catalog: CatalogRow[];
  categories: CategoryCard[];
  assets: AssetRow[];
  udis: UdiRow[];
  totalCount: number;
  assetCount: number;
  udiCount: number;
  categoryCount: number;
  loading: boolean;
  error: string | null;
};

const EMPTY: ItemWorkcenterData = {
  catalog: [],
  categories: [],
  assets: [],
  udis: [],
  totalCount: 0,
  assetCount: 0,
  udiCount: 0,
  categoryCount: 0,
  loading: true,
  error: null };

export function useItemData(userCompany?: string): ItemWorkcenterData {
  const [state, setState] = useState<ItemWorkcenterData>(EMPTY);
  const companyFilter = userCompany && userCompany !== '전체' ? userCompany : null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // INV-01: limit(200) 이면 품목 1,032건 중 832건이 '품목' 수·자산·UDI 집계에서 빠진다
        // (모바일 물품·자산 헤더가 이 totalCount 를 그대로 쓴다).
        // last_updated 만으로는 동값이 많아 OFFSET 페이징 경계가 흔들리므로 id 를 2차 정렬로 둔다.
        const buildInvQ = () => {
          const q = db
            .from('inventory')
            .select(INVENTORY_SELECT_COLUMNS)
            .order('last_updated', { ascending: false })
            .order('id');
          return companyFilter ? q.eq('company', companyFilter) : q;
        };
        const [invRes, catRes] = await Promise.all([
          fetchAllRowsPaged(buildInvQ),
          db.from('inventory_categories').select('id, name, parent_id').order('name').limit(100),
        ]);

        if (cancelled) return;

        const invRows: Row[] = invRes.rows;
        const catRows: Row[] = Array.isArray(catRes.data) ? (catRes.data as Row[]) : [];

        const catalog = invRows.slice(0, 20).map(mapCatalogRow);

        const assetRows = invRows.filter((r) => {
          const c = asString(r['category']).toLowerCase();
          return c.includes('자산') || c.includes('장비') || c.includes('asset');
        });
        const assets = assetRows.slice(0, 30).map(mapAssetRow);

        const udiRows = invRows.filter((r) => r['udi'] ?? r['udi_code'] ?? r['barcode']);
        const udis = udiRows.slice(0, 30).map(mapUdiRow);

        const categories = buildCategoryCards(catRows, invRows);

        setState({
          catalog,
          categories,
          assets,
          udis,
          totalCount: invRows.length,
          assetCount: assetRows.length,
          udiCount: udiRows.length,
          categoryCount: catRows.length,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '품목 데이터를 불러오지 못했습니다.';
        setState({ ...EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [companyFilter]);

  return state;
}
