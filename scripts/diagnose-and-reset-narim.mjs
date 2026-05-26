// ============================================================
// diagnose-and-reset-narim.mjs
// 보안 사고 대응: 이나림 계정 무단 로그인 원인 진단 + 비밀번호 강제 리셋.
//
// 1) 이나림 계정의 현재 비밀번호 "형태"만 조회 (값 자체는 출력 안 함)
// 2) production master-login에 이나림 + 무작위 비번으로 1회 호출 → 무단 통과 여부 실증
// 3) 이나림 비밀번호를 강한 무작위 값(bcrypt)으로 강제 리셋
//
// 실행: node scripts/diagnose-and-reset-narim.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const BASE = 'https://erp.pchos.kr';

const env = {};
try {
  const raw = readFileSync(join(import.meta.dirname, '../.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
} catch (e) { console.error('.env.local 읽기 실패:', e.message); process.exit(1); }

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Supabase 설정 없음'); process.exit(1); }
const supabase = createClient(url, key);

// ── 1. 이나림 원래 비밀번호 형태 조회 (값 노출 안 함) ──────────
const { data: narimRows, error: selErr } = await supabase
  .from('staff_members')
  .select('id, employee_no, name, status, password, passwd')
  .eq('name', '이나림');
if (selErr) { console.error('이나림 조회 실패:', selErr.message); process.exit(1); }
if (!narimRows || narimRows.length === 0) { console.error('이나림 계정 없음'); process.exit(1); }
if (narimRows.length > 1) { console.log(`⚠ 이나림 동명 계정 ${narimRows.length}건 — 첫 번째 사용`); }
const narim = narimRows[0];

const describePw = (v) => {
  const s = String(v ?? '');
  if (!s) return 'null/빈값';
  return `length=${s.length}, prefix="${s.slice(0, 4)}", bcrypt=${s.startsWith('$2')}`;
};
console.log('[1] 이나림 계정 현재 상태');
console.log(`    id=${narim.id} 사번=${narim.employee_no} status=${narim.status}`);
console.log(`    password: ${describePw(narim.password)}`);
console.log(`    passwd  : ${describePw(narim.passwd)}`);

// ── 2. master-login 무단 통과 실증 (무작위 비번 1회) ──────────
const probePw = 'probe_' + randomBytes(10).toString('hex');
let probeStatus = 0, probeJson = null;
try {
  const res = await fetch(`${BASE}/api/auth/master-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: '이나림', password: probePw }),
  });
  probeStatus = res.status;
  probeJson = await res.json().catch(() => null);
} catch (e) {
  console.log(`[2] master-login 진단 호출 실패: ${e.message}`);
}
console.log('\n[2] master-login 무단 통과 실증 (이나림 + 무작위 비번)');
console.log(`    HTTP ${probeStatus}, success=${probeJson?.success}`);
if (probeJson?.notice) console.log(`    notice="${probeJson.notice}"`);
if (probeJson?.error) console.log(`    error="${probeJson.error}"`);
if (probeJson?.success === true) {
  console.log('    ✗ 무단 로그인 통과 — 취약점 확인됨');
  if (probeJson?.notice?.includes('비밀번호가 설정')) {
    console.log('    → first-login 경로 (비밀번호 미설정으로 인식되어 자동 설정·로그인)');
  } else {
    console.log('    → 비밀번호 검증 통과 경로');
  }
} else {
  console.log('    ✓ 무단 로그인 차단됨 (현 시점)');
}

// ── 3. 이나림 비밀번호 강제 리셋 (강한 무작위 bcrypt) ──────────
const newPw = randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
const hash = await bcrypt.hash(newPw, 10);
const { error: updErr } = await supabase
  .from('staff_members')
  .update({ password: hash, passwd: null })
  .eq('id', narim.id);
if (updErr) { console.error('\n[3] 비밀번호 리셋 실패:', updErr.message); process.exit(1); }
console.log('\n[3] 이나림 비밀번호 강제 리셋 완료 (bcrypt 해시 저장)');
console.log(`    새 임시 비밀번호: ${newPw}`);
console.log('    → 이나림 본인에게만 전달하고, 첫 로그인 후 즉시 변경하도록 안내하세요.');
