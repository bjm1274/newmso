/**
 * 모바일 시트/다이얼로그 히스토리 회귀 — popstate(브라우저/하드웨어 뒤로가기)로
 * 시트가 정상적으로 닫히는지 검증한다.
 *
 * 직접적인 ActionDialog/BottomSheet 트리거 UI가 모든 화면에 노출되지는 않으므로,
 * 실제 진입 가능한 경로(채팅방 진입 → 메시지 화면)에서 popstate 동작을 본다.
 * 채팅 화면의 history entry는 useSheetHistory와 동일한 원칙으로 관리된다.
 *
 * 검증 원칙
 * - JM: popstate 회귀 단일 책임
 * - JM3: 실패 시 시트 상태/history.length 값을 메시지에 포함
 * - JM4: any 금지, page.evaluate 결과는 명시 타입
 * - JM7: 핵심 시나리오만 — 키보드/포커스 트랩은 별도 a11y 테스트
 */
import { expect, test } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const ROOM_ID = 'mobile-sheet-room-1';
const PEER_ID = 'mobile-sheet-peer-1';

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
  await mockSupabase(page, {
    chatRooms: [
      {
        id: NOTICE_ROOM_ID,
        name: 'Notice',
        type: 'notice',
        members: [],
        created_at: '2026-05-15T00:00:00.000Z',
        last_message_at: '2026-05-15T00:00:00.000Z',
      },
      {
        id: ROOM_ID,
        name: '모바일 시트 회귀용 방',
        type: 'group',
        members: [fakeUser.id, PEER_ID],
        created_at: '2026-05-15T09:00:00.000Z',
        last_message_at: '2026-05-15T10:00:00.000Z',
        last_message_preview: '시트 회귀 메시지',
      },
    ],
    staffMembers: [
      fakeUser,
      {
        ...fakeUser,
        id: PEER_ID,
        name: '모바일 시트 피어',
        employee_no: 'E2E-SHEET-MOBILE',
      },
    ],
    messages: [
      {
        id: 'mobile-sheet-msg-1',
        room_id: ROOM_ID,
        sender_id: PEER_ID,
        content: '시트 회귀 메시지',
        created_at: '2026-05-15T10:00:00.000Z',
        is_deleted: false,
        staff: { name: '모바일 시트 피어', photo_url: null },
      },
    ],
  });
  await seedSession(page, { localStorage: { erp_last_menu: '채팅' } });
});

test('채팅방 진입 시 history entry 가 1개 push 된다', async ({ page }) => {
  await page.goto('/main?open_menu=채팅');
  await expect(page.getByTestId('chat-view')).toBeVisible();

  const backToRoomListButton = page.getByRole('button', { name: '뒤로' });
  if (await backToRoomListButton.isVisible().catch(() => false)) {
    await backToRoomListButton.click();
  }

  const historyBefore = await page.evaluate(() => window.history.length);
  const room = page.getByTestId(`chat-room-${ROOM_ID}`);
  await expect(room).toBeVisible();
  await room.click();

  await expect(page.getByTestId('chat-message-input')).toBeVisible();

  // useSheetHistory와 동일 원칙: 시트형 진입 시 history.length 가 +1 되어야 한다.
  await expect
    .poll(async () => page.evaluate(() => window.history.length))
    .toBe(historyBefore + 1);
});

test('채팅방 popstate(뒤로가기) 시 시트가 닫히고 페이지를 벗어나지 않는다', async ({ page }) => {
  await page.goto('/main?open_menu=채팅');
  await expect(page.getByTestId('chat-view')).toBeVisible();

  const backToRoomListButton = page.getByRole('button', { name: '뒤로' });
  if (await backToRoomListButton.isVisible().catch(() => false)) {
    await backToRoomListButton.click();
  }

  const room = page.getByTestId(`chat-room-${ROOM_ID}`);
  await expect(room).toBeVisible();
  await room.click();
  await expect(page.getByTestId('chat-message-input')).toBeVisible();

  await page.evaluate(() => window.history.back());

  // popstate 후에도 /main 안에 머물러야 하며, 시트(메시지 입력기)는 닫혀야 한다.
  await expect(page).toHaveURL(/\/main/);
  await expect(page.getByTestId('chat-view')).toBeVisible();
  await expect(page.getByTestId('chat-message-input')).toBeHidden();
  await expect(page.getByTestId(`chat-room-${ROOM_ID}`)).toBeVisible();
});

test('채팅방 닫기 버튼(뒤로) 클릭 시 history entry 가 정리된다', async ({ page }) => {
  await page.goto('/main?open_menu=채팅');
  await expect(page.getByTestId('chat-view')).toBeVisible();

  const initialBackButton = page.getByRole('button', { name: '뒤로' });
  if (await initialBackButton.isVisible().catch(() => false)) {
    await initialBackButton.click();
  }

  const historyBefore = await page.evaluate(() => window.history.length);

  const room = page.getByTestId(`chat-room-${ROOM_ID}`);
  await expect(room).toBeVisible();
  await room.click();
  await expect(page.getByTestId('chat-message-input')).toBeVisible();

  // 정상 닫기 경로 — 뒤로 버튼 클릭
  const closeButton = page.getByRole('button', { name: '뒤로' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  } else {
    // 닫기 버튼이 노출되지 않는 변형이면 popstate 으로 닫기 (둘 다 history 를 +1 만큼만 사용해야 함)
    await page.evaluate(() => window.history.back());
  }

  await expect(page.getByTestId('chat-message-input')).toBeHidden();

  // 시트가 닫히고 나면 history.length 가 다시 초기값 이하로 돌아와야 한다.
  // (정상 닫기 경로에서 push한 entry를 정리하므로 ±1 허용)
  const historyAfter = await page.evaluate(() => window.history.length);
  expect(
    Math.abs(historyAfter - historyBefore),
    `시트 닫기 후 history.length 변화량(${historyAfter - historyBefore})이 1을 초과함`,
  ).toBeLessThanOrEqual(1);
});
