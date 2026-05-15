/**
 * 지리 좌표 관련 공용 유틸 (Haversine 거리 계산).
 *
 * JM:  단일 책임, ~50줄
 * JM4: any 금지, 입력 타입 명시
 */

export type LatLng = {
  latitude: number;
  longitude: number;
};

/**
 * 두 좌표 간 거리(m). Haversine 공식 사용.
 * 입력값이 유효하지 않으면 Number.POSITIVE_INFINITY를 반환해 호출부가 위치 미확정으로 판단하게 한다.
 */
export function calculateDistance(p1: LatLng, p2: LatLng): number {
  if (!isFiniteCoord(p1) || !isFiniteCoord(p2)) {
    return Number.POSITIVE_INFINITY;
  }

  const R = 6371e3; // 지구 반경 (미터)
  const phi1 = toRad(p1.latitude);
  const phi2 = toRad(p2.latitude);
  const deltaPhi = toRad(p2.latitude - p1.latitude);
  const deltaLambda = toRad(p2.longitude - p1.longitude);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function isFiniteCoord(p: LatLng | null | undefined): p is LatLng {
  return (
    !!p &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude)
  );
}
