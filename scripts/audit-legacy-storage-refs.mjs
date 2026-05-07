#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (key) values[key] = value;
  }
  return values;
}

const env = {
  ...loadEnvFile(path.join(process.cwd(), '.env.local')),
  ...process.env,
};

const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  process.exit(1);
}

const normalizedBaseUrl = supabaseUrl.replace(/\/+$/, '');
const legacyPrefix = `${normalizedBaseUrl}/storage/v1/object/public/`;
const client = createClient(supabaseUrl, serviceRoleKey);

const targets = [
  { table: 'messages', column: 'file_url' },
  { table: 'staff_members', column: 'avatar_url' },
  { table: 'staff_members', column: 'photo_url' },
  { table: 'document_repository', column: 'file_url' },
];

console.log('# Legacy Storage Reference Audit');
console.log(`legacyPrefix: ${legacyPrefix}`);

for (const target of targets) {
  try {
    const { count, error } = await client
      .from(target.table)
      .select(target.column, { count: 'exact', head: true })
      .like(target.column, `${legacyPrefix}%`);

    if (error) {
      console.log(`${target.table}.${target.column}: error -> ${error.message}`);
      continue;
    }

    console.log(`${target.table}.${target.column}: ${count || 0}`);
  } catch (error) {
    console.log(
      `${target.table}.${target.column}: error -> ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
