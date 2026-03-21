const fs = require('fs');
const path = require('path');

// Get all tsx files with alert() from the list
const files = process.argv.slice(2);

let totalReplaced = 0;

for (const filePath of files) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    console.log(`SKIP (read error): ${filePath}`);
    continue;
  }

  // Skip if no alert( usage
  if (!content.includes('alert(')) continue;

  // Determine toast type based on message content
  function classifyAlert(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes('실패') || lower.includes('오류') || lower.includes('error') || lower.includes('없습니다') && (lower.includes('권한') || lower.includes('찾을'))) {
      return 'error';
    }
    if (lower.includes('저장') || lower.includes('완료') || lower.includes('등록') || lower.includes('수정') || lower.includes('삭제') || lower.includes('처리') || lower.includes('성공') || lower.includes('발송') || lower.includes('전송')) {
      return 'success';
    }
    if (lower.includes('입력') || lower.includes('선택') || lower.includes('확인') || lower.includes('필요') || lower.includes('올바르지') || lower.includes('유효') || lower.includes('이미')) {
      return 'warning';
    }
    return 'info';
  }

  // Replace alert() calls with toast()
  // Strategy: replace alert('...') and alert(`...`) patterns
  let newContent = content;

  // Match alert( followed by string literal or template literal or variable
  // Replace all: alert(X) -> toast(X, type)
  // We'll use a regex that matches alert( and captures the argument
  newContent = newContent.replace(/\balert\(([\s\S]*?)\);/g, (match, arg) => {
    const trimmed = arg.trim();
    // Determine type from arg content
    const type = classifyAlert(trimmed);
    if (type === 'info') {
      return `toast(${trimmed});`;
    }
    return `toast(${trimmed}, '${type}');`;
  });

  if (newContent === content) continue;

  // Add import if not already present
  const hasToastImport = newContent.includes("from '@/lib/toast'") || newContent.includes('from "@/lib/toast"');
  if (!hasToastImport) {
    // Add after 'use client'; or at the top of imports
    if (newContent.startsWith("'use client'")) {
      newContent = newContent.replace(
        /^('use client';?\n)/,
        `$1import { toast } from '@/lib/toast';\n`
      );
    } else {
      // Add before first import
      newContent = `import { toast } from '@/lib/toast';\n` + newContent;
    }
  }

  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`UPDATED: ${path.relative(process.cwd(), filePath)}`);
  totalReplaced++;
}

console.log(`\nTotal files updated: ${totalReplaced}`);
