'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const COMPANIES = ['전체', '박철홍정형외과', '수연의원', 'SY INC.'];
const CATEGORIES = ['식비', '교통', '경비', '복리후생', '의료', '기타'];

export default function CorporateCardTransactions({ staffs = [] }: any) {
  const [activeTab, setActiveTab] = useState<'cards' | 'transactions'>('transactions');
  const [selectedCo, setSelectedCo] = useState('전체');
  const [cards, setCards] = useState<any[]>([]);
  const [list, setList] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [filterCardId, setFilterCardId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [adding, setAdding] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ date: '', merchant: '', category: '식비', amount: 0, description: '', card_id: '' });
  const [cardForm, setCardForm] = useState({ company_name: '박철홍정형외과', card_nickname: '', last_four: '', issuer: '', holder_id: '' });

  const fetchCards = useCallback(async () => {
    const { data, error } = await supabase.from('corporate_cards').select('*, staff_members(name)').eq('status', 'active').order('company_name');
    setCards(error ? [] : (data || []));
  }, []);

  const fetchTransactions = useCallback(async () => {
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = `${month}-${new Date(y, m, 0).getDate()}`;
    const { data, error } = await supabase
      .from('corporate_card_transactions')
      .select('*, staff_members(name), corporate_cards(card_nickname, last_four, company_name)')
      .gte('transaction_date', start)
      .lte('transaction_date', end)
      .order('transaction_date', { ascending: false });
    let rows: any[] = error ? [] : (data || []);
    if (selectedCo !== '전체') rows = rows.filter((r: any) => (r.company_name || r.corporate_cards?.company_name) === selectedCo);
    if (filterCat) rows = rows.filter((r: any) => r.category === filterCat);
    if (filterCardId) rows = rows.filter((r: any) => r.card_id === filterCardId);
    setList(rows);
  }, [month, selectedCo, filterCat, filterCardId]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // 실시간 구독
  useEffect(() => {
    const ch = supabase.channel('corporate_card_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'corporate_card_transactions' }, () => {
        fetchTransactions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'corporate_cards' }, () => {
        fetchCards();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchTransactions, fetchCards]);

  const totalByCat = list.reduce((acc: Record<string, number>, r: any) => {
    const c = r.category || '기타';
    acc[c] = (acc[c] || 0) + (r.amount || 0);
    return acc;
  }, {});
  const grandTotal = list.reduce((s, r) => s + (r.amount || 0), 0);

  const cardsByCo = selectedCo === '전체'
    ? cards
    : cards.filter((c: any) => c.company_name === selectedCo);

  const handleAddCard = async () => {
    if (!cardForm.company_name || !cardForm.card_nickname) return alert('회사와 카드별칭을 입력하세요.');
    await supabase.from('corporate_cards').insert({
      company_name: cardForm.company_name,
      card_nickname: cardForm.card_nickname,
      last_four: cardForm.last_four || null,
      issuer: cardForm.issuer || null,
      holder_id: cardForm.holder_id || null,
    });
    setCardForm({ company_name: '박철홍정형외과', card_nickname: '', last_four: '', issuer: '', holder_id: '' });
    setAddingCard(false);
    fetchCards();
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm('카드를 비활성화하시겠습니까?')) return;
    await supabase.from('corporate_cards').update({ status: 'inactive' }).eq('id', id);
    fetchCards();
  };

  const handleAdd = async () => {
    if (!form.date || !form.merchant || form.amount <= 0) return alert('필수 항목을 입력하세요.');
    const co = selectedCo !== '전체' ? selectedCo : (form.card_id ? cards.find((c: any) => c.id === form.card_id)?.company_name : null) || '전체';
    await supabase.from('corporate_card_transactions').insert({
      transaction_date: form.date,
      merchant: form.merchant,
      category: form.category,
      amount: form.amount,
      description: form.description,
      company_name: co,
      card_id: form.card_id || null,
    });
    setForm({ date: '', merchant: '', category: '식비', amount: 0, description: '', card_id: '' });
    setAdding(false);
    fetchTransactions();
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('date') || header.includes('날짜') || header.includes('일자');
    const rows = hasHeader ? lines.slice(1) : lines;
    const co = selectedCo !== '전체' ? selectedCo : '전체';

    let imported = 0;
    for (const line of rows) {
      const parts = line.split(/[\t,]/).map((p: string) => p.trim());
      if (parts.length < 3) continue;
      const dateMatch = parts[0].match(/(\d{4})-(\d{2})-(\d{2})/) || parts[0].match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}` : '';
      const merchant = parts[1] || '';
      const amount = parseInt(String(parts[2]).replace(/[^0-9]/g, '')) || 0;
      if (!date || amount <= 0) continue;
      await supabase.from('corporate_card_transactions').insert({
        transaction_date: date,
        merchant,
        amount,
        category: CATEGORIES.includes(parts[3]) ? parts[3] : '기타',
        description: parts[4] || '',
        company_name: co,
      });
      imported++;
    }
    setImporting(false);
    (e.target as HTMLInputElement).value = '';
    alert(`${imported}건 가져왔습니다.`);
    fetchTransactions();
  };

  return (
    <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-gray-100 shadow-xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 tracking-tighter">법인카드 관리</h3>
          <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">회사별 카드 등록 · 사용내역 실시간 반영</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-0.5 p-1 bg-[#eef2f7] rounded-lg">
            {COMPANIES.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCo(c)}
                className={`px-4 py-2 text-[10px] font-semibold rounded-[12px] transition-all ${selectedCo === c ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 p-1 bg-[#eef2f7] rounded-lg">
            <button onClick={() => setActiveTab('cards')} className={`px-4 py-2 text-[10px] font-semibold rounded-[12px] transition-all ${activeTab === 'cards' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}>카드 등록</button>
            <button onClick={() => setActiveTab('transactions')} className={`px-4 py-2 text-[10px] font-semibold rounded-[12px] transition-all ${activeTab === 'transactions' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}>사용내역</button>
          </div>
        </div>
      </div>

      {activeTab === 'cards' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-gray-800">회사별 법인카드 목록</h4>
            <button onClick={() => setAddingCard(true)} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl">+ 카드 등록</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cardsByCo.map((c: any) => (
              <div key={c.id} className="p-5 border border-gray-100 rounded-lg bg-gray-50/50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{c.card_nickname || '미지정'}</p>
                    <p className="text-[10px] text-gray-500">{c.company_name} {c.last_four ? `· ****${c.last_four}` : ''}</p>
                    {c.staff_members?.name && <p className="text-[10px] text-blue-600 mt-1">사용자: {c.staff_members.name}</p>}
                  </div>
                  <button onClick={() => handleDeleteCard(c.id)} className="text-red-500 text-[10px] font-semibold">비활성화</button>
                </div>
              </div>
            ))}
            {cardsByCo.length === 0 && (
              <p className="col-span-full text-sm text-gray-400 font-bold">등록된 카드가 없습니다. 카드를 등록해주세요.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <>
          <div className="flex flex-wrap gap-2 items-center mb-6">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="p-2 border rounded-xl text-sm font-bold" />
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="p-2 border rounded-xl text-sm font-bold">
              <option value="">전체 항목</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={filterCardId} onChange={(e) => setFilterCardId(e.target.value)} className="p-2 border rounded-xl text-sm font-bold">
              <option value="">전체 카드</option>
              {cardsByCo.map((c: any) => (
                <option key={c.id} value={c.id}>{c.card_nickname || `****${c.last_four}`}</option>
              ))}
            </select>
            <button onClick={() => setAdding(true)} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl">+ 수동 등록</button>
            <label className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer hover:bg-gray-200">
              CSV 가져오기
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvImport} disabled={importing} />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {Object.entries(totalByCat).map(([cat, amt]) => (
              <div key={cat} className="p-4 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold text-gray-500">{cat}</p>
                <p className="text-lg font-semibold text-gray-900">{amt.toLocaleString()}원</p>
              </div>
            ))}
            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="text-[10px] font-bold text-blue-600">합계</p>
              <p className="text-lg font-semibold text-blue-700">{grandTotal.toLocaleString()}원</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase">
                  <th className="p-4 text-left">날짜</th>
                  <th className="p-4 text-left">가맹점</th>
                  <th className="p-4 text-left">카드</th>
                  <th className="p-4 text-left">항목</th>
                  <th className="p-4 text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="p-4">{r.transaction_date}</td>
                    <td className="p-4">{r.merchant}</td>
                    <td className="p-4 text-[10px] text-gray-500">{r.corporate_cards?.card_nickname || (r.corporate_cards?.last_four ? `****${r.corporate_cards.last_four}` : null) || '-'}</td>
                    <td className="p-4">{r.category}</td>
                    <td className="p-4 text-right font-bold">{Number(r.amount).toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-[10px] font-semibold text-amber-800">💡 실시간 연동</p>
            <p className="text-[10px] text-amber-700 font-bold mt-1">사용내역은 실시간으로 반영됩니다. CSV는 은행/카드사에서 다운로드한 파일(날짜,가맹점,금액 순)을 업로드해 일괄 등록할 수 있습니다. KB·신한 등 은행 Open API 제휴 시 자동 연동이 가능합니다.</p>
          </div>
        </>
      )}

      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]" onClick={() => setAdding(false)}>
          <div className="bg-white p-8 rounded-lg max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">법인카드 사용 등록</h4>
            <select value={form.card_id} onChange={(e) => setForm({ ...form, card_id: e.target.value })} className="w-full p-3 border rounded-xl">
              <option value="">카드 선택 (선택)</option>
              {cardsByCo.map((c: any) => (
                <option key={c.id} value={c.id}>{c.card_nickname || `****${c.last_four}`} - {c.company_name}</option>
              ))}
            </select>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full p-3 border rounded-xl" />
            <input type="text" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder="가맹점" className="w-full p-3 border rounded-xl" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full p-3 border rounded-xl">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: parseInt(e.target.value) || 0 })} placeholder="금액" className="w-full p-3 border rounded-xl" />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl">등록</button>
              <button onClick={() => setAdding(false)} className="flex-1 py-3 bg-gray-200 font-semibold rounded-xl">취소</button>
            </div>
          </div>
        </div>
      )}

      {addingCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]" onClick={() => setAddingCard(false)}>
          <div className="bg-white p-8 rounded-lg max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">법인카드 등록</h4>
            <select value={cardForm.company_name} onChange={(e) => setCardForm({ ...cardForm, company_name: e.target.value })} className="w-full p-3 border rounded-xl">
              {COMPANIES.filter((c) => c !== '전체').map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input type="text" value={cardForm.card_nickname} onChange={(e) => setCardForm({ ...cardForm, card_nickname: e.target.value })} placeholder="카드 별칭 (예: 대표카드, 경비카드)" className="w-full p-3 border rounded-xl" />
            <input type="text" value={cardForm.last_four} onChange={(e) => setCardForm({ ...cardForm, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="카드번호 끝 4자리" className="w-full p-3 border rounded-xl" maxLength={4} />
            <input type="text" value={cardForm.issuer} onChange={(e) => setCardForm({ ...cardForm, issuer: e.target.value })} placeholder="발급사 (KB, 신한 등)" className="w-full p-3 border rounded-xl" />
            <select value={cardForm.holder_id} onChange={(e) => setCardForm({ ...cardForm, holder_id: e.target.value })} className="w-full p-3 border rounded-xl">
              <option value="">사용자 (선택)</option>
              {staffs?.filter((s: any) => s.company === cardForm.company_name).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={handleAddCard} className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl">등록</button>
              <button onClick={() => setAddingCard(false)} className="flex-1 py-3 bg-gray-200 font-semibold rounded-xl">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
