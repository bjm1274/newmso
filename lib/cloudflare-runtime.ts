/**
 * Cloudflare Workers 런타임 판별.
 *
 * OpenNext 워커 엔트리와 `initOpenNextCloudflareForDev()` 는
 * `Symbol.for('__cloudflare-context__')` 를 globalThis 에 심는다.
 * Workers 런타임에는 `WebSocketPair` 가 있다.
 *
 * Node.js (Oracle Docker / next start / server.mjs) 에서는 둘 다 없다.
 * 그런데 `@opennextjs/cloudflare` 의 `getCloudflareContext({ async: true })` 는
 * Node 에서 컨텍스트가 없으면 throw 하지 않고 wrangler `getPlatformProxy()` 를
 * 띄운다. 그 과정에서 Node 빌트인(zlib 등)이 패치되어
 * `The "original" argument must be of type Function` 이 나고 페이지가 죽는다.
 */
export function isCloudflareWorkerRuntime(): boolean {
  if (typeof globalThis === 'undefined') return false;
  const g = globalThis as any;
  if (g[Symbol.for('__cloudflare-context__')]) return true;
  if (typeof g.WebSocketPair === 'function') return true;
  return false;
}
