'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';
import SmartMonthPicker from '../공통/SmartMonthPicker';

const CATEGORIES = ['식비', '교통', '경비', '복리후생', '의료', '기타'];

// 가맹점명 키워드 기반 자동 분류
function autoClassify(merchant: string): string {
  const m = merchant.toLowerCase();
  if (/식당|카페|커피|음식|빵|편의점|마트|치킨|피자|김밥|분식|레스토랑|순두부|냉면|설렁탕|삼겹살|갈비|스타벅스|투썸|이디야|맥도날드|버거킹|kfc|롯데리아|배달|요기요|배민/.test(m)) return '식비';
  if (/주유|택시|카카오t|버스|지하철|고속도로|통행료|ktx|기차|항공|렌터카|카렌탈|하이패스|주차|톨게이트/.test(m)) return '교통';
  if (/병원|약국|의원|클리닉|한의원|치과|안과|정형외과|내과|외과|피부과|이비인후과|의료|메디/.test(m)) return '의료';
  if (/헬스|스포츠|당구|볼링|영화|공연|워크숍|노래방|피씨방|마사지|사우나/.test(m)) return '복리후생';
  if (/문구|사무용품|소모품|화방|소프트웨어|클라우드|구독|aws|azure|구글|네이버|microsoft/.test(m)) return '경비';
  return '기타';
}

export default function CorporateCardTransactions({ staffs = [] }: Record<string, unknown>) {
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
  const [cardForm, setCardForm] = useState({ company_name: '', card_nickname: '', last_four: '', issuer: '', holder_id: '' });

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
    let rows: Record<string, unknown>[] = error ? [] : (data || []);
    if (selectedCo !== '전체') rows = rows.filter((r: Record<string, unknown>) => (r.company_name || (r.corporate_cards as Record<string, unknown>)?.company_name) === selectedCo);
    if (filterCat) rows = rows.filter((r: Record<string, unknown>) => r.category === filterCat);
    if (filterCardId) rows = rows.filter((r: Record<string, unknown>) => r.card_id === filterCardId);
    setList(rows);
  }, [month, selectedCo, filterCat, filterCardId]);

  // cards와 staffs에서 회사 목록 동적 생성
  const COMPANIES = useMemo(() => {
    const fromCards = (cards as any[]).map((c) => c.company_name).filter(Boolean);
    const fromStaffs = (staffs as any[]).map((s: any) => s.company).filter(Boolean);
    const names = Array.from(new Set([...fromCards, ...fromStaffs])).sort();
    return ['전체', ...names];
  }, [cards, staffs]);

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
    if (!cardForm.company_name || !cardForm.card_nickname) return toast('회사와 카드별칭을 입력하세요.', 'warning');
    const { error } = await supabase.from('corporate_cards').insert({
      company_name: cardForm.company_name,
      card_nickname: cardForm.card_nickname,
      last_four: cardForm.last_four || null,
      issuer: cardForm.issuer || null,
      holder_id: cardForm.holder_id || null,
    });
    if (error) {
      toast('법인카드 저장에 실패했습니다.', 'error');
      return;
    }
    setCardForm({ company_name: '', card_nickname: '', last_four: '', issuer: '', holder_id: '' });
    setAddingCard(false);
    fetchCards();
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm('카드를 비활성화하시겠습니까?')) return;
    const { error } = await supabase.from('corporate_cards').update({ status: 'inactive' }).eq('id', id);
    if (error) {
      toast('카드 비활성화에 실패했습니다.', 'error');
      return;
    }
    fetchCards();
  };

  const handleAdd = async () => {
    if (!form.date || !form.merchant || form.amount <= 0) return toast('필수 항목을 입력하세요.', 'warning');
    const co = selectedCo !== '전체' ? selectedCo : (form.card_id ? cards.find((c: any) => c.id === form.card_id)?.company_name : null) || '전체';
    const { error } = await supabase.from('corporate_card_transactions').insert({
      transaction_date: form.date,
      merchant: form.merchant,
      category: form.category,
      amount: form.amount,
      description: form.description,
      company_name: co,
      card_id: form.card_id || null,
    });
    if (error) {
      toast('사용내역 저장에 실패했습니다.', 'error');
      return;
    }
    setForm({ date: '', merchant: '', category: '식비', amount: 0, description: '', card_id: '' });
    setAdding(false);
    fetchTransactions();
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('date') || header.includes('날짜') || header.includes('일자');
    const rows = hasHeader ? lines.slice(1) : lines;
    const co = selectedCo !== '전체' ? selectedCo : '전체';

    let imported = 0;
    let failed = 0;
    try {
      for (const line of rows) {
        const parts = line.split(/[\t,]/).map((p: string) => p.trim());
        if (parts.length < 3) continue;
        const dateMatch = parts[0].match(/(\d{4})-(\d{2})-(\d{2})/) || parts[0].match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : '';
        const merchant = parts[1] || '';
        const amount = parseInt(String(parts[2]).replace(/[^0-9]/g, '')) || 0;
        if (!date || amount <= 0) continue;
        // 카테고리가 명시되지 않은 경우 자동 분류
        const category = CATEGORIES.includes(parts[3]) ? parts[3] : autoClassify(merchant);
        const { error } = await supabase.from('corporate_card_transactions').insert({
          transaction_date: date,
          merchant,
          amount,
          category,
          description: parts[4] || '',
          company_name: co,
        });
        if (error) {
          failed++;
          console.error('corporate_card_transactions csv insert failed:', error);
          continue;
        }
        imported++;
      }
      toast(failed > 0 ? `${imported}건 가져왔고 ${failed}건은 실패했습니다.` : `${imported}건 가져왔습니다. (카테고리 자동 분류 적용)`, 'error');
      fetchTransactions();
    } finally {
      setImporting(false);
      (e.target as HTMLInputElement).value = '';
    }
  };

  // '기타'로 분류된 항목을 일괄 자동 분류
  const handleBulkAutoClassify = async () => {
    const unclassified = list.filter((r: Record<string, unknown>) => r.category === '기타' && r.merchant);
    if (unclassified.length === 0) return toast('자동 분류할 항목이 없습니다. (이미 분류됨)', 'warning');
    if (!confirm(`${unclassified.length}건을 자동 분류하시겠습니까?`)) return;
    let updated = 0;
    let failed = 0;
    for (const r of unclassified) {
      const cat = autoClassify(r.merchant);
      if (cat !== '기타') {
        const { error } = await supabase.from('corporate_card_transactions').update({ category: cat }).eq('id', r.id);
        if (error) {
          failed++;
          console.error('corporate_card_transactions auto classify update failed:', error);
          continue;
        }
        updated++;
      }
    }
    toast(failed > 0 ? `${updated}건 자동 분류, ${failed}건 실패했습니다.` : `${updated}건 자동 분류 완료.`, 'error');
    fetchTransactions();
  };

  return (
    <div className="bg-[var(--card)] p-4 md:p-5 rounded-2xl border border-[var(--border)] shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
        <div>
          <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">법인카드 관리</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-0.5 p-1 app-tab-bar">
            {COMPANIES.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCo(c)}
                className={`px-4 py-2 text-[11px] font-semibold rounded-[var(--radius-md)] transition-all ${selectedCo === c ? 'bg-[var(--card)] shadow-md text-[var(--accent)]' : 'text-[var(--toss-gray-3)]'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 p-1 app-tab-bar">
            <button onClick={() => setActiveTab('cards')} className={`px-4 py-2 text-[11px] font-semibold rounded-[var(--radius-md)] transition-all ${activeTab === 'cards' ? 'bg-[var(--card)] shadow-md text-[var(--accent)]' : 'text-[var(--toss-gray-3)]'}`}>카드 등록</button>
            <button onClick={() => setActiveTab('transactions')} className={`px-4 py-2 text-[11px] font-semibold rounded-[var(--radius-md)] transition-all ${activeTab === 'transactions' ? 'bg-[var(--card)] shadow-md text-[var(--accent)]' : 'text-[var(--toss-gray-3)]'}`}>사용내역</button>
          </div>
        </div>
      </div>

      {activeTab === 'cards' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-[var(--foreground)]">회사별 법인카드 목록</h4>
            <button onClick={() => setAddingCard(true)} className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-semibold rounded-[var(--radius-lg)]">+ 카드 등록</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cardsByCo.map((c: any) => (
              <div key={c.id} className="p-5 border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--muted)]/50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-[var(--foreground)]">{c.card_nickname || '미지정'}</p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">{c.company_name} {c.last_four ? `· ****${c.last_four}` : ''}</p>
                    {c.staff_members?.name && <p className="text-[11px] text-[var(--accent)] mt-1">사용자: {c.staff_members.name}</p>}
                  </div>
                  <button onClick={() => handleDeleteCard(c.id)} className="text-red-500 text-[11px] font-semibold">비활성화</button>
                </div>
              </div>
            ))}
            {cardsByCo.length === 0 && (
              <p className="col-span-full text-sm text-[var(--toss-gray-3)] font-bold">등록된 카드가 없습니다. 카드를 등록해주세요.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <>
          <div className="flex flex-wrap gap-2 items-center mb-4">
            <SmartMonthPicker value={month} onChange={val => setMonth(val)} inputClassName="p-2 border rounded-[var(--radius-lg)] text-sm font-bold bg-[var(--card)]" />
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="p-2 border rounded-[var(--radius-lg)] text-sm font-bold">
              <option value="">전체 항목</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={filterCardId} onChange={(e) => setFilterCardId(e.target.value)} className="p-2 border rounded-[var(--radius-lg)] text-sm font-bold">
              <option value="">전체 카드</option>
              {cardsByCo.map((c: any) => (
                <option key={c.id} value={c.id}>{c.card_nickname || `****${c.last_four}`}</option>
              ))}
            </select>
            <button onClick={() => setAdding(true)} className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-semibold rounded-[var(--radius-lg)]">+ 수동 등록</button>
            <button onClick={handleBulkAutoClassify} className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold rounded-[var(--radius-lg)] hover:bg-amber-100 transition-all">🤖 일괄 자동 분류</button>
            <label className="px-4 py-2 bg-[var(--muted)] text-[var(--foreground)] text-xs font-semibold rounded-[var(--radius-lg)] cursor-pointer hover:opacity-90">
              CSV 가져오기
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvImport} disabled={importing} />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {Object.entries(totalByCat).map(([cat, amt]) => (
              <div key={cat} className="p-4 bg-[var(--muted)] rounded-[var(--radius-lg)]">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{cat}</p>
                <p className="text-lg font-semibold text-[var(--foreground)]">{amt.toLocaleString()}원</p>
              </div>
            ))}
            <div className="p-4 bg-[var(--toss-blue-light)] rounded-[var(--radius-lg)]">
              <p className="text-[11px] font-bold text-[var(--accent)]">합계</p>
              <p className="text-lg font-semibold text-[var(--accent)]">{grandTotal.toLocaleString()}원</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
                  <th className="p-4 text-left">날짜</th>
                  <th className="p-4 text-left">가맹점</th>
                  <th className="p-4 text-left">카드</th>
                  <th className="p-4 text-left">항목</th>
                  <th className="p-4 text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)]">
                    <td className="p-4">{r.transaction_date}</td>
                    <td className="p-4">{r.merchant}</td>
                    <td className="p-4 text-[11px] text-[var(--toss-gray-3)]">{r.corporate_cards?.card_nickname || (r.corporate_cards?.last_four ? `****${r.corporate_cards.last_four}` : null) || '-'}</td>
                    <td className="p-4">{r.category}</td>
                    <td className="p-4 text-right font-bold">{Number(r.amount).toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-4 bg-amber-50 rounded-[var(--radius-md)] border border-amber-100">
            <p className="text-[11px] font-semibold text-amber-800">💡 실시간 연동</p>
            <p className="text-[11px] text-amber-700 font-bold mt-1">사용내역은 실시간으로 반영됩니다. CSV는 은행/카드사에서 다운로드한 파일(날짜,가맹점,금액 순)을 업로드해 일괄 등록할 수 있습니다. KB·신한 등 은행 Open API 제휴 시 자동 연동이 가능합니다.</p>
          </div>
        </>
      )}

      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]" onClick={() => setAdding(false)}>
          <div className="bg-[var(--card)] p-5 rounded-[var(--radius-md)] max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">법인카드 사용 등록</h4>
            <select value={form.card_id} onChange={(e) => setForm({ ...form, card_id: e.target.value })} className="w-full p-3 border rounded-[var(--radius-lg)]">
              <option value="">카드 선택 (선택)</option>
              {cardsByCo.map((c: any) => (
                <option key={c.id} value={c.id}>{c.card_nickname || `****${c.last_four}`} - {c.company_name}</option>
              ))}
            </select>
            <SmartDatePicker value={form.date} onChange={val => setForm({ ...form, date: val })} inputClassName="w-full p-3 border rounded-[var(--radius-lg)] font-bold" />
            <div className="relative">
              <input type="text" value={form.merchant} onChange={(e) => {
                const m = e.target.value;
                const suggested = autoClassify(m);
                setForm({ ...form, merchant: m, category: suggested });
              }} placeholder="가맹점 (입력 시 카테고리 자동 제안)" className="w-full p-3 border rounded-[var(--radius-lg)]" />
              {form.merchant && <span className="absolute right-3 top-3 text-[10px] text-[var(--accent)] font-bold bg-blue-500/10 px-2 py-0.5 rounded-lg">자동: {autoClassify(form.merchant)}</span>}
            </div>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full p-3 border rounded-[var(--radius-lg)]">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: parseInt(e.target.value) || 0 })} placeholder="금액" className="w-full p-3 border rounded-[var(--radius-lg)]" />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 py-3 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-lg)]">등록</button>
              <button onClick={() => setAdding(false)} className="flex-1 py-3 bg-[var(--muted)] font-semibold rounded-[var(--radius-lg)] text-[var(--foreground)]">취소</button>
            </div>
          </div>
        </div>
      )}

      {addingCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]" onClick={() => setAddingCard(false)}>
          <div className="bg-[var(--card)] p-5 rounded-[var(--radius-md)] max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">법인카드 등록</h4>
            <select value={cardForm.company_name} onChange={(e) => setCardForm({ ...cardForm, company_name: e.target.value })} className="w-full p-3 border rounded-[var(--radius-lg)]">
              {COMPANIES.filter((c) => c !== '전체').map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input type="text" value={cardForm.card_nickname} onChange={(e) => setCardForm({ ...cardForm, card_nickname: e.target.value })} placeholder="카드 별칭 (예: 대표카드, 경비카드)" className="w-full p-3 border rounded-[var(--radius-lg)]" />
            <input type="text" value={cardForm.last_four} onChange={(e) => setCardForm({ ...cardForm, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="카드번호 끝 4자리" className="w-full p-3 border rounded-[var(--radius-lg)]" maxLength={4} />
            <input type="text" value={cardForm.issuer} onChange={(e) => setCardForm({ ...cardForm, issuer: e.target.value })} placeholder="발급사 (KB, 신한 등)" className="w-full p-3 border rounded-[var(--radius-lg)]" />
            <select value={cardForm.holder_id} onChange={(e) => setCardForm({ ...cardForm, holder_id: e.target.value })} className="w-full p-3 border rounded-[var(--radius-lg)]">
              <option value="">사용자 (선택)</option>
              {(staffs as Record<string, unknown>[] | undefined)?.filter((s: Record<string, unknown>) => s.company === cardForm.company_name).map((s: Record<string, unknown>) => (
                <option key={s.id as string} value={s.id as string}>{s.name as string}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={handleAddCard} className="flex-1 py-3 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-lg)]">등록</button>
              <button onClick={() => setAddingCard(false)} className="flex-1 py-3 bg-[var(--muted)] font-semibold rounded-[var(--radius-lg)] text-[var(--foreground)]">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
