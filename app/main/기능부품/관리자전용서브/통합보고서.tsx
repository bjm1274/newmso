'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import * as XLSX from 'xlsx';

type ReportTab = '인사현황' | '급여요약' | '재고현황';

interface StaffMember {
  dept?: string;
  department?: string;
  employment_type?: string;
  contract_type?: string;
  base_salary?: number;
  [key: string]: unknown;
}

const PIE_COLORS = ['#4F8EF7', '#34C759', '#FF9500', '#FF6B6B', '#AF52DE', '#5AC8FA'];

export default function IntegratedReport({ staffs = [] }: { staffs: StaffMember[] }) {
  const [activeTab, setActiveTab] = useState<ReportTab>('인사현황');
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  useEffect(() => {
    const fetchInventory = async () => {
      setLoadingInventory(true);
      const { data } = await supabase.from('inventory').select('*');
      if (data) setInventory(data);
      setLoadingInventory(false);
    };
    fetchInventory();
  }, []);

  // ── 인사현황 데이터 ──
  const deptMap: Record<string, { total: number; regular: number; contract: number }> = {};
  staffs.forEach((s: StaffMember) => {
    const dept = String(s.dept || s.department || '미분류');
    if (!deptMap[dept]) deptMap[dept] = { total: 0, regular: 0, contract: 0 };
    deptMap[dept].total++;
    if (s.employment_type === '계약직' || s.contract_type === '계약직') {
      deptMap[dept].contract++;
    } else {
      deptMap[dept].regular++;
    }
  });

  const hrChartData = Object.entries(deptMap).map(([dept, v]) => ({
    name: dept,
    value: v.total,
    regular: v.regular,
    contract: v.contract,
  }));

  const totalRegular = staffs.filter((s: StaffMember) => s.employment_type !== '계약직' && s.contract_type !== '계약직').length;
  const totalContract = staffs.length - totalRegular;
  const employmentPieData = [
    { name: '정규직', value: totalRegular },
    { name: '계약직', value: totalContract },
  ].filter(d => d.value > 0);

  // ── 급여 요약 데이터 ──
  const totalSalary = staffs.reduce((acc: number, s: StaffMember) => acc + (s.base_salary || 0), 0);

  const salaryByDept: Record<string, number> = {};
  staffs.forEach((s: StaffMember) => {
    const dept = String(s.dept || s.department || '미분류');
    salaryByDept[dept] = (salaryByDept[dept] || 0) + (s.base_salary || 0);
  });

  const salaryChartData = Object.entries(salaryByDept).map(([dept, total]) => ({
    dept,
    total,
  }));

  // ── 재고 현황 데이터 ──
  const categoryMap: Record<string, { count: number; totalAmount: number }> = {};
  inventory.forEach((item: Record<string, unknown>) => {
    const cat = String(item.category || '미분류');
    if (!categoryMap[cat]) categoryMap[cat] = { count: 0, totalAmount: 0 };
    categoryMap[cat].count++;
    categoryMap[cat].totalAmount += (Number(item.unit_price || item.price || 0)) * (Number(item.quantity || 1));
  });

  const inventoryChartData = Object.entries(categoryMap).map(([category, v]) => ({
    category,
    count: v.count,
    totalAmount: v.totalAmount,
  }));

  // ── Excel 다운로드 ──
  const handleExcelDownload = () => {
    let sheetData: unknown[][] = [];
    let sheetName = '';

    if (activeTab === '인사현황') {
      sheetName = '인사현황';
      sheetData = [
        ['부서', '총인원', '정규직', '계약직'],
        ...hrChartData.map(r => [r.name, r.value, r.regular, r.contract]),
        [],
        ['합계', staffs.length, totalRegular, totalContract],
      ];
    } else if (activeTab === '급여요약') {
      sheetName = '급여요약';
      sheetData = [
        ['부서', '인건비 합계 (원)'],
        ...salaryChartData.map(r => [r.dept, r.total]),
        [],
        ['전체 합계', totalSalary],
      ];
    } else if (activeTab === '재고현황') {
      sheetName = '재고현황';
      sheetData = [
        ['카테고리', '품목 수', '총 금액 (원)'],
        ...inventoryChartData.map(r => [r.category, r.count, r.totalAmount]),
      ];
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── PDF 다운로드 ──
  const handlePdfDownload = () => {
    window.print();
  };

  const tabs: { id: ReportTab; label: string }[] = [
    { id: '인사현황', label: '인사현황 보고서' },
    { id: '급여요약', label: '급여 요약' },
    { id: '재고현황', label: '재고 현황' },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300" data-testid="admin-analysis-report">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">통합 보고서</h2>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handleExcelDownload}
            className="px-4 py-2 rounded-[var(--radius-md)] bg-[#217346] text-white text-sm font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            <span>Excel 다운로드</span>
          </button>
          <button
            onClick={handlePdfDownload}
            className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--toss-gray-2,#6B7684)] text-white text-sm font-bold hover:opacity-90 transition-opacity"
          >
            PDF 다운로드
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[var(--muted)] p-1 rounded-[var(--radius-md)] w-fit print:hidden">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-[var(--radius-md)] text-sm font-bold transition-all ${activeTab === tab.id
              ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
              : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 인사현황 보고서 */}
      {activeTab === '인사현황' && (
        <div className="space-y-4">
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '전체 인원', value: `${staffs.length}명`, color: 'text-[var(--accent)]' },
              { label: '정규직', value: `${totalRegular}명`, color: 'text-[#34C759]' },
              { label: '계약직', value: `${totalContract}명`, color: 'text-[#FF9500]' },
              { label: '부서 수', value: `${hrChartData.length}개`, color: 'text-[var(--foreground)]' },
            ].map(card => (
              <div key={card.label} className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
                <div className="text-xs text-[var(--toss-gray-3)] font-bold mb-1">{card.label}</div>
                <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* 차트 영역 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 부서별 인원 바 차트 */}
            <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
              <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">부서별 인원</h3>
              {hrChartData.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">데이터가 없습니다.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hrChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
                    <Tooltip
                      formatter={(value: any) => [`${value || 0}명`]}
                      contentStyle={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}
                    />
                    <Bar dataKey="regular" name="정규직" stackId="a" fill="#4F8EF7" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="contract" name="계약직" stackId="a" fill="#FF9500" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 고용형태 파이 차트 */}
            <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
              <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">고용형태 비율</h3>
              {employmentPieData.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">데이터가 없습니다.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={employmentPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {employmentPieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => [`${value || 0}명`]}
                      contentStyle={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 부서별 상세 테이블 */}
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <span className="text-sm font-bold text-[var(--foreground)]">부서별 상세</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--muted)]">
                    <th className="text-left px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">부서</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">총인원</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">정규직</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">계약직</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">비율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {hrChartData.map(row => (
                    <tr key={row.name} className="hover:bg-[var(--muted)]/50 transition-colors">
                      <td className="px-4 py-2 font-bold text-[var(--foreground)]">{row.name}</td>
                      <td className="px-4 py-2 text-right font-bold text-[var(--accent)]">{row.value}</td>
                      <td className="px-4 py-2 text-right text-[var(--foreground)]">{row.regular}</td>
                      <td className="px-4 py-2 text-right text-[var(--foreground)]">{row.contract}</td>
                      <td className="px-4 py-2 text-right text-[var(--toss-gray-3)]">
                        {row.value > 0 ? `정규 ${(row.regular / row.value * 100).toFixed(0)}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 급여 요약 */}
      {activeTab === '급여요약' && (
        <div className="space-y-4">
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: '전체 인건비 합계', value: `${totalSalary.toLocaleString()}원`, color: 'text-[var(--accent)]' },
              { label: '1인 평균 급여', value: staffs.length > 0 ? `${Math.round(totalSalary / staffs.length).toLocaleString()}원` : '-', color: 'text-[var(--foreground)]' },
              { label: '급여 데이터 인원', value: `${staffs.filter((s: StaffMember) => (s.base_salary ?? 0) > 0).length}명`, color: 'text-[#34C759]' },
            ].map(card => (
              <div key={card.label} className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
                <div className="text-xs text-[var(--toss-gray-3)] font-bold mb-1">{card.label}</div>
                <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* 부서별 인건비 바 차트 */}
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">부서별 인건비</h3>
            {salaryChartData.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">데이터가 없습니다.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={salaryChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="dept" tick={{ fontSize: 12, fill: 'var(--toss-gray-3)' }} />
                  <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
                  <Tooltip
                    formatter={(value: any) => [`${(value || 0).toLocaleString()}원`, '인건비']}
                    contentStyle={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}
                  />
                  <Bar dataKey="total" name="인건비" fill="#4F8EF7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 부서별 급여 테이블 */}
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <span className="text-sm font-bold text-[var(--foreground)]">부서별 급여 상세</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--muted)]">
                    <th className="text-left px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">부서</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">인건비 합계</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">비율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {salaryChartData
                    .sort((a, b) => b.total - a.total)
                    .map(row => (
                      <tr key={row.dept} className="hover:bg-[var(--muted)]/50 transition-colors">
                        <td className="px-4 py-2 font-bold text-[var(--foreground)]">{row.dept}</td>
                        <td className="px-4 py-2 text-right font-bold text-[var(--accent)]">{row.total.toLocaleString()}원</td>
                        <td className="px-4 py-2 text-right text-[var(--toss-gray-3)]">
                          {totalSalary > 0 ? `${(row.total / totalSalary * 100).toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 재고 현황 */}
      {activeTab === '재고현황' && (
        <div className="space-y-4">
          {loadingInventory ? (
            <div className="py-20 text-center text-sm text-[var(--toss-gray-3)]">재고 데이터를 불러오는 중...</div>
          ) : (
            <>
              {/* 요약 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: '전체 품목 수', value: `${inventory.length}개`, color: 'text-[var(--accent)]' },
                  { label: '카테고리 수', value: `${inventoryChartData.length}개`, color: 'text-[var(--foreground)]' },
                  {
                    label: '총 재고 금액',
                    value: `${inventoryChartData.reduce((acc, r) => acc + r.totalAmount, 0).toLocaleString()}원`,
                    color: 'text-[#34C759]'
                  },
                ].map(card => (
                  <div key={card.label} className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
                    <div className="text-xs text-[var(--toss-gray-3)] font-bold mb-1">{card.label}</div>
                    <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                  </div>
                ))}
              </div>

              {/* 카테고리별 파이 차트 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
                  <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">카테고리별 품목 수</h3>
                  {inventoryChartData.length === 0 ? (
                    <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">데이터가 없습니다.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={inventoryChartData.map(d => ({ name: d.category, value: d.count }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {inventoryChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => [`${value || 0}개`]}
                          contentStyle={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* 카테고리별 금액 바 차트 */}
                <div className="bg-[var(--card)] rounded-[var(--radius-lg)] p-4 border border-[var(--border)] shadow-sm">
                  <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">카테고리별 재고 금액</h3>
                  {inventoryChartData.length === 0 ? (
                    <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">데이터가 없습니다.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={inventoryChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
                        <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11, fill: 'var(--toss-gray-3)' }} />
                        <Tooltip
                          formatter={(value: any) => [`${(value || 0).toLocaleString()}원`, '재고 금액']}
                          contentStyle={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)' }}
                        />
                        <Bar dataKey="totalAmount" name="재고 금액" fill="#34C759" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* 카테고리별 테이블 */}
              <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--border)]">
                  <span className="text-sm font-bold text-[var(--foreground)]">카테고리별 재고 상세</span>
                </div>
                {inventoryChartData.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">재고 데이터가 없습니다.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--muted)]">
                          <th className="text-left px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">카테고리</th>
                          <th className="text-right px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">품목 수</th>
                          <th className="text-right px-4 py-2 text-xs font-bold text-[var(--toss-gray-3)]">총 금액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {inventoryChartData
                          .sort((a, b) => b.totalAmount - a.totalAmount)
                          .map(row => (
                            <tr key={row.category} className="hover:bg-[var(--muted)]/50 transition-colors">
                              <td className="px-4 py-2 font-bold text-[var(--foreground)]">{row.category}</td>
                              <td className="px-4 py-2 text-right text-[var(--foreground)]">{row.count}개</td>
                              <td className="px-4 py-2 text-right font-bold text-[#34C759]">{row.totalAmount.toLocaleString()}원</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
