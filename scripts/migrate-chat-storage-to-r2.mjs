#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'pchos-files';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const values = {};
  for (const line of lines) {
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

function buildTargetUrl(bucket, objectKey, publicBaseUrl) {
  const normalizedPublicBaseUrl = String(publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (normalizedPublicBaseUrl) {
    return `${normalizedPublicBaseUrl}/${encodeObjectKey(objectKey)}`;
  }

  const params = new URLSearchParams({
    provider: 'r2',
    bucket,
    key: objectKey,
  });
  return `/api/storage/object?${params.toString()}`;
}

async function listBucketObjects(supabase, bucket) {
  const queue = [''];
  const files = [];

  while (queue.length > 0) {
    const prefix = queue.shift();
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        throw new Error(`${bucket}:${prefix || '/'} 목록 조회 실패 - ${error.message}`);
      }

      const rows = data || [];
      for (const row of rows) {
        if (row.id === null) {
          queue.push(prefix ? `${prefix}/${row.name}` : row.name);
          continue;
        }

        files.push({
          key: prefix ? `${prefix}/${row.name}` : row.name,
          size: Number(row.metadata?.size || row.metadata?.contentLength || 0) || 0,
          contentType: String(row.metadata?.mimetype || row.metadata?.contentType || 'application/octet-stream'),
          createdAt: row.created_at || null,
        });
      }

      if (rows.length < 100) break;
      offset += 100;
    }
  }

  return files;
}

async function main() {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const r2AccountId = readEnv('R2_ACCOUNT_ID');
  const r2AccessKeyId = readEnv('R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = readEnv('R2_SECRET_ACCESS_KEY');
  const r2Bucket = readEnv('R2_CHAT_BUCKET', DEFAULT_BUCKET);
  const r2PublicBaseUrl = readEnv('R2_PUBLIC_BASE_URL');
  const bucket = readOption('--bucket', DEFAULT_BUCKET);
  const limit = Number(readOption('--limit', '0')) || 0;
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

  const allObjects = await listBucketObjects(supabase, bucket);
  const objects = limit > 0 ? allObjects.slice(0, limit) : allObjects;

  const summary = {
    bucket,
    totalObjects: objects.length,
    totalBytes: objects.reduce((sum, row) => sum + row.size, 0),
    migratedObjects: 0,
    migratedBytes: 0,
    updatedMessages: 0,
    dryRun,
  };

  console.log(`[migrate-chat-storage-to-r2] bucket=${bucket} objects=${objects.length} dryRun=${dryRun}`);

  for (const [index, object] of objects.entries()) {
    const sourceUrl = buildSupabasePublicUrl(supabaseUrl, bucket, object.key);
    const targetUrl = buildTargetUrl(r2Bucket, object.key, r2PublicBaseUrl);

    const { count: messageRefs, error: messageCountError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('file_url', sourceUrl);

    if (messageCountError) {
      throw new Error(`messages 참조 수 조회 실패 (${object.key}) - ${messageCountError.message}`);
    }

    console.log(
      `[${index + 1}/${objects.length}] ${object.key} size=${object.size} bytes refs=${messageRefs || 0} -> ${targetUrl}`,
    );

    if (dryRun) {
      continue;
    }

    const sourceResponse = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!sourceResponse.ok) {
      throw new Error(`원본 파일 다운로드 실패 (${object.key}) - HTTP ${sourceResponse.status}`);
    }

    const bodyBuffer = Buffer.from(await sourceResponse.arrayBuffer());
    await r2.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: object.key,
        Body: bodyBuffer,
        ContentType: object.contentType,
        CacheControl: 'public, max-age=3600',
      }),
    );

    if (messageRefs) {
      const { error: updateError } = await supabase
        .from('messages')
        .update({ file_url: targetUrl })
        .eq('file_url', sourceUrl);

      if (updateError) {
        throw new Error(`messages URL 업데이트 실패 (${object.key}) - ${updateError.message}`);
      }
    }

    summary.migratedObjects += 1;
    summary.migratedBytes += object.size;
    summary.updatedMessages += messageRefs || 0;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[migrate-chat-storage-to-r2] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
