export type SystemMasterChatRoomLike = {
  id: string;
};

export type SystemMasterChatMessageLike = {
  id: string;
  room_id?: string | null;
  content?: string | null;
};

export function includesBannedWord(
  content: string | null | undefined,
  bannedWords: string[],
) {
  const normalizedContent = String(content || '').trim().toLowerCase();
  if (!normalizedContent) return false;
  return bannedWords.some((word) => {
    const normalizedWord = String(word || '').trim().toLowerCase();
    return normalizedWord ? normalizedContent.includes(normalizedWord) : false;
  });
}

export function getFlaggedChatMessages<T extends SystemMasterChatMessageLike>(
  messages: T[],
  bannedWords: string[],
) {
  return messages.filter((message) => includesBannedWord(message.content, bannedWords));
}

export function getFlaggedChatRoomIds<T extends SystemMasterChatMessageLike>(
  messages: T[],
  bannedWords: string[],
) {
  return new Set(
    getFlaggedChatMessages(messages, bannedWords)
      .map((message) => String(message.room_id || '').trim())
      .filter(Boolean),
  );
}

export function getFlaggedChatRooms<
  T extends SystemMasterChatRoomLike,
  M extends SystemMasterChatMessageLike,
>(
  rooms: T[],
  messages: M[],
  bannedWords: string[],
) {
  const flaggedRoomIds = getFlaggedChatRoomIds(messages, bannedWords);
  return rooms.filter((room) => flaggedRoomIds.has(String(room.id || '').trim()));
}

export function pickFirstFlaggedChatMessage<T extends SystemMasterChatMessageLike>(
  messages: T[],
  bannedWords: string[],
) {
  return getFlaggedChatMessages(messages, bannedWords)[0] || null;
}
