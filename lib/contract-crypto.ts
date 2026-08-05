/**
 * 계약서 PII(서명 이미지 base64 · 주소 · 연락처) 암호화 헬퍼.
 *
 * - AES-GCM(256bit) + Web Crypto(crypto.subtle) 사용 → Edge/Cloudflare Workers/브라우저 호환.
 * - 키: process.env.CONTRACT_ENCRYPTION_KEY (임의 길이 문자열 → SHA-256 으로 32바이트 파생).
 * - 암호문은 `enc:v1:<base64(iv||ciphertext)>` 버전 프리픽스로 표식.
 *   복호화 시 프리픽스가 없으면 평문으로 간주하고 그대로 반환 → 기존 평문 레코드 하위호환.
 *
 * ── 이 모듈이 이렇게 생긴 이유 (D04-001) ──────────────────────────────
 * 예전에는 `encryptContract` 가 키를 못 찾으면 **경고 한 줄 찍고 평문을 그대로
 * 반환**했다. 그런데 호출처가 전부 `'use client'` 파일이었고, `NEXT_PUBLIC_`
 * 접두사가 없는 env 는 클라이언트 번들에 인라인되지 않는다. 즉 브라우저에서
 * `getRawKey()` 는 **항상 빈 문자열**이었고, 결과적으로 근로계약서 사본(서명
 * 이미지·주소·연락처 포함)은 **한 번도 암호화된 적이 없다.** 문서에는 '적용
 * 완료'로 적혀 있었지만 실제로는 통제가 동작한 적이 없었다.
 *
 * 그래서 두 가지를 바꾼다.
 *   (a) 기본 API(`encryptContract`)는 암호화하지 못하면 **던진다.** 조용한 평문
 *       저장이 더 이상 기본값이 아니다.
 *   (b) 평문 저장이 필요한 호출처는 `tryEncryptContract` 로 **명시적으로**
 *       그렇게 선언하고 사유를 로그로 남긴다. 어디가 평문으로 나가는지가
 *       코드에서 보이게 만드는 것이 목적이다.
 *
 * 읽기(`decryptContract`)는 평문·암호문을 모두 받아들인다 — 기존 데이터가
 * 전부 평문이므로 여기를 조이면 과거 계약서를 못 읽게 된다.
 *
 * **키를 `NEXT_PUBLIC_` 로 옮겨 브라우저에 노출하는 방향으로 고치면 안 된다.**
 * 그러면 모든 사용자에게 복호화 키를 배포하는 셈이라 지금보다 나빠진다.
 * 진짜 수정은 서명 저장을 서버 라우트로 옮겨 서버에서 암호화하는 것이다.
 */

const ENC_PREFIX = 'enc:v1:';
const IV_BYTES = 12; // AES-GCM 표준 nonce 길이

let warnedDecryptNoKey = false;

/** 암호화가 불가능한 사유. 로그·보고에서 원인을 구분하기 위한 코드다. */
export type ContractEncryptionUnavailableReason =
  | 'no_key_in_browser'
  | 'no_key'
  | 'no_web_crypto';

export class ContractEncryptionUnavailableError extends Error {
  readonly reason: ContractEncryptionUnavailableReason;
  constructor(reason: ContractEncryptionUnavailableReason) {
    super(`[contract-crypto] 계약 content 를 암호화할 수 없습니다 (${reason}).`);
    this.name = 'ContractEncryptionUnavailableError';
    this.reason = reason;
  }
}

function getRawKey(): string {
  return (typeof process !== 'undefined' && process.env?.CONTRACT_ENCRYPTION_KEY) || '';
}

/** 지금 이 실행 컨텍스트에서 암호화가 가능한지. 가능하면 null. */
export function getContractEncryptionUnavailableReason(): ContractEncryptionUnavailableReason | null {
  if (!getSubtle()) return 'no_web_crypto';
  if (!getRawKey()) {
    // 브라우저에서는 원리적으로 키가 올 수 없다(NEXT_PUBLIC_ 아닌 env 는 번들에 없음).
    // 설정 누락과 구분해야 "키를 넣었는데 왜 안 되지" 를 헤매지 않는다.
    return typeof window !== 'undefined' ? 'no_key_in_browser' : 'no_key';
  }
  return null;
}

function getSubtle(): SubtleCrypto | null {
  const c = (typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined);
  return c?.subtle ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') return btoa(binary);
  // Node 폴백
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function deriveKey(subtle: SubtleCrypto, rawKey: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(rawKey);
  const hash = await subtle.digest('SHA-256', material);
  return subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** 문자열이 이 모듈로 암호화된 값인지 여부. */
export function isEncryptedContract(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * 계약 content 암호화. 저장(write) 직전에 호출한다.
 *
 * 암호화할 수 없으면 **던진다** — 예전처럼 조용히 평문을 돌려주지 않는다.
 * 평문 저장을 감수해야 하는 호출처는 `tryEncryptContract` 를 쓴다.
 *
 * @throws ContractEncryptionUnavailableError 키·Web Crypto 부재
 * @throws Error 암호화 연산 자체가 실패한 경우(키는 있는데 깨진 상황 — 이때
 *   평문으로 떨어지는 것이 가장 위험하다. 반드시 실패시킨다.)
 */
export async function encryptContract(plain: string | null | undefined): Promise<string> {
  const text = plain ?? '';
  if (!text) return text;
  // 이미 암호화된 값이면 이중 암호화 방지.
  if (isEncryptedContract(text)) return text;

  const unavailable = getContractEncryptionUnavailableReason();
  if (unavailable) {
    throw new ContractEncryptionUnavailableError(unavailable);
  }

  const rawKey = getRawKey();
  const subtle = getSubtle() as SubtleCrypto;

  const key = await deriveKey(subtle, rawKey);
  const iv = new Uint8Array(IV_BYTES);
  (globalThis.crypto as Crypto).getRandomValues(iv);
  const cipher = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)),
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return `${ENC_PREFIX}${bytesToBase64(packed)}`;
}

export type ContractEncryptAttempt = {
  /** 저장할 값. encrypted=false 면 평문 그대로다. */
  value: string;
  encrypted: boolean;
  reason: ContractEncryptionUnavailableReason | null;
};

/**
 * 암호화를 시도하되, **키가 없는 환경**에서는 평문을 그대로 돌려준다.
 *
 * 예전 `encryptContract` 의 폴백과 결과는 같지만 결정적으로 다른 점이 둘 있다.
 *   1. 평문으로 나간다는 사실이 반환값(`encrypted:false`)에 드러난다. 호출처가
 *      모르고 지나칠 수 없다.
 *   2. **키가 있는데 암호화 연산이 실패한 경우는 던진다.** 그 상황에서 평문으로
 *      떨어지는 것이 원래 가장 위험한 경로였다 — 통제가 켜져 있다고 믿는 상태에서
 *      데이터만 평문으로 나간다.
 */
export async function tryEncryptContract(plain: string | null | undefined): Promise<ContractEncryptAttempt> {
  const text = plain ?? '';
  if (!text || isEncryptedContract(text)) {
    return { value: text, encrypted: isEncryptedContract(text), reason: null };
  }

  const unavailable = getContractEncryptionUnavailableReason();
  if (unavailable) {
    return { value: text, encrypted: false, reason: unavailable };
  }

  // 여기부터는 키가 있다 — 실패를 삼키지 않는다.
  const value = await encryptContract(text);
  return { value, encrypted: true, reason: null };
}

/**
 * 계약 content 복호화. 표시/인쇄(read) 직전에 호출한다.
 * - 프리픽스가 없으면(=기존 평문 레코드) 그대로 반환 → 하위호환.
 * - 프리픽스가 있으나 키/Web Crypto 가 없으면 원본을 그대로 반환(복호 불가).
 */
export async function decryptContract(stored: string | null | undefined): Promise<string> {
  const text = stored ?? '';
  if (!isEncryptedContract(text)) return text; // 평문 하위호환

  const rawKey = getRawKey();
  const subtle = getSubtle();
  if (!rawKey || !subtle) {
    if (!warnedDecryptNoKey) {
      warnedDecryptNoKey = true;
      console.warn(
        '[contract-crypto] 암호화된 계약 content 를 발견했으나 CONTRACT_ENCRYPTION_KEY 가 없어 복호화할 수 없습니다.',
      );
    }
    return text;
  }

  try {
    const packed = base64ToBytes(text.slice(ENC_PREFIX.length));
    const iv = packed.slice(0, IV_BYTES);
    const cipher = packed.slice(IV_BYTES);
    const key = await deriveKey(subtle, rawKey);
    const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    console.error('[contract-crypto] 복호화 실패 — 원본을 그대로 반환합니다.', e);
    return text;
  }
}
