#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const TARGET_DIRS = ['app', 'lib'];
const SKIP_SEGMENTS = ['node_modules', '.next', '.claude', '.wrangler', '.git'];
const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const tableCounts = new Map();
const wildcardCounts = new Map();
const pollingCounts = new Map();
const realtimeCounts = new Map();

function walk(dirPath, output = []) {
  if (!fs.existsSync(dirPath)) return output;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (SKIP_SEGMENTS.includes(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
      continue;
    }
    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
    output.push(fullPath);
  }

  return output;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

for (const relativeDir of TARGET_DIRS) {
  const files = walk(path.join(ROOT, relativeDir));

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(ROOT, filePath);

    for (const match of content.matchAll(/from\('([^']+)'\)/g)) {
      increment(tableCounts, match[1]);
    }

    for (const match of content.matchAll(/from\('([^']+)'\)\.select\('\*'\)/g)) {
      increment(wildcardCounts, `${match[1]} @ ${relativePath}`);
    }

    for (const match of content.matchAll(/setInterval\(|bindPageRefresh\(/g)) {
      increment(pollingCounts, relativePath);
    }

    for (const match of content.matchAll(/channel\(|subscribe\(/g)) {
      increment(realtimeCounts, relativePath);
    }
  }
}

function printSorted(title, map, limit = 20) {
  console.log(`\n## ${title}`);
  const rows = [...map.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit);
  if (rows.length === 0) {
    console.log('(none)');
    return;
  }
  rows.forEach(([key, count], index) => {
    console.log(`${index + 1}. ${key} -> ${count}`);
  });
}

console.log('# Supabase Hotspot Audit');
console.log(`workspace: ${ROOT}`);
printSorted('Top Table References', tableCounts);
printSorted('Wildcard Selects', wildcardCounts);
printSorted('Polling Hooks', pollingCounts);
printSorted('Realtime Hooks', realtimeCounts);
