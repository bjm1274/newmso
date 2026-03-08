'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const BADGE_TYPES = [
  { id: 'excellent', label: '우수 직원', emoji: '⭐', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { id: 'teamwork', label: '팀워크', emoji: '🤝', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { id: 'innovation', label: '혁신', emoji: '💡', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { id: 'kindness', label: '친절', emoji: '😊', color: 'bg-pink-100 text-pink-700 border-pink-300' },
  { id: 'mentor', label: '멘토', emoji: '🎓', color: 'bg-green-100 text-green-700 border-green-300' },
  { id: 'diligence', label: '성실', emoji: '💪', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { id: 'creative', label: '창의', emoji: '🎨', color: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  { id: 'leadership', label: '리더십', emoji: '🏆', color: 'bg-red-100 text-red-700 border-red-300' },
];

export default function PraisesBadges({ staffs = [], selectedCo, user }: { staffs: any[]; selectedCo: string; user: any }) {
  const [badges, setBadges] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ recipient_id: '', badge_type: BADGE_TYPES[0].id, message: '' });
  const [sending, setSending] = useState(false);
  const [filterBadge, setFilterBadge] = useState('전체');
  const [viewMode, setViewMode] = useState<'feed' | 'rank'>('feed');

  const filteredStaffs = staffs.filter(s => selectedCo === '전체' || s.company === selectedCo);

  const fetchBadges = useCallback(async () => {
    const { data } = await supabase.from('staff_badges').select('*').order('created_at', { ascending: false }).limit(200);
    setBadges(data || []);
  }, []);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  const displayed = badges.filter(b => filterBadge === '전체' || b.badge_type === filterBadge);

  // 랭킹 계산
  const rankMap: Record<string, { name: string; dept: string; total: number; badges: Record<string, number> }> = {};
  badges.forEach(b => {
    if (!rankMap[b.recipient_id]) {
      const s = filteredStaffs.find(s => String(s.id) === String(b.recipient_id));
      rankMap[b.recipient_id] = { name: b.recipient_name || s?.name || '알 수 없음', dept: s?.department || '', total: 0, badges: {} };
    }
    rankMap[b.recipient_id].total++;
    rankMap[b.recipient_id].badges[b.badge_type] = (rankMap[b.recipient_id].badges[b.badge_type] || 0) + 1;
  });
  const ranking = Object.values(rankMap).sort((a, b) => b.total - a.total);

  const handleSend = async () => {
    if (!form.recipient_id) return alert('수신자를 선택하세요.');
    setSending(true);
    try {
      const recipient = filteredStaffs.find(s => String(s.id) === String(form.recipient_id));
      const badgeInfo = BADGE_TYPES.find(b => b.id === form.badge_type)!;
      await supabase.from('staff_badges').insert([{
        recipient_id: form.recipient_id,
        recipient_name: recipient?.name,
        sender_id: user?.id,
        sender_name: user?.name,
        badge_type: form.badge_type,
        badge_label: badgeInfo.label,
        badge_emoji: badgeInfo.emoji,
        message: form.message,
      }]);
      // 알림 발송
      await supabase.from('notifications').insert([{
        user_id: form.recipient_id,
        type: 'badge',
        title: `${badgeInfo.emoji} ${badgeInfo.label} 배지를 받았습니다!`,
        body: `${user?.name}님이 칭찬 배지를 보냈습니다${form.message ? ': ' + form.message : '.'}`,
      }]);
      setShowModal(false);
      setForm({ recipient_id: '', badge_type: BADGE_TYPES[0].id, message: '' });
      fetchBadges();
      alert('배지를 전송했습니다!');
    } catch { alert('전송 실패'); } finally { setSending(false); }
  };

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">칭찬 배지 시스템</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">동료에게 칭찬 배지를 보내고 인정 문화를 만들어보세요.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[10px] text-sm font-bold shadow-sm hover:opacity-90">+ 배지 보내기</button>
      </div>

      {/* 배지 범례 */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterBadge('전체')} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filterBadge === '전체' ? 'bg-[var(--toss-blue)] text-white border-[var(--toss-blue)]' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] border-[var(--toss-border)]'}`}>전체</button>
        {BADGE_TYPES.map(b => (
          <button key={b.id} onClick={() => setFilterBadge(b.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterBadge === b.id ? b.color : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] border-[var(--toss-border)]'}`}>
            {b.emoji} {b.label}
          </button>
        ))}
      </div>

      {/* 뷰 탭 */}
      <div className="flex gap-1 bg-[var(--toss-gray-1)] rounded-[12px] p-1 w-fit">
        {[{ key: 'feed', label: '피드' }, { key: 'rank', label: '랭킹' }].map(t => (
          <button key={t.key} onClick={() => setViewMode(t.key as any)}
            className={`px-4 py-1.5 rounded-[10px] text-xs font-bold transition-all ${viewMode === t.key ? 'bg-[var(--toss-card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {viewMode === 'feed' && (
        <div className="space-y-3">
          {displayed.length === 0 ? (
            <div className="text-center py-16 text-[var(--toss-gray-3)] font-bold text-sm">아직 배지가 없습니다. 첫 번째 칭찬을 보내보세요!</div>
          ) : displayed.map(b => {
            const badgeInfo = BADGE_TYPES.find(bt => bt.id === b.badge_type);
            return (
              <div key={b.id} className={`p-4 rounded-[16px] border shadow-sm ${badgeInfo?.color || 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{b.badge_emoji || badgeInfo?.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold">
                      <span className="text-[var(--foreground)]">{b.sender_name}</span>
                      <span className="mx-1">→</span>
                      <span>{b.recipient_name}</span>
                    </p>
                    <p className="text-xs font-bold mt-0.5">{b.badge_label || badgeInfo?.label} 배지</p>
                    {b.message && <p className="text-xs mt-1 italic opacity-80">&quot;{b.message}&quot;</p>}
                    <p className="text-[9px] mt-1 opacity-60">{b.created_at?.slice(0, 16)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'rank' && (
        <div className="space-y-2">
          {ranking.length === 0 ? (
            <div className="text-center py-16 text-[var(--toss-gray-3)] font-bold text-sm">랭킹 데이터가 없습니다.</div>
          ) : ranking.map((r, i) => (
            <div key={r.name} className={`flex items-center justify-between p-4 rounded-[14px] border shadow-sm ${i === 0 ? 'bg-yellow-50 border-yellow-300' : i === 1 ? 'bg-gray-50 border-gray-300' : i === 2 ? 'bg-orange-50 border-orange-300' : 'bg-[var(--toss-card)] border-[var(--toss-border)]'}`}>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold w-8 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</span>
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">{r.name}</p>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">{r.dept}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[var(--toss-blue)]">{r.total}개</p>
                <div className="flex gap-1 flex-wrap justify-end mt-0.5">
                  {Object.entries(r.badges).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, cnt]) => {
                    const bt = BADGE_TYPES.find(b => b.id === type);
                    return <span key={type} className="text-[9px]">{bt?.emoji}{cnt}</span>;
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--toss-card)] rounded-[20px] shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-4">칭찬 배지 보내기</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">받는 사람 *</label>
                <select value={form.recipient_id} onChange={e => setForm(f => ({ ...f, recipient_id: e.target.value }))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none">
                  <option value="">선택하세요</option>
                  {filteredStaffs.filter(s => String(s.id) !== String(user?.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.position})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-2">배지 종류 *</label>
                <div className="grid grid-cols-2 gap-2">
                  {BADGE_TYPES.map(b => (
                    <button key={b.id} onClick={() => setForm(f => ({ ...f, badge_type: b.id }))}
                      className={`px-3 py-2 rounded-[10px] text-xs font-bold border transition-all text-left ${form.badge_type === b.id ? b.color + ' ring-2 ring-offset-1 ring-[var(--toss-blue)]' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] border-[var(--toss-border)]'}`}>
                      {b.emoji} {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">칭찬 메시지 (선택)</label>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="함께 일하면서 느낀 점을 전해주세요..."
                  rows={3} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleSend} disabled={sending} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-blue)] text-white font-semibold text-sm disabled:opacity-50">{sending ? '전송 중...' : '배지 보내기'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
