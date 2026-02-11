'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ESLint 규칙에 맞게 컴포넌트 이름을 영문 대문자로 시작하게 변경합니다.
// default export 이므로 외부에서의 import 이름(부서별물품장비현황)은 그대로 유지됩니다.
export default function DepartmentAssetOverview({ user, inventory: inventoryProp }: { user: any; inventory?: any[] }) {
  const [assetLoans, setAssetLoans] = useState<any[]>([]);
  const [inventoryFetched, setInventoryFetched] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDept, setViewDept] = useState<string>('');

  const inventory = (inventoryProp?.length ? inventoryProp : inventoryFetched) || [];

  const myDept = (user?.department || '').trim();
  const myCompany = (user?.company || '').trim();
  const effectiveDept = viewDept || myDept;

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (!inventoryProp?.length) {
        const { data: inv } = await supabase.from('inventory').select('*').order('name');
        setInventoryFetched(inv || []);
      }
      const { data } = await supabase
        .from('asset_loans')
        .select('id, asset_type, asset_name, loaned_at, returned_at, staff_id')
        .is('returned_at', null);
      const list = data || [];
      if (list.length === 0) {
        setAssetLoans([]);
        setLoading(false);
        return;
      }
      const staffIds = [...new Set(list.map((r: any) => r.staff_id))];
      const { data: staffs } = await supabase.from('staff_members').select('id, name, department, company').in('id', staffIds);
      const staffMap: Record<string, any> = {};
      (staffs || []).forEach((s: any) => { staffMap[s.id] = s; });
      setAssetLoans(list.map((r: any) => ({ ...r, staff: staffMap[r.staff_id] })));
      setLoading(false);
    })();
  }, [inventoryProp?.length]);

  // 우리 부서 물품: 회사 일치 + 부서 일치(또는 부서 미지정만 보려면 effectiveDept 있을 때만)
  const deptItems = inventory.filter((item: any) => {
    const coMatch = !myCompany || item.company === myCompany;
    const deptMatch = !effectiveDept || (item.department || '').trim() === effectiveDept;
    return coMatch && deptMatch;
  });

  // 우리 부서 장비: 미반납 대여 중 직원의 부서가 우리 부서인 것
  const deptAssets = assetLoans.filter((r: any) => (r.staff?.department || '').trim() === effectiveDept);

  const departments = Array.from(new Set([
    ...inventory.map((i: any) => (i.department || '').trim()).filter(Boolean),
    ...assetLoans.map((r: any) => (r.staff?.department || '').trim()).filter(Boolean)
  ])).sort();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-xl font-black text-gray-800">🏢 부서별 물품·장비 현황</h2>
        {departments.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black text-gray-400 uppercase">조회 부서</label>
            <select
              value={viewDept}
              onChange={e => setViewDept(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"
            >
              <option value="">내 부서 ({myDept || '미지정'})</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!effectiveDept && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          부서가 지정되지 않은 경우 위에서 조회 부서를 선택하면 해당 부서의 물품·장비를 볼 수 있습니다.
        </div>
      )}

      {/* 우리 부서 물품 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
          📦 {effectiveDept ? `[${effectiveDept}] 물품 재고` : '물품 재고 (부서 선택 시 필터)'}
        </h3>
        {loading ? (
          <p className="text-gray-400 text-sm">로딩 중...</p>
        ) : deptItems.length === 0 ? (
          <p className="text-gray-400 text-sm">해당 부서에 배정된 물품이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase">
                  <th className="pb-3 pr-4">품목명</th>
                  <th className="pb-3 pr-4">분류</th>
                  <th className="pb-3 pr-4">잔여 수량</th>
                  <th className="pb-3 pr-4">최소재고</th>
                  <th className="pb-3 pr-4">상태</th>
                </tr>
              </thead>
              <tbody>
                {deptItems.map((item: any) => (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="py-3 pr-4 font-bold text-gray-900">{item.name || item.item_name}</td>
                    <td className="py-3 pr-4 text-gray-500">{item.category || '-'}</td>
                    <td className="py-3 pr-4 font-black text-gray-800">{item.stock ?? item.quantity ?? 0}</td>
                    <td className="py-3 pr-4 text-gray-500">{item.min_stock ?? item.min_quantity ?? '-'}</td>
                    <td className="py-3 pr-4">
                      {(item.stock ?? item.quantity ?? 0) <= (item.min_stock ?? item.min_quantity ?? 0) ? (
                        <span className="text-red-600 text-[10px] font-black">발주 필요</span>
                      ) : (
                        <span className="text-emerald-600 text-[10px] font-black">정상</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 우리 부서 장비 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-black text-gray-700 mb-4 flex items-center gap-2">
          🖥️ {effectiveDept ? `[${effectiveDept}] 보유 장비 (미반납)` : '보유 장비 (부서 선택 시 필터)'}
        </h3>
        {loading ? (
          <p className="text-gray-400 text-sm">로딩 중...</p>
        ) : deptAssets.length === 0 ? (
          <p className="text-gray-400 text-sm">해당 부서에서 사용 중인 장비가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase">
                  <th className="pb-3 pr-4">장비 종류</th>
                  <th className="pb-3 pr-4">장비명</th>
                  <th className="pb-3 pr-4">사용자</th>
                  <th className="pb-3 pr-4">대여일</th>
                </tr>
              </thead>
              <tbody>
                {deptAssets.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-3 pr-4 font-bold text-gray-900">{r.asset_type}</td>
                    <td className="py-3 pr-4 text-gray-600">{r.asset_name || '-'}</td>
                    <td className="py-3 pr-4 text-gray-700">{r.staff?.name ?? '-'}</td>
                    <td className="py-3 pr-4 text-gray-500">{r.loaned_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
