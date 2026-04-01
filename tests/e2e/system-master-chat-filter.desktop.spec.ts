import { expect, test } from '@playwright/test';
import {
  getFlaggedChatRooms,
  includesBannedWord,
  pickFirstFlaggedChatMessage,
} from '../../lib/system-master-chat-filter';

test('system master chat filter keeps only rooms with flagged messages', async () => {
  const rooms = [
    { id: 'room-a' },
    { id: 'room-b' },
    { id: 'room-c' },
  ];
  const messages = [
    { id: 'msg-1', room_id: 'room-a', content: '안전한 대화' },
    { id: 'msg-2', room_id: 'room-b', content: '이건 병신 같은 처리야' },
    { id: 'msg-3', room_id: 'room-c', content: '정상 메시지' },
    { id: 'msg-4', room_id: 'room-b', content: '씨발 다시 확인해' },
  ];

  const result = getFlaggedChatRooms(rooms, messages, ['병신', '씨발']);

  expect(result).toEqual([{ id: 'room-b' }]);
});

test('system master chat filter picks the first flagged message in the current order', async () => {
  const messages = [
    { id: 'msg-latest', room_id: 'room-b', content: '씨발 다시 확인해' },
    { id: 'msg-older', room_id: 'room-a', content: '병신 같은 예시' },
  ];

  const target = pickFirstFlaggedChatMessage(messages, ['병신', '씨발']);

  expect(target).toEqual(messages[0]);
});

test('system master banned-word matching is case-insensitive', async () => {
  expect(includesBannedWord('This is BADWORD', ['badword'])).toBe(true);
  expect(includesBannedWord('This is safe', ['badword'])).toBe(false);
});
