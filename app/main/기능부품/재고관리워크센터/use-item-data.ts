// item 워크센터 — Supabase fetch 훅
//
// inventory → 카탈로그 / 자산 / UDI
// inventory_categories → 6 대분류 카드 (parent_id 기준)

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AssetRow, CatalogRow, CategoryCard, Tone, UdiRow } from './stock-types';
import { asString, pickNumber, pickString, toMonthString, type Row } from './data-helpers';

function mapCatalogRow(r: Row): CatalogRow {
  return {
    sku: pickString(r, ['code', 'sku', 'item_code'], pickString(r, ['id'], '-').slice(0, 8)),
    name: pickString(r, ['name', 'item_name'], '(미명칭)'),
    cat: pickString(r, ['category', 'category_name'], '미분류'),
    unit: pickString(r, ['unit'], 'EA'),
    price: pickNumber(r, ['price', 'unit_price']),
    date: toMonthString(r['created_at']),
    who: pickString(r, ['created_by_name', 'created_by'], '-'),
  };
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
  const hasQr = Boolean(r['qr_code'] ?? r['barcode']);
  const broken = Boolean(r['needs_repair']);
  const status: AssetRow['status'] = broken ? '수리 필요' : !hasQr ? 'QR 미부착' : '정상';
  const tone: Tone = broken ? 'danger' : !hasQr ? 'warn' : 'success';
  return {
    id: pickString(r, ['code', 'asset_id', 'id'], '-').slice(0, 16),
    name: pickString(r, ['name', 'item_name'], '(미명칭)'),
    loc: pickString(r, ['location', 'department'], '-'),
    date: toMonthString(r['purchase_date'] ?? r['created_at']),
    qr: hasQr,
    status,
    tone,
  };
}

function mapUdiRow(r: Row): UdiRow {
  return {
    udi: pickString(r, ['udi', 'udi_code', 'barcode'], '-'),
    name: pickString(r, ['name', 'item_name'], '-'),
    mfr: pickString(r, ['manufacturer', 'maker'], '-'),
    model: pickString(r, ['model', 'model_name'], '-'),
    lot: pickString(r, ['lot_number', 'lot'], '-'),
    date: toMonthString(r['created_at']),
  };
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
  error: null,
};

export function useItemData(): ItemWorkcenterData {
  const [state, setState] = useState<ItemWorkcenterData>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [invRes, catRes] = await Promise.all([
          supabase
            .from('inventory')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200),
          supabase.from('inventory_categories').select('*').order('name').limit(100),
        ]);

        if (cancelled) return;

        const invRows: Row[] = Array.isArray(invRes.data) ? (invRes.data as Row[]) : [];
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
          error: null,
        });
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
  }, []);

  return state;
}
