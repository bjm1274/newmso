'use client';
import { toast } from '@/lib/toast';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getItemName, getItemQuantity, validateInventoryQuantity } from '@/app/main/inventory-utils';

type CountItem = {
  id: string;
  item_name: string;
  category: string;
  company: string;
  expected: number;
  actual: string; // 입력값 (string)
};

export default function InventoryCount({ user, inventory, fetchInventory }: { user: any; inventory: any[]; fetchInventory: () => void }) {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [items, setItems] = useState<CountItem[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<any[] | null>(null);

  const startSession = () => {
    const list: CountItem[] = inventory.map(item => ({
      id: item.id,
      item_name: getItemName(item),
      category: item.category || '-',
      company: item.company || '-',
      expected: getItemQuantity(item),
      actual: '',
    }));
    setItems(list);
    setSessionStarted(true);
    setReport(null);
  };

  const setActual = (id: string, val: string) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, actual: val } : it));
  };

  const filtered = items.filter(it =>
    !search || it.item_name.includes(search) || it.category.includes(search) || it.company.includes(search)
  );

  const enteredCount = items.filter(it => it.actual !== '').length;
  const invalidEntries = items.filter((item) => {
    if (item.actual === '') return false;
    return Boolean(
      validateInventoryQuantity(item.actual, {
        label: '실물 수량',
        allowEmpty: true,
      }).error,
    );
  });
  const discrepancies = items.filter((item) => {
    const { quantity } = validateInventoryQuantity(item.actual, {
      label: '실물 수량',
      allowEmpty: true,
    });
    return quantity !== null && quantity !== item.expected;
  });

  const handleComplete = async () => {
    if (invalidEntries.length > 0) {
      const preview = invalidEntries.slice(0, 5).map((item) => `- ${item.item_name}`).join('\n');
      const suffix = invalidEntries.length > 5 ? `\n외 ${invalidEntries.length - 5}개 품목` : '';
      toast(`실물 수량을 다시 확인하세요.\n${preview}${suffix}`, 'warning');
      return;
    }

    const unenteredCount = items.filter(it => it.actual === '').length;
    if (unenteredCount > 0) {
      if (!confirm(`아직 ${unenteredCount}개 품목의 실사 수량이 입력되지 않았습니다.\n미입력 품목은 제외하고 완료하시겠습니까?`)) return;
    }
    setSaving(true);
    try {
      const entered = items.flatMap((item) => {
        const { quantity } = validateInventoryQuantity(item.actual, {
          label: '실물 수량',
          allowEmpty: true,
        });

        return quantity === null ? [] : [{
          ...item,
          actualQuantity: quantity,
        }];
      });
      const discrepancyList = entered.filter(item => item.actualQuantity !== item.expected);

      // 차이 있는 품목만 DB 업데이트
      for (const item of discrepancyList) {
        await supabase.from('inventory').update({ quantity: item.actualQuantity, stock: item.actualQuantity }).eq('id', item.id);
        await supabase.from('inventory_logs').insert([{
          item_id: item.id,
          inventory_id: item.id,
          type: '실사조정',
          change_type: '실사조정',
          quantity: Math.abs(item.actualQuantity - item.expected),
          prev_quantity: item.expected,
          next_quantity: item.actualQuantity,
          actor_name: user?.name,
          company: item.company,
        }]);
      }

      // 실사 기록 저장
      try {
        await supabase.from('inventory_count_sessions').insert([{
          conducted_by: user?.id,
          conducted_name: user?.name,
          total_items: entered.length,
          discrepancy_count: discrepancyList.length,
          report: entered.map(item => ({
            id: item.id,
            item_name: item.item_name,
            category: item.category,
            expected: item.expected,
            actual: item.actualQuantity,
            diff: item.actualQuantity - item.expected,
          })),
          created_at: new Date().toISOString(),
        }]);
      } catch {
        // inventory_count_sessions 테이블 미존재 시 무시 (선택적 기록)
      }

      setReport(discrepancyList.map(item => ({
        item_name: item.item_name,
        category: item.category,
        expected: item.expected,
        actual: item.actualQuantity,
        diff: item.actualQuantity - item.expected,
      })));
      fetchInventory();
      setSessionStarted(false);
    } catch (err) {
      toast('실사 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 실사 전
  if (!sessionStarted && !report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl">📦</div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">재고 실사</h2>
          <p className="text-sm text-[var(--toss-gray-3)] max-w-sm leading-relaxed">
            현재 등록된 모든 재고 품목에 대해 실물 수량을 입력하고<br/>
            장부 수량과의 차이를 자동으로 조정합니다.
          </p>
          <p className="text-xs text-[var(--toss-gray-3)] mt-2">대상 품목: {inventory.length}개</p>
        </div>
        <button
          onClick={startSession}
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-bold text-sm shadow-sm hover:opacity-90 transition-all"
        >
          실사 시작
        </button>
      </div>
    );
  }

  // 실사 완료 리포트
  if (report) {
    return (
      <div className="space-y-4">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">✅</span>
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">실사 완료</h3>
              <p className="text-xs text-[var(--toss-gray-3)]">{new Date().toLocaleString('ko-KR')} · {user?.name}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[var(--muted)] rounded-[var(--radius-md)] p-3 text-center">
              <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">실사 품목</p>
              <p className="text-xl font-bold text-[var(--accent)]">{enteredCount}개</p>
            </div>
            <div className="bg-[var(--muted)] rounded-[var(--radius-md)] p-3 text-center">
              <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">수량 차이 조정</p>
              <p className="text-xl font-bold text-orange-500">{report.length}개</p>
            </div>
          </div>
          {report.length === 0 ? (
            <p className="text-center text-emerald-600 font-bold text-sm py-4">모든 품목의 실물 수량이 장부와 일치합니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[400px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">
                    <th className="py-2 px-3">품목</th><th className="py-2 px-3 text-center">장부</th><th className="py-2 px-3 text-center">실물</th><th className="py-2 px-3 text-center">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--border)]">
                      <td className="py-2 px-3 font-medium">{r.item_name} <span className="text-[var(--toss-gray-3)]">{r.category}</span></td>
                      <td className="py-2 px-3 text-center">{r.expected}</td>
                      <td className="py-2 px-3 text-center font-bold">{r.actual}</td>
                      <td className={`py-2 px-3 text-center font-bold ${r.diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{r.diff > 0 ? '+' : ''}{r.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <button onClick={() => setReport(null)} className="w-full py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm">새 실사 시작</button>
      </div>
    );
  }

  // 실사 진행 중
  return (
    <div className="space-y-4">
      {/* 진행 상황 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-[var(--foreground)]">실사 진행 중</p>
          <p className="text-xs text-[var(--accent)] font-bold">{enteredCount} / {items.length} 입력됨</p>
        </div>
        <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all"
            style={{ width: items.length > 0 ? `${(enteredCount / items.length) * 100}%` : '0%' }}
          />
        </div>
        {discrepancies.length > 0 && (
          <p className="text-xs text-orange-500 font-bold mt-2">⚠️ 차이 발견: {discrepancies.length}개 품목</p>
        )}
        {invalidEntries.length > 0 && (
          <p className="text-xs text-red-500 font-bold mt-1">입력 오류: {invalidEntries.length}개 품목</p>
        )}
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="품목명·분류·회사 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
        />
        <button
          onClick={handleComplete}
          disabled={saving}
          className="px-4 py-2 bg-emerald-600 text-white rounded-[var(--radius-md)] text-sm font-semibold shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '실사 완료'}
        </button>
        <button
          onClick={() => { if (confirm('실사를 중단하시겠습니까? 입력한 내용이 사라집니다.')) { setSessionStarted(false); setItems([]); } }}
          className="px-3 py-2 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] text-sm font-semibold"
        >
          중단
        </button>
      </div>

      <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="bg-[var(--muted)]/60 border-b border-[var(--border)]">
                {['회사/분류', '품목명', '장부 수량', '실물 수량 입력', '차이'].map(h => (
                  <th key={h} className="px-4 py-2 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map(it => {
                const { quantity: actualNum, error: actualError } = validateInventoryQuantity(it.actual, {
                  label: '실물 수량',
                  allowEmpty: true,
                });
                const diff = actualNum !== null ? actualNum - it.expected : null;
                const hasError = Boolean(actualError);
                const hasDiff = diff !== null && diff !== 0;
                return (
                  <tr key={it.id} className={`transition-colors ${hasError ? 'bg-red-500/10/60' : hasDiff ? 'bg-orange-500/10/50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="text-[10px] font-bold text-[var(--accent)]">{it.company}</p>
                      <p className="text-[9px] text-[var(--toss-gray-3)]">{it.category}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-[var(--foreground)]">{it.item_name}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-[var(--toss-gray-4)]">{it.expected}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={it.actual}
                        onChange={e => setActual(it.id, e.target.value)}
                        placeholder="실물 수량"
                        className={`w-24 px-3 py-1.5 border rounded-[var(--radius-md)] text-sm font-bold text-center outline-none focus:ring-2 focus:ring-[var(--accent)]/20 ${hasError ? 'border-red-400 bg-red-500/10' : hasDiff ? 'border-orange-400 bg-orange-500/10' : 'border-[var(--border)] bg-[var(--card)]'}`}
                      />
                      {actualError && (
                        <p className="mt-1 text-[10px] font-semibold text-red-500">{actualError}</p>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-center text-sm font-bold ${hasError || diff === null ? 'text-[var(--toss-gray-3)]' : diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {diff === null ? '-' : diff === 0 ? '✓' : `${diff > 0 ? '+' : ''}${diff}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
