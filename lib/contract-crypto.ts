/**
 * 계약서 PII(서명 이미지 base64 · 주소 · 연락처) 암호화 헬퍼.
 *
 * - AES-GCM(256bit) + Web Crypto(crypto.subtle) 사용 → Edge/Cloudflare Workers/브라우저 호환.
 * - 키: process.env.CONTRACT_ENCRYPTION_KEY (임의 길이 문자열 → SHA-256 으로 32바이트 파생).
 *   키가 없으면 평문 폴백(+1회 경고) → 키 미설정 환경에서도 기존 동작 유지.
 * - 암호문은 `enc:v1:<base64(iv||ciphertext)>` 버전 프리픽스로 표식.
 *   복호화 시 프리픽스가 없으면 평문으로 간주하고 그대로 반환 → 기존 평문 레코드 하위호환.
 *
 * 서버(인쇄 API 등)와 클라이언트(표시) 양쪽에서 동일 모듈을 사용한다.
 */

const ENC_PREFIX = 'enc:v1:';
const IV_BYTES = 12; // AES-GCM 표준 nonce 길이

let warnedMissingKey = false;
let warnedDecryptNoKey = false;

function getRawKey(): string {
  return (typeof process !== 'undefined' && process.env?.CONTRACT_ENCRYPTION_KEY) || '';
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
 * 키 미설정 또는 Web Crypto 미지원 시 평문 그대로 반환(폴백).
 */
export async function encryptContract(plain: string | null | undefined): Promise<string> {
  const text = plain ?? '';
  if (!text) return text;
  // 이미 암호화된 값이면 이중 암호화 방지.
  if (isEncryptedContract(text)) return text;

  const rawKey = getRawKey();
  const subtle = getSubtle();
  if (!rawKey || !subtle) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        '[contract-crypto] CONTRACT_ENCRYPTION_KEY 미설정 또는 Web Crypto 미지원 — 계약 content 를 평문으로 저장합니다.',
      );
    }
    return text;
  }

  try {
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
  } catch (e) {
    console.error('[contract-crypto] 암호화 실패 — 평문으로 폴백합니다.', e);
    return text;
  }
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
