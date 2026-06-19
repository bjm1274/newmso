/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = rawLine.indexOf('=');
    if (eqIndex === -1) continue;

    const key = rawLine.slice(0, eqIndex).trim();
    let value = rawLine.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function timestampStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(argv) {
  const options = {
    apply: argv.includes('--apply'),
    removeOrphans: !argv.includes('--keep-orphans'),
    maxPerUser: 10,
  };

  const maxArg = argv.find((arg) => arg.startsWith('--max-per-user='));
  if (maxArg) {
    const parsed = Number(maxArg.slice('--max-per-user='.length));
    if (Number.isFinite(parsed) && parsed > 0) {
      options.maxPerUser = Math.floor(parsed);
    }
  }

  return options;
}

async function selectAll(supabase, columns) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select(columns)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function isMissingColumnError(error, columnName) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return String(error?.code || '') === '42703' && message.includes(columnName.toLowerCase());
}

async function fetchAllSubscriptions(supabase) {
  const extendedColumns = [
    'id',
    'staff_id',
    'endpoint',
    'p256dh',
    'auth',
    'fcm_token',
    'device_id',
    'platform',
    'user_agent',
    'created_at',
  ].join(',');

  try {
    return {
      rows: await selectAll(supabase, extendedColumns),
      supportsDeviceColumns: true,
      supportsFcmToken: true,
    };
  } catch (error) {
    if (!isMissingColumnError(error, 'device_id')) throw error;
  }

  const fcmColumns = 'id,staff_id,endpoint,p256dh,auth,fcm_token,created_at';
  try {
    return {
      rows: await selectAll(supabase, fcmColumns),
      supportsDeviceColumns: false,
      supportsFcmToken: true,
    };
  } catch (error) {
    if (!isMissingColumnError(error, 'fcm_token')) throw error;
  }

  return {
    rows: await selectAll(supabase, 'id,staff_id,endpoint,p256dh,auth,created_at'),
    supportsDeviceColumns: false,
    supportsFcmToken: false,
  };
}

function rowTime(row) {
  const timestamp = new Date(row?.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function chooseNewest(rows) {
  return [...rows].sort((left, right) => {
    const byTime = rowTime(right) - rowTime(left);
    if (byTime !== 0) return byTime;
    return String(right.id || '').localeCompare(String(left.id || ''));
  })[0];
}

function addDeleteCandidate(candidates, row, reason) {
  if (!row?.id) return;
  const existing = candidates.get(row.id) || {
    id: row.id,
    staff_id: row.staff_id || null,
    endpoint: row.endpoint || null,
    fcm_token: row.fcm_token || null,
    device_id: row.device_id || null,
    created_at: row.created_at || null,
    reasons: [],
  };
  if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
  candidates.set(row.id, existing);
}

function groupRows(rows, keyBuilder) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyBuilder(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function markDuplicateGroups(candidates, rows, keyBuilder, reason) {
  const groups = groupRows(rows, keyBuilder);
  for (const groupRows of groups.values()) {
    if (groupRows.length <= 1) continue;
    const keep = chooseNewest(groupRows);
    for (const row of groupRows) {
      if (row.id !== keep.id) addDeleteCandidate(candidates, row, reason);
    }
  }
}

function buildDedupePlan(rows, options, supportsDeviceColumns) {
  const candidates = new Map();

  if (options.removeOrphans) {
    for (const row of rows) {
      if (!row.staff_id) addDeleteCandidate(candidates, row, 'orphan_staff_id');
    }
  }

  markDuplicateGroups(
    candidates,
    rows,
    (row) => {
      const staffId = String(row.staff_id || '').trim();
      const endpoint = String(row.endpoint || '').trim();
      return staffId && endpoint ? `staff_endpoint:${staffId}:${endpoint}` : '';
    },
    'duplicate_staff_endpoint',
  );

  markDuplicateGroups(
    candidates,
    rows,
    (row) => {
      const token = String(row.fcm_token || '').trim();
      return token ? `fcm_token:${token}` : '';
    },
    'duplicate_fcm_token',
  );

  if (supportsDeviceColumns) {
    markDuplicateGroups(
      candidates,
      rows,
      (row) => {
        const staffId = String(row.staff_id || '').trim();
        const deviceId = String(row.device_id || '').trim();
        return staffId && deviceId ? `staff_device:${staffId}:${deviceId}` : '';
      },
      'duplicate_staff_device',
    );
  }

  if (options.maxPerUser > 0) {
    const byStaff = groupRows(rows, (row) => {
      const staffId = String(row.staff_id || '').trim();
      return staffId ? `staff:${staffId}` : '';
    });
    for (const groupRows of byStaff.values()) {
      if (groupRows.length <= options.maxPerUser) continue;
      const sortedOldestFirst = [...groupRows].sort((left, right) => {
        const byTime = rowTime(left) - rowTime(right);
        if (byTime !== 0) return byTime;
        return String(left.id || '').localeCompare(String(right.id || ''));
      });
      for (const row of sortedOldestFirst.slice(0, groupRows.length - options.maxPerUser)) {
        addDeleteCandidate(candidates, row, `over_max_per_user_${options.maxPerUser}`);
      }
    }
  }

  return Array.from(candidates.values()).sort((left, right) =>
    String(left.staff_id || '').localeCompare(String(right.staff_id || '')) ||
    String(left.created_at || '').localeCompare(String(right.created_at || '')) ||
    String(left.id || '').localeCompare(String(right.id || ''))
  );
}

async function deleteByIds(supabase, ids) {
  const result = {
    deleted: 0,
    failed: [],
  };

  const batchSize = 100;
  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    const { error } = await supabase.from('push_subscriptions').delete().in('id', batch);
    if (error) {
      result.failed.push({ ids: batch, error: error.message || String(error) });
    } else {
      result.deleted += batch.length;
    }
  }

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = readEnv(path.join(process.cwd(), '.env.local'));
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const stamp = timestampStamp();
  const backupDir = path.join(process.cwd(), 'backups', `push_subscription_dedupe_${stamp}`);
  ensureDir(backupDir);

  const before = await fetchAllSubscriptions(supabase);
  const deletePlan = buildDedupePlan(before.rows, options, before.supportsDeviceColumns);
  const deleteIds = deletePlan.map((row) => row.id);

  fs.writeFileSync(
    path.join(backupDir, 'push_subscriptions_before.json'),
    JSON.stringify(before.rows, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(backupDir, 'delete_plan.json'),
    JSON.stringify(deletePlan, null, 2),
    'utf8',
  );

  const applyResult = options.apply ? await deleteByIds(supabase, deleteIds) : null;
  const after = options.apply ? await fetchAllSubscriptions(supabase) : null;

  const report = {
    generated_at: new Date().toISOString(),
    apply: options.apply,
    remove_orphans: options.removeOrphans,
    max_per_user: options.maxPerUser,
    backup_dir: backupDir,
    supports_device_columns: before.supportsDeviceColumns,
    supports_fcm_token: before.supportsFcmToken,
    scanned_before: before.rows.length,
    planned_delete_count: deletePlan.length,
    planned_delete_reasons: deletePlan.reduce((acc, row) => {
      for (const reason of row.reasons) acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {}),
    apply_result: applyResult,
    scanned_after: after?.rows?.length ?? null,
  };

  fs.writeFileSync(
    path.join(backupDir, 'dedupe_report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
