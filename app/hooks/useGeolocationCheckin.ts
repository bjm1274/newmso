'use client';

/**
 * useGeolocationCheckin — 출퇴근 체크인 전용 위치 확인 훅
 *
 * - getCurrentPosition을 1회 요청하고 결과/오류 상태를 노출한다.
 * - 권한 거부(PERMISSION_DENIED)는 'denied', 그 외 오류는 'error'로 구분해
 *   호출부가 사용자 메시지를 다르게 제공할 수 있게 한다.
 *
 * JM:  단일 책임, ~80줄
 * JM3: 위치 거부/오류 사용자 메시지 분리 (status로 신호)
 * JM4: any 금지, 명시적 타입
 */

import { useCallback, useState } from 'react';

export type GeolocationCheckinStatus =
  | 'idle'
  | 'requesting'
  | 'success'
  | 'error'
  | 'denied';

export type GeolocationCheckinCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type GeolocationCheckinState = {
  status: GeolocationCheckinStatus;
  coords: GeolocationCheckinCoords | null;
  error: string | null;
};

export type UseGeolocationCheckinResult = GeolocationCheckinState & {
  requestLocation: () => void;
  reset: () => void;
};

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
};

const INITIAL_STATE: GeolocationCheckinState = {
  status: 'idle',
  coords: null,
  error: null,
};

export function useGeolocationCheckin(
  options: PositionOptions = DEFAULT_OPTIONS,
): UseGeolocationCheckinResult {
  const [state, setState] = useState<GeolocationCheckinState>(INITIAL_STATE);

  const requestLocation = useCallback(() => {
    setState({ status: 'requesting', coords: null, error: null });

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({
        status: 'error',
        coords: null,
        error: '브라우저가 위치 정보를 지원하지 않습니다.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'success',
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
          error: null,
        });
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setState({
          status: denied ? 'denied' : 'error',
          coords: null,
          error: denied
            ? '위치 권한이 차단되어 있습니다. 브라우저 또는 앱 설정에서 위치 권한을 허용해 주세요.'
            : err.message || '위치 정보를 가져오지 못했습니다.',
        });
      },
      options,
    );
  }, [options]);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, requestLocation, reset };
}
