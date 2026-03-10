import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import { SUPABASE_ACCESS_TOKEN_STORAGE_KEY } from '../../lib/supabase-bridge';
import { createSupabaseAccessToken } from '../../lib/server-supabase-bridge';
import {
  createSessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../../lib/server-session';

function hydrateEnvFromLocalFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

hydrateEnvFromLocalFile();

const defaultYearMonth = new Date().toISOString().slice(0, 7);
const noticeRoomId = '00000000-0000-0000-0000-000000000000';

export const fakeUser = {
  id: '11111111-1111-1111-1111-111111111111',
  employee_no: 'E2E-001',
  name: 'E2E Tester',
  company: 'E2E Clinic',
  company_id: '22222222-2222-2222-2222-222222222222',
  department: '간호부',
  position: '부서장',
  role: 'manager',
  permissions: {
    hr: true,
    inventory: true,
    approval: true,
    admin: false,
    mso: false,
  },
};

export type MockFixtures = {
  staffMembers?: any[];
  notifications?: any[];
  chatRooms?: any[];
  messages?: any[];
  messageInsertFailures?: number;
  approvals?: any[];
  payrollRecords?: any[];
  boardPosts?: any[];
  companies?: any[];
  inventoryItems?: any[];
  inventoryLogs?: any[];
  workShifts?: any[];
  orgTeams?: any[];
  approvalFormTypes?: any[];
  systemConfigs?: any[];
  generatedContracts?: any[];
  insuranceRecords?: any[];
  attendance?: any[];
  attendances?: any[];
  leaveRequests?: any[];
  attendanceDeductionRules?: any[];
  taxInsuranceRates?: any[];
};

type SeedOptions = {
  user?: Record<string, unknown>;
  localStorage?: Record<string, string>;
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

function normalizeComparableValue(value: any) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function parseInValues(raw: string) {
  const inner = raw.slice(4, -1);
  if (!inner) return [];
  return inner
    .split(',')
    .map((item) => decodeURIComponent(item.replace(/^"|"$/g, '').trim()));
}

function applyQueryFilters(rows: any[], url: URL) {
  let filtered = [...rows];

  for (const [key, rawValue] of url.searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) {
      continue;
    }

    if (rawValue.startsWith('eq.')) {
      const expected = decodeURIComponent(rawValue.slice(3));
      filtered = filtered.filter((row) => String(normalizeComparableValue(row[key]) ?? '') === expected);
      continue;
    }

    if (rawValue.startsWith('neq.')) {
      const expected = decodeURIComponent(rawValue.slice(4));
      filtered = filtered.filter((row) => String(normalizeComparableValue(row[key]) ?? '') !== expected);
      continue;
    }

    if (rawValue.startsWith('gte.')) {
      const expected = decodeURIComponent(rawValue.slice(4));
      filtered = filtered.filter((row) => String(normalizeComparableValue(row[key]) ?? '') >= expected);
      continue;
    }

    if (rawValue.startsWith('lte.')) {
      const expected = decodeURIComponent(rawValue.slice(4));
      filtered = filtered.filter((row) => String(normalizeComparableValue(row[key]) ?? '') <= expected);
      continue;
    }

    if (rawValue.startsWith('in.(') && rawValue.endsWith(')')) {
      const expected = parseInValues(rawValue);
      filtered = filtered.filter((row) => expected.includes(String(normalizeComparableValue(row[key]) ?? '')));
      continue;
    }

    if (rawValue.startsWith('is.')) {
      const expected = rawValue.slice(3);
      if (expected === 'null') {
        filtered = filtered.filter((row) => row[key] == null);
      } else if (expected === 'not.null') {
        filtered = filtered.filter((row) => row[key] != null);
      } else {
        filtered = filtered.filter((row) => String(normalizeComparableValue(row[key]) ?? '') === expected);
      }
    }
  }

  const order = url.searchParams.get('order');
  if (order) {
    const [column, direction = 'asc'] = order.split('.');
    filtered.sort((left, right) => {
      const leftValue = normalizeComparableValue(left?.[column]);
      const rightValue = normalizeComparableValue(right?.[column]);
      if (leftValue == null && rightValue == null) return 0;
      if (leftValue == null) return direction === 'desc' ? 1 : -1;
      if (rightValue == null) return direction === 'desc' ? -1 : 1;
      if (leftValue < rightValue) return direction === 'desc' ? 1 : -1;
      if (leftValue > rightValue) return direction === 'desc' ? -1 : 1;
      return 0;
    });
  }

  const limit = url.searchParams.get('limit');
  if (limit) {
    const parsed = Number(limit);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      filtered = filtered.slice(0, parsed);
    }
  }

  return filtered;
}

function matchFilters(row: any, url: URL) {
  return applyQueryFilters([row], url).length > 0;
}

function buildFixtures(overrides: MockFixtures = {}) {
  return {
    staffMembers: overrides.staffMembers ?? [fakeUser],
    notifications: overrides.notifications ?? [],
    chatRooms:
      overrides.chatRooms ??
      [
        {
          id: noticeRoomId,
          name: '공지메시지',
          type: 'notice',
          members: [fakeUser.id],
          created_at: '2026-03-08T00:00:00.000Z',
          last_message_at: '2026-03-08T00:00:00.000Z',
        },
      ],
    messages: overrides.messages ?? [],
    messageInsertFailures: overrides.messageInsertFailures ?? 0,
    approvals:
      overrides.approvals ??
      [
        {
          id: '33333333-3333-3333-3333-333333333333',
          type: '일반기안',
          title: 'E2E 결재 문서',
          content: '테스트용 결재 문서입니다.',
          sender_id: fakeUser.id,
          sender_name: fakeUser.name,
          sender_company: fakeUser.company,
          company_id: fakeUser.company_id,
          current_approver_id: fakeUser.id,
          approver_line: [fakeUser.id],
          status: '대기',
          created_at: '2026-03-08T09:00:00.000Z',
          meta_data: {},
        },
      ],
    payrollRecords:
      overrides.payrollRecords ??
      [
        {
          id: '44444444-4444-4444-4444-444444444444',
          staff_id: fakeUser.id,
          year_month: defaultYearMonth,
          record_type: 'regular',
          net_pay: 2800000,
          gross_pay: 3200000,
          created_at: '2026-03-08T09:00:00.000Z',
        },
      ],
    boardPosts: overrides.boardPosts ?? [],
    companies:
      overrides.companies ?? [
        {
          id: fakeUser.company_id,
          name: fakeUser.company,
          type: 'hospital',
          is_active: true,
        },
      ],
    inventoryItems: overrides.inventoryItems ?? [],
    inventoryLogs: overrides.inventoryLogs ?? [],
    workShifts: overrides.workShifts ?? [],
    orgTeams: overrides.orgTeams ?? [],
    approvalFormTypes: overrides.approvalFormTypes ?? [],
    generatedContracts: overrides.generatedContracts ?? [],
    insuranceRecords: overrides.insuranceRecords ?? [],
    attendance: overrides.attendance ?? [],
    attendances: overrides.attendances ?? [],
    leaveRequests: overrides.leaveRequests ?? [],
    attendanceDeductionRules:
      overrides.attendanceDeductionRules ??
      [
        {
          company_name: '전체',
          late_deduction_type: 'fixed',
          late_deduction_amount: 0,
          early_leave_deduction_type: 'fixed',
          early_leave_deduction_amount: 0,
        },
      ],
    taxInsuranceRates:
      overrides.taxInsuranceRates ??
      [
        {
          id: 'tax-rate-default-1',
          effective_year: Number(defaultYearMonth.slice(0, 4)),
          company_name: fakeUser.company,
          national_pension_rate: 0.045,
          health_insurance_rate: 0.0355,
          long_term_care_rate: 0.0046,
          employment_insurance_rate: 0.009,
          income_tax_bracket: [{ min: 0, rate: 0.03 }],
        },
        {
          id: 'tax-rate-default-all',
          effective_year: Number(defaultYearMonth.slice(0, 4)),
          company_name: '전체',
          national_pension_rate: 0.045,
          health_insurance_rate: 0.0355,
          long_term_care_rate: 0.0046,
          employment_insurance_rate: 0.009,
          income_tax_bracket: [{ min: 0, rate: 0.03 }],
        },
      ],
    systemConfigs:
      overrides.systemConfigs ?? [
        {
          key: 'min_auth_time',
          value: '1970-01-01T00:00:00.000Z',
        },
      ],
  };
}

function firstOrList(rows: any[], wantsObject: boolean) {
  return wantsObject ? rows[0] ?? null : rows;
}

function markNotificationsRead(rows: any[], id?: string | null) {
  const now = new Date().toISOString();
  return rows.map((row) => {
    if (!id || row.id === id) {
      return {
        ...row,
        read_at: row.read_at ?? now,
      };
    }
    return row;
  });
}

export async function seedSession(page: Page, options: SeedOptions = {}) {
  const user = {
    ...fakeUser,
    ...(options.user || {}),
  };
  const extraStorage: Record<string, string> = {
    erp_permission_prompt_shown: '1',
    ...(options.localStorage || {}),
  };
  const token = await createSessionToken(user);
  const supabaseAccessToken = await createSupabaseAccessToken(user as any);
  const cookieOptions = getSessionCookieOptions();

  if (supabaseAccessToken) {
    extraStorage[SUPABASE_ACCESS_TOKEN_STORAGE_KEY] = supabaseAccessToken;
  }

  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      url: 'http://127.0.0.1:3000',
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + (cookieOptions.maxAge || 0),
    },
  ]);

  await page.addInitScript(
    ({ seededUser, seededStorage }) => {
      window.localStorage.setItem('erp_user', JSON.stringify(seededUser));
      window.localStorage.setItem('erp_login_at', new Date().toISOString());
      Object.entries(seededStorage).forEach(([key, value]) => {
        window.localStorage.setItem(key, value);
      });
    },
    { seededUser: user, seededStorage: extraStorage }
  );
}

export async function replaceSession(page: Page, options: SeedOptions = {}) {
  const user = {
    ...fakeUser,
    ...(options.user || {}),
  };
  const extraStorage: Record<string, string> = {
    erp_permission_prompt_shown: '1',
    ...(options.localStorage || {}),
  };
  const token = await createSessionToken(user);
  const supabaseAccessToken = await createSupabaseAccessToken(user as any);
  const cookieOptions = getSessionCookieOptions();

  if (supabaseAccessToken) {
    extraStorage[SUPABASE_ACCESS_TOKEN_STORAGE_KEY] = supabaseAccessToken;
  }

  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      url: 'http://127.0.0.1:3000',
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + (cookieOptions.maxAge || 0),
    },
  ]);

  await page.evaluate(
    ({ seededUser, seededStorage, tokenKey, accessToken }) => {
      window.localStorage.clear();
      window.localStorage.setItem('erp_user', JSON.stringify(seededUser));
      window.localStorage.setItem('erp_login_at', new Date().toISOString());
      Object.entries(seededStorage).forEach(([key, value]) => {
        window.localStorage.setItem(key, value);
      });
      if (accessToken) {
        window.localStorage.setItem(tokenKey, accessToken);
      }
    },
    {
      seededUser: user,
      seededStorage: extraStorage,
      tokenKey: SUPABASE_ACCESS_TOKEN_STORAGE_KEY,
      accessToken: supabaseAccessToken,
    }
  );
}

export async function buildSessionCookieHeader(user: Record<string, unknown>) {
  const token = await createSessionToken(user);
  const cookieOptions = getSessionCookieOptions();
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Path=${cookieOptions.path}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (cookieOptions.maxAge) {
    parts.push(`Max-Age=${cookieOptions.maxAge}`);
  }
  if (cookieOptions.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export async function dismissDialogs(page: Page) {
  page.on('dialog', async (dialog) => {
    await dialog.dismiss();
  });
}

export async function mockSupabase(page: Page, overrides: MockFixtures = {}) {
  const fixtures = buildFixtures(overrides);
  let notifications = [...fixtures.notifications];
  let staffMembers = [...fixtures.staffMembers];
  let approvals = [...fixtures.approvals];
  let messages = [...fixtures.messages];
  let chatRooms = [...fixtures.chatRooms];
  let companies = [...fixtures.companies];
  let inventoryItems = [...fixtures.inventoryItems];
  let inventoryLogs = [...fixtures.inventoryLogs];
  let workShifts = [...fixtures.workShifts];
  let orgTeams = [...fixtures.orgTeams];
  let generatedContracts = [...fixtures.generatedContracts];
  let insuranceRecords = [...fixtures.insuranceRecords];
  let attendance = [...(fixtures.attendance ?? [])];
  let attendances = [...fixtures.attendances];
  let leaveRequests = [...(fixtures.leaveRequests ?? [])];
  const attendanceDeductionRules = [...fixtures.attendanceDeductionRules];
  const taxInsuranceRates = [...fixtures.taxInsuranceRates];
  let messageInsertFailures = fixtures.messageInsertFailures;
  let payrollRecords = [...fixtures.payrollRecords];

  const updateChatRoomMeta = (roomId?: string, content?: string | null, createdAt?: string) => {
    if (!roomId) return;
    chatRooms = chatRooms.map((room: any) =>
      room.id === roomId
        ? {
            ...room,
            last_message_at: createdAt || new Date().toISOString(),
            last_message_preview: (content || '📎 파일').slice(0, 80),
          }
        : room
    );
  };

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const accept = request.headers().accept || '';
    const wantsObject = accept.includes('application/vnd.pgrst.object+json');

    if (method === 'HEAD' && path.includes('/notifications')) {
      const unreadCount = notifications.filter((item) => !item.read_at).length;
      return route.fulfill({
        status: 200,
        headers: {
          'content-range': `0-0/${unreadCount}`,
        },
      });
    }

    if (path.includes('/staff_members')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(staffMembers, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => {
          const matchedCompany = companies.find(
            (company: any) => String(company.name) === String(payload.company)
          );
          return {
            id: payload.id || `staff-member-${staffMembers.length + index + 1}`,
            created_at: payload.created_at || new Date().toISOString(),
            company_id: payload.company_id || matchedCompany?.id || null,
            annual_leave_total: payload.annual_leave_total ?? 0,
            annual_leave_used: payload.annual_leave_used ?? 0,
            permissions: payload.permissions || {},
            ...payload,
          };
        });
        staffMembers = [...staffMembers, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        staffMembers = staffMembers.map((staff: any) =>
          matchFilters(staff, url) ? { ...staff, ...body } : staff
        );
        const updated = applyQueryFilters(staffMembers, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      return json(route, []);
    }

    if (path.includes('/board_posts')) {
      return json(route, fixtures.boardPosts);
    }

    if (path.includes('/notifications')) {
      if (method === 'GET') {
        return json(route, applyQueryFilters(notifications, url));
      }

      if (method === 'PATCH') {
        const targetId = url.searchParams.get('id')?.replace('eq.', '') || null;
        notifications = markNotificationsRead(notifications, targetId);
        return json(route, notifications);
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `notification-${notifications.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          read_at: payload.read_at ?? null,
          ...payload,
        }));
        notifications = [...inserted, ...notifications];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, notifications);
    }

    if (path.includes('/system_configs')) {
      return json(route, firstOrList(fixtures.systemConfigs, wantsObject));
    }

    if (path.includes('/companies')) {
      if (method === 'GET') {
        return json(route, applyQueryFilters(companies, url));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `company-${companies.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          is_active: payload.is_active ?? true,
          ...payload,
        }));
        companies = [...companies, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        companies = companies.map((company: any) =>
          matchFilters(company, url) ? { ...company, ...body } : company
        );
        const updated = applyQueryFilters(companies, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      return json(route, companies);
    }

    if (path.includes('/org_teams')) {
      if (method === 'GET') {
        return json(route, applyQueryFilters(orgTeams, url));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `org-team-${orgTeams.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        orgTeams = [...orgTeams, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        orgTeams = orgTeams.filter((team: any) => !matchFilters(team, url));
        return json(route, []);
      }

      return json(route, orgTeams);
    }

    if (path.includes('/approval_form_types')) {
      return json(route, fixtures.approvalFormTypes);
    }

    if (path.includes('/attendance_deduction_rules')) {
      if (method === 'GET') {
        const filteredRows = applyQueryFilters(attendanceDeductionRules, url);
        return json(route, firstOrList(filteredRows, wantsObject));
      }
      return json(route, attendanceDeductionRules);
    }

    if (path.includes('/tax_insurance_rates')) {
      if (method === 'GET') {
        const filteredRows = applyQueryFilters(taxInsuranceRates, url);
        return json(route, firstOrList(filteredRows, wantsObject));
      }
      return json(route, taxInsuranceRates);
    }

    if (path.includes('/chat_rooms')) {
      if (method === 'GET') {
        return json(route, applyQueryFilters(chatRooms, url));
      }
      return json(route, chatRooms);
    }

    if (path.includes('/messages')) {
      if (method === 'GET') {
        return json(route, applyQueryFilters(messages, url));
      }
      if (method === 'POST') {
        if (messageInsertFailures > 0) {
          messageInsertFailures -= 1;
          return json(route, { message: 'insert failed' }, 500);
        }
        const body = request.postDataJSON();
        const payload = Array.isArray(body) ? body[0] : body;
        const inserted = {
          id: `msg-${messages.length + 1}`,
          created_at: new Date().toISOString(),
          is_deleted: false,
          ...payload,
          staff: {
            name: fixtures.staffMembers[0]?.name || 'E2E Tester',
            photo_url: null,
          },
        };
        messages = [...messages, inserted];
        updateChatRoomMeta(inserted.room_id, inserted.content, inserted.created_at);
        return json(route, firstOrList([inserted], wantsObject));
      }
      return json(route, messages);
    }

    if (path.includes('/approvals')) {
      if (method === 'HEAD') {
        return route.fulfill({
          status: 200,
          headers: {
            'content-range': `0-0/${approvals.length}`,
          },
        });
      }

      if (method === 'GET') {
        return json(route, applyQueryFilters(approvals, url));
      }
      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `approval-${approvals.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        approvals = [...inserted, ...approvals];
        return json(route, wantsObject ? inserted[0] : inserted);
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        approvals = approvals.map((approval: any) =>
          matchFilters(approval, url) ? { ...approval, ...body } : approval
        );
        const updated = applyQueryFilters(approvals, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }
      return json(route, approvals);
    }

    if (path.includes('/work_shifts')) {
      if (method === 'GET') {
        return json(route, applyQueryFilters(workShifts, url));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `shift-${workShifts.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          is_active: payload.is_active ?? true,
          ...payload,
        }));
        workShifts = [...workShifts, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        workShifts = workShifts.map((shift: any) =>
          matchFilters(shift, url) ? { ...shift, ...body } : shift
        );
        const updated = applyQueryFilters(workShifts, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        workShifts = workShifts.filter((shift: any) => !matchFilters(shift, url));
        return json(route, []);
      }

      return json(route, workShifts);
    }

    if (path.includes('/attendance') && !path.includes('/attendances')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(attendance, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any, index: number) => {
          const existingIndex = attendance.findIndex(
            (row: any) =>
              String(row.staff_id) === String(payload.staff_id) &&
              String(row.date) === String(payload.date)
          );
          const nextRow = {
            id: payload.id || (existingIndex >= 0 ? attendance[existingIndex].id : `attendance-${attendance.length + index + 1}`),
            created_at: payload.created_at || new Date().toISOString(),
            ...payload,
          };
          if (existingIndex >= 0) {
            attendance[existingIndex] = { ...attendance[existingIndex], ...nextRow };
          } else {
            attendance = [...attendance, nextRow];
          }
          return nextRow;
        });
        return json(route, wantsObject ? upserted[0] : upserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        attendance = attendance.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(attendance, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      return json(route, attendance);
    }

    if (path.includes('/attendances')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(attendances, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any, index: number) => {
          const workDate = payload.work_date || payload.date;
          const existingIndex = attendances.findIndex(
            (row: any) =>
              String(row.staff_id) === String(payload.staff_id) &&
              String(row.work_date || row.date) === String(workDate)
          );
          const nextRow = {
            id: payload.id || (existingIndex >= 0 ? attendances[existingIndex].id : `attendances-${attendances.length + index + 1}`),
            created_at: payload.created_at || new Date().toISOString(),
            work_date: workDate,
            ...payload,
          };
          if (existingIndex >= 0) {
            attendances[existingIndex] = { ...attendances[existingIndex], ...nextRow };
          } else {
            attendances = [...attendances, nextRow];
          }
          return nextRow;
        });
        return json(route, wantsObject ? upserted[0] : upserted);
      }
      return json(route, attendances);
    }

    if (path.includes('/leave_requests')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(leaveRequests, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `leave-request-${leaveRequests.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        leaveRequests = [...inserted, ...leaveRequests];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        leaveRequests = leaveRequests.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(leaveRequests, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      return json(route, leaveRequests);
    }

    if (path.includes('/payroll_records')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(payrollRecords, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any, index: number) => {
          const existingIndex = payrollRecords.findIndex(
            (record: any) =>
              String(record.staff_id) === String(payload.staff_id) &&
              String(record.year_month) === String(payload.year_month)
          );
          const row = {
            id: payload.id || (existingIndex >= 0 ? payrollRecords[existingIndex].id : `payroll-record-${payrollRecords.length + index + 1}`),
            created_at: payload.created_at || new Date().toISOString(),
            ...payload,
          };
          if (existingIndex >= 0) {
            payrollRecords[existingIndex] = row;
          } else {
            payrollRecords = [...payrollRecords, row];
          }
          return row;
        });
        return json(route, wantsObject ? upserted[0] : upserted);
      }

      return json(route, payrollRecords);
    }

    if (path.includes('/inventory_logs')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(inventoryLogs, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `inventory-log-${inventoryLogs.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        inventoryLogs = [...inserted, ...inventoryLogs];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, inventoryLogs);
    }

    if (path.includes('/inventory')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(inventoryItems, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `inventory-item-${inventoryItems.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        inventoryItems = [...inventoryItems, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        inventoryItems = inventoryItems.map((item: any) =>
          matchFilters(item, url) ? { ...item, ...body } : item
        );
        const updated = applyQueryFilters(inventoryItems, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        inventoryItems = inventoryItems.filter((item: any) => !matchFilters(item, url));
        return json(route, []);
      }

      return json(route, inventoryItems);
    }

    if (path.includes('/generated_contracts')) {
      if (method === 'GET') {
        return json(route, generatedContracts);
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `generated-contract-${generatedContracts.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        generatedContracts = [...generatedContracts, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, generatedContracts);
    }

    if (path.includes('/insurance_records')) {
      if (method === 'GET') {
        return json(route, insuranceRecords);
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `insurance-record-${insuranceRecords.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        insuranceRecords = [...insuranceRecords, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const targetId = url.searchParams.get('id')?.replace('eq.', '') || null;
        const body = request.postDataJSON();
        insuranceRecords = insuranceRecords.map((record: any) =>
          !targetId || String(record.id) === String(targetId) ? { ...record, ...body } : record
        );
        return json(route, insuranceRecords);
      }

      return json(route, insuranceRecords);
    }

    if (
      path.includes('/push_subscriptions') ||
      path.includes('/education_records') ||
      path.includes('/message_reads') ||
      path.includes('/room_read_cursors') ||
      path.includes('/pinned_messages') ||
      path.includes('/message_reactions') ||
      path.includes('/polls') ||
      path.includes('/poll_votes') ||
      path.includes('/room_notification_settings') ||
      path.includes('/messenger_drive_links')
    ) {
      return json(route, []);
    }

    return json(route, []);
  });
}
