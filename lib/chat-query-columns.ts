export const CHAT_ROOM_SELECT = [
  'id',
  'name',
  'type',
  'members',
  'created_at',
  'created_by',
  'last_message',
  'last_message_at',
  'last_message_preview',
].join(', ');

export const CHAT_MESSAGE_SELECT = [
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
].join(', ');

export const POLL_SELECT = [
  'id',
  'room_id',
  'creator_id',
  'question',
  'options',
  'created_at',
].join(', ');
