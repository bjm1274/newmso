const CHAT_ROOM_COLUMNS = [
  'id',
  'name',
  'type',
  'members',
  'created_at',
  'created_by',
  'last_message',
  'last_message_at',
  'last_message_preview',
];

export const CHAT_ROOM_SELECT = CHAT_ROOM_COLUMNS.join(', ');

const CHAT_MESSAGE_COLUMNS = [
  'id',
  'room_id',
  'sender_id',
  'sender_name',
  'content',
  'file_url',
  'file_name',
  'file_kind',
  'message_type',
  'created_at',
  'is_deleted',
  'reply_to_id',
  'album_id',
];

export const CHAT_MESSAGE_OPTIONAL_COLUMNS = [
  'sender_name',
  'file_url',
  'file_name',
  'file_kind',
  'message_type',
  'is_deleted',
  'reply_to_id',
  'album_id',
] as const;

export const CHAT_MESSAGE_SELECT = CHAT_MESSAGE_COLUMNS.join(', ');

export function buildChatMessageSelect(omittedColumns?: ReadonlySet<string>) {
  return CHAT_MESSAGE_COLUMNS.filter((column) => !omittedColumns?.has(column)).join(', ');
}

export const POLL_SELECT = [
  'id',
  'room_id',
  'creator_id',
  'question',
  'options',
  'created_at',
].join(', ');
