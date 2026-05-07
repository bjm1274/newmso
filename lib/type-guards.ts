/**
 * Supabase 쿼리 결과 타입 안전 유틸리티
 *
 * `data as SomeType[]` 강제 캐스팅을 대체하는 검증 함수.
 * 기능 변경 없이 타입 안정성(JM4) 향상이 목적이다.
 */

/**
 * 값이 배열인지 확인하고 지정 타입 배열로 반환.
 * 배열이 아니면 빈 배열을 반환하고 개발 환경에서 경고를 출력한다.
 */
export function assertArray<T>(value: unknown, typeName?: string): T[] {
  if (!Array.isArray(value)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `Expected array${typeName ? ` of ${typeName}` : ''}, got:`,
        typeof value,
      );
    }
    return [];
  }
  return value as T[];
}

/**
 * 이중 캐스팅(`value as unknown as T`)을 단일 지점으로 집중하는 헬퍼.
 * Supabase 제네릭이 실제 반환 타입과 맞지 않을 때만 사용한다.
 */
export function assertType<T>(value: unknown): T {
  return value as T;
}
