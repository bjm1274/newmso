'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';

type UseChatComposerStateParams = {
  inputMsg: string;
  setInputMsg: (value: string) => void;
  inputMsgRef: MutableRefObject<string>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  typingClearRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  emitTypingState: (isTyping: boolean) => void;
};

export function useChatComposerState({
  inputMsg,
  setInputMsg,
  inputMsgRef,
  composerRef,
  typingClearRef,
  emitTypingState,
}: UseChatComposerStateParams) {
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);
  // 한글 IME 조합 가드 — 자모(ㄱ/가/간) 매 단계마다 typing realtime broadcast 가 발화하던 것을
  // 조합 종료 시점에 한 번만 발화하도록 차단한다. value 갱신(setInputMsg) 은 항상 수행해
  // controlled textarea 의 동기화는 그대로 유지된다. (JM2 — 불필요한 네트워크 호출 축소)
  const isComposingRef = useRef(false);

  useEffect(() => {
    inputMsgRef.current = inputMsg;
  }, [inputMsg, inputMsgRef]);

  const applyMentionAndTypingEffects = useCallback((value: string, caret: number) => {
    const upToCaret = value.slice(0, caret);
    const match = upToCaret.match(/@([^\s@]{0,20})$/);
    if (match) {
      setMentionQuery(match[1] || '');
      setShowMentionList(true);
    } else {
      setShowMentionList(false);
      setMentionQuery('');
    }

    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }

    if (value.trim()) {
      emitTypingState(true);
      typingClearRef.current = setTimeout(() => {
        emitTypingState(false);
        typingClearRef.current = null;
      }, 1800);
    } else {
      emitTypingState(false);
    }
  }, [emitTypingState, typingClearRef]);

  // composition end 시 최신 부가효과 함수를 stale closure 없이 참조하기 위한 ref
  const applyEffectsRef = useRef(applyMentionAndTypingEffects);
  useEffect(() => {
    applyEffectsRef.current = applyMentionAndTypingEffects;
  }, [applyMentionAndTypingEffects]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const handleStart = () => { isComposingRef.current = true; };
    const handleEnd = () => {
      isComposingRef.current = false;
      // 조합 종료 후 마지막 값으로 부가 효과(멘션·typing emit) 를 한 번 동기화한다.
      const value = el.value;
      const caret = el.selectionStart ?? value.length;
      applyEffectsRef.current(value, caret);
    };
    el.addEventListener('compositionstart', handleStart);
    el.addEventListener('compositionend', handleEnd);
    return () => {
      el.removeEventListener('compositionstart', handleStart);
      el.removeEventListener('compositionend', handleEnd);
    };
  }, [composerRef]);

  const handleComposerChange = useCallback((value: string, caret: number) => {
    // value 갱신은 항상 수행 — controlled textarea 의 한글 IME 동기화 무결성을 위해.
    inputMsgRef.current = value;
    setInputMsg(value);
    // 한글 자모 조합 중에는 부가 효과(멘션·typing emit) 만 skip. 조합 종료 시 한번 동기화.
    if (isComposingRef.current) return;
    applyMentionAndTypingEffects(value, caret);
  }, [applyMentionAndTypingEffects, inputMsgRef, setInputMsg]);

  const handleSelectMention = useCallback((name: string) => {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return;

    const value = inputMsgRef.current;
    const replaced = value.match(/@([^\s@]{0,20})$/)
      ? value.replace(/@([^\s@]{0,20})$/, `@${trimmedName} `)
      : `${value}@${trimmedName} `;

    inputMsgRef.current = replaced;
    setInputMsg(replaced);
    setShowMentionList(false);
    setMentionQuery('');
    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }, [composerRef, inputMsgRef]);

  useEffect(() => {
    const composerEl = composerRef.current;
    if (!composerEl) return;
    composerEl.style.height = '0px';
    composerEl.style.height = `${Math.min(120, composerEl.scrollHeight)}px`;
  }, [composerRef, inputMsg]);

  return {
    mentionQuery,
    showMentionList,
    handleComposerChange,
    handleSelectMention,
  };
}
