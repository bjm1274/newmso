import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const ignoreDirs = new Set([
  'node_modules',
  '.next',
  '.git',
  'backups',
  'data',
  '.gemini',
  '.scratch-r',
  '.open-next',
  '.wrangler',
  'agent-claw',
  'coverage',
  'build',
  'dist',
  '.claude',
  '.jscpd-report',
  'test-results'
]);

const validExts = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.sql', '.json'
]);

const statsByExt = {};
const statsByDir = {};
let coreAppFiles = 0;
let coreAppLines = 0;
let totalFiles = 0;
let totalLines = 0;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!validExts.has(ext)) continue;
      if (entry.name === 'package-lock.json' || entry.name === 'audit_result_temp.json') continue;

      const fullPath = path.join(dir, entry.name);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n').length;

        totalFiles++;
        totalLines += lines;

        const rel = path.relative(rootDir, fullPath);
        const topDir = rel.includes(path.sep) ? rel.split(path.sep)[0] : '(루트 설정/서버)';

        if (topDir === 'app' || topDir === 'lib' || topDir === '(루트 설정/서버)' || topDir === 'public') {
          coreAppFiles++;
          coreAppLines += lines;
        }

        // By Extension
        if (!statsByExt[ext]) statsByExt[ext] = { files: 0, lines: 0 };
        statsByExt[ext].files++;
        statsByExt[ext].lines += lines;

        // By Top Directory
        if (!statsByDir[topDir]) statsByDir[topDir] = { files: 0, lines: 0 };
        statsByDir[topDir].files++;
        statsByDir[topDir].lines += lines;
      } catch (err) {}
    }
  }
}

walk(rootDir);

console.log('====================================================');
console.log(` 1. 순수 프로덕션 애플리케이션 코드 (app + lib + 루트 서버)`);
console.log('====================================================');
console.log(`핵심 파일 수: ${coreAppFiles.toLocaleString()} 개`);
console.log(`핵심 라인 수: ${coreAppLines.toLocaleString()} 줄\n`);

console.log('====================================================');
console.log(` 2. 전체 소스 코드 (테스트·스크립트·문서 포함)`);
console.log('====================================================');
console.log(`전체 파일 수: ${totalFiles.toLocaleString()} 개`);
console.log(`전체 라인 수: ${totalLines.toLocaleString()} 줄\n`);

console.log('--- 확장자별 현황 ---');
for (const [ext, data] of Object.entries(statsByExt).sort((a, b) => b[1].lines - a[1].lines)) {
  console.log(`${ext.padEnd(8)} : ${String(data.files).padStart(4)}개 파일 | ${data.lines.toLocaleString().padStart(10)}줄`);
}

console.log('\n--- 디렉토리별 현황 ---');
for (const [d, data] of Object.entries(statsByDir).sort((a, b) => b[1].lines - a[1].lines)) {
  console.log(`${d.padEnd(18)} : ${String(data.files).padStart(4)}개 파일 | ${data.lines.toLocaleString().padStart(10)}줄`);
}
