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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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

async function fetchAllNotifications(supabase) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id,user_id,type,title,body,metadata,created_at,read_at')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function chooseCanonicalRow(group) {
  const sortedByCreatedDesc = [...group].sort((left, right) => {
    const leftTs = new Date(left.created_at || 0).getTime();
    const rightTs = new Date(right.created_at || 0).getTime();
    return rightTs - leftTs;
  });
  const readRows = sortedByCreatedDesc.filter((row) => !!row.read_at);
  return (readRows[0] || sortedByCreatedDesc[0] || group[0]);
}

function summarizeDuplicates(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const dedupeKey = row?.metadata?.dedupe_key;
    if (!dedupeKey || !row?.user_id) continue;
    const groupKey = `${row.user_id}::${dedupeKey}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(row);
  }

  return Array.from(grouped.entries())
    .map(([groupKey, groupRows]) => ({ groupKey, groupRows }))
    .filter(({ groupRows }) => groupRows.length > 1)
    .map(({ groupKey, groupRows }) => {
      const canonical = chooseCanonicalRow(groupRows);
      const mergedReadAt = groupRows
        .map((row) => row.read_at)
        .filter(Boolean)
        .sort()[0] || null;

      const deleteIds = groupRows
        .filter((row) => row.id !== canonical.id)
        .map((row) => row.id);

      return {
        groupKey,
        user_id: canonical.user_id,
        type: canonical.type,
        dedupe_key: canonical?.metadata?.dedupe_key || null,
        count: groupRows.length,
        canonical_id: canonical.id,
        canonical_created_at: canonical.created_at,
        canonical_read_at: canonical.read_at,
        merged_read_at: mergedReadAt,
        delete_ids: deleteIds,
        rows: groupRows,
      };
    });
}

async function applyDedupe(supabase, duplicateGroups) {
  const result = {
    updatedCanonicalReadAt: 0,
    deletedRows: 0,
    failedGroups: [],
  };

  for (const group of duplicateGroups) {
    try {
      if (group.merged_read_at && group.canonical_read_at !== group.merged_read_at) {
        const { error: updateError } = await supabase
          .from('notifications')
          .update({ read_at: group.merged_read_at })
          .eq('id', group.canonical_id);
        if (updateError) throw updateError;
        result.updatedCanonicalReadAt += 1;
      }

      if (group.delete_ids.length > 0) {
        const { error: deleteError } = await supabase
          .from('notifications')
          .delete()
          .in('id', group.delete_ids);
        if (deleteError) throw deleteError;
        result.deletedRows += group.delete_ids.length;
      }
    } catch (error) {
      result.failedGroups.push({
        groupKey: group.groupKey,
        error: error?.message || String(error),
      });
    }
  }

  return result;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = readEnv(path.join(process.cwd(), '.env.local'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const stamp = timestampStamp();
  const backupDir = path.join(process.cwd(), 'backups', `notification_dedupe_${stamp}`);
  ensureDir(backupDir);

  const rows = await fetchAllNotifications(supabase);
  const duplicateGroups = summarizeDuplicates(rows);

  fs.writeFileSync(
    path.join(backupDir, 'notifications_duplicates_before.json'),
    JSON.stringify({
      generated_at: new Date().toISOString(),
      apply,
      scanned_rows: rows.length,
      duplicate_group_count: duplicateGroups.length,
      duplicate_row_count: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
      duplicate_groups: duplicateGroups,
    }, null, 2),
    'utf8'
  );

  let applyResult = null;
  if (apply && duplicateGroups.length > 0) {
    applyResult = await applyDedupe(supabase, duplicateGroups);
  }

  const rowsAfter = await fetchAllNotifications(supabase);
  const duplicatesAfter = summarizeDuplicates(rowsAfter);
  const report = {
    generated_at: new Date().toISOString(),
    apply,
    backup_dir: backupDir,
    scanned_before: rows.length,
    duplicate_groups_before: duplicateGroups.length,
    duplicate_rows_before: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
    apply_result: applyResult,
    scanned_after: rowsAfter.length,
    duplicate_groups_after: duplicatesAfter.length,
    duplicate_rows_after: duplicatesAfter.reduce((sum, group) => sum + group.count, 0),
  };

  fs.writeFileSync(
    path.join(backupDir, 'dedupe_report.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
