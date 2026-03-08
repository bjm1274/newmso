'use client';
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type OrgNode = {
  id: string;
  name: string;
  title: string;
  department: string;
  position: string;
  parent_id: string | null;
  color: string;
  children?: OrgNode[];
};

const NODE_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
  'bg-red-500', 'bg-indigo-500', 'bg-teal-500', 'bg-pink-500',
];

function buildTree(nodes: OrgNode[]): OrgNode[] {
  const map: Record<string, OrgNode> = {};
  nodes.forEach(n => { map[n.id] = { ...n, children: [] }; });
  const roots: OrgNode[] = [];
  nodes.forEach(n => {
    if (n.parent_id && map[n.parent_id]) {
      map[n.parent_id].children!.push(map[n.id]);
    } else {
      roots.push(map[n.id]);
    }
  });
  return roots;
}

function OrgCard({ node, onEdit, onDelete, onAddChild, depth = 0 }: {
  node: OrgNode; onEdit: (n: OrgNode) => void; onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void; depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative group">
        <div className={`px-4 py-3 rounded-[14px] text-white shadow-md min-w-[120px] text-center ${node.color || 'bg-blue-500'} cursor-pointer transition-all hover:scale-105`}>
          <p className="text-xs font-bold leading-tight">{node.name}</p>
          <p className="text-[9px] opacity-80 mt-0.5">{node.position || node.title}</p>
          {node.department && <p className="text-[8px] opacity-70">{node.department}</p>}
        </div>
        <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1">
          <button onClick={() => onEdit(node)} className="w-5 h-5 rounded-full bg-white text-blue-600 text-[9px] font-bold shadow border border-blue-200 flex items-center justify-center">✎</button>
          <button onClick={() => onAddChild(node.id)} className="w-5 h-5 rounded-full bg-white text-green-600 text-[9px] font-bold shadow border border-green-200 flex items-center justify-center">+</button>
          <button onClick={() => onDelete(node.id)} className="w-5 h-5 rounded-full bg-white text-red-500 text-[9px] font-bold shadow border border-red-200 flex items-center justify-center">×</button>
        </div>
        {hasChildren && (
          <button onClick={() => setExpanded(v => !v)} className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border border-[var(--toss-border)] text-[8px] text-[var(--toss-gray-3)] flex items-center justify-center shadow-sm">
            {expanded ? '▲' : '▼'}
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="flex flex-col items-center mt-5">
          <div className="w-px h-5 bg-[var(--toss-border)]" />
          <div className="flex gap-4 items-start">
            {node.children!.map((child, idx) => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-px h-5 bg-[var(--toss-border)]" />
                <OrgCard node={child} onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} depth={depth + 1} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgChartEditor({ staffs = [], selectedCo, user }: { staffs: any[]; selectedCo: string; user: any }) {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editNode, setEditNode] = useState<Partial<OrgNode> | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'chart' | 'list'>('chart');

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('org_chart_nodes').select('*').order('created_at');
    setNodes((data || []) as OrgNode[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  const tree = buildTree(nodes);

  const openAdd = (parentId?: string) => {
    setEditNode({ parent_id: parentId || null, color: NODE_COLORS[0], name: '', title: '', department: '', position: '' });
    setShowModal(true);
  };

  const openEdit = (n: OrgNode) => {
    setEditNode({ ...n });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('노드를 삭제하시겠습니까? 하위 노드도 함께 삭제됩니다.')) return;
    const toDelete = [id];
    const findChildren = (pid: string) => {
      nodes.filter(n => n.parent_id === pid).forEach(c => { toDelete.push(c.id); findChildren(c.id); });
    };
    findChildren(id);
    await supabase.from('org_chart_nodes').delete().in('id', toDelete);
    fetchNodes();
  };

  const handleSave = async () => {
    if (!editNode?.name?.trim()) return alert('이름을 입력하세요.');
    setSaving(true);
    try {
      if (editNode.id) {
        await supabase.from('org_chart_nodes').update({
          name: editNode.name, title: editNode.title, department: editNode.department,
          position: editNode.position, parent_id: editNode.parent_id, color: editNode.color,
        }).eq('id', editNode.id);
      } else {
        await supabase.from('org_chart_nodes').insert([{
          name: editNode.name, title: editNode.title, department: editNode.department,
          position: editNode.position, parent_id: editNode.parent_id, color: editNode.color,
        }]);
      }
      setShowModal(false);
      fetchNodes();
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  const importFromStaff = async () => {
    if (!confirm(`직원 ${staffs.length}명으로 조직도를 자동 구성하시겠습니까?\n기존 조직도가 초기화됩니다.`)) return;
    setSaving(true);
    try {
      await supabase.from('org_chart_nodes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const depts = Array.from(new Set(staffs.map(s => s.department).filter(Boolean)));
      const colorMap: Record<string, string> = {};
      depts.forEach((d, i) => colorMap[d] = NODE_COLORS[i % NODE_COLORS.length]);
      const deptRows = depts.map(d => ({ name: d, title: '부서', department: d, position: '', parent_id: null, color: colorMap[d] }));
      const { data: inserted } = await supabase.from('org_chart_nodes').insert(deptRows).select();
      const deptNodeMap: Record<string, string> = {};
      (inserted || []).forEach((r: any) => { deptNodeMap[r.department] = r.id; });
      const staffRows = staffs.map(s => ({
        name: s.name, title: s.position || '', department: s.department || '',
        position: s.position || '', parent_id: deptNodeMap[s.department] || null,
        color: colorMap[s.department] || NODE_COLORS[0],
      }));
      if (staffRows.length > 0) await supabase.from('org_chart_nodes').insert(staffRows);
      fetchNodes();
      alert('조직도가 생성되었습니다.');
    } catch { alert('생성 실패'); } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 md:p-6 border-b border-[var(--toss-border)] flex flex-col md:flex-row gap-3 items-start md:items-center justify-between shrink-0">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">조직도 편집기</h2>
          <p className="text-xs text-[var(--toss-gray-3)]">조직 구조를 시각적으로 편집합니다.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setViewMode(v => v === 'chart' ? 'list' : 'chart')} className="px-3 py-1.5 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-[10px] text-xs font-bold">
            {viewMode === 'chart' ? '목록 보기' : '차트 보기'}
          </button>
          <button onClick={importFromStaff} disabled={saving} className="px-3 py-1.5 bg-purple-500 text-white rounded-[10px] text-xs font-bold disabled:opacity-50">직원 자동 구성</button>
          <button onClick={() => openAdd()} className="px-3 py-1.5 bg-[var(--toss-blue)] text-white rounded-[10px] text-xs font-bold">+ 노드 추가</button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--toss-gray-3)] text-sm font-bold">불러오는 중...</div>
      ) : nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-[var(--toss-gray-3)] font-bold text-sm">조직도가 비어있습니다.</p>
          <div className="flex gap-2">
            <button onClick={() => openAdd()} className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[12px] text-sm font-bold">직접 추가</button>
            <button onClick={importFromStaff} disabled={saving} className="px-4 py-2 bg-purple-500 text-white rounded-[12px] text-sm font-bold disabled:opacity-50">직원으로 자동 생성</button>
          </div>
        </div>
      ) : viewMode === 'chart' ? (
        <div className="flex-1 overflow-auto p-8">
          <div className="flex gap-8 justify-center flex-wrap">
            {tree.map(root => (
              <OrgCard key={root.id} node={root} onEdit={openEdit} onDelete={handleDelete} onAddChild={openAdd} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-2">
            {nodes.map(n => (
              <div key={n.id} className="flex items-center justify-between p-3 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px]">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${n.color}`} />
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{n.name}</p>
                    <p className="text-[10px] text-[var(--toss-gray-3)]">{n.department} · {n.position}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => openEdit(n)} className="px-2 py-1 text-[10px] bg-blue-50 text-blue-600 font-bold rounded-[6px]">편집</button>
                  <button onClick={() => handleDelete(n.id)} className="px-2 py-1 text-[10px] bg-red-50 text-red-500 font-bold rounded-[6px]">삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && editNode && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--toss-card)] rounded-[20px] shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-4">{editNode.id ? '노드 편집' : '노드 추가'}</h3>
            <div className="space-y-3">
              {[
                { label: '이름 *', key: 'name', placeholder: '예: 홍길동' },
                { label: '직함', key: 'title', placeholder: '예: 대표이사' },
                { label: '부서', key: 'department', placeholder: '예: 경영진' },
                { label: '직책', key: 'position', placeholder: '예: 원장' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>
                  <input
                    value={(editNode as any)[key] || ''}
                    onChange={e => setEditNode(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">색상</label>
                <div className="flex gap-2 flex-wrap">
                  {NODE_COLORS.map(c => (
                    <button key={c} onClick={() => setEditNode(prev => ({ ...prev, color: c }))}
                      className={`w-7 h-7 rounded-full ${c} ${editNode.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">상위 노드</label>
                <select
                  value={editNode.parent_id || ''}
                  onChange={e => setEditNode(prev => ({ ...prev, parent_id: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none"
                >
                  <option value="">최상위 (없음)</option>
                  {nodes.filter(n => n.id !== editNode.id).map(n => (
                    <option key={n.id} value={n.id}>{n.name} ({n.position || n.department})</option>
                  ))}
                </select>
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
