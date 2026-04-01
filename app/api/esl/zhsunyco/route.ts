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
};

type MobileBlePreflightPayload = {
  deviceId?: string;
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

      const [licenseResult, triggerResult, ...taskResults] = await Promise.all([
        fetchUpstream(`${config.baseUrl}/mobile/query/license`, { method: 'GET' }, { mode: 'token', value: token }),
        fetchUpstream(`${config.baseUrl}/mobile/trigger/task`, { method: 'GET' }, { mode: 'token', value: token }),
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

      const readyTask = taskAttempts.find((attempt) => attempt.ok) || null;

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        deviceId,
        login: loginResult.json ?? loginResult.rawText,
        license: licenseResult.json ?? licenseResult.rawText,
        trigger: triggerResult.json ?? triggerResult.rawText,
        taskReady: Boolean(readyTask),
        task: readyTask?.upstream ?? null,
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
