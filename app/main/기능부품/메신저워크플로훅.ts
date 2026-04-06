'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';

const DEFAULT_POLL_OPTIONS = ['찬성', '반대'];

export type PollItem = {
  id: string;
  room_id?: string | null;
  creator_id?: string | null;
  question: string;
  options: string[];
  created_at?: string | null;
  [key: string]: unknown;
};

export type SlashCommandType = 'annual_leave' | 'purchase' | null;

export type SlashCommandForm = {
  startDate: string;
  endDate: string;
  reason: string;
  itemName: string;
  quantity: number;
};

type UseChatWorkflowDraftsParams = {
  selectedRoomId: string | null;
  effectiveChatUserId: string | null | undefined;
  user: StaffMember | null;
  fetchData: () => void | Promise<void>;
};

type UseChatWorkflowDraftsResult = {
  polls: PollItem[];
  setPolls: Dispatch<SetStateAction<PollItem[]>>;
  pollVotes: Record<string, Record<number, number>>;
  setPollVotes: Dispatch<SetStateAction<Record<string, Record<number, number>>>>;
  showPollModal: boolean;
  pollQuestion: string;
  setPollQuestion: Dispatch<SetStateAction<string>>;
  pollOptions: string[];
  openPollModal: () => void;
  closePollModal: () => void;
  handleCreatePoll: () => Promise<void>;
  handlePollOptionChange: (index: number, value: string) => void;
  handleRemovePollOption: (index: number) => void;
  handleAddPollOption: () => void;
  handleVote: (pollId: string, optionIndex: number) => Promise<void>;
  slashCommand: SlashCommandType;
  showSlashModal: boolean;
  slashForm: SlashCommandForm;
  closeSlashModal: () => void;
  handleSlashFormFieldChange: <K extends keyof SlashCommandForm>(
    field: K,
    value: SlashCommandForm[K],
  ) => void;
  openSlashDraftFromText: (content: string) => boolean;
  handleSubmitAnnualLeaveDraft: () => Promise<void>;
  handleSubmitPurchaseDraft: () => Promise<void>;
};

export function useChatWorkflowDrafts({
  selectedRoomId,
  effectiveChatUserId,
  user,
  fetchData,
}: UseChatWorkflowDraftsParams): UseChatWorkflowDraftsResult {
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [pollVotes, setPollVotes] = useState<Record<string, Record<number, number>>>({});
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(DEFAULT_POLL_OPTIONS);
  const [slashCommand, setSlashCommand] = useState<SlashCommandType>(null);
  const [showSlashModal, setShowSlashModal] = useState(false);
  const [slashForm, setSlashForm] = useState<SlashCommandForm>({
    startDate: '',
    endDate: '',
    reason: '',
    itemName: '',
    quantity: 1,
  });

  const openPollModal = useCallback(() => {
    setShowPollModal(true);
  }, []);

  const closePollModal = useCallback(() => {
    setShowPollModal(false);
  }, []);

  const handleCreatePoll = useCallback(async () => {
    if (!pollQuestion.trim()) {
      toast('투표 질문을 입력해 주세요.', 'warning');
      return;
    }

    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (options.length < 2) {
      toast('선택지는 2개 이상 입력해 주세요.', 'warning');
      return;
    }

    try {
      const { data: poll, error } = await supabase
        .from('polls')
        .insert([
          {
            room_id: selectedRoomId,
            creator_id: effectiveChatUserId || user?.id,
            question: pollQuestion,
            options,
          },
        ])
        .select()
        .single();

      if (error || !poll) {
        throw error || new Error('poll create failed');
      }

      setPolls((prev) => [...prev, poll as PollItem]);
    } catch {
      const optimisticPoll: PollItem = {
        id: Date.now().toString(),
        room_id: selectedRoomId,
        question: pollQuestion,
        options,
      };
      setPolls((prev) => [...prev, optimisticPoll]);
    } finally {
      setPollQuestion('');
      setPollOptions(DEFAULT_POLL_OPTIONS);
      setShowPollModal(false);
    }
  }, [effectiveChatUserId, pollOptions, pollQuestion, selectedRoomId, user?.id]);

  const handlePollOptionChange = useCallback((index: number, value: string) => {
    setPollOptions((prev) => prev.map((option, optionIndex) => (optionIndex === index ? value : option)));
  }, []);

  const handleRemovePollOption = useCallback((index: number) => {
    setPollOptions((prev) => prev.filter((_, optionIndex) => optionIndex !== index));
  }, []);

  const handleAddPollOption = useCallback(() => {
    setPollOptions((prev) => [...prev, '']);
  }, []);

  const handleVote = useCallback(async (pollId: string, optionIndex: number) => {
    try {
      const { data: previousVote } = await supabase
        .from('poll_votes')
        .select('option_index')
        .eq('poll_id', pollId)
        .eq('user_id', effectiveChatUserId || user?.id)
        .maybeSingle();

      const previousOptionIndex = previousVote?.option_index as number | null | undefined;

      const { error } = await supabase.from('poll_votes').upsert(
        {
          poll_id: pollId,
          user_id: effectiveChatUserId || user?.id,
          option_index: optionIndex,
        },
        { onConflict: 'poll_id,user_id' },
      );

      if (error) return;

      setPollVotes((prev) => {
        const next = { ...(prev[pollId] || {}) };
        if (previousOptionIndex != null && previousOptionIndex !== optionIndex) {
          next[previousOptionIndex] = Math.max((next[previousOptionIndex] || 0) - 1, 0);
        }
        if (previousOptionIndex !== optionIndex) {
          next[optionIndex] = (next[optionIndex] || 0) + 1;
        }
        return { ...prev, [pollId]: next };
      });

      void fetchData();
    } catch {
      // ignore poll vote failures here; room refresh will reconcile later
    }
  }, [effectiveChatUserId, fetchData, user?.id]);

  const closeSlashModal = useCallback(() => {
    setShowSlashModal(false);
  }, []);

  const handleSlashFormFieldChange = useCallback(
    <K extends keyof SlashCommandForm>(field: K, value: SlashCommandForm[K]) => {
      setSlashForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const openSlashDraftFromText = useCallback((content: string) => {
    if (!content.startsWith('/')) return false;

    if (content.startsWith('/연차')) {
      setSlashCommand('annual_leave');
      setSlashForm({
        startDate: '',
        endDate: '',
        reason: content.replace('/연차', '').trim(),
        itemName: '',
        quantity: 1,
      });
      setShowSlashModal(true);
      return true;
    }

    if (content.startsWith('/발주')) {
      setSlashCommand('purchase');
      setSlashForm({
        startDate: '',
        endDate: '',
        reason: '',
        itemName: content.replace('/발주', '').trim(),
        quantity: 1,
      });
      setShowSlashModal(true);
      return true;
    }

    return false;
  }, []);

  const handleSubmitAnnualLeaveDraft = useCallback(async () => {
    if (!slashForm.startDate || !slashForm.endDate) {
      toast('시작일과 종료일을 입력해 주세요.', 'warning');
      return;
    }

    try {
      const title = `[채팅]/연차 자동 기안 - ${user?.name}`;
      const contentLines = [
        `요청자: ${user?.name} (${user?.department || ''} ${user?.position || ''})`,
        `기간: ${slashForm.startDate} ~ ${slashForm.endDate}`,
        slashForm.reason ? `사유: ${slashForm.reason}` : '',
        '',
        '이 요청서는 채팅 명령어(/연차)로 자동 생성되었습니다.',
      ].filter(Boolean);

      await supabase.from('approvals').insert([
        {
          sender_id: effectiveChatUserId || user?.id,
          sender_name: user?.name,
          sender_company: user?.company,
          type: '연차/휴가',
          title,
          content: contentLines.join('\n'),
          status: '대기',
        },
      ]);

      toast('연차/휴가 전자결재 초안을 생성했습니다. 전자결재 메뉴에서 내용을 확인 후 제출해 주세요.', 'warning');
    } catch {
      toast('연차 초안 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      closeSlashModal();
    }
  }, [
    closeSlashModal,
    effectiveChatUserId,
    slashForm.endDate,
    slashForm.reason,
    slashForm.startDate,
    user?.company,
    user?.department,
    user?.id,
    user?.name,
    user?.position,
  ]);

  const handleSubmitPurchaseDraft = useCallback(async () => {
    if (!slashForm.itemName || !slashForm.quantity) {
      toast('품목명과 수량을 입력해 주세요.', 'warning');
      return;
    }

    try {
      const title = `[채팅]/발주 자동 기안 - ${slashForm.itemName} x ${slashForm.quantity}`;
      const contentLines = [
        `요청자: ${user?.name} (${user?.department || ''} ${user?.position || ''})`,
        `품목: ${slashForm.itemName}`,
        `수량: ${slashForm.quantity}`,
        slashForm.reason ? `비고: ${slashForm.reason}` : '',
        '',
        '이 요청서는 채팅 명령어(/발주)로 자동 생성되었습니다.',
      ].filter(Boolean);

      await supabase.from('approvals').insert([
        {
          sender_id: effectiveChatUserId || user?.id,
          sender_name: user?.name,
          sender_company: user?.company,
          type: '비품구매',
          title,
          content: contentLines.join('\n'),
          status: '대기',
        },
      ]);

      toast('비품구매 전자결재 초안을 생성했습니다. 전자결재 메뉴에서 내용을 확인 후 제출해 주세요.', 'warning');
    } catch {
      toast('발주 초안 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      closeSlashModal();
    }
  }, [
    closeSlashModal,
    effectiveChatUserId,
    slashForm.itemName,
    slashForm.quantity,
    slashForm.reason,
    user?.company,
    user?.department,
    user?.id,
    user?.name,
    user?.position,
  ]);

  return {
    polls,
    setPolls,
    pollVotes,
    setPollVotes,
    showPollModal,
    pollQuestion,
    setPollQuestion,
    pollOptions,
    openPollModal,
    closePollModal,
    handleCreatePoll,
    handlePollOptionChange,
    handleRemovePollOption,
    handleAddPollOption,
    handleVote,
    slashCommand,
    showSlashModal,
    slashForm,
    closeSlashModal,
    handleSlashFormFieldChange,
    openSlashDraftFromText,
    handleSubmitAnnualLeaveDraft,
    handleSubmitPurchaseDraft,
  };
}
