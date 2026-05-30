'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { buildPollQuestionContent, extractPollMetaFromQuestion } from './메신저유틸';
import type { PollPrizeWinner } from './메신저유틸';
import { insertChatMessageWithFallback } from './메신저메시지서비스';

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
  pollDeadlineAt: string;
  setPollDeadlineAt: Dispatch<SetStateAction<string>>;
  prizeEnabled: boolean;
  prizeWinnerCount: number;
  prizeName: string;
  setPrizeEnabled: Dispatch<SetStateAction<boolean>>;
  setPrizeWinnerCount: Dispatch<SetStateAction<number>>;
  setPrizeName: Dispatch<SetStateAction<string>>;
  openPollModal: () => void;
  closePollModal: () => void;
  handleCreatePoll: () => Promise<void>;
  handlePollOptionChange: (index: number, value: string) => void;
  handleRemovePollOption: (index: number) => void;
  handleAddPollOption: () => void;
  handleVote: (pollId: string, optionIndex: number) => Promise<void>;
  handleDrawPollPrize: (pollId: string) => Promise<void>;
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
  const [pollDeadlineAt, setPollDeadlineAt] = useState('');
  const [prizeEnabled, setPrizeEnabled] = useState(false);
  const [prizeWinnerCount, setPrizeWinnerCount] = useState(1);
  const [prizeName, setPrizeName] = useState('');
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
    setPollDeadlineAt('');
    setPrizeEnabled(false);
    setPrizeWinnerCount(1);
    setPrizeName('');
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
      const prizeMeta =
        prizeEnabled && prizeName.trim() && prizeWinnerCount >= 1
          ? { winnerCount: prizeWinnerCount, name: prizeName.trim() }
          : undefined;

      const pollPayload = {
        room_id: selectedRoomId,
        creator_id: effectiveChatUserId || user?.id,
        question: buildPollQuestionContent(pollQuestion, {
          deadlineAt: pollDeadlineAt,
          prize: prizeMeta,
        }),
        options,
      };

      const { data: poll, error } = await supabase
        .from('polls')
        .insert([pollPayload])
        .select()
        .single();

      if (error || !poll) {
        throw error || new Error('poll create failed');
      }

      setPolls((prev) => [...prev, poll as PollItem]);
    } catch {
      const prizeMeta =
        prizeEnabled && prizeName.trim() && prizeWinnerCount >= 1
          ? { winnerCount: prizeWinnerCount, name: prizeName.trim() }
          : undefined;

      const optimisticPoll: PollItem = {
        id: Date.now().toString(),
        room_id: selectedRoomId,
        question: buildPollQuestionContent(pollQuestion, {
          deadlineAt: pollDeadlineAt,
          prize: prizeMeta,
        }),
        options,
      };
      setPolls((prev) => [...prev, optimisticPoll]);
    } finally {
      setPollQuestion('');
      setPollOptions(DEFAULT_POLL_OPTIONS);
      setPollDeadlineAt('');
      setPrizeEnabled(false);
      setPrizeWinnerCount(1);
      setPrizeName('');
      setShowPollModal(false);
    }
  }, [effectiveChatUserId, pollDeadlineAt, pollOptions, pollQuestion, prizeEnabled, prizeName, prizeWinnerCount, selectedRoomId, user?.id]);

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

  const handleDrawPollPrize = useCallback(async (pollId: string) => {
    const poll = polls.find((p) => p.id === pollId);
    if (!poll) return;

    const myId = effectiveChatUserId || user?.id;
    if (String(poll.creator_id) !== String(myId)) {
      toast('투표 생성자만 추첨할 수 있습니다.', 'warning');
      return;
    }

    const { prize, prizeWinners } = extractPollMetaFromQuestion(poll.question);
    if (!prize) return;
    if (prizeWinners && prizeWinners.length > 0) {
      toast('이미 추첨이 완료된 투표입니다.', 'warning');
      return;
    }

    try {
      const { data: voteRows, error: voteError } = await supabase
        .from('poll_votes')
        .select('user_id')
        .eq('poll_id', pollId);

      if (voteError) throw voteError;

      const participantIds = [...new Set((voteRows ?? []).map((row: { user_id: unknown }) => String(row.user_id)))];
      if (participantIds.length === 0) {
        toast('투표 참여자가 없어 추첨할 수 없습니다.', 'warning');
        return;
      }

      // Fisher-Yates 셔플
      const shuffled = [...participantIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selectedIds = shuffled.slice(0, Math.min(prize.winnerCount, shuffled.length));

      const { data: staffRows, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name')
        .in('id', selectedIds);

      if (staffError) throw staffError;

      const winners: PollPrizeWinner[] = (selectedIds as string[]).map((id) => {
        const found = (staffRows ?? []).find((s: { id: unknown; name: unknown }) => String(s.id) === id);
        return { id, name: String(found?.name || '알 수 없음') } as PollPrizeWinner;
      });

      const { deadlineAt } = extractPollMetaFromQuestion(poll.question);
      const newQuestion = buildPollQuestionContent(
        extractPollMetaFromQuestion(poll.question).displayQuestion,
        { deadlineAt, prize, prizeWinners: winners },
      );

      const { error: updateError } = await supabase
        .from('polls')
        .update({ question: newQuestion })
        .eq('id', pollId);

      if (updateError) throw updateError;

      // 낙관적 갱신
      setPolls((prev) =>
        prev.map((p) => (p.id === pollId ? { ...p, question: newQuestion } : p)),
      );

      // 추첨 결과를 해당 채팅방에 일반 메시지로 게시 (JM3: 추첨 성공과 격리)
      const roomId = String(poll.room_id || selectedRoomId || '');
      if (roomId) {
        const senderId = String(effectiveChatUserId || user?.id || '');
        const { displayQuestion } = extractPollMetaFromQuestion(poll.question);
        const winnerNames = winners.map((w) => w.name).join(', ');
        const resultContent = `🎉 추첨 결과\n[${displayQuestion}]\n🎁 상품: ${prize.name}\n🏆 당첨: ${winnerNames}`;

        try {
          await insertChatMessageWithFallback({
            room_id: roomId,
            sender_id: senderId || null,
            content: resultContent,
            file_url: null,
            file_name: null,
            file_size_bytes: null,
            file_kind: null,
            reply_to_id: null,
            album_id: null,
            album_index: null,
            album_total: null,
          });
        } catch {
          toast('추첨 결과 메시지 게시에 실패했습니다.', 'warning');
        }
      }

      void fetchData();
      toast(`🎉 추첨 완료! 당첨자: ${winners.map((w) => w.name).join(', ')}`);
    } catch {
      toast('추첨 중 오류가 발생했습니다.', 'error');
    }
  }, [effectiveChatUserId, fetchData, polls, selectedRoomId, setPolls, user?.id]);

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
    pollDeadlineAt,
    setPollDeadlineAt,
    prizeEnabled,
    prizeWinnerCount,
    prizeName,
    setPrizeEnabled,
    setPrizeWinnerCount,
    setPrizeName,
    openPollModal,
    closePollModal,
    handleCreatePoll,
    handlePollOptionChange,
    handleRemovePollOption,
    handleAddPollOption,
    handleVote,
    handleDrawPollPrize,
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
