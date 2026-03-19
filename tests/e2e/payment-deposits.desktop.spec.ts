import { expect, test, type Page } from '@playwright/test';
import { dismissDialogs, fakeUser, mockSupabase, seedSession } from './helpers';
import type { VirtualAccountDepositRow } from '../../lib/virtual-account-deposits';

function trackRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;

    const text = message.text();
    if (
      text.includes('favicon') ||
      text.includes('Failed to load resource') ||
      text.includes('ERR_ABORTED')
    ) {
      return;
    }

    errors.push(`console: ${text}`);
  });

  return errors;
}

const depositUser = {
  ...fakeUser,
  permissions: {
    ...fakeUser.permissions,
    'extra_\uC785\uAE08\uC2E4\uC2DC\uAC04\uC870\uD68C': true,
  },
};

test.beforeEach(async ({ page }) => {
  await dismissDialogs(page);
});

test('realtime deposit view loads rows and saves manual matching', async ({ page }) => {
  const runtimeErrors = trackRuntimeErrors(page);
  let deposits: VirtualAccountDepositRow[] = [
    {
      id: 'deposit-1',
      company_id: depositUser.company_id,
      provider: 'toss',
      dedupe_key: 'toss:order-20260319-1',
      provider_event_type: 'DEPOSIT_CALLBACK',
      provider_event_id: 'event-1',
      order_id: 'order-20260319-1',
      order_name: '외래수납 1건',
      payment_key: 'payment-1',
      transaction_key: 'tx-1',
      method: 'virtual_account',
      deposit_status: 'deposited',
      match_status: 'unmatched',
      amount: 150000,
      currency: 'KRW',
      depositor_name: '백정민',
      customer_name: '백정민',
      patient_name: null,
      patient_id: null,
      transaction_label: null,
      bank_code: '088',
      bank_name: '신한은행',
      account_number: '123-456-7890',
      due_date: '2026-03-20T00:00:00.000Z',
      deposited_at: '2026-03-19T09:30:00.000Z',
      matched_target_type: null,
      matched_target_id: null,
      matched_note: null,
      raw_payload: {},
      created_at: '2026-03-19T09:30:00.000Z',
      updated_at: '2026-03-19T09:30:00.000Z',
    },
  ];

  await mockSupabase(page, {
    staffMembers: [depositUser],
  });

  await seedSession(page, {
    user: depositUser,
    localStorage: {
      erp_last_menu: '추가기능',
    },
  });

  await page.route('**/api/payments/virtual-account-deposits**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deposits }),
      });
      return;
    }

    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, string>;
      const nextMatchStatus =
        body.patient_name || body.patient_id || body.transaction_label || body.matched_target_id
          ? 'matched'
          : body.match_status || 'unmatched';
      deposits = deposits.map((row) =>
        row.id === body.id
          ? {
              ...row,
              patient_name: body.patient_name || null,
              patient_id: body.patient_id || null,
              transaction_label: body.transaction_label || null,
              matched_target_type: body.matched_target_type || null,
              matched_target_id: body.matched_target_id || null,
              matched_note: body.matched_note || null,
              match_status: nextMatchStatus,
              updated_at: '2026-03-19T09:35:00.000Z',
            }
          : row,
      );

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deposit: deposits[0] }),
      });
      return;
    }

    await route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Method not allowed' }),
    });
  });

  await page.goto(`/main?open_menu=${encodeURIComponent('추가기능')}`);
  await expect(page.getByTestId('extra-view')).toBeVisible();
  await page.getByTestId('extra-card-realtime-deposit').click();

  await expect(page.getByTestId('realtime-deposit-view')).toBeVisible();
  await expect(page.getByText('외래수납 1건')).toBeVisible();
  await expect(page.getByTestId('realtime-deposit-row-deposit-1').getByText('150,000원')).toBeVisible();

  await page.getByTestId('realtime-deposit-patient-name-deposit-1').fill('김환자');
  await page.getByTestId('realtime-deposit-transaction-label-deposit-1').fill('외래 접수비');
  await page.getByTestId('realtime-deposit-save-deposit-1').click();

  const depositRow = page.getByTestId('realtime-deposit-row-deposit-1');
  await expect(depositRow.getByText('김환자')).toBeVisible();
  await expect(depositRow.getByRole('heading', { name: '외래 접수비' })).toBeVisible();
  await expect(depositRow.locator('span').filter({ hasText: '매칭완료' }).first()).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});
