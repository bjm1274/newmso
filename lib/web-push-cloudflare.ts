/**
 * Web Push API — Cloudflare Workers 호환 (web-push 라이브러리 대체)
 * VAPID JWT 서명 + ECDH + HKDF + AES-128-GCM 암호화를 Web Crypto API로 구현
 * 규격: RFC 8291 (Message Encryption), RFC 8292 (VAPID)
 */

export type WebPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getVapidConfig() {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    throw new Error('Web Push VAPID keys are not configured.');
  }

  return { publicKey, privateKey, subject };
}

export function ensureWebPushConfigured() {
  const { publicKey, subject } = getVapidConfig();
  return { publicKey, subject };
}

// TypeScript 5 Uint8Array<ArrayBufferLike> → ArrayBuffer 호환 헬퍼
function buf(u8: Uint8Array): ArrayBuffer {
  return new Uint8Array(u8).buffer as ArrayBuffer;
}

// base64url decode
function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b64.length % 4)) % 4;
  const padded = b64 + '='.repeat(pad);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// base64url encode
function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function createVapidJwt(audience: string): Promise<{ jwt: string; publicKeyBytes: Uint8Array }> {
  const { privateKey, publicKey } = getVapidConfig();

  const privateKeyBytes = b64urlToBytes(privateKey);
  if (privateKeyBytes.length !== 32) {
    throw new Error(
      `VAPID_PRIVATE_KEY must decode to exactly 32 bytes (P-256 scalar), got ${privateKeyBytes.length} bytes. ` +
        'Ensure the key is a base64url-encoded raw 32-byte EC private key.'
    );
  }
  const publicKeyBytes = b64urlToBytes(publicKey);

  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: bytesToB64url(privateKeyBytes),
    x: bytesToB64url(publicKeyBytes.slice(1, 33)),
    y: bytesToB64url(publicKeyBytes.slice(33, 65)),
  };

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const now = Math.floor(Date.now() / 1000);
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 3600,
    sub: getVapidConfig().subject,
  })));

  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(signingInput)));

  // Web Crypto ECDSA sign()는 IEEE P1363 raw(r||s) 형식으로 반환 — DER 변환 불필요
  const r = sig.slice(0, 32);
  const s = sig.slice(32, 64);
  const rawSig = concat(r, s);

  return { jwt: `${header}.${payload}.${bytesToB64url(rawSig)}`, publicKeyBytes };
}

// RFC 5869 HKDF-Extract: HMAC-SHA256(salt, ikm) → PRK
async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const saltKey = await crypto.subtle.importKey('raw', buf(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, buf(ikm)));
}

// RFC 5869 HKDF-Expand: HMAC-SHA256(prk, info || 0x01) → OKM (単一ブロック ≤ 32 bytes)
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prkKey = await crypto.subtle.importKey('raw', buf(prk), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  // T(1) = HMAC-SHA256(PRK, info || 0x01) — 단일 레코드이므로 T(0)=empty, counter=1
  const t1 = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, buf(concat(info, new Uint8Array([1])))));
  return t1.slice(0, length);
}

// Web Crypto HKDF (Extract+Expand 합산): CEK, nonce 도출에 사용
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) },
    keyMaterial,
    length * 8,
  );
  return new Uint8Array(derived);
}

// RFC 8291 §3.3: encryptPayload — aes128gcm
// body = salt(16) || rs(4, BE=4096) || idlen(1=65) || as_public(65) || AES-128-GCM(plaintext || 0x02)
async function encryptPayload(
  clientPublicKeyBytes: Uint8Array,
  authSecret: Uint8Array,
  payloadText: string,
): Promise<{ body: Uint8Array; serverPublicKey: Uint8Array; salt: Uint8Array }> {
  // 발송 서버 임시(ephemeral) ECDH 키 쌍 생성
  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey));

  // 클라이언트 공개키 import
  const clientKey = await crypto.subtle.importKey('raw', buf(clientPublicKeyBytes), { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  // ECDH 공유 비밀 (256비트 = 32바이트)
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeyPair.privateKey, 256));

  // salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 §3.3 IKM 도출:
  //   PRK  = HKDF-Extract(salt=auth_secret, IKM=ecdh_shared_secret)
  //   info = "WebPush: info\0" || ua_public(65) || as_public(65)
  //   IKM  = HKDF-Expand(PRK, info, 32)
  const prk = await hkdfExtract(authSecret, sharedSecret);
  const keyInfo = concat(
    new TextEncoder().encode('WebPush: info\x00'),
    clientPublicKeyBytes,   // ua_public: 구독자 P-256 공개키 (uncompressed, 65바이트)
    serverPublicKeyRaw,     // as_public: 임시 서버 공개키 (uncompressed, 65바이트)
  );
  const ikm = await hkdfExpand(prk, keyInfo, 32);

  // CEK = HKDF(salt, IKM, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\x00');
  const contentEncryptionKey = await hkdf(salt, ikm, cekInfo, 16);

  // nonce = HKDF(salt, IKM, "Content-Encoding: nonce\0", 12)
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\x00');
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // plaintext || 0x02 (단일 레코드 패딩 구분자, RFC 8188 §2.2)
  const payloadBytes = new TextEncoder().encode(payloadText);
  const padded = concat(payloadBytes, new Uint8Array([0x02]));

  // AES-128-GCM 암호화 (GCM tag 16바이트 자동 포함)
  const aesKey = await crypto.subtle.importKey('raw', buf(contentEncryptionKey), 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aesKey, buf(padded)));

  // RFC 8188 §2.1 body = salt(16) || rs(4, BE) || idlen(1) || keyid(65) || ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false); // record size = 4096
  const idlen = new Uint8Array([65]);
  const body = concat(salt, rs, idlen, serverPublicKeyRaw, ciphertext);

  return { body, serverPublicKey: serverPublicKeyRaw, salt };
}

export async function sendWebPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<Response> {
  const clientPublicKey = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);

  const { body } = await encryptPayload(clientPublicKey, authSecret, payload);

  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const { jwt, publicKeyBytes } = await createVapidJwt(audience);

  // RFC 8291: Content-Encoding: aes128gcm 만 사용 (Crypto-Key/Encryption 헤더 불필요)
  // RFC 8292: Authorization: vapid t=<jwt>, k=<public> 형식
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(body.byteLength),
      Authorization: `vapid t=${jwt}, k=${bytesToB64url(publicKeyBytes)}`,
      TTL: '60',
      Urgency: 'high',
    },
    body: buf(body),
  });

  if (!response.ok) {
    const err = new Error(`Web Push failed: HTTP ${response.status}`) as Error & { statusCode: number };
    err.statusCode = response.status;
    throw err;
  }

  return response;
}
