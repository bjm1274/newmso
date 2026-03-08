/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

function findFiles(dir) {
  let results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findFiles(full));
    } else if (item.name.endsWith('.tsx') || item.name.endsWith('.ts')) {
      results.push(full);
    }
  }

  return results;
}

const base = path.join('app', 'main', '기능부품');
const files = findFiles(base);
const errors = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/from\s+['"](\.[^'"]+)['"]/);
    if (!match) continue;

    const rel = match[1];
    if (!rel.startsWith('./') && !rel.startsWith('../')) continue;

    const dir = path.dirname(file);
    const candidates = [
      rel,
      `${rel}.tsx`,
      `${rel}.ts`,
      `${rel}.js`,
      `${rel}/index.tsx`,
      `${rel}/index.ts`,
    ];

    const exists = candidates.some((candidate) => fs.existsSync(path.join(dir, candidate)));
    if (!exists) {
      errors.push(`${file} -> ${rel}`);
    }
  }
}

if (errors.length === 0) {
  console.log('상대경로 import 모두 정상');
} else {
  errors.forEach((error) => {
    console.log(`MISSING: ${error}`);
  });
}
