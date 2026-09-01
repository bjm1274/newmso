import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

const itemsToDelete = [
  // 1. 인계노트
  'app/main/기능부품/인계노트.tsx',
  'app/main/모바일/추가기능/인계노트.tsx',

  // 2. 퇴원심사
  'app/main/기능부품/퇴원심사',
  'app/main/기능부품/퇴원심사.tsx',
  'app/main/기능부품/퇴원심사규정빌더.tsx',
  'app/main/기능부품/퇴원심사규정패널.tsx',
  'app/main/모바일/추가기능/퇴원심사목록.tsx',
  'app/main/모바일/추가기능/퇴원심사상세.tsx',
  'app/api/discharge-review',

  // 3. 수술상담
  'app/main/기능부품/수술상담-components.tsx',
  'app/main/기능부품/수술상담-types.ts',
  'app/main/기능부품/수술상담-utils.ts',
  'app/main/기능부품/수술상담.tsx',
  'app/main/모바일/추가기능/수술상담.tsx',
  'app/api/consultation',

  // 4. OP체크
  'app/main/기능부품/OP체크',
  'app/main/기능부품/OP체크.tsx',
  'app/main/기능부품/op-check-components.tsx',
  'app/main/기능부품/op-check-utils.ts',
  'app/main/모바일/추가기능/OP메시지시트.tsx',
  'app/main/모바일/추가기능/OP체크보드.tsx',
  'app/main/모바일/추가기능/OP체크상세.tsx',
  'app/main/모바일/추가기능/OP체크카드.tsx',

  // 5. ESL관리
  'app/main/기능부품/ESL관리.tsx',

  // 6. 입금 실시간조회
  'app/main/기능부품/입금실시간조회.tsx',
  'app/main/모바일/추가기능/입금조회.tsx',
  'app/api/payments/virtual-account-deposits',
  'app/api/payments/virtual-account-webhook',

  // 7. 마감보고
  'app/main/기능부품/마감보고.tsx',
  'app/main/기능부품/마감보고Grid.tsx',
  'app/main/모바일/추가기능/마감보고.tsx',
];

console.log('=== Deleting 7 features from app/... ===');

for (const relPath of itemsToDelete) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log('  Deleted:', relPath);
  }
}

// Clean empty parent dirs if any (e.g. app/api/payments if empty)
const paymentsDir = path.join(rootDir, 'app/api/payments');
if (fs.existsSync(paymentsDir) && fs.readdirSync(paymentsDir).length === 0) {
  fs.rmdirSync(paymentsDir);
  console.log('  Cleaned empty dir: app/api/payments');
}

console.log('\n✔ All target files deleted.');
