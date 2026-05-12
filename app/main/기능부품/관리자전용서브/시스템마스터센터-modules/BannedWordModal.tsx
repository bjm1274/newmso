'use client';

import { useState } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
import { DEFAULT_BANNED, loadBannedWords, saveBannedWords } from '@/lib/banned-words';
import { toast } from '@/lib/toast';

export function BannedWordModal({ onClose }: { onClose: () => void }) {
  const { dialog, openConfirm } = useActionDialog();
  const [words, setWords] = useState<string[]>(loadBannedWords);
  const [input, setInput] = useState('');

  const add = () => {
    const w = input.trim();
    if (!w) return;
    if (words.includes(w)) { toast('이미 등록된 단어입니다.', 'warning'); return; }
    const next = [...words, w];
    setWords(next);
    saveBannedWords(next);
    setInput('');
    toast(`"${w}" 등록 완료`, 'success');
  };

  const remove = (w: string) => {
    const next = words.filter((x) => x !== w);
    setWords(next);
    saveBannedWords(next);
  };

  const reset = async () => {
    const confirmed = await openConfirm({
      title: '금지어 기본값 초기화',
      description: '현재 금지어 목록을 기본 금지어 목록으로 되돌립니다.',
      confirmText: '초기화',
      tone: 'danger',
    });
    if (!confirmed) return;
    setWords(DEFAULT_BANNED);
    saveBannedWords(DEFAULT_BANNED);
    toast('초기화 완료', 'success');
  };

  return (
    <>
      {dialog}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div
          className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm w-full max-w-md p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--foreground)]">🔍 단어 필터</h3>
            <button onClick={onClose} className="text-[var(--toss-gray-3)] hover:text-[var(--foreground)] text-lg">×</button>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="금지어 입력 후 Enter"
              className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--page-bg)] text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <button onClick={add} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)]">추가</button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto mb-4 p-2 bg-[var(--page-bg)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {words.length === 0 && <p className="text-xs text-[var(--toss-gray-3)]">등록된 금지어 없음</p>}
            {words.map((w) => (
              <span key={w} className="inline-flex items-center gap-1 px-2 py-0.5 bg-danger/20 text-danger text-xs font-semibold rounded-full">
                {w}
                <button onClick={() => remove(w)} className="hover:opacity-70 font-bold">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={reset}
              className="px-3 py-1.5 text-xs text-[var(--toss-gray-3)] border border-[var(--border)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
            >
              기본값으로 초기화
            </button>
            <button onClick={onClose} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)]">확인</button>
          </div>
        </div>
      </div>
    </>
  );
}
