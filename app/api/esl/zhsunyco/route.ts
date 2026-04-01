import { NextRequest, NextResponse } from 'next/server';
import { readAuthorizedExtraFeatureUser } from '@/lib/server-extra-feature-access';
import {
  normalizeZhsunycoBaseUrl,
  type ZhsunycoGoodsPayloadRow,
} from '@/lib/zhsunyco-esl';

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

type UpstreamJson = {
  code?: number;
  message?: string;
  body?: unknown;
  [key: string]: unknown;
};

type RouteBody =
  | {
      action: 'test';
      config?: RouteConfig;
    }
  | {
      action: 'queryStores';
      config?: RouteConfig;
    }
  | {
      action: 'pushGoods';
      config?: RouteConfig;
      payload?: ZhsunycoGoodsPayloadRow[];
    }
  | {
      action: 'bindDevice';
      config?: RouteConfig;
      payload?: {
        mode?: 'esl' | 'tft';
        deviceId?: string;
        templateName?: string;
        goodsCodes?: string[];
        areaId?: number;
        displayIndex?: number;
        refreshAfterBind?: boolean;
        ap?: string;
      };
    };

function buildErrorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function parseUpstreamResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {
      rawText: '',
      json: null as UpstreamJson | null,
    };
  }

  try {
    return {
      rawText: text,
      json: JSON.parse(text) as UpstreamJson,
    };
  } catch {
    return {
      rawText: text,
      json: null as UpstreamJson | null,
    };
  }
}

async function fetchUpstream(
  url: string,
  init: RequestInit,
  token?: string | null,
) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, text/plain;q=0.9, */*;q=0.8');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  const parsed = await parseUpstreamResponse(response);
  return {
    response,
    ...parsed,
  };
}

async function loginToZhsunyco(baseUrl: string, config: RouteConfig) {
  const userName = String(config.userName || '').trim();
  const password = String(config.password || '').trim();

  if (!userName || !password) {
    throw new Error('API 로그인 계정을 입력해 주세요.');
  }

  const loginResult = await fetchUpstream(
    `${baseUrl}/api/login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userName,
        password,
      }),
    },
  );

  if (!loginResult.response.ok) {
    const upstreamMessage =
      loginResult.json?.message ||
      loginResult.rawText ||
      `HTTP ${loginResult.response.status}`;
    throw new Error(`API 로그인 실패: ${upstreamMessage}`);
  }

  const token = typeof loginResult.json?.body === 'string' ? loginResult.json.body.trim() : '';
  if (!token) {
    throw new Error('API 로그인은 성공했지만 토큰을 받지 못했습니다.');
  }

  return {
    token,
    loginResult,
  };
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
    return buildErrorResponse(error instanceof Error ? error.message : '설정 값이 올바르지 않습니다.');
  }

  try {
    if (body.action === 'test') {
      const helloResult = await fetchUpstream(`${config.baseUrl}/api/hello`, {
        method: 'GET',
      });

      const { loginResult } = await loginToZhsunyco(config.baseUrl, config);

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

    const { token } = await loginToZhsunyco(config.baseUrl, config);

    if (body.action === 'queryStores') {
      const storeResult = await fetchUpstream(
        `${config.baseUrl}/api/shop/queryShopListByUser`,
        {
          method: 'GET',
        },
        token,
      );

      if (!storeResult.response.ok) {
        const upstreamMessage =
          storeResult.json?.message ||
          storeResult.rawText ||
          `HTTP ${storeResult.response.status}`;
        return buildErrorResponse(`매장 조회 실패: ${upstreamMessage}`, 502);
      }

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        stores: Array.isArray(storeResult.json?.body) ? storeResult.json?.body : [],
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
        token,
      );

      if (!pushResult.response.ok) {
        const upstreamMessage =
          pushResult.json?.message ||
          pushResult.rawText ||
          `HTTP ${pushResult.response.status}`;
        return buildErrorResponse(`상품 전송 실패: ${upstreamMessage}`, 502);
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

    if (body.action === 'bindDevice') {
      const payload = isObject(body.payload) ? body.payload : {};
      const mode = payload.mode === 'esl' ? 'esl' : 'tft';
      const deviceId = String(payload.deviceId || '').trim();
      const templateName = String(payload.templateName || '').trim();
      const goodsCodes = Array.isArray(payload.goodsCodes)
        ? payload.goodsCodes.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
      const shopCode = String(config.baseUrl && body.config?.['shopCode'] ? body.config['shopCode'] : '').trim();
      const shopCodeCst = String(body.config?.['customerStoreCode'] || '').trim();

      if (!deviceId) {
        return buildErrorResponse('기기 바코드 또는 기기 ID를 입력해 주세요.');
      }

      if (goodsCodes.length === 0) {
        return buildErrorResponse('바인딩할 상품코드가 없습니다.');
      }

      if (!shopCode && !shopCodeCst) {
        return buildErrorResponse('shopCode 또는 고객 매장코드 중 하나는 필요합니다.');
      }

      if (mode === 'tft') {
        if (!templateName) {
          return buildErrorResponse('TFT/사이니지 바인딩에는 templateName 이 필요합니다.');
        }

        const bindBody = {
          areaId: Number(payload.areaId ?? 0),
          bindRes: [],
          displayIndex: Number(payload.displayIndex ?? 0),
          goods: goodsCodes,
          shopCode,
          shopCodeCst,
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
          token,
        );

        if (!bindResult.response.ok || Number(bindResult.json?.code) !== 0) {
          const upstreamMessage =
            bindResult.json?.message ||
            bindResult.rawText ||
            `HTTP ${bindResult.response.status}`;
          return buildErrorResponse(`기기 바인딩 실패: ${upstreamMessage}`, 502);
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
                shopCode,
              }),
            },
            token,
          );

          if (!refreshResult.response.ok || Number(refreshResult.json?.code) !== 0) {
            const upstreamMessage =
              refreshResult.json?.message ||
              refreshResult.rawText ||
              `HTTP ${refreshResult.response.status}`;
            return buildErrorResponse(`바인딩은 됐지만 새로고침 실패: ${upstreamMessage}`, 502);
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
            shopCode,
            shopCodeCst,
            ap: String(payload.ap || '').trim(),
            binds: goodsCodes.map((goodsCode) => ({
              tagID: deviceId,
              goodsCode,
            })),
          }),
        },
        token,
      );

      if (!bindResult.response.ok || Number(bindResult.json?.code) !== 0) {
        const upstreamMessage =
          bindResult.json?.message ||
          bindResult.rawText ||
          `HTTP ${bindResult.response.status}`;
        return buildErrorResponse(`ESL 바인딩 실패: ${upstreamMessage}`, 502);
      }

      return NextResponse.json({
        ok: true,
        normalizedBaseUrl: config.baseUrl,
        mode,
        bind: bindResult.json ?? bindResult.rawText,
      });
    }

    return buildErrorResponse('지원하지 않는 action 입니다.');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Zhsunyco 연동 처리 중 오류가 발생했습니다.';
    return buildErrorResponse(message, 500);
  }
}
