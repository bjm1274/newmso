/**
 * 출퇴근 지오펜스·시각 서버 검증 (D01-012 · D09-007)
 *
 * 예전에는 반경 검사와 출퇴근 시각이 **전적으로 브라우저에** 있었다.
 * 두 출퇴근 화면 모두 `localStorage.getItem('bypass_gps') === 'true'` 면
 * 거리 검사를 통째로 건너뛰었고(PC 경로는 표시 거리까지 0m 로 위조했다),
 * 기록 시각은 `new Date().toISOString()` 즉 단말 시계였다.
 * 쓰기 경로도 전용 라우트가 아니라 범용 `/api/d1/mutate` 라서 서버에는
 * 좌표·시각을 볼 기회 자체가 없었다 — 검증이 0 인 상태였다.
 *
 * 그래서 판정을 서버로 옮긴다. 서버가 스스로 거리를 재계산하고 시계 차이를
 * 재며, 위반이면 audit_logs 에 사유와 함께 남긴다.
 *
 * 무엇을 막고 무엇을 막지 않는가:
 *   **반경 밖으로 판정되면 막는다.** 좌표를 받아 서버가 직접 계산한 결과이므로
 *   이 판정에는 근거가 있다.
 *   반면 좌표를 못 받은 경우(위치 권한 거부·실내 GPS 실패·구형 브라우저)와
 *   정확도가 낮은 경우는 막지 않고 기록만 한다. 위치를 못 잡는 단말이 즉시
 *   출근 불가가 되면 운영이 멈추고, 그 오탐 비용은 바로 현장에 떨어진다.
 *
 *   차단 판정은 이 라우트가 내려 `blocked` 로 돌려준다. 클라이언트가 각자
 *   정책을 다시 쓰면 PC 와 모바일이 또 갈라진다 — 그게 애초에 이 라우트를
 *   만든 이유다.
 *
 * 서버가 돌려주는 `serverTime` 은 클라이언트가 기록 시각으로 그대로 쓴다.
 * 그것만으로도 "단말 시계를 돌려 지각을 정상으로 만드는" 경로는 닫힌다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { calculateDistance } from '@/lib/geo';
import { ALLOWED_DISTANCE_M, WORKPLACE_LOCATION } from '@/lib/location';
import { logAuditServer as logAudit } from '@/lib/audit-server';
import { userId } from '@/lib/d1-api-helpers';
import {
  normalizeSessionUser,
  readSessionFromRequest,
} from '@/lib/server-session';

export const dynamic = 'force-dynamic';

/** 단말 시계와 서버 시계가 이만큼 벌어지면 기록해 둔다(분). */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
/** 이 정확도보다 나쁜 좌표는 반경 판정의 근거로 쓰기 어렵다(m). */
const ACCURACY_UNRELIABLE_M = 200;

type GeoVerifyRequest = {
  action?: 'check_in' | 'check_out';
  date?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  /** 단말이 기록에 쓰려던 시각(ISO). 서버 시계와 비교만 한다. */
  clientTime?: string | null;
  /** 클라이언트가 bypass 경로로 통과했다고 스스로 신고한 값. */
  clientBypass?: boolean | null;
};

export type GeoVerifyResponse = {
  ok: true;
  /** 기록에 사용할 권위 시각. 클라이언트는 이 값을 써야 한다. */
  serverTime: string;
  /** 서버가 다시 계산한 사업장까지의 거리(m). 좌표가 없으면 null. */
  distanceM: number | null;
  allowedDistanceM: number;
  /** 서버 판정. 좌표 미제출이면 false. */
  withinRange: boolean;
  /** 위반 사유 코드 목록. 비어 있으면 정상. */
  violations: string[];
  /** 서버 차단 판정. true 면 클라이언트는 기록을 남기지 말아야 한다. */
  blocked: boolean;
  /** 차단 사유 문구. blocked 가 false 면 null. */
  blockReason: string | null;
};

/**
 * 좌표 파싱.
 *
 * `Number(null)` 과 `Number('')` 는 **0 이다.** 그래서 예전에는 좌표를 보내지 않은
 * 요청이 위도 0·경도 0(기니만 앞바다)으로 해석돼 사업장에서 1,300만 m 떨어진 것으로
 * 계산됐다. 기록만 하던 동안에는 로그가 더러워지는 정도였지만, 반경 밖을 차단하게
 * 되면 **위치 권한이 꺼진 단말이 전부 출근 불가**가 된다 — 막지 않기로 한 바로 그
 * 경우가 막히는 것이다. 그래서 null·빈 문자열은 숫자로 취급하지 않는다.
 */
function toFiniteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: NextRequest) {
  const serverTime = new Date().toISOString();

  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const sessionUser = normalizeSessionUser(session.user);
    const actorId = userId(sessionUser);
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as GeoVerifyRequest;
    const action = body.action === 'check_out' ? 'check_out' : 'check_in';
    const latitude = toFiniteOrNull(body.latitude);
    const longitude = toFiniteOrNull(body.longitude);
    const accuracy = toFiniteOrNull(body.accuracy);

    const violations: string[] = [];

    // 1) 거리 — 클라이언트가 계산해 보낸 거리는 아예 받지 않는다. 좌표만 받아
    //    서버가 같은 Haversine 으로 다시 계산한다.
    let distanceM: number | null = null;
    if (latitude === null || longitude === null) {
      violations.push('no_coordinates');
    } else {
      const raw = calculateDistance({ latitude, longitude }, WORKPLACE_LOCATION);
      distanceM = Number.isFinite(raw) ? Math.round(raw) : null;
      if (distanceM === null) {
        violations.push('no_coordinates');
      } else if (distanceM > ALLOWED_DISTANCE_M) {
        violations.push('out_of_range');
      }
      if (accuracy !== null && accuracy > ACCURACY_UNRELIABLE_M) {
        violations.push('low_accuracy');
      }
    }

    // 2) 시계 — 단말 시계를 신뢰하지 않는다. 얼마나 벌어졌는지만 남긴다.
    let clockSkewMs: number | null = null;
    if (body.clientTime) {
      const clientMs = Date.parse(String(body.clientTime));
      if (Number.isFinite(clientMs)) {
        clockSkewMs = clientMs - Date.parse(serverTime);
        if (Math.abs(clockSkewMs) > CLOCK_SKEW_TOLERANCE_MS) {
          violations.push('clock_skew');
        }
      } else {
        violations.push('invalid_client_time');
      }
    }

    // 3) bypass 신고 — 클라이언트가 개발용 우회 경로로 통과했다고 밝힌 경우.
    //    운영에서 이 값이 올라오면 그 자체가 조사 대상이다.
    if (body.clientBypass === true) {
      violations.push('client_bypass_flag');
    }

    const withinRange = distanceM !== null && distanceM <= ALLOWED_DISTANCE_M;

    /**
     * 차단 판정은 **서버가 한다.** 클라이언트마다 정책을 다시 쓰면 PC 와 모바일이
     * 또 갈라진다(그게 애초에 이 라우트를 만든 이유다).
     *
     * 반경 밖일 때만 막는다. 좌표를 못 받은 경우(권한 거부·실내 GPS 실패)나
     * 정확도가 낮은 경우는 막지 않는다 — 위치를 못 잡는 단말이 출근을 못 하면
     * 운영이 멈춘다. 그 경우는 기록만 남기고 통과시킨다.
     *
     * 남는 구멍 하나를 분명히 해 둔다. 클라이언트가 좌표를 아예 보내지 않으면
     * 서버는 거리를 알 수 없어 막을 수 없다. `bypass_gps` 우회 경로가 살아 있는
     * 한 이 차단은 "정상 단말에서 반경 밖 출근을 막는" 수준이고, 의도적 우회는
     * 막지 못한다(우회 사실은 감사로그에 남는다). 완전히 닫으려면 우회 경로를
     * 프로덕션 번들에서 제거해야 하는데, 그러면 위치 권한이 막힌 단말의
     * 대응 수단도 함께 사라진다 — 그 교환은 운영 판단이다.
     */
    const blocked = violations.includes('out_of_range');
    const blockReason = blocked
      ? `사업장에서 ${distanceM?.toLocaleString() ?? '?'}m 떨어진 위치입니다. `
        + `허용 반경은 ${ALLOWED_DISTANCE_M.toLocaleString()}m 입니다.`
      : null;

    if (violations.length > 0) {
      // 실패시키지 않고 남긴다 — 위 파일 상단의 "왜 거부하지 않는가" 참고.
      await logAudit(
        '출퇴근위치검증위반',
        'attendance',
        `${actorId}:${String(body.date || '').slice(0, 10)}:${action}`,
        {
          action,
          date: body.date ?? null,
          violations,
          server_distance_m: distanceM,
          allowed_distance_m: ALLOWED_DISTANCE_M,
          accuracy_m: accuracy,
          clock_skew_ms: clockSkewMs,
          client_bypass: body.clientBypass === true,
          server_time: serverTime,
          client_time: body.clientTime ?? null,
        },
        actorId,
        sessionUser.name ?? undefined,
      );
    }

    const response: GeoVerifyResponse = {
      ok: true,
      serverTime,
      distanceM,
      allowedDistanceM: ALLOWED_DISTANCE_M,
      withinRange,
      violations,
      blocked,
      blockReason,
    };
    return NextResponse.json(response);
  } catch (error) {
    // 검증 라우트가 죽어도 출퇴근 자체는 막지 않는다(클라이언트가 폴백한다).
    console.error('[attendance/geo-verify] 검증 실패:', error);
    return NextResponse.json(
      { error: '출퇴근 위치 검증에 실패했습니다.', serverTime },
      { status: 500 },
    );
  }
}
