/**
 * Web Push API — Cloudflare Workers 호환 (web-push 라이브러리 대체)
 * VAPID JWT 서명 + ECDH + HKDF + AESGCM 암호화를 Web Crypto API로 구현
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

  // DER → raw r|s (각 32바이트)
  const r = sig.slice(0, 32);
  const s = sig.slice(32, 64);
  const rawSig = concat(r, s);

  return { jwt: `${header}.${payload}.${bytesToB64url(rawSig)}`, publicKeyBytes };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) },
    keyMaterial,
    length * 8,
  );
  return new Uint8Array(derived);
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);
  const header = encoder.encode('Content-Encoding: ');
  const nul = new Uint8Array([0]);
  const p256 = encoder.encode('P-256');

  return concat(
    header, typeBytes, nul,
    p256, nul,
    new Uint8Array([0, 65]), clientPublicKey,
    new Uint8Array([0, 65]), serverPublicKey,
  );
}

async function encryptPayload(
  clientPublicKeyBytes: Uint8Array,
  authSecret: Uint8Array,
  payloadText: string,
): Promise<{ body: Uint8Array; serverPublicKey: Uint8Array; salt: Uint8Array }> {
  // 서버 ECDH 키 쌍 생성
  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey));

  // 클라이언트 공개키 import
  const clientKey = await crypto.subtle.importKey('raw', buf(clientPublicKeyBytes), { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  // ECDH 공유 비밀
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeyPair.privateKey, 256));

  // salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK = HKDF-Extract(auth_secret, shared_secret)
  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0');
  const prk = await hkdf(authSecret, sharedSecret, authInfo, 32);

  // CEK = HKDF-Expand(salt, prk, cek_info, 16)
  const cekInfo = createInfo('aesgcm', clientPublicKeyBytes, serverPublicKeyRaw);
  const contentEncryptionKey = await hkdf(salt, prk, cekInfo, 16);

  // Nonce = HKDF-Expand(salt, prk, nonce_info, 12)
  const nonceInfo = createInfo('nonce', clientPublicKeyBytes, serverPublicKeyRaw);
  const nonce = await hkdf(salt, prk, nonceInfo, 12);

  // 패딩 (2바이트 패딩 길이 + 페이로드)
  const payloadBytes = new TextEncoder().encode(payloadText);
  const paddingLength = 0;
  const padded = concat(new Uint8Array([paddingLength >> 8, paddingLength & 0xff]), payloadBytes);

  // AES-128-GCM 암호화
  const aesKey = await crypto.subtle.importKey('raw', buf(contentEncryptionKey), 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aesKey, buf(padded)));

  return { body: encrypted, serverPublicKey: serverPublicKeyRaw, salt };
}

export async function sendWebPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<Response> {
  const clientPublicKey = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);

  const { body, serverPublicKey, salt } = await encryptPayload(clientPublicKey, authSecret, payload);

  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const { jwt, publicKeyBytes } = await createVapidJwt(audience);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Content-Length': String(body.byteLength),
      Encryption: `salt=${bytesToB64url(salt)}`,
      'Crypto-Key': `dh=${bytesToB64url(serverPublicKey)};p256ecdsa=${bytesToB64url(publicKeyBytes)}`,
      Authorization: `WebPush ${jwt}`,
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
