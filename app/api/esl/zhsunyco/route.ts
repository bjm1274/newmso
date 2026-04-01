import { NextRequest, NextResponse } from 'next/server';
import { readAuthorizedExtraFeatureUser } from '@/lib/server-extra-feature-access';
import { normalizeZhsunycoBaseUrl, type ZhsunycoGoodsPayloadRow } from '@/lib/zhsunyco-esl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteConfig = {
  baseUrl?: string;
  userName?: string;
  password?: string;
  notifyRefresh?: boolean;
  shopCode?: string;
  customerStoreCode?: string;
  legacyApiCode?: string;
  legacyApiSign?: string;
};

type MobileBlePreflightPayload = {
  deviceId?: string;
};

type LegacyBleSearchPayload = {
  deviceId?: string;
  deviceIds?: string[];
};

type LegacyBleProductPayload = {
  pc?: string;
  pn?: string;
  pp?: string | number | null;
  extend?: Record<string, unknown>;
};

type LegacyBleLedPayload = {
  r?: number | string | null;
  g?: number | string | null;
  b?: number | string | null;
  timeOn?: number | string | null;
  time?: number | string | null;
};

type LegacyBleDirectCommandPayload = {
  eslCode?: string;
  templateId?: number | string | null;
  product?: LegacyBleProductPayload;
  led?: LegacyBleLedPayload[];
};

type LegacyBleDirectPayload = {
  commands?: LegacyBleDirectCommandPayload[];
  deviceId?: string;
  templateId?: number | string | null;
  product?: LegacyBleProductPayload;
  led?: LegacyBleLedPayload[];
};

type BoundBleDeviceSummary = {
  id: number | null;
  eslCode: string;
  productCode: string;
  templateId: number | null;
  typeCode: string;
  deviceArea: number | null;
  actionFrom: string;
  pid: string;
  eslVersion: string;
};

type UpstreamJson = {
  code?: number;
  message?: string;
  body?: unknown;
  error_code?: number;
  error?: string;
  token?: string;
  list?: unknown;
  [key: string]: unknown;
};

type BindDevicePayload = {
  mode?: 'esl' | 'tft';
  deviceId?: string;
  templateName?: string;
  goodsCodes?: string[];
  areaId?: number;
  displayIndex?: number;
  refreshAfterBind?: boolean;
  ap?: string;
};

type RouteBody =
  | { action: 'test'; config?: RouteConfig }
  | { action: 'queryStores'; config?: RouteConfig }
  | { action: 'pushGoods'; config?: RouteConfig; payload?: ZhsunycoGoodsPayloadRow[] }
  | { action: 'bindDevice'; config?: RouteConfig; payload?: BindDevicePayload }
  | { action: 'legacyBleSearch'; config?: RouteConfig; payload?: LegacyBleSearchPayload }
  | { action: 'legacyBleDirect'; config?: RouteConfig; payload?: LegacyBleDirectPayload }
  | { action: 'mobileTest'; config?: RouteConfig }
  | { action: 'mobileTemplates'; config?: RouteConfig }
  | { action: 'mobileBlePreflight'; config?: RouteConfig; payload?: MobileBlePreflightPayload };

type AuthHeader =
  | {
      mode: 'bearer' | 'token';
      value: string;
    }
  | null
  | undefined;

function buildErrorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUpstreamJsonOk(json: UpstreamJson | null, response: Response) {
  const errorCode = Number(json?.error_code);
  return response.ok && (!Number.isFinite(errorCode) || errorCode === 0);
}

function toNullableNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildBoundBleDeviceSummary(value: unknown): BoundBleDeviceSummary | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    id: toNullableNumber(value.id),
    eslCode: String(value.esl_code || '').trim(),
    productCode: String(value.product_code || '').trim(),
    templateId: toNullableNumber(value.template_id),
    typeCode: String(value.esltype_code || value.type_code || '').trim(),
    deviceArea: toNullableNumber(value.device_area),
    actionFrom: String(value.action_from || '').trim(),
    pid: String(value.pid || '').trim(),
    eslVersion: String(value.esl_version || '').trim(),
  };
}

async function parseUpstreamResponse(response: Response) {
  const rawText = await response.text();

  if (!rawText) {
    return {
      rawText: '',
      json: null as UpstreamJson | null,
    };
  }

  try {
    return {
      rawText,
      json: JSON.parse(rawText) as UpstreamJson,
    };
  } catch {
    return {
      rawText,
      json: null as UpstreamJson | null,
    };
  }
}

async function fetchUpstream(url: string, init: RequestInit, auth?: AuthHeader) {
  const headers = new Headers(init.headers || {});

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, text/plain;q=0.9, */*;q=0.8');
  }

  if (auth?.value) {
    if (auth.mode === 'bearer') {
      headers.set('Authorization', `Bearer ${auth.value}`);
    } else {
      headers.set('token', auth.value);
    }
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  return {
    response,
    ...(await parseUpstreamResponse(response)),
  };
}

function extractUpstreamMessage(parsed: { json: UpstreamJson | null; rawText: string }, fallbackStatus: number) {
  return parsed.json?.message || parsed.json?.error || parsed.rawText || `HTTP ${fallbackStatus}`;
}

function validateConfig(config?: RouteConfig) {
  const baseUrl = normalizeZhsunycoBaseUrl(String(config?.baseUrl || ''));
  if (!baseUrl) {
    throw new Error('API 기본 주소를 입력해 주세요.');
  }

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('API 기본 주소는 http:// 또는 https:// 로 시작해야 합니다.');
  }

  return {
    baseUrl,
    userName: String(config?.userName || '').trim(),
    password: String(config?.password || '').trim(),
    notifyRefresh: config?.notifyRefresh !== false,
    shopCode: String(config?.shopCode || '').trim(),
    customerStoreCode: String(config?.customerStoreCode || '').trim(),
    legacyApiCode: String(config?.legacyApiCode || '').trim(),
    legacyApiSign: String(config?.legacyApiSign || '').trim(),
  };
}

function validateLegacyApiConfig(config: ReturnType<typeof validateConfig>) {
  const storeCode = String(config.shopCode || config.customerStoreCode || '').trim();
  if (!storeCode) {
    throw new Error('공식 ESL API용 매장코드가 필요합니다.');
  }

  const sign = String(config.legacyApiSign || '').trim();
  if (!sign) {
    throw new Error('공식 ESL API sign 값이 필요합니다.');
  }

  return {
    apiCode: String(config.legacyApiCode || 'default').trim() || 'default',
    sign,
    storeCode,
  };
}

function buildLegacyApiUrl(baseUrl: string, apiCode: string, resourcePath: string) {
  const trimmedPath = String(resourcePath || '').replace(/^\/+/g, '');
  return `${baseUrl}/api/${encodeURIComponent(apiCode)}/${trimmedPath}`;
}

async function postLegacyApi(
  baseUrl: string,
  apiCode: string,
  resourcePath: string,
  body: Record<string, unknown>,
) {
  return fetchUpstream(buildLegacyApiUrl(baseUrl, apiCode, resourcePath), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function isLegacyApiMessageFailure(parsed: { json: UpstreamJson | null; rawText: string }) {
  const jsonValue = parsed.json as unknown;
  const messageSource =
    typeof jsonValue === 'string'
      ? jsonValue
      : typeof parsed.rawText === 'string'
        ? parsed.rawText
        : '';

  const normalized = messageSource.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith('miss ') || normalized.startsWith('invalid ') || normalized.includes('error');
}

function normalizeLegacyLedEntry(value: LegacyBleLedPayload) {
  const red = toNullableNumber(value.r) ?? 0;
  const green = toNullableNumber(value.g) ?? 0;
  const blue = toNullableNumber(value.b) ?? 0;
  const timeOn = toNullableNumber(value.timeOn) ?? 100;
  const time = toNullableNumber(value.time) ?? 5;

  return {
    r: red,
    g: green,
    b: blue,
    time_on: timeOn,
    time,
  };
}

function buildLegacyBleDirectCommand(payload: LegacyBleDirectCommandPayload) {
  const eslCode = String(payload.eslCode || '').trim();
  const templateId = toNullableNumber(payload.templateId);
  if (!eslCode || templateId === null) {
    return null;
  }

  const productInput = isObject(payload.product) ? payload.product : {};
  const extendInput = isObject(productInput.extend) ? productInput.extend : {};
  const extendEntries = Object.entries(extendInput)
    .map(([key, value]) => [String(key).trim(), String(value ?? '').trim()] as const)
    .filter(([key, value]) => key && value);

  const product: Record<string, unknown> = {
    pc: String(productInput.pc || '').trim(),
    pn: String(productInput.pn || '').trim(),
  };

  const priceValue = productInput.pp;
  if (priceValue !== null && priceValue !== undefined && String(priceValue).trim()) {
    product.pp = typeof priceValue === 'number' ? priceValue : String(priceValue).trim();
  }

  if (extendEntries.length > 0) {
    product.extend = Object.fromEntries(extendEntries);
  }

  const led = Array.isArray(payload.led) ? payload.led.map(normalizeLegacyLedEntry) : [];

  return {
    esl_code: eslCode,
    template_id: templateId,
    product,
    ...(led.length > 0 ? { led } : {}),
  };
}

async function loginToERetail(baseUrl: string, config: RouteConfig) {
  const userName = String(config.userName || '').trim();
  const password = String(config.password || '').trim();

  if (!userName || !password) {
    throw new Error('API 계정과 비밀번호를 입력해 주세요.');
  }

  const loginResult = await fetchUpstream(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName,
      password,
    }),
  });

  if (!loginResult.response.ok) {
    throw new Error(`eRetail 로그인 실패: ${extractUpstreamMessage(loginResult, loginResult.response.status)}`);
  }

  const token = typeof loginResult.json?.body === 'string' ? loginResult.json.body.trim() : '';
  if (!token) {
    throw new Error('eRetail 로그인은 되었지만 토큰을 받지 못했습니다.');
  }

  return {
    token,
    loginResult,
  };
}

async function loginToMobileCloud(baseUrl: string, config: RouteConfig) {
  const userName = String(config.userName || '').trim();
  const password = String(config.password || '').trim();

  if (!userName || !password) {
    throw new Error('모바일 계정과 비밀번호를 입력해 주세요.');
  }

  const params = new URLSearchParams({
    username: userName,
    password,
  });

  const loginResult = await fetchUpstream(`${baseUrl}/mobile/login?${params.toString()}`, {
    method: 'GET',
  });

  if (!loginResult.response.ok) {
    throw new Error(`모바일 로그인 실패: ${extractUpstreamMessage(loginResult, loginResult.response.status)}`);
  }

  const errorCode = Number(loginResult.json?.error_code);
  if (Number.isFinite(errorCode) && errorCode !== 0) {
    throw new Error(`모바일 로그인 실패: ${extractUpstreamMessage(loginResult, loginResult.response.status)}`);
  }

  const token = typeof loginResult.json?.token === 'string' ? loginResult.json.token.trim() : '';
  if (!token) {
    throw new Error('모바일 로그인은 되었지만 token 값을 받지 못했습니다.');
  }

  return {
    token,
    loginResult,
  };
}

export async function POST(request: NextRequest) {
  const auth = await readAuthorizedExtraFeatureUser(request, 'ESL연동');
  if (auth.status || !auth.user) {
    return buildErrorResponse(auth.error || 'Unauthorized', auth.status || 401);
  }

  let body: RouteBody;
  try {
    body = (await request.json()) as RouteBody;
  } catch {
    return buildErrorResponse('요청 본문을 해석할 수 없습니다.');
  }

  if (!body?.action) {
    return buildErrorResponse('action 값이 필요합니다.');
  }

  let config: ReturnType<typeof validateConfig>;
  try {
    config = validateConfig(body.config);
  } catch (error) {
    return buildErrorResponse(error instanceof Error ? error.message : '설정값이 올바르지 않습니다.');
  }

  try {
    if (body.action === 'mobileTest') {
      const { token, loginResult } = await loginToMobileCloud(config.baseUrl, config);

      const [licenseResult, overviewResult] = await Promise.all([
        fetchUpstream(`${config.baseUrl}/mobile/query/license`, { method: 'GET' }, { mode: 'token', value: token }),
        fetchUpstream(`${config.baseUrl}/mobile/get/overview`, { method: 'GET' }, { mode: 'token', value: token }),
      ]);

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        login: loginResult.json ?? loginResult.rawText,
        license: licenseResult.json ?? licenseResult.rawText,
        overview: overviewResult.json ?? overviewResult.rawText,
      });
    }

    if (body.action === 'mobileTemplates') {
      const { token } = await loginToMobileCloud(config.baseUrl, config);

      const templateResult = await fetchUpstream(
        `${config.baseUrl}/mobile/queryDeluxe/template`,
        { method: 'GET' },
        { mode: 'token', value: token },
      );

      if (!templateResult.response.ok) {
        return buildErrorResponse(
          `모바일 템플릿 조회 실패: ${extractUpstreamMessage(templateResult, templateResult.response.status)}`,
          502,
        );
      }

      const errorCode = Number(templateResult.json?.error_code);
      if (Number.isFinite(errorCode) && errorCode !== 0) {
        return buildErrorResponse(
          `모바일 템플릿 조회 실패: ${extractUpstreamMessage(templateResult, templateResult.response.status)}`,
          502,
        );
      }

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        templates: Array.isArray(templateResult.json?.list) ? templateResult.json.list : [],
        upstream: templateResult.json ?? templateResult.rawText,
      });
    }

    if (body.action === 'mobileBlePreflight') {
      const { token, loginResult } = await loginToMobileCloud(config.baseUrl, config);
      const payload = isObject(body.payload) ? (body.payload as MobileBlePreflightPayload) : {};
      const deviceId = String(payload.deviceId || '').trim();
      const triggerQuery = deviceId ? `?${new URLSearchParams({ esl_code: deviceId }).toString()}` : '';
      const queryBleQuery = deviceId ? `?${new URLSearchParams({ page: '1', limit: '20', code: deviceId }).toString()}` : '';
      const deviceLookupQuery = deviceId ? `?${new URLSearchParams({ esl_code: deviceId }).toString()}` : '';
      const taskCountQuery = deviceId ? `?${new URLSearchParams({ esl_code: deviceId }).toString()}` : '';
      const taskListQuery = deviceId ? `?${new URLSearchParams({ page: '1', limit: '20', esl_code: deviceId }).toString()}` : '';

      const queryVariants = [
        { label: '기본 조회', query: '' },
        ...(deviceId
          ? [
              { label: 'esl_code', query: `?${new URLSearchParams({ esl_code: deviceId }).toString()}` },
              { label: 'deviceId', query: `?${new URLSearchParams({ deviceId }).toString()}` },
              { label: 'code', query: `?${new URLSearchParams({ code: deviceId }).toString()}` },
            ]
          : []),
      ];

      const [licenseResult, triggerResult, bleQueryResult, deviceLookupResult, taskCountResult, taskListResult, ...taskResults] = await Promise.all([
        fetchUpstream(`${config.baseUrl}/mobile/query/license`, { method: 'GET' }, { mode: 'token', value: token }),
        fetchUpstream(`${config.baseUrl}/mobile/trigger/task${triggerQuery}`, { method: 'GET' }, { mode: 'token', value: token }),
        deviceId
          ? fetchUpstream(`${config.baseUrl}/mobile/query/ble${queryBleQuery}`, { method: 'GET' }, { mode: 'token', value: token })
          : Promise.resolve(null),
        deviceId
          ? fetchUpstream(`${config.baseUrl}/mobile/get/ble${deviceLookupQuery}`, { method: 'GET' }, { mode: 'token', value: token })
          : Promise.resolve(null),
        deviceId
          ? fetchUpstream(`${config.baseUrl}/mobile/getTaskCount/ble${taskCountQuery}`, { method: 'GET' }, { mode: 'token', value: token })
          : Promise.resolve(null),
        deviceId
          ? fetchUpstream(`${config.baseUrl}/mobile/getTaskList/ble${taskListQuery}`, { method: 'GET' }, { mode: 'token', value: token })
          : Promise.resolve(null),
        ...queryVariants.map((variant) =>
          fetchUpstream(`${config.baseUrl}/mobile/getTask/ble${variant.query}`, { method: 'GET' }, { mode: 'token', value: token }),
        ),
      ]);

      const taskAttempts = taskResults.map((result, index) => {
        const variant = queryVariants[index];
        const errorCode = Number(result.json?.error_code);
        const ok = result.response.ok && (!Number.isFinite(errorCode) || errorCode === 0);
        return {
          label: variant?.label || `시도 ${index + 1}`,
          query: variant?.query || '',
          ok,
          upstream: result.json ?? result.rawText,
        };
      });

      const deviceLookupOk = deviceLookupResult ? isUpstreamJsonOk(deviceLookupResult.json, deviceLookupResult.response) : false;
      const boundDevice = deviceLookupOk ? buildBoundBleDeviceSummary(deviceLookupResult?.json?.device) : null;
      const bleQueryList = Array.isArray(bleQueryResult?.json?.list) ? bleQueryResult.json.list : [];
      const waitingCount = toNullableNumber(taskCountResult?.json?.waiting);
      const errorTaskCount = toNullableNumber(taskCountResult?.json?.error);
      const readyTask = taskAttempts.find((attempt) => attempt.ok) || null;
      const taskState =
        readyTask ? 'ready' : boundDevice ? 'idle' : deviceId ? 'missing' : 'unknown';
      const statusSummary = readyTask
        ? '제조사 서버에 이 기기의 BLE 작업이 준비되어 있습니다.'
        : boundDevice
          ? '제조사 서버에는 이 기기가 등록되어 있지만, 현재 내려온 BLE 작업은 없습니다.'
          : deviceId
            ? '제조사 서버에서 이 기기 바코드를 찾지 못했습니다. 먼저 공식 앱/웹에서 바인딩이 필요합니다.'
            : '기기 바코드를 입력하면 제조사 서버 등록 상태를 확인할 수 있습니다.';

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        deviceId,
        login: loginResult.json ?? loginResult.rawText,
        license: licenseResult.json ?? licenseResult.rawText,
        trigger: triggerResult.json ?? triggerResult.rawText,
        taskReady: Boolean(readyTask),
        task: readyTask?.upstream ?? null,
        taskState,
        statusSummary,
        bleQuery: bleQueryResult ? bleQueryResult.json ?? bleQueryResult.rawText : null,
        deviceLookup: deviceLookupResult ? deviceLookupResult.json ?? deviceLookupResult.rawText : null,
        boundDevice,
        waitingCount,
        errorTaskCount,
        taskList: taskListResult ? taskListResult.json ?? taskListResult.rawText : null,
        queryBleCount: bleQueryList.length,
        taskAttempts,
        browserBle: {
          primaryServiceUuid: '3e3d1158-5656-4217-b715-266f37eb5000',
          characteristicUuids: [
            '30323032-4c53-4545-4c42-4b4e494c4f57',
            '31323032-4c53-4545-4c42-4b4e494c4f57',
            '32323032-4c53-4545-4c42-4b4e494c4f57',
            '33323032-4c53-4545-4c42-4b4e494c4f57',
            '34323032-4c53-4545-4c42-4b4e494c4f57',
            '35323032-4c53-4545-4c42-4b4e494c4f57',
          ],
        },
      });
    }

    if (body.action === 'legacyBleSearch') {
      const legacyConfig = validateLegacyApiConfig(config);
      const payload = isObject(body.payload) ? (body.payload as LegacyBleSearchPayload) : {};
      const deviceIds = Array.from(
        new Set(
          [
            ...(Array.isArray(payload.deviceIds) ? payload.deviceIds : []),
            payload.deviceId,
          ]
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      );

      if (deviceIds.length === 0) {
        return buildErrorResponse('LED 점멸 확인용 ESL 코드가 필요합니다.');
      }

      const requestBody = {
        store_code: legacyConfig.storeCode,
        f1: deviceIds,
        is_base64: '0',
        sign: legacyConfig.sign,
      };

      const searchResult = await postLegacyApi(config.baseUrl, legacyConfig.apiCode, 'esl_ble/search', requestBody);

      if (!searchResult.response.ok || isLegacyApiMessageFailure(searchResult)) {
        return buildErrorResponse(
          `공식 BLE 검색 실패: ${extractUpstreamMessage(searchResult, searchResult.response.status)}`,
          502,
        );
      }

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        apiCode: legacyConfig.apiCode,
        storeCode: legacyConfig.storeCode,
        deviceIds,
        requestBody,
        upstream: searchResult.json ?? searchResult.rawText,
      });
    }

    if (body.action === 'legacyBleDirect') {
      const legacyConfig = validateLegacyApiConfig(config);
      const payload = isObject(body.payload) ? (body.payload as LegacyBleDirectPayload) : {};
      const commandInputs = Array.isArray(payload.commands)
        ? payload.commands
        : [
            {
              eslCode: payload.deviceId,
              templateId: payload.templateId,
              product: payload.product,
              led: payload.led,
            } satisfies LegacyBleDirectCommandPayload,
          ];

      const commands = commandInputs
        .map((command) => buildLegacyBleDirectCommand(command))
        .filter((command): command is NonNullable<ReturnType<typeof buildLegacyBleDirectCommand>> => Boolean(command));

      if (commands.length === 0) {
        return buildErrorResponse('직접 전송용 ESL 코드와 template ID가 필요합니다.');
      }

      const requestBody = {
        store_code: legacyConfig.storeCode,
        f1: commands,
        is_base64: '0',
        sign: legacyConfig.sign,
      };

      const directResult = await postLegacyApi(config.baseUrl, legacyConfig.apiCode, 'esl_ble/direct', requestBody);

      if (!directResult.response.ok || isLegacyApiMessageFailure(directResult)) {
        return buildErrorResponse(
          `공식 BLE 직접 전송 실패: ${extractUpstreamMessage(directResult, directResult.response.status)}`,
          502,
        );
      }

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        apiCode: legacyConfig.apiCode,
        storeCode: legacyConfig.storeCode,
        requestBody,
        upstream: directResult.json ?? directResult.rawText,
      });
    }

    if (body.action === 'test') {
      const helloResult = await fetchUpstream(`${config.baseUrl}/api/hello`, {
        method: 'GET',
      });

      const { loginResult } = await loginToERetail(config.baseUrl, config);

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        hello: {
          ok: helloResult.response.ok,
          status: helloResult.response.status,
          body: helloResult.json ?? helloResult.rawText,
        },
        login: {
          ok: true,
          status: loginResult.response.status,
          body: loginResult.json ?? loginResult.rawText,
        },
      });
    }

    const { token } = await loginToERetail(config.baseUrl, config);

    if (body.action === 'queryStores') {
      const storeResult = await fetchUpstream(
        `${config.baseUrl}/api/shop/queryShopListByUser`,
        { method: 'GET' },
        { mode: 'bearer', value: token },
      );

      if (!storeResult.response.ok) {
        return buildErrorResponse(
          `매장 조회 실패: ${extractUpstreamMessage(storeResult, storeResult.response.status)}`,
          502,
        );
      }

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        stores: Array.isArray(storeResult.json?.body) ? storeResult.json.body : [],
        upstream: storeResult.json ?? storeResult.rawText,
      });
    }

    if (body.action === 'pushGoods') {
      const payload = Array.isArray(body.payload) ? body.payload : [];
      if (payload.length === 0) {
        return buildErrorResponse('전송할 상품 데이터가 없습니다.');
      }

      const invalidRow = payload.find((row) => {
        if (!isObject(row)) return true;
        const shopCode = String(row.shopCode || '').trim();
        const template = String(row.template || '').trim();
        return !shopCode || !template || !Array.isArray(row.items);
      });

      if (invalidRow) {
        return buildErrorResponse('상품 전송 payload 형식이 올바르지 않습니다.');
      }

      const refreshParam = config.notifyRefresh ? 'true' : 'false';
      const pushResult = await fetchUpstream(
        `${config.baseUrl}/api/goods/saveList?NR=${refreshParam}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        { mode: 'bearer', value: token },
      );

      if (!pushResult.response.ok) {
        return buildErrorResponse(
          `상품 전송 실패: ${extractUpstreamMessage(pushResult, pushResult.response.status)}`,
          502,
        );
      }

      const upstreamCode = Number(pushResult.json?.code);
      const isSuccessCode = !Number.isFinite(upstreamCode) || upstreamCode === 0;
      if (!isSuccessCode) {
        return NextResponse.json(
          {
            ok: false,
            normalizedBaseUrl: config.baseUrl,
            upstream: pushResult.json ?? pushResult.rawText,
          },
          { status: 502 },
        );
      }

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        itemCount: payload.length,
        upstream: pushResult.json ?? pushResult.rawText,
      });
    }

    if (body.action !== 'bindDevice') {
      return buildErrorResponse('지원하지 않는 action 입니다.');
    }

    const payload = isObject(body.payload) ? (body.payload as BindDevicePayload) : {};
    const mode = payload.mode === 'esl' ? 'esl' : 'tft';
    const deviceId = String(payload.deviceId || '').trim();
    const templateName = String(payload.templateName || '').trim();
    const goodsCodes = Array.isArray(payload.goodsCodes)
      ? payload.goodsCodes.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

    if (!deviceId) {
      return buildErrorResponse('기기 바코드 또는 기기 ID를 입력해 주세요.');
    }

    if (goodsCodes.length === 0) {
      return buildErrorResponse('바인딩할 상품 코드가 없습니다.');
    }

    if (!config.shopCode && !config.customerStoreCode) {
      return buildErrorResponse('shopCode 또는 고객 매장코드가 필요합니다.');
    }

    if (mode === 'tft') {
      if (!templateName) {
        return buildErrorResponse('TFT 바인딩에는 templateName 이 필요합니다.');
      }

      const bindBody = {
        areaId: Number(payload.areaId ?? 0),
        bindRes: [],
        displayIndex: Number(payload.displayIndex ?? 0),
        goods: goodsCodes,
        shopCode: config.shopCode,
        shopCodeCst: config.customerStoreCode,
        templateName,
        tftId: deviceId,
      };

      const bindResult = await fetchUpstream(
        `${config.baseUrl}/api/tft/tft/bind`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bindBody),
        },
        { mode: 'bearer', value: token },
      );

      if (!bindResult.response.ok || Number(bindResult.json?.code) !== 0) {
        return buildErrorResponse(
          `기기 바인딩 실패: ${extractUpstreamMessage(bindResult, bindResult.response.status)}`,
          502,
        );
      }

      let refreshPayload: unknown = null;
      if (payload.refreshAfterBind !== false) {
        const refreshResult = await fetchUpstream(
          `${config.baseUrl}/api/tft/tft/refresh`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tftId: [deviceId],
              shopCode: config.shopCode,
            }),
          },
          { mode: 'bearer', value: token },
        );

        if (!refreshResult.response.ok || Number(refreshResult.json?.code) !== 0) {
          return buildErrorResponse(
            `바인딩 후 새로고침 실패: ${extractUpstreamMessage(refreshResult, refreshResult.response.status)}`,
            502,
          );
        }

        refreshPayload = refreshResult.json ?? refreshResult.rawText;
      }

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        mode,
        bind: bindResult.json ?? bindResult.rawText,
        refresh: refreshPayload,
      });
    }

    const bindResult = await fetchUpstream(
      `${config.baseUrl}/api/esl/tag/bind`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopCode: config.shopCode,
          shopCodeCst: config.customerStoreCode,
          ap: String(payload.ap || '').trim(),
          binds: goodsCodes.map((goodsCode) => ({
            tagID: deviceId,
            goodsCode,
          })),
        }),
      },
      { mode: 'bearer', value: token },
    );

    if (!bindResult.response.ok || Number(bindResult.json?.code) !== 0) {
      return buildErrorResponse(
        `ESL 바인딩 실패: ${extractUpstreamMessage(bindResult, bindResult.response.status)}`,
        502,
      );
    }

    return NextResponse.json({
      ok: true,
      normalizedBaseUrl: config.baseUrl,
      mode,
      bind: bindResult.json ?? bindResult.rawText,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Zhsunyco 연동 처리 중 오류가 발생했습니다.';
    return buildErrorResponse(message, 500);
  }
}
