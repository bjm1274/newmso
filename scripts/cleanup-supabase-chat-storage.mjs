#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'pchos-files';
const DEFAULT_PREFIX = 'chat';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (key) {
      values[key] = value;
    }
  }
  return values;
}

const envFromFile = loadEnvFile(path.join(process.cwd(), '.env.local'));

function readEnv(name, fallback = '') {
  const value = process.env[name] ?? envFromFile[name] ?? fallback;
  return String(value || '').trim();
}

function readFlag(name) {
  return process.argv.includes(name);
}

function readOption(prefix, fallback = '') {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : fallback;
}

function encodeObjectKey(objectKey) {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildSupabasePublicUrl(supabaseUrl, bucket, objectKey) {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${encodeObjectKey(objectKey)}`;
}

async function listSupabaseObjects(supabase, bucket, prefix = '') {
  const queue = [prefix];
  const files = [];

  while (queue.length > 0) {
    const currentPrefix = queue.shift();
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error) {
        throw new Error(`${bucket}:${currentPrefix || '/'} 목록 조회 실패 - ${error.message}`);
      }

      const rows = data || [];
      for (const row of rows) {
        if (row.id === null) {
          queue.push(currentPrefix ? `${currentPrefix}/${row.name}` : row.name);
          continue;
        }

        files.push({
          key: currentPrefix ? `${currentPrefix}/${row.name}` : row.name,
          size: Number(row.metadata?.size || row.metadata?.contentLength || 0) || 0,
        });
      }

      if (rows.length < 100) break;
      offset += 100;
    }
  }

  return files;
}

async function listR2Objects(r2, bucket) {
  const keys = [];
  let continuationToken;

  do {
    const output = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of output.Contents || []) {
      if (item.Key) {
        keys.push(item.Key);
      }
    }

    continuationToken = output.IsTruncated ? output.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

async function main() {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const r2AccountId = readEnv('R2_ACCOUNT_ID');
  const r2AccessKeyId = readEnv('R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = readEnv('R2_SECRET_ACCESS_KEY');
  const r2Bucket = readEnv('R2_CHAT_BUCKET', DEFAULT_BUCKET);
  const bucket = readOption('--bucket', DEFAULT_BUCKET);
  const prefix = readOption('--prefix', DEFAULT_PREFIX).replace(/^\/+|\/+$/g, '');
  const includeRootFiles = readFlag('--include-root-files');
  const dryRun = !readFlag('--write');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  }

  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error('R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY가 필요합니다.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });

  const [prefixedObjects, rootObjects, r2Objects] = await Promise.all([
    listSupabaseObjects(supabase, bucket, prefix),
    includeRootFiles ? listSupabaseObjects(supabase, bucket, '') : Promise.resolve([]),
    listR2Objects(r2, r2Bucket),
  ]);

  const rootLevelFiles = includeRootFiles
    ? rootObjects.filter((object) => !object.key.includes('/'))
    : [];

  const objectMap = new Map();
  for (const object of [...prefixedObjects, ...rootLevelFiles]) {
    objectMap.set(object.key, object);
  }
  const objectsToDelete = [...objectMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const r2KeySet = new Set(r2Objects);
  const missingInR2 = objectsToDelete.filter((object) => !r2KeySet.has(object.key));

  if (missingInR2.length > 0) {
    throw new Error(
      `R2에 없는 원본이 있어 삭제를 중단했습니다. 첫 항목: ${missingInR2[0].key} (총 ${missingInR2.length}건)`,
    );
  }

  let referencedMessageCount = 0;
  for (const object of objectsToDelete) {
    const publicUrl = buildSupabasePublicUrl(supabaseUrl, bucket, object.key);
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('file_url', publicUrl);

    if (error) {
      throw new Error(`messages 참조 확인 실패 (${object.key}) - ${error.message}`);
    }

    referencedMessageCount += count || 0;
  }

  if (referencedMessageCount > 0) {
    throw new Error(`Supabase 원본 URL을 아직 참조 중인 메시지가 ${referencedMessageCount}건 남아 있습니다.`);
  }

  const summary = {
    bucket,
    prefix,
    includeRootFiles,
    totalObjects: objectsToDelete.length,
    totalBytes: objectsToDelete.reduce((sum, row) => sum + row.size, 0),
    referencedMessageCount,
    dryRun,
  };

  console.log(`[cleanup-supabase-chat-storage] bucket=${bucket} objects=${objectsToDelete.length} dryRun=${dryRun}`);
  console.log(JSON.stringify(summary, null, 2));

  if (dryRun || objectsToDelete.length === 0) {
    return;
  }

  for (const batch of chunk(objectsToDelete.map((object) => object.key), 100)) {
    const { data, error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      throw new Error(`원본 삭제 실패 - ${error.message}`);
    }

    console.log(`[cleanup-supabase-chat-storage] deleted batch size=${batch.length} result=${data?.length || 0}`);
  }
}

main().catch((error) => {
  console.error('[cleanup-supabase-chat-storage] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
