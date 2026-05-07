/**
 * 외부 데이터 등 타입이 불확실한 레코드를 안전하게 다루기 위한 공용 타입.
 * `any` 대신 사용하여 타입 안정성을 유지한다.
 */
export type LooseRecord = Record<string, unknown>;
