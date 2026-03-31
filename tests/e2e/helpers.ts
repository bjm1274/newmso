import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import { DEFAULT_INCOME_TAX_BRACKET } from '../../lib/use-tax-insurance-rates';
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

function buildMockMonthlyWithholdingTable() {
  const officialTablePath = path.join(
    process.cwd(),
    'data',
    'payroll',
    '2026_monthly_withholding_table.json'
  );
  if (fs.existsSync(officialTablePath)) {
    return JSON.parse(fs.readFileSync(officialTablePath, 'utf8')).map((entry: any) => ({
      ...entry,
      official: true,
    }));
  }

  return DEFAULT_INCOME_TAX_BRACKET.map((entry) => ({
    ...entry,
    official: true,
    monthly_tax: Math.max(
      0,
      Math.floor(
        Math.max(0, entry.min * entry.rate - (entry.deduction ?? 0)) / 12
      )
    ),
    family_monthly_tax: Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => {
        const familyCount = index + 1;
        const baselineMonthlyTax = Math.max(
          0,
          Math.floor(
            Math.max(0, entry.min * entry.rate - (entry.deduction ?? 0)) / 12
          )
        );
        const syntheticFamilyTax = Math.max(
          0,
          baselineMonthlyTax - Math.max(0, familyCount - 1) * 12500
        );
        return [String(familyCount), syntheticFamilyTax];
      })
    ),
  }));
}

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
    menu_추가기능: true,
    menu_게시판: true,
    menu_전자결재: true,
    menu_인사관리: true,
    menu_재고관리: true,
    board_공지사항_read: true,
    board_공지사항_write: true,
    board_자유게시판_read: true,
    board_자유게시판_write: true,
    board_경조사_read: true,
    board_경조사_write: true,
    board_MRI일정_read: true,
    board_MRI일정_write: true,
    board_수술일정_read: true,
    board_수술일정_write: true,
    approval_기안함: true,
    approval_결재함: true,
    approval_참조문서함: true,
    approval_작성하기: true,
    hr_직원등록: true,
    hr_구성원: true,
    hr_근태: true,
    hr_교대근무: true,
    hr_연차휴가: true,
    hr_급여: true,
    hr_계약: true,
    hr_문서보관함: true,
    hr_증명서: true,
    hr_캘린더: true,
    inventory_현황: true,
    inventory_이력: true,
    inventory_등록: true,
    inventory_발주: true,
    inventory_재고실사: true,
    inventory_이관: true,
  },
};

export type MockFixtures = {
  staffMembers?: any[];
  notifications?: any[];
  emailQueue?: any[];
  taxReports?: any[];
  chatRooms?: any[];
  messages?: any[];
  pinnedMessages?: any[];
  polls?: any[];
  pollVotes?: any[];
  messageReactions?: any[];
  messageReads?: any[];
  messageBookmarks?: any[];
  messageInsertFailures?: number;
  approvals?: any[];
  payrollRecords?: any[];
  boardPosts?: any[];
  boardPostComments?: any[];
  boardPostReads?: any[];
  boardPostLikes?: any[];
  companies?: any[];
  inventoryItems?: any[];
  inventoryLogs?: any[];
  inventoryTransfers?: any[];
  suppliers?: any[];
  inventoryCategories?: any[];
  purchaseOrders?: any[];
  asRepairRecords?: any[];
  returnRecords?: any[];
  workSchedules?: any[];
  workShifts?: any[];
  orgTeams?: any[];
  approvalFormTypes?: any[];
  systemConfigs?: any[];
  generatedContracts?: any[];
  employmentContracts?: any[];
  onboardingChecklists?: any[];
  insuranceRecords?: any[];
  documentRepository?: any[];
  certificateIssuances?: any[];
  attendance?: any[];
  attendances?: any[];
  shiftAssignments?: any[];
  handoverNotes?: any[];
  dischargeTemplates?: any[];
  dischargeReviews?: any[];
  surgeryTemplates?: any[];
  opCheckTemplates?: any[];
  opPatientChecks?: any[];
  missingSurgeryTemplatesSchema?: boolean;
  missingInventoryItemsSchema?: boolean;
  dailyClosures?: any[];
  dailyClosureItems?: any[];
  dailyChecks?: any[];
  staffEvaluations?: any[];
  attendanceCorrections?: any[];
  legacyAttendanceCorrectionsSchema?: boolean;
  legacyInventoryDepartmentSchema?: boolean;
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

function missingColumn(route: Route, columnName: string, tableName = 'attendance_corrections') {
  return json(
    route,
    {
      code: 'PGRST204',
      details: null,
      hint: null,
      message: `Could not find the '${columnName}' column of '${tableName}' in the schema cache`,
    },
    400
  );
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

    if (rawValue.startsWith('gt.')) {
      const expected = decodeURIComponent(rawValue.slice(3));
      filtered = filtered.filter((row) => String(normalizeComparableValue(row[key]) ?? '') > expected);
      continue;
    }

    if (rawValue.startsWith('lte.')) {
      const expected = decodeURIComponent(rawValue.slice(4));
      filtered = filtered.filter((row) => String(normalizeComparableValue(row[key]) ?? '') <= expected);
      continue;
    }

    if (rawValue.startsWith('lt.')) {
      const expected = decodeURIComponent(rawValue.slice(3));
      filtered = filtered.filter((row) => String(normalizeComparableValue(row[key]) ?? '') < expected);
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
    emailQueue: overrides.emailQueue ?? [],
    taxReports: overrides.taxReports ?? [],
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
    pinnedMessages: overrides.pinnedMessages ?? [],
    polls: overrides.polls ?? [],
    pollVotes: overrides.pollVotes ?? [],
    messageReactions: overrides.messageReactions ?? [],
    messageReads: overrides.messageReads ?? [],
    messageBookmarks: overrides.messageBookmarks ?? [],
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
    boardPostComments: overrides.boardPostComments ?? [],
    boardPostReads: overrides.boardPostReads ?? [],
    boardPostLikes: overrides.boardPostLikes ?? [],
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
    inventoryTransfers: overrides.inventoryTransfers ?? [],
    suppliers: overrides.suppliers ?? [],
    inventoryCategories: overrides.inventoryCategories ?? [],
    purchaseOrders: overrides.purchaseOrders ?? [],
    asRepairRecords: overrides.asRepairRecords ?? [],
    returnRecords: overrides.returnRecords ?? [],
    workSchedules: overrides.workSchedules ?? [],
    workShifts: overrides.workShifts ?? [],
    orgTeams: overrides.orgTeams ?? [],
    approvalFormTypes: overrides.approvalFormTypes ?? [],
    generatedContracts: overrides.generatedContracts ?? [],
    employmentContracts: overrides.employmentContracts ?? [],
    onboardingChecklists: overrides.onboardingChecklists ?? [],
    insuranceRecords: overrides.insuranceRecords ?? [],
    documentRepository: overrides.documentRepository ?? [],
    certificateIssuances: overrides.certificateIssuances ?? [],
    attendance: overrides.attendance ?? [],
    attendances: overrides.attendances ?? [],
    shiftAssignments: overrides.shiftAssignments ?? [],
    handoverNotes: overrides.handoverNotes ?? [],
    dischargeTemplates: overrides.dischargeTemplates ?? [],
    dischargeReviews: overrides.dischargeReviews ?? [],
    surgeryTemplates: overrides.surgeryTemplates ?? [],
    opCheckTemplates: overrides.opCheckTemplates ?? [],
    opPatientChecks: overrides.opPatientChecks ?? [],
    missingSurgeryTemplatesSchema: overrides.missingSurgeryTemplatesSchema ?? false,
    missingInventoryItemsSchema: overrides.missingInventoryItemsSchema ?? false,
    dailyClosures: overrides.dailyClosures ?? [],
    dailyClosureItems: overrides.dailyClosureItems ?? [],
    dailyChecks: overrides.dailyChecks ?? [],
    staffEvaluations: overrides.staffEvaluations ?? [],
    attendanceCorrections: overrides.attendanceCorrections ?? [],
    legacyAttendanceCorrectionsSchema: overrides.legacyAttendanceCorrectionsSchema ?? false,
    legacyInventoryDepartmentSchema: overrides.legacyInventoryDepartmentSchema ?? false,
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
          configured: true,
          income_tax_bracket: buildMockMonthlyWithholdingTable(),
        },
        {
          id: 'tax-rate-default-all',
          effective_year: Number(defaultYearMonth.slice(0, 4)),
          company_name: '전체',
          national_pension_rate: 0.045,
          health_insurance_rate: 0.0355,
          long_term_care_rate: 0.0046,
          employment_insurance_rate: 0.009,
          configured: true,
          income_tax_bracket: buildMockMonthlyWithholdingTable(),
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

function patchRowsMatchingFilters(rows: any[], url: URL, patch: Record<string, any>) {
  const matchedIndexes: number[] = [];
  const nextRows = rows.map((row: any, index: number) => {
    if (!matchFilters(row, url)) {
      return row;
    }

    matchedIndexes.push(index);
    return {
      ...row,
      ...patch,
    };
  });

  return {
    nextRows,
    updatedRows: matchedIndexes.map((index) => nextRows[index]),
  };
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
  let emailQueue = [...fixtures.emailQueue];
  let taxReports = [...fixtures.taxReports];
  let staffMembers = [...fixtures.staffMembers];
  let approvals = [...fixtures.approvals];
  let messages = [...fixtures.messages];
  let chatRooms = [...fixtures.chatRooms];
  let pinnedMessages = [...fixtures.pinnedMessages];
  let polls = [...fixtures.polls];
  let pollVotes = [...fixtures.pollVotes];
  let messageReactions = [...fixtures.messageReactions];
  let messageReads = [...fixtures.messageReads];
  let messageBookmarks = [...fixtures.messageBookmarks];
  let companies = [...fixtures.companies];
  let inventoryItems = [...fixtures.inventoryItems];
  let inventoryLogs = [...fixtures.inventoryLogs];
  let inventoryTransfers = [...fixtures.inventoryTransfers];
  let suppliers = [...fixtures.suppliers];
  let inventoryCategories = [...fixtures.inventoryCategories];
  let purchaseOrders = [...fixtures.purchaseOrders];
  let asRepairRecords = [...fixtures.asRepairRecords];
  let returnRecords = [...fixtures.returnRecords];
  let workSchedules = [...fixtures.workSchedules];
  let workShifts = [...fixtures.workShifts];
  let orgTeams = [...fixtures.orgTeams];
  let generatedContracts = [...fixtures.generatedContracts];
  let employmentContracts = [...fixtures.employmentContracts];
  let onboardingChecklists = [...fixtures.onboardingChecklists];
  let insuranceRecords = [...fixtures.insuranceRecords];
  let documentRepository = [...fixtures.documentRepository];
  let certificateIssuances = [...fixtures.certificateIssuances];
  let attendance = [...(fixtures.attendance ?? [])];
  let attendances = [...fixtures.attendances];
  let shiftAssignments = [...fixtures.shiftAssignments];
  let handoverNotes = [...fixtures.handoverNotes];
  let dischargeTemplates = [...fixtures.dischargeTemplates];
  let dischargeReviews = [...fixtures.dischargeReviews];
  const surgeryTemplates = [...fixtures.surgeryTemplates];
  let opCheckTemplates = [...fixtures.opCheckTemplates];
  let opPatientChecks = [...fixtures.opPatientChecks];
  const missingSurgeryTemplatesSchema = fixtures.missingSurgeryTemplatesSchema;
  const missingInventoryItemsSchema = fixtures.missingInventoryItemsSchema;
  let dailyClosures = [...fixtures.dailyClosures];
  let dailyClosureItems = [...fixtures.dailyClosureItems];
  let dailyChecks = [...fixtures.dailyChecks];
  let staffEvaluations = [...fixtures.staffEvaluations];
  let attendanceCorrections = [...fixtures.attendanceCorrections];
  let leaveRequests = [...(fixtures.leaveRequests ?? [])];
  const attendanceDeductionRules = [...fixtures.attendanceDeductionRules];
  const taxInsuranceRates = [...fixtures.taxInsuranceRates];
  const legacyAttendanceCorrectionsSchema = fixtures.legacyAttendanceCorrectionsSchema;
  const legacyInventoryDepartmentSchema = fixtures.legacyInventoryDepartmentSchema;
  let messageInsertFailures = fixtures.messageInsertFailures;
  let payrollRecords = [...fixtures.payrollRecords];
  let boardPosts = [...fixtures.boardPosts];
  let boardPostComments = [...fixtures.boardPostComments];
  let boardPostReads = [...fixtures.boardPostReads];
  let boardPostLikes = [...fixtures.boardPostLikes];

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

  const dispatchMockNotificationInsert = async (rows: any[]) => {
    if (!rows.length) return;
    try {
      await page.evaluate((insertedRows) => {
        window.dispatchEvent(
          new CustomEvent('erp-mock-notification-insert', {
            detail: { rows: insertedRows },
          })
        );
      }, rows);
    } catch {
      // ignore mock realtime dispatch failures in tests
    }
  };

  const appendNotifications = async (rows: any[]) => {
    if (!rows.length) return;
    notifications = [...rows, ...notifications];
    await dispatchMockNotificationInsert(rows);
  };

  const approvalStatus = {
    pending: '\uB300\uAE30',
    approved: '\uC2B9\uC778',
    rejected: '\uBC18\uB824',
  } as const;

  const attendanceStatus = {
    normal: '\uC815\uC0C1',
    annualLeaveLegacy: '\uC5F0\uCC28\uD734\uAC00',
    annualLeaveModern: 'annual_leave',
    correctionApproved: '\uC2B9\uC778',
    correctionNormalType: '\uC815\uC0C1\uBC18\uC601',
  } as const;

  const parseApproverLine = (approval: any) => {
    const directLine = Array.isArray(approval?.approver_line) ? approval.approver_line : null;
    if (directLine && directLine.length > 0) {
      return directLine.map((value: unknown) => String(value));
    }

    const metaLine = approval?.meta_data?.approver_line;
    if (Array.isArray(metaLine)) {
      return metaLine.map((value: unknown) => String(value));
    }

    return approval?.current_approver_id ? [String(approval.current_approver_id)] : [];
  };

  const upsertLeaveRequestRow = (row: Record<string, unknown>) => {
    const existingIndex = leaveRequests.findIndex(
      (item: any) =>
        String(item.staff_id || '') === String(row.staff_id || '') &&
        String(item.start_date || '') === String(row.start_date || '') &&
        String(item.end_date || '') === String(row.end_date || '')
    );
    if (existingIndex >= 0) {
      leaveRequests[existingIndex] = { ...leaveRequests[existingIndex], ...row };
      return leaveRequests[existingIndex];
    }

    const inserted = {
      id: row.id || `leave-request-${leaveRequests.length + 1}`,
      created_at: row.created_at || new Date().toISOString(),
      ...row,
    };
    leaveRequests = [inserted, ...leaveRequests];
    return inserted;
  };

  const upsertAttendanceRow = (row: Record<string, unknown>) => {
    const existingIndex = attendance.findIndex(
      (item: any) =>
        String(item.staff_id || '') === String(row.staff_id || '') &&
        String(item.date || '') === String(row.date || '')
    );
    if (existingIndex >= 0) {
      attendance[existingIndex] = { ...attendance[existingIndex], ...row };
      return attendance[existingIndex];
    }

    const inserted = {
      id: row.id || `attendance-${attendance.length + 1}`,
      created_at: row.created_at || new Date().toISOString(),
      ...row,
    };
    attendance = [inserted, ...attendance];
    return inserted;
  };

  const upsertAttendancesRow = (row: Record<string, unknown>) => {
    const existingIndex = attendances.findIndex(
      (item: any) =>
        String(item.staff_id || '') === String(row.staff_id || '') &&
        String(item.work_date || '') === String(row.work_date || '')
    );
    if (existingIndex >= 0) {
      attendances[existingIndex] = { ...attendances[existingIndex], ...row };
      return attendances[existingIndex];
    }

    const inserted = {
      id: row.id || `attendances-${attendances.length + 1}`,
      created_at: row.created_at || new Date().toISOString(),
      ...row,
    };
    attendances = [inserted, ...attendances];
    return inserted;
  };

  const upsertAttendanceCorrectionRow = (row: Record<string, unknown>) => {
    const existingIndex = attendanceCorrections.findIndex(
      (item: any) =>
        String(item.staff_id || '') === String(row.staff_id || '') &&
        String(item.original_date || item.attendance_date || '') ===
          String(row.original_date || row.attendance_date || '')
    );
    if (existingIndex >= 0) {
      attendanceCorrections[existingIndex] = { ...attendanceCorrections[existingIndex], ...row };
      return attendanceCorrections[existingIndex];
    }

    const inserted = {
      id: row.id || `attendance-correction-${attendanceCorrections.length + 1}`,
      created_at: row.created_at || new Date().toISOString(),
      status: approvalStatus.pending,
      ...row,
    };
    attendanceCorrections = [inserted, ...attendanceCorrections];
    return inserted;
  };

  const applyAnnualLeaveApprovalEffects = (approval: any) => {
    const metaData = approval?.meta_data ?? {};
    const staffId = String(approval?.sender_id || '');
    const startDate = String(metaData.startDate || metaData.start || '');
    const endDate = String(metaData.endDate || metaData.end || startDate);
    const leaveType = String(metaData.leaveType || '\uC5F0\uCC28');

    if (!staffId || !startDate) return;

    upsertLeaveRequestRow({
      staff_id: staffId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason: String(metaData.reason || approval?.title || ''),
      status: approvalStatus.approved,
      approval_id: approval.id,
      delegate_id: String(metaData.delegateId || '').trim() || null,
      delegate_name: String(metaData.delegateName || '').trim() || null,
      delegate_department: String(metaData.delegateDepartment || '').trim() || null,
      delegate_position: String(metaData.delegatePosition || '').trim() || null,
    });

    const start = new Date(startDate);
    const end = new Date(endDate || startDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

    for (let index = 0; index < days; index += 1) {
      const cursor = new Date(start);
      cursor.setDate(cursor.getDate() + index);
      const date = cursor.toISOString().slice(0, 10);
      upsertAttendanceRow({
        staff_id: staffId,
        date,
        status: attendanceStatus.annualLeaveLegacy,
      });
      upsertAttendancesRow({
        staff_id: staffId,
        work_date: date,
        status: attendanceStatus.annualLeaveModern,
        check_in_time: null,
        check_out_time: null,
        work_hours_minutes: 0,
      });
    }
  };

  const applyAttendanceCorrectionApprovalEffects = (approval: any) => {
    const metaData = approval?.meta_data ?? {};
    const staffId = String(approval?.sender_id || '');
    const correctionDates = Array.isArray(metaData.correction_dates)
      ? metaData.correction_dates.map((value: unknown) => String(value))
      : [];

    if (!staffId || correctionDates.length === 0) return;

    for (const date of correctionDates) {
      upsertAttendanceCorrectionRow({
        staff_id: staffId,
        original_date: date,
        attendance_date: date,
        correction_type: String(metaData.correction_type || attendanceStatus.correctionNormalType),
        reason: String(metaData.correction_reason || approval?.content || ''),
        status: approvalStatus.approved,
        approval_status: approvalStatus.approved,
        approval_id: approval.id,
      });
      upsertAttendanceRow({
        staff_id: staffId,
        date,
        status: attendanceStatus.normal,
      });
      upsertAttendancesRow({
        staff_id: staffId,
        work_date: date,
        status: 'present',
      });
    }
  };

  const applySupplyApprovalEffects = async (approval: any) => {
    const metaData = approval?.meta_data ?? {};
    const requestedItems = Array.isArray(metaData.items) ? metaData.items : [];
    if (requestedItems.length === 0) {
      return null;
    }

    const workflowItems = requestedItems.map((item: any) => {
      const qty = Number(item?.qty ?? item?.quantity ?? 0) || 0;
      const sourceInventory = inventoryItems.find(
        (inventoryItem: any) =>
          String(inventoryItem.item_name || '') === String(item?.name || '') &&
          String(inventoryItem.company || '') === 'SY INC.'
      ) || inventoryItems.find((inventoryItem: any) => String(inventoryItem.item_name || '') === String(item?.name || ''));

      const availableQty = Number(sourceInventory?.quantity ?? sourceInventory?.stock ?? 0) || 0;
      const shortageQty = Math.max(0, qty - availableQty);
      const recommendedAction = shortageQty > 0 ? 'order' : 'issue';
      const status = shortageQty > 0 ? 'order_required' : 'issue_ready';

      return {
        name: String(item?.name || ''),
        qty,
        dept: String(item?.dept || item?.department || ''),
        purpose: String(item?.purpose || ''),
        recommended_action: recommendedAction,
        status,
        available_qty: availableQty,
        shortage_qty: shortageQty,
        source_inventory_id: sourceInventory?.id || null,
      };
    });

    const summary = {
      total_count: workflowItems.length,
      issue_ready_count: workflowItems.filter((item: any) => item.status === 'issue_ready').length,
      order_required_count: workflowItems.filter((item: any) => item.status === 'order_required').length,
      issued_count: workflowItems.filter((item: any) => item.status === 'issued').length,
      ordered_count: workflowItems.filter((item: any) => item.status === 'ordered').length,
    };

    const primarySource = workflowItems.find((item: any) => item.source_inventory_id);
    const sourceInventory = inventoryItems.find((item: any) => item.id === primarySource?.source_inventory_id);
    const sourceCompany = String(sourceInventory?.company || 'SY INC.');
    const sourceDepartment = String(sourceInventory?.department || '\uACBD\uC601\uC9C0\uC6D0\uD300');
    const workflow = {
      status: 'pending',
      source_company: sourceCompany,
      source_department: sourceDepartment,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: workflowItems,
      summary,
    };

    approvals = approvals.map((row: any) =>
      String(row.id) === String(approval.id)
        ? {
            ...row,
            meta_data: {
              ...(row.meta_data || {}),
              inventory_workflow: workflow,
            },
          }
        : row
    );

    const managerNotifications = staffMembers
      .filter(
        (staff: any) =>
          String(staff.company || '') === sourceCompany &&
          String(staff.department || '') === sourceDepartment
      )
      .map((staff: any, index: number) => ({
        id: `notification-inventory-${approval.id}-${index + 1}`,
        user_id: staff.id,
        type: 'inventory',
        title: `[\uBB3C\uD488\uC694\uCCAD \uC2B9\uC778] ${String(approval.title || '\uC804\uC790\uACB0\uC7AC \uBB38\uC11C')}`,
        body: `${String(approval.sender_name || '\uC694\uCCAD\uC790')} \uC694\uCCAD\uC774 \uC2B9\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uCD9C\uACE0 \uAC00\uB2A5 ${summary.issue_ready_count}\uAC74 / \uBC1C\uC8FC \uD544\uC694 ${summary.order_required_count}\uAC74\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.`,
        created_at: new Date().toISOString(),
        read_at: null,
        metadata: {
          approval_id: approval.id,
          workflow_type: 'supply_request_fulfillment',
          source_company: sourceCompany,
          source_department: sourceDepartment,
          summary,
        },
      }));

    const requesterNotification = approval?.sender_id
      ? [
          {
            id: `notification-approval-${approval.id}`,
            user_id: approval.sender_id,
            type: 'approval',
            title: '\uBB3C\uD488\uC694\uCCAD\uC774 \uC2B9\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
            body: '\uACBD\uC601\uC9C0\uC6D0\uD300\uC5D0\uC11C \uC7AC\uACE0\uB97C \uD655\uC778\uD558\uC5EC \uBD88\uCD9C \uB610\uB294 \uBC1C\uC8FC\uB97C \uC9C4\uD589\uD569\uB2C8\uB2E4.',
            created_at: new Date().toISOString(),
            read_at: null,
            metadata: {
              approval_id: approval.id,
              workflow_type: 'supply_request_fulfillment',
              summary,
            },
          },
        ]
      : [];

    await appendNotifications([...managerNotifications, ...requesterNotification]);
    return summary;
  };

  const processFinalApprovalEffects = async (approval: any) => {
    const approvalType = String(approval?.type || '').trim();
    const formSlug = String(approval?.meta_data?.form_slug || '').trim();
    const warnings: string[] = [];
    let supplySummary: Record<string, unknown> | null = null;

    if (approvalType === '\uC5F0\uCC28/\uD734\uAC00' || formSlug === 'leave_request') {
      applyAnnualLeaveApprovalEffects(approval);
    }

    if (approvalType === '\uCD9C\uACB0\uC815\uC815' || formSlug === 'attendance_fix') {
      applyAttendanceCorrectionApprovalEffects(approval);
    }

    if (
      (approvalType === '\uBB3C\uD488\uC694\uCCAD' ||
        approvalType === '\uBB3C\uD488\uC2E0\uCCAD' ||
        formSlug === 'supplies') &&
      Array.isArray(approval?.meta_data?.items)
    ) {
      supplySummary = await applySupplyApprovalEffects(approval);
    }

    approvals = approvals.map((row: any) =>
      String(row.id) === String(approval.id)
        ? {
            ...row,
            meta_data: {
              ...(row.meta_data || {}),
              server_processing: {
                status: 'completed',
                processed_at: new Date().toISOString(),
                started_by: approval?.current_approver_id || null,
                errors: warnings,
              },
            },
          }
        : row
    );

    return {
      alreadyProcessed: false,
      warnings,
      supplySummary,
    };
  };

  await page.route('**/api/chat/upload', async (route) => {
    const body = route.request().postDataJSON?.() as
      | { fileName?: string; mimeType?: string; fileSize?: number }
      | undefined;
    const normalizedFileName = String(body?.fileName || '').trim();
    const mimeType = String(body?.mimeType || '').trim().toLowerCase();
    const extensionFromName = normalizedFileName.includes('.')
      ? normalizedFileName.split('.').pop()?.trim().toLowerCase()
      : '';
    const extensionFromMime = mimeType.startsWith('image/')
      ? mimeType.replace('image/', '') || 'png'
      : mimeType.startsWith('video/')
        ? mimeType.replace('video/', '') || 'mp4'
        : mimeType === 'application/pdf'
          ? 'pdf'
          : '';
    const extension = extensionFromName || extensionFromMime || 'bin';
    const path = `chat/mock-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        bucket: 'pchos-files',
        path,
        token: 'mock-upload-token',
        url: `http://127.0.0.1:3000/storage/v1/object/public/pchos-files/${path}`,
      }),
    });
  });

  await page.route('**/storage/v1/object/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: 'mock-upload-key' }),
    });
  });

  await page.route('**/api/approvals/process-final', async (route) => {
    const body = route.request().postDataJSON() as { approvalId?: string } | null;
    const approval = approvals.find((row: any) => String(row.id) === String(body?.approvalId || ''));
    if (!approval) {
      return json(route, { ok: false, error: 'Approval not found' }, 404);
    }

    const result = await processFinalApprovalEffects(approval);
    return json(route, {
      ok: true,
      alreadyProcessed: result.alreadyProcessed,
      warnings: result.warnings,
      supplySummary: result.supplySummary,
    });
  });

  await page.route('**/api/approvals/transition', async (route) => {
    const body = route.request().postDataJSON() as {
      action?: 'approve' | 'reject';
      approvalIds?: string[];
      reason?: string | null;
    } | null;
    const action = body?.action;
    const approvalIds = Array.isArray(body?.approvalIds) ? body!.approvalIds : [];
    const reason = body?.reason ?? null;
    const results: Array<Record<string, unknown>> = [];
    let finalApprovalCount = 0;
    let warningCount = 0;

    for (const approvalId of approvalIds) {
      const approval = approvals.find((row: any) => String(row.id) === String(approvalId));
      if (!approval) {
        results.push({
          approvalId,
          ok: false,
          status: 'error',
          finalApproval: false,
          error: 'Approval not found',
        });
        continue;
      }

      const approverLine = parseApproverLine(approval);
      const currentApproverId = approval?.current_approver_id ? String(approval.current_approver_id) : null;
      const currentIndex = currentApproverId ? approverLine.indexOf(currentApproverId) : -1;
      const nextApproverId =
        currentIndex >= 0 && currentIndex < approverLine.length - 1 ? approverLine[currentIndex + 1] : null;

      if (action === 'reject') {
        const nextMetaData = {
          ...(approval.meta_data || {}),
          reject_reason: reason || '\uBC18\uB824',
        };
        approvals = approvals.map((row: any) =>
          String(row.id) === String(approvalId)
            ? {
                ...row,
                status: approvalStatus.rejected,
                meta_data: nextMetaData,
              }
            : row
        );
        results.push({
          approvalId,
          ok: true,
          status: approvalStatus.rejected,
          finalApproval: false,
          nextApproverId: null,
          warnings: [],
        });
        continue;
      }

      if (nextApproverId) {
        approvals = approvals.map((row: any) =>
          String(row.id) === String(approvalId)
            ? {
                ...row,
                status: approvalStatus.pending,
                current_approver_id: nextApproverId,
              }
            : row
        );
        results.push({
          approvalId,
          ok: true,
          status: approvalStatus.pending,
          finalApproval: false,
          nextApproverId,
          warnings: [],
        });
        continue;
      }

      approvals = approvals.map((row: any) =>
        String(row.id) === String(approvalId)
          ? {
              ...row,
              status: approvalStatus.approved,
              current_approver_id: null,
            }
          : row
      );
      const updatedApproval = approvals.find((row: any) => String(row.id) === String(approvalId));
      const finalResult = await processFinalApprovalEffects(updatedApproval);
      finalApprovalCount += 1;
      warningCount += finalResult.warnings.length;
      results.push({
        approvalId,
        ok: true,
        status: approvalStatus.approved,
        finalApproval: true,
        nextApproverId: null,
        warnings: finalResult.warnings,
        supplySummary: finalResult.supplySummary,
      });
    }

    const successCount = results.filter((result) => result.ok).length;
    const failCount = results.length - successCount;

    return json(route, {
      ok: true,
      action,
      summary: {
        total: results.length,
        successCount,
        failCount,
        finalApprovalCount,
        warningCount,
      },
      results,
    });
  });

  await page.route('**/api/notifications/chat-push', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

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
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(boardPosts, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `board-post-${boardPosts.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          views: payload.views ?? 0,
          likes_count: payload.likes_count ?? 0,
          attachments: payload.attachments ?? [],
          tags: payload.tags ?? [],
          ...payload,
        }));
        boardPosts = [...inserted, ...boardPosts];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        boardPosts = boardPosts.map((post: any) =>
          matchFilters(post, url) ? { ...post, ...body } : post
        );
        const updated = applyQueryFilters(boardPosts, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(boardPosts, url);
        const deleteIds = new Set(deleting.map((post: any) => String(post.id)));
        boardPosts = boardPosts.filter((post: any) => !deleteIds.has(String(post.id)));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, boardPosts);
    }

    if (path.includes('/board_post_comments')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(boardPostComments, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `board-comment-${boardPostComments.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        boardPostComments = [...boardPostComments, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(boardPostComments, url);
        const deleteIds = new Set(deleting.map((comment: any) => String(comment.id)));
        boardPostComments = boardPostComments.filter(
          (comment: any) => !deleteIds.has(String(comment.id))
        );
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, boardPostComments);
    }

    if (path.includes('/board_post_reads')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(boardPostReads, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any) => {
          const existing = boardPostReads.find(
            (row: any) =>
              String(row.post_id) === String(payload.post_id) &&
              String(row.user_id) === String(payload.user_id)
          );

          if (existing) {
            return { ...existing, ...payload };
          }

          return {
            id: payload.id || `board-post-read-${boardPostReads.length + 1}`,
            created_at: payload.created_at || new Date().toISOString(),
            ...payload,
          };
        });

        boardPostReads = [
          ...boardPostReads.filter(
            (row: any) =>
              !upserted.some(
                (candidate: any) =>
                  String(candidate.post_id) === String(row.post_id) &&
                  String(candidate.user_id) === String(row.user_id)
              )
          ),
          ...upserted,
        ];

        return json(route, wantsObject ? upserted[0] : upserted);
      }

      return json(route, boardPostReads);
    }

    if (path.includes('/board_post_likes')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(boardPostLikes, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any) => ({
          id: payload.id || `board-post-like-${boardPostLikes.length + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));

        boardPostLikes = [
          ...boardPostLikes.filter(
            (row: any) =>
              !inserted.some(
                (candidate: any) =>
                  String(candidate.post_id) === String(row.post_id) &&
                  String(candidate.user_id) === String(row.user_id)
              )
          ),
          ...inserted,
        ];

        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(boardPostLikes, url);
        const deleteKeys = new Set(
          deleting.map((row: any) => `${String(row.post_id)}::${String(row.user_id)}`)
        );
        boardPostLikes = boardPostLikes.filter(
          (row: any) => !deleteKeys.has(`${String(row.post_id)}::${String(row.user_id)}`)
        );
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, boardPostLikes);
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
        try {
          await page.evaluate((rows) => {
            window.dispatchEvent(
              new CustomEvent('erp-mock-notification-insert', {
                detail: { rows },
              })
            );
          }, inserted);
        } catch {
          // ignore mock realtime dispatch failures in tests
        }
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, notifications);
    }

    if (path.includes('/email_queue')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(emailQueue, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `email-queue-${emailQueue.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        emailQueue = [...inserted, ...emailQueue];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, emailQueue);
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
      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `chat-room-${chatRooms.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          last_message_at: payload.last_message_at || payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        chatRooms = [...chatRooms, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        chatRooms = chatRooms.map((room: any) =>
          matchFilters(room, url) ? { ...room, ...body } : room
        );
        const updated = applyQueryFilters(chatRooms, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }
      return json(route, chatRooms);
    }

    if (path.includes('/messages')) {
      if (method === 'GET') {
        return json(route, applyQueryFilters(messages, url));
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        messages = messages.map((message: any) =>
          matchFilters(message, url) ? { ...message, ...body } : message
        );
        const updated = applyQueryFilters(messages, url);
        return json(route, firstOrList(updated, wantsObject));
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
        try {
          await page.evaluate((row) => {
            window.dispatchEvent(
              new CustomEvent('erp-mock-chat-message-insert', {
                detail: { row },
              })
            );
          }, inserted);
        } catch {
          // ignore mock realtime dispatch failures in tests
        }
        return json(route, firstOrList([inserted], wantsObject));
      }
      return json(route, messages);
    }

    if (path.includes('/pinned_messages')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(pinnedMessages, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `pinned-message-${pinnedMessages.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        pinnedMessages = [...pinnedMessages, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(pinnedMessages, url);
        const deleteIds = new Set(deleting.map((row: any) => String(row.id)));
        pinnedMessages = pinnedMessages.filter((row: any) => !deleteIds.has(String(row.id)));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, pinnedMessages);
    }

    if (path.includes('/message_reactions')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(messageReactions, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `message-reaction-${messageReactions.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        messageReactions = [...messageReactions, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(messageReactions, url);
        const deleteIds = new Set(deleting.map((row: any) => String(row.id)));
        messageReactions = messageReactions.filter(
          (row: any) => !deleteIds.has(String(row.id))
        );
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, messageReactions);
    }

    if (path.includes('/message_reads')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(messageReads, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any) => {
          const existing = messageReads.find(
            (row: any) =>
              String(row.message_id) === String(payload.message_id) &&
              String(row.user_id) === String(payload.user_id)
          );

          if (existing) {
            return { ...existing, ...payload };
          }

          return {
            id: payload.id || `message-read-${messageReads.length + 1}`,
            created_at: payload.created_at || new Date().toISOString(),
            ...payload,
          };
        });

        messageReads = [
          ...messageReads.filter(
            (row: any) =>
              !upserted.some(
                (candidate: any) =>
                  String(candidate.message_id) === String(row.message_id) &&
                  String(candidate.user_id) === String(row.user_id)
              )
          ),
          ...upserted,
        ];

        return json(route, wantsObject ? upserted[0] : upserted);
      }

      return json(route, messageReads);
    }

    if (path.includes('/message_bookmarks')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(messageBookmarks, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `message-bookmark-${messageBookmarks.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        messageBookmarks = [...messageBookmarks, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(messageBookmarks, url);
        const deleteIds = new Set(deleting.map((row: any) => String(row.id)));
        messageBookmarks = messageBookmarks.filter(
          (row: any) => !deleteIds.has(String(row.id))
        );
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, messageBookmarks);
    }

    if (path.includes('/polls')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(polls, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `poll-${polls.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        polls = [...polls, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, polls);
    }

    if (path.includes('/poll_votes')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(pollVotes, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any) => {
          const existing = pollVotes.find(
            (row: any) =>
              String(row.poll_id) === String(payload.poll_id) &&
              String(row.user_id) === String(payload.user_id)
          );

          if (existing) {
            return { ...existing, ...payload };
          }

          return {
            id: payload.id || `poll-vote-${pollVotes.length + 1}`,
            created_at: payload.created_at || new Date().toISOString(),
            ...payload,
          };
        });

        pollVotes = [
          ...pollVotes.filter(
            (row: any) =>
              !upserted.some(
                (candidate: any) =>
                  String(candidate.poll_id) === String(row.poll_id) &&
                  String(candidate.user_id) === String(row.user_id)
              )
          ),
          ...upserted,
        ];

        return json(route, wantsObject ? upserted[0] : upserted);
      }

      return json(route, pollVotes);
    }

    if (path.includes('/approvals')) {
      if (method === 'HEAD') {
        const count = applyQueryFilters(approvals, url).length;
        return route.fulfill({
          status: 200,
          headers: {
            'content-range': `0-0/${count}`,
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

    if (path.includes('/attendance_corrections')) {
      if (legacyAttendanceCorrectionsSchema) {
        const select = url.searchParams.get('select') || '';
        const order = url.searchParams.get('order') || '';

        if (select.includes('attendance_date')) {
          return missingColumn(route, 'attendance_date');
        }

        if (order.startsWith('requested_at')) {
          return missingColumn(route, 'requested_at');
        }
      }

      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(attendanceCorrections, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];

        if (legacyAttendanceCorrectionsSchema) {
          const missingColumnName = ['attendance_date', 'requested_at', 'approval_status'].find((column) =>
            payloads.some((payload: any) => Object.prototype.hasOwnProperty.call(payload, column))
          );

          if (missingColumnName) {
            return missingColumn(route, missingColumnName);
          }
        }

        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `attendance-correction-${attendanceCorrections.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          status: payload.status ?? '대기',
          ...payload,
        }));
        attendanceCorrections = [...inserted, ...attendanceCorrections];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();

        if (legacyAttendanceCorrectionsSchema) {
          const missingColumnName = ['approval_status', 'approved_by', 'approved_at'].find((column) =>
            Object.prototype.hasOwnProperty.call(body, column)
          );

          if (missingColumnName) {
            return missingColumn(route, missingColumnName);
          }
        }

        attendanceCorrections = attendanceCorrections.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(attendanceCorrections, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      return json(route, attendanceCorrections);
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

    if (path.includes('/shift_assignments')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(shiftAssignments, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `shift-assignment-${shiftAssignments.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        shiftAssignments = [...shiftAssignments, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        shiftAssignments = shiftAssignments.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(shiftAssignments, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      return json(route, shiftAssignments);
    }

    if (path.includes('/handover_notes')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(handoverNotes, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `handover-note-${handoverNotes.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          is_completed: payload.is_completed ?? false,
          ...payload,
        }));
        handoverNotes = [...inserted, ...handoverNotes];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        handoverNotes = handoverNotes.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(handoverNotes, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(handoverNotes, url);
        const deletingIds = new Set(deleting.map((row: any) => String(row.id)));
        handoverNotes = handoverNotes.filter((row: any) => !deletingIds.has(String(row.id)));
        return json(route, wantsObject ? null : []);
      }

      return json(route, handoverNotes);
    }

    if (path.includes('/discharge_templates')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(dischargeTemplates, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any, index: number) => {
          const existingIndex = dischargeTemplates.findIndex(
            (row: any) => String(row.id) === String(payload.id)
          );
          const nextRow = {
            id:
              payload.id ||
              (existingIndex >= 0
                ? dischargeTemplates[existingIndex].id
                : `discharge-template-${dischargeTemplates.length + index + 1}`),
            created_at: payload.created_at || new Date().toISOString(),
            ...payload,
          };
          if (existingIndex >= 0) {
            dischargeTemplates[existingIndex] = { ...dischargeTemplates[existingIndex], ...nextRow };
            return dischargeTemplates[existingIndex];
          }
          dischargeTemplates = [...dischargeTemplates, nextRow];
          return nextRow;
        });
        return json(route, wantsObject ? upserted[0] : upserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(dischargeTemplates, url);
        const deleteIds = new Set(deleting.map((row: any) => String(row.id)));
        dischargeTemplates = dischargeTemplates.filter((row: any) => !deleteIds.has(String(row.id)));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, dischargeTemplates);
    }

    if (path.includes('/discharge_reviews')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(dischargeReviews, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `discharge-review-${dischargeReviews.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          items: payload.items ?? [],
          status: payload.status ?? 'pending',
          ...payload,
        }));
        dischargeReviews = [...inserted, ...dischargeReviews];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        dischargeReviews = dischargeReviews.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(dischargeReviews, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(dischargeReviews, url);
        const deleteIds = new Set(deleting.map((row: any) => String(row.id)));
        dischargeReviews = dischargeReviews.filter((row: any) => !deleteIds.has(String(row.id)));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, dischargeReviews);
    }

    if (path.includes('/surgery_templates')) {
      if (method === 'GET' && missingSurgeryTemplatesSchema) {
        return json(
          route,
          {
            code: 'PGRST205',
            details: null,
            hint: null,
            message: "Could not find the table 'public.surgery_templates' in the schema cache",
          },
          400
        );
      }

      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(surgeryTemplates, url), wantsObject));
      }

      return json(route, surgeryTemplates);
    }

    if (path.includes('/op_check_templates')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(opCheckTemplates, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `op-check-template-${opCheckTemplates.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          updated_at: payload.updated_at || new Date().toISOString(),
          prep_items: payload.prep_items ?? [],
          consumable_items: payload.consumable_items ?? [],
          is_active: payload.is_active ?? true,
          ...payload,
        }));
        opCheckTemplates = [...opCheckTemplates, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        opCheckTemplates = opCheckTemplates.map((row: any) =>
          matchFilters(row, url)
            ? { ...row, ...body, updated_at: body.updated_at || new Date().toISOString() }
            : row
        );
        const updated = applyQueryFilters(opCheckTemplates, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(opCheckTemplates, url);
        const deleteIds = new Set(deleting.map((row: any) => String(row.id)));
        opCheckTemplates = opCheckTemplates.filter((row: any) => !deleteIds.has(String(row.id)));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, opCheckTemplates);
    }

    if (path.includes('/op_patient_checks')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(opPatientChecks, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any, index: number) => {
          const existingIndex = opPatientChecks.findIndex(
            (row: any) =>
              String(row.schedule_post_id || '') === String(payload.schedule_post_id || '') ||
              (payload.id && String(row.id || '') === String(payload.id))
          );
          const nextRow = {
            id:
              payload.id ||
              (existingIndex >= 0
                ? opPatientChecks[existingIndex].id
                : `op-patient-check-${opPatientChecks.length + index + 1}`),
            created_at:
              payload.created_at ||
              (existingIndex >= 0 ? opPatientChecks[existingIndex].created_at : new Date().toISOString()),
            updated_at: payload.updated_at || new Date().toISOString(),
            prep_items: payload.prep_items ?? [],
            consumable_items: payload.consumable_items ?? [],
            applied_template_ids: payload.applied_template_ids ?? [],
            ...payload,
          };

          if (existingIndex >= 0) {
            opPatientChecks[existingIndex] = { ...opPatientChecks[existingIndex], ...nextRow };
            return opPatientChecks[existingIndex];
          }

          opPatientChecks = [nextRow, ...opPatientChecks];
          return nextRow;
        });
        return json(route, wantsObject ? upserted[0] : upserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        opPatientChecks = opPatientChecks.map((row: any) =>
          matchFilters(row, url)
            ? { ...row, ...body, updated_at: body.updated_at || new Date().toISOString() }
            : row
        );
        const updated = applyQueryFilters(opPatientChecks, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(opPatientChecks, url);
        const deleteIds = new Set(deleting.map((row: any) => String(row.id)));
        opPatientChecks = opPatientChecks.filter((row: any) => !deleteIds.has(String(row.id)));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, opPatientChecks);
    }

    if (path.includes('/daily_closures')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(dailyClosures, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any, index: number) => {
          const existingIndex = dailyClosures.findIndex(
            (row: any) =>
              String(row.company_id) === String(payload.company_id) &&
              String(row.date) === String(payload.date)
          );
          const nextRow = {
            id:
              payload.id ||
              (existingIndex >= 0
                ? dailyClosures[existingIndex].id
                : `daily-closure-${dailyClosures.length + index + 1}`),
            created_at: payload.created_at || new Date().toISOString(),
            ...payload,
          };
          if (existingIndex >= 0) {
            dailyClosures[existingIndex] = { ...dailyClosures[existingIndex], ...nextRow };
            return dailyClosures[existingIndex];
          }
          dailyClosures = [nextRow, ...dailyClosures];
          return nextRow;
        });
        return json(route, wantsObject ? upserted[0] : upserted);
      }

      return json(route, dailyClosures);
    }

    if (path.includes('/daily_closure_items')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(dailyClosureItems, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `daily-closure-item-${dailyClosureItems.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        dailyClosureItems = [...dailyClosureItems, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(dailyClosureItems, url);
        dailyClosureItems = dailyClosureItems.filter((row: any) => !matchFilters(row, url));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, dailyClosureItems);
    }

    if (path.includes('/daily_checks')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(dailyChecks, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `daily-check-${dailyChecks.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        dailyChecks = [...dailyChecks, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(dailyChecks, url);
        dailyChecks = dailyChecks.filter((row: any) => !matchFilters(row, url));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, dailyChecks);
    }

    if (path.includes('/staff_evaluations')) {
      if (method === 'GET') {
        const rows = applyQueryFilters(staffEvaluations, url).map((row: any) => {
          const evaluator = staffMembers.find(
            (staff: any) => String(staff.id) === String(row.evaluator_id)
          );
          return {
            ...row,
            evaluator: evaluator
              ? {
                  name: evaluator.name,
                  position: evaluator.position,
                }
              : null,
          };
        });
        return json(route, firstOrList(rows, wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `staff-evaluation-${staffEvaluations.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        staffEvaluations = [...inserted, ...staffEvaluations];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'DELETE') {
        const deleting = applyQueryFilters(staffEvaluations, url);
        const deleteIds = new Set(deleting.map((row: any) => String(row.id)));
        staffEvaluations = staffEvaluations.filter((row: any) => !deleteIds.has(String(row.id)));
        return json(route, wantsObject ? deleting[0] ?? null : deleting);
      }

      return json(route, staffEvaluations);
    }

    if (path.includes('/work_schedules')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(workSchedules, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `work-schedule-${workSchedules.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        workSchedules = [...workSchedules, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        workSchedules = workSchedules.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(workSchedules, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        workSchedules = workSchedules.filter((row: any) => !matchFilters(row, url));
        return json(route, []);
      }

      return json(route, workSchedules);
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
        const { nextRows, updatedRows } = patchRowsMatchingFilters(attendance, url, body);
        attendance = nextRows;
        const updated = updatedRows;
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
      if (method === 'HEAD') {
        const count = applyQueryFilters(payrollRecords, url).length;
        return route.fulfill({
          status: 200,
          headers: {
            'content-range': `0-0/${count}`,
          },
        });
      }

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

    if (path.includes('/tax_reports')) {
      if (method === 'HEAD') {
        const count = applyQueryFilters(taxReports, url).length;
        return route.fulfill({
          status: 200,
          headers: {
            'content-range': `0-0/${count}`,
          },
        });
      }

      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(taxReports, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `tax-report-${taxReports.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        taxReports = [...inserted, ...taxReports];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, taxReports);
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

    if (path.includes('/inventory_transfers')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(inventoryTransfers, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `inventory-transfer-${inventoryTransfers.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        inventoryTransfers = [...inserted, ...inventoryTransfers];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, inventoryTransfers);
    }

    if (path.includes('/suppliers')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(suppliers, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `supplier-${suppliers.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        suppliers = [...suppliers, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        suppliers = suppliers.map((row: any) => (matchFilters(row, url) ? { ...row, ...body } : row));
        const updated = applyQueryFilters(suppliers, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        suppliers = suppliers.filter((row: any) => !matchFilters(row, url));
        return json(route, []);
      }

      return json(route, suppliers);
    }

    if (path.includes('/inventory_categories')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(inventoryCategories, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `inventory-category-${inventoryCategories.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        inventoryCategories = [...inventoryCategories, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        inventoryCategories = inventoryCategories.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(inventoryCategories, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        inventoryCategories = inventoryCategories.filter((row: any) => !matchFilters(row, url));
        return json(route, []);
      }

      return json(route, inventoryCategories);
    }

    if (path.includes('/purchase_orders')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(purchaseOrders, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `purchase-order-${purchaseOrders.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        purchaseOrders = [...inserted, ...purchaseOrders];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        purchaseOrders = purchaseOrders.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(purchaseOrders, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        purchaseOrders = purchaseOrders.filter((row: any) => !matchFilters(row, url));
        return json(route, []);
      }

      return json(route, purchaseOrders);
    }

    if (path.includes('/as_repair_records')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(asRepairRecords, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `as-repair-record-${asRepairRecords.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        asRepairRecords = [...inserted, ...asRepairRecords];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        asRepairRecords = asRepairRecords.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(asRepairRecords, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        asRepairRecords = asRepairRecords.filter((row: any) => !matchFilters(row, url));
        return json(route, []);
      }

      return json(route, asRepairRecords);
    }

    if (path.includes('/return_records')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(returnRecords, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `return-record-${returnRecords.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        returnRecords = [...inserted, ...returnRecords];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        returnRecords = returnRecords.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(returnRecords, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        returnRecords = returnRecords.filter((row: any) => !matchFilters(row, url));
        return json(route, []);
      }

      return json(route, returnRecords);
    }

    if (path.includes('/inventory')) {
      if (method === 'GET') {
        if (missingInventoryItemsSchema && path.includes('/inventory_items')) {
          return json(
            route,
            {
              code: 'PGRST205',
              details: null,
              hint: null,
              message: "Could not find the table 'public.inventory_items' in the schema cache",
            },
            400
          );
        }

        if (legacyInventoryDepartmentSchema && url.searchParams.has('department')) {
          return missingColumn(route, 'department', 'inventory');
        }

        return json(route, firstOrList(applyQueryFilters(inventoryItems, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];

        if (
          legacyInventoryDepartmentSchema &&
          payloads.some((payload: any) => Object.prototype.hasOwnProperty.call(payload, 'department'))
        ) {
          return missingColumn(route, 'department', 'inventory');
        }

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

    if (path.includes('/employment_contracts')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(employmentContracts, url), wantsObject));
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        employmentContracts = employmentContracts.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(employmentContracts, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `employment-contract-${employmentContracts.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        employmentContracts = [...employmentContracts, ...inserted];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      return json(route, employmentContracts);
    }

    if (path.includes('/onboarding_checklists')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(onboardingChecklists, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const upserted = payloads.map((payload: any, index: number) => {
          const existing = onboardingChecklists.find(
            (row: any) =>
              String(row.staff_id) === String(payload.staff_id) &&
              String(row.checklist_type) === String(payload.checklist_type),
          );

          if (existing) {
            return { ...existing, ...payload };
          }

          return {
            id: payload.id || `onboarding-checklist-${onboardingChecklists.length + index + 1}`,
            created_at: payload.created_at || new Date().toISOString(),
            ...payload,
          };
        });

        onboardingChecklists = [
          ...onboardingChecklists.filter(
            (row: any) =>
              !upserted.some(
                (candidate: any) =>
                  String(candidate.staff_id) === String(row.staff_id) &&
                  String(candidate.checklist_type) === String(row.checklist_type),
              ),
          ),
          ...upserted,
        ];

        return json(route, wantsObject ? upserted[0] : upserted);
      }

      return json(route, onboardingChecklists);
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

    if (path.includes('/document_repository')) {
      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(documentRepository, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `document-repository-${documentRepository.length + index + 1}`,
          created_at: payload.created_at || new Date().toISOString(),
          ...payload,
        }));
        documentRepository = [...inserted, ...documentRepository];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        documentRepository = documentRepository.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(documentRepository, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      if (method === 'DELETE') {
        documentRepository = documentRepository.filter((row: any) => !matchFilters(row, url));
        return json(route, []);
      }

      return json(route, documentRepository);
    }

    if (path.includes('/certificate_issuances')) {
      if (method === 'HEAD') {
        const count = applyQueryFilters(certificateIssuances, url).length;
        return route.fulfill({
          status: 200,
          headers: {
            'content-range': `0-0/${count}`,
          },
        });
      }

      if (method === 'GET') {
        return json(route, firstOrList(applyQueryFilters(certificateIssuances, url), wantsObject));
      }

      if (method === 'POST') {
        const body = request.postDataJSON();
        const payloads = Array.isArray(body) ? body : [body];
        const inserted = payloads.map((payload: any, index: number) => ({
          id: payload.id || `certificate-issuance-${certificateIssuances.length + index + 1}`,
          issued_at: payload.issued_at || new Date().toISOString(),
          ...payload,
        }));
        certificateIssuances = [...inserted, ...certificateIssuances];
        return json(route, wantsObject ? inserted[0] : inserted);
      }

      if (method === 'PATCH') {
        const body = request.postDataJSON();
        certificateIssuances = certificateIssuances.map((row: any) =>
          matchFilters(row, url) ? { ...row, ...body } : row
        );
        const updated = applyQueryFilters(certificateIssuances, url);
        return json(route, wantsObject ? updated[0] ?? null : updated);
      }

      return json(route, certificateIssuances);
    }

    if (
      path.includes('/push_subscriptions') ||
      path.includes('/education_records') ||
      path.includes('/room_read_cursors') ||
      path.includes('/room_notification_settings') ||
      path.includes('/messenger_drive_links')
    ) {
      return json(route, []);
    }

    return json(route, []);
  });
}
