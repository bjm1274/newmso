#!/usr/bin/env node
// ============================================================
// merge-and-verify.mjs
// d1_schema.sql + d1_schema_missing.sql → d1_schema_final.sql
//
// 검증:
//  - 중복 CREATE TABLE 탐지
//  - DB 실측(126개) vs final.sql 테이블 수 비교
//  - 사이즈/줄 수 리포트
// ============================================================

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'scripts', 'migrate-d1', 'output');

const BASE = join(OUT_DIR, 'd1_schema.sql');
const MISSING = join(OUT_DIR, 'd1_schema_missing.sql');
const FINAL = join(OUT_DIR, 'd1_schema_final.sql');

const DB_TABLE_COUNT_EXPECTED = 125; // 126 - attendances_20260513_bulk_backup
const EXCLUDED = new Set(['attendances_20260513_bulk_backup']);

function extractTableNames(sql) {
  const names = new Set();
  const re = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_가-힣][a-zA-Z0-9_가-힣]*)["`]?\s*\(/gim;
  let m;
  while ((m = re.exec(sql)) !== null) names.add(m[1]);
  return names;
}

// base SQL에서 지정된 테이블 이름의 CREATE TABLE 블록을 제거
// (information_schema 기반 missing 정의가 더 정확하므로 우선)
function removeTableBlocks(sql, tableSet) {
  const lines = sql.split('\n');
  const out = [];
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipping) {
      // CREATE TABLE 블록의 끝: ')' 또는 ');'로 끝나는 줄
      if (/^\s*\)\s*;?\s*$/.test(line)) skipping = false;
      continue;
    }
    const m = line.match(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_가-힣][a-zA-Z0-9_가-힣]*)["`]?\s*\(/i);
    if (m && tableSet.has(m[1])) {
      skipping = true;
      // 직전의 -- 주석 줄도 함께 제거
      while (out.length > 0 && /^\s*--/.test(out[out.length - 1])) out.pop();
      // 직전 빈 줄도 정리
      while (out.length > 0 && /^\s*$/.test(out[out.length - 1])) out.pop();
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

async function main() {
  const baseSql = await readFile(BASE, 'utf8');
  const missingSql = await readFile(MISSING, 'utf8');

  const baseTables = extractTableNames(baseSql);
  const missingTables = extractTableNames(missingSql);

  // missing.sql이 이제 125개 활성 전체 (information_schema 기반)
  // base에서는 잉여 11개(DB에 없지만 마이그레이션 SQL에 있는 미적용)만 추출
  const surplus = [...baseTables].filter((n) => !missingTables.has(n));
  console.log(`▸ missing(information_schema): ${missingTables.size}개`);
  console.log(`▸ base에서 잉여 ${surplus.length}개 추출 (미적용 마이그레이션)`);

  // base에서 잉여 테이블의 CREATE TABLE 블록과 인덱스만 추출
  function keepOnlySurplusBlocks(sql, keepSet) {
    const lines = sql.split('\n');
    const out = [];
    let inBlock = false;
    let keepBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (inBlock) {
        if (keepBlock) out.push(line);
        if (/^\s*\)\s*;?\s*$/.test(line)) { inBlock = false; keepBlock = false; }
        continue;
      }
      const ct = line.match(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_가-힣][a-zA-Z0-9_가-힣]*)["`]?\s*\(/i);
      if (ct) {
        inBlock = true;
        keepBlock = keepSet.has(ct[1]);
        if (keepBlock) out.push(line);
        continue;
      }
      const idx = line.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX[\s\S]*?ON\s+["`]?([a-zA-Z_가-힣][a-zA-Z0-9_가-힣]*)["`]?/i);
      if (idx) {
        if (keepSet.has(idx[1])) out.push(line);
        continue;
      }
    }
    return out.join('\n');
  }

  const baseSurplus = keepOnlySurplusBlocks(baseSql, new Set(surplus));

  const missingBody = missingSql
    .replace(/^-- =+[\s\S]*?-- =+\n+/, '')
    .replace(/^PRAGMA\s+foreign_keys\s*=\s*ON;\s*\n+/m, '');

  const finalSql = [
    '-- ============================================================',
    '-- D1 통합 최종 스키마 (auto-generated)',
    `-- 생성일: ${new Date().toISOString()}`,
    `-- 125개 활성(information_schema) + 잉여 ${surplus.length}개(마이그레이션 SQL)`,
    '-- ============================================================',
    '',
    'PRAGMA foreign_keys = ON;',
    '',
    '-- ── 125개 활성 테이블 (DB 실측 기반) ──',
    missingBody,
    '',
    `-- ── 잉여 ${surplus.length}개 (미적용 마이그레이션) ──`,
    baseSurplus,
  ].join('\n');

  await writeFile(FINAL, finalSql);

  // 검증
  const finalTables = extractTableNames(finalSql);
  const dbAll = new Set([
    // 126개 DB 테이블 (CSV에서 받은 목록)
    'access_logs','annual_leave_promotion_logs','approval_history','approval_templates',
    'approvals','asset_loans','attendance','attendance_corrections','attendance_deduction_rules',
    'attendances','attendances_20260513_bulk_backup','audit_logs','backup_restore_runs',
    'board_post_comments','board_post_likes','board_post_reads','board_posts',
    'certificate_issuances','chat_messages','chat_push_jobs','chat_room_favorites',
    'chat_room_prefs','chat_rooms','companies','company_expenses','company_holidays',
    'contract_templates','corporate_card_transactions','corporate_cards','daily_checks',
    'daily_closure_items','daily_closures','delivery_confirmations',
    'department_private_inventory_items','department_private_inventory_logs',
    'device_inspections','discharge_reviews','discharge_templates','document_repository',
    'document_versions','education_records','employment_contracts','freelancer_payments',
    'generated_reports','handover_notes','health_checkups','incident_reports','inventory',
    'inventory_categories','inventory_closing_snapshots','inventory_cost_entries',
    'inventory_count_sessions','inventory_logs','inventory_price_history','inventory_receipts',
    'inventory_transfers','job_categories','job_category_required_trainings','leave_balances',
    'leave_requests','medical_devices','message_bookmarks','message_reactions','message_reads',
    'messages','messenger_drive_links','monthly_off_quota','mri_templates',
    'notification_templates','notifications','official_doc_log','onboarding_checklists',
    'op_check_templates','op_patient_checks','org_teams','payroll','payroll_approval_logs',
    'payroll_approval_workflows','payroll_bonus_items','payroll_calendar_items',
    'payroll_deduction_controls','payroll_locks','payroll_policy_versions','payroll_records',
    'payroll_retro_adjustments','personnel_appointments','pinned_messages','poll_votes',
    'polls','popups','posts','purchase_orders','push_subscriptions','report_schedules',
    'retirement_pensions','reward_discipline','room_notification_settings','room_read_cursors',
    'salary_change_history','scheduled_messages','shift_assignments','staff_certifications',
    'staff_evaluations','staff_job_categories','staff_licenses','staff_members',
    'staff_preferred_off','staff_shift_assignments','staff_trainings','staff_transfer_history',
    'suppliers','surgery_templates','system_configs','system_settings','tasks',
    'tax_free_settings','tax_insurance_rates','tax_reports','todo_reminder_logs','todos',
    'unpaid_absence_records','virtual_account_deposits','wiki_document_versions',
    'wiki_documents','wiki_folders','work_shifts',
  ]);

  const dbActive = [...dbAll].filter((n) => !EXCLUDED.has(n));
  const finalArr = [...finalTables];

  const inFinalNotDb = finalArr.filter((n) => !dbAll.has(n));
  const inDbNotFinal = dbActive.filter((n) => !finalTables.has(n));

  console.log('');
  console.log('═══ 검증 결과 ═══');
  console.log(`d1_schema.sql 테이블:        ${baseTables.size}`);
  console.log(`d1_schema_missing.sql 테이블: ${missingTables.size}`);
  console.log(`surplus (잉여):               ${surplus.length}`);
  console.log(`final 테이블 (unique):        ${finalTables.size}`);
  console.log(`기대 (DB - excluded):         ${dbActive.length}`);
  console.log('');
  if (inDbNotFinal.length > 0) {
    console.log(`⚠ DB에 있지만 final에 없음 (${inDbNotFinal.length}개):`);
    inDbNotFinal.forEach((n) => console.log(`   - ${n}`));
  } else {
    console.log('✓ DB의 모든 활성 테이블이 final에 포함됨');
  }
  if (inFinalNotDb.length > 0) {
    console.log(`⚠ final에 있지만 DB에 없음 — 잉여 ${inFinalNotDb.length}개 (미적용 마이그레이션):`);
    inFinalNotDb.forEach((n) => console.log(`   - ${n}`));
  }
  console.log('');
  console.log(`✓ 출력: ${FINAL}`);
  console.log(`  크기: ${Math.round((finalSql.length / 1024) * 10) / 10} KB`);
  console.log(`  줄 수: ${finalSql.split('\n').length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
