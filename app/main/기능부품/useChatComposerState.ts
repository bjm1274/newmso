'use client';

import { useCallback, useEffect, useState, type MutableRefObject, type RefObject } from 'react';

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

  useEffect(() => {
    inputMsgRef.current = inputMsg;
  }, [inputMsg, inputMsgRef]);

  const handleComposerChange = useCallback((value: string, caret: number) => {
    inputMsgRef.current = value;
    setInputMsg(value);
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
  }, [emitTypingState, inputMsgRef, typingClearRef]);

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
