'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string;
  color: string;
  children?: Category[];
};

const CAT_COLORS = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-red-500', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500'];

function buildCategoryTree(cats: Category[]): Category[] {
  const map: Record<string, Category> = {};
  cats.forEach(c => { map[c.id] = { ...c, children: [] }; });
  const roots: Category[] = [];
  cats.forEach(c => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children!.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}

function CategoryNode({ cat, onEdit, onDelete, onAdd, depth = 0 }: {
  cat: Category; onEdit: (c: Category) => void; onDelete: (id: string) => void; onAdd: (pid: string) => void; depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className={`flex items-center justify-between p-2.5 rounded-[10px] mb-1 border ${depth === 0 ? 'border-[var(--toss-border)] bg-[var(--toss-card)]' : 'border-[var(--toss-border)]/50 bg-[var(--toss-gray-1)]/30'} group`}>
        <div className="flex items-center gap-2">
          {(cat.children?.length ?? 0) > 0 && (
            <button onClick={() => setExpanded(v => !v)} className="w-4 h-4 text-[var(--toss-gray-3)] text-[10px]">{expanded ? '▼' : '▶'}</button>
          )}
          {(cat.children?.length ?? 0) === 0 && <div className="w-4" />}
          <div className={`w-2.5 h-2.5 rounded-full ${cat.color || 'bg-gray-400'}`} />
          <span className="text-sm font-bold text-[var(--foreground)]">{cat.name}</span>
          {cat.description && <span className="text-[10px] text-[var(--toss-gray-3)]">{cat.description}</span>}
          <span className="text-[9px] text-[var(--toss-gray-3)]">(하위 {cat.children?.length || 0}개)</span>
        </div>
        <div className="hidden group-hover:flex gap-1">
          <button onClick={() => onAdd(cat.id)} className="px-2 py-0.5 text-[10px] bg-green-50 text-green-700 font-bold rounded-[5px]">+ 하위</button>
          <button onClick={() => onEdit(cat)} className="px-2 py-0.5 text-[10px] bg-blue-50 text-blue-600 font-bold rounded-[5px]">편집</button>
          <button onClick={() => onDelete(cat.id)} className="px-2 py-0.5 text-[10px] bg-red-50 text-red-500 font-bold rounded-[5px]">삭제</button>
        </div>
      </div>
      {expanded && cat.children?.map(child => (
        <CategoryNode key={child.id} cat={child} onEdit={onEdit} onDelete={onDelete} onAdd={onAdd} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function CategoryManager({ user }: { user: any }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', parent_id: '', description: '', color: CAT_COLORS[0] });
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from('inventory_categories').select('*').order('name');
    setCategories((data || []) as Category[]);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const tree = buildCategoryTree(categories);

  const openAdd = (parentId?: string) => {
    setEditId(null);
    setForm({ name: '', parent_id: parentId || '', description: '', color: CAT_COLORS[0] });
    setShowModal(true);
  };

  const openEdit = (c: Category) => {
    setEditId(c.id);
    setForm({ name: c.name, parent_id: c.parent_id || '', description: c.description || '', color: c.color || CAT_COLORS[0] });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('카테고리를 삭제하시겠습니까? 하위 카테고리도 삭제됩니다.')) return;
    const toDelete = [id];
    const findChildren = (pid: string) => {
      categories.filter(c => c.parent_id === pid).forEach(c => { toDelete.push(c.id); findChildren(c.id); });
    };
    findChildren(id);
    await supabase.from('inventory_categories').delete().in('id', toDelete);
    fetchCategories();
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('카테고리명을 입력하세요.');
    setSaving(true);
    try {
      const payload = { name: form.name, parent_id: form.parent_id || null, description: form.description, color: form.color };
      if (editId) {
        await supabase.from('inventory_categories').update(payload).eq('id', editId);
      } else {
        await supabase.from('inventory_categories').insert([payload]);
      }
      setShowModal(false);
      fetchCategories();
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  const importFromInventory = async () => {
    const { data } = await supabase.from('inventory').select('category').not('category', 'is', null);
    const cats = Array.from(new Set((data || []).map((r: any) => r.category).filter(Boolean)));
    const existing = categories.map(c => c.name);
    const newCats = cats.filter(c => !existing.includes(c));
    if (newCats.length === 0) return alert('새로 추가할 카테고리가 없습니다.');
    if (!confirm(`재고 데이터에서 ${newCats.length}개 카테고리를 가져오시겠습니까?\n${newCats.slice(0, 5).join(', ')}${newCats.length > 5 ? ' ...' : ''}`)) return;
    await supabase.from('inventory_categories').insert(newCats.map((name, i) => ({ name, parent_id: null, color: CAT_COLORS[i % CAT_COLORS.length] })));
    fetchCategories();
    alert(`${newCats.length}개 카테고리가 추가되었습니다.`);
  };

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">재고 카테고리 트리 관리</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={importFromInventory} className="px-3 py-1.5 bg-purple-500 text-white rounded-[10px] text-xs font-bold">재고에서 가져오기</button>
          <button onClick={() => openAdd()} className="px-3 py-1.5 bg-[var(--toss-blue)] text-white rounded-[10px] text-xs font-bold">+ 카테고리 추가</button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-[var(--toss-gray-3)] font-bold text-sm">카테고리가 없습니다.</p>
          <div className="flex gap-2">
            <button onClick={() => openAdd()} className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[12px] text-sm font-bold">직접 추가</button>
            <button onClick={importFromInventory} className="px-4 py-2 bg-purple-500 text-white rounded-[12px] text-sm font-bold">재고에서 가져오기</button>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">총 {categories.length}개 카테고리</p>
          </div>
          {tree.map(root => (
            <CategoryNode key={root.id} cat={root} onEdit={openEdit} onDelete={handleDelete} onAdd={openAdd} />
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--toss-card)] rounded-[20px] shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-4">{editId ? '카테고리 편집' : '카테고리 추가'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">카테고리명 *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 진단용품" className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">상위 카테고리</label>
                <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none">
                  <option value="">최상위 (없음)</option>
                  {categories.filter(c => c.id !== editId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">설명</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="카테고리 설명" className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">색상</label>
                <div className="flex gap-2 flex-wrap">
                  {CAT_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full ${c} ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-blue)] text-white font-semibold text-sm disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
