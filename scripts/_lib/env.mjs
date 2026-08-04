/**
 * scripts/_lib/env.mjs
 *
 * .env.local 파서 하나. 예전에는 스크립트마다 제각기 정규식을 써서
 * 같은 파일을 서로 다르게 읽었다 — 어떤 것은 `^([A-Z0-9_]+)=`, 어떤 것은 `^([^=]+)=`,
 * 어떤 것은 값에서 따옴표를 전부 지웠다.
 *
 * 특히 값 안의 따옴표를 전부 제거하던 변종은 bcrypt 해시처럼 특수문자가 든 값을
 * 조용히 망가뜨렸다. 여기서는 값을 감싼 따옴표 한 쌍만 벗긴다.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * .env 형식 텍스트를 key/value 로 파싱한다.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();

    // 값을 감싼 따옴표 한 쌍만 벗긴다. 안쪽 따옴표는 값의 일부이므로 건드리지 않는다.
    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    if (quoted) {
      value = quoted[2];
      // 큰따옴표로 감싼 경우에만 \n 등 이스케이프를 해석한다 (.env 관례).
      if (quoted[1] === '"') {
        value = value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
      }
    }

    out[key] = value;
  }
  return out;
}

/**
 * 저장소 루트의 .env.local 을 읽어 파싱한다. 없으면 빈 객체.
 * @param {string} [rootDir] 기본값: process.cwd()
 */
export function loadEnvLocal(rootDir = process.cwd()) {
  const envPath = path.join(rootDir, '.env.local');
  if (!fs.existsSync(envPath)) return {};
  return parseEnv(fs.readFileSync(envPath, 'utf8'));
}

/**
 * .env.local 값을 process.env 에 채운다. 이미 있는 값은 덮지 않는다.
 * @param {string} [rootDir]
 * @returns {string[]} 새로 채운 키 목록
 */
export function applyEnvLocal(rootDir = process.cwd()) {
  const parsed = loadEnvLocal(rootDir);
  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied.push(key);
    }
  }
  return applied;
}

/**
 * 필수 값을 읽는다. 없으면 즉시 종료 — 빈 자격증명으로 원격을 호출해
 * "인증 실패"라는 엉뚱한 오류를 보는 것보다 여기서 멈추는 편이 낫다.
 * @param {string} key
 * @param {string} [rootDir]
 */
export function requireEnv(key, rootDir = process.cwd()) {
  const value = process.env[key] ?? loadEnvLocal(rootDir)[key];
  if (!value) {
    console.error(`오류: ${key} 가 설정되지 않았습니다 (.env.local 또는 환경변수).`);
    process.exit(1);
  }
  return value;
}
