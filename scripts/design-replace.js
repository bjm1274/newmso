const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');
const pairs = [
  ['border-gray-400', 'border-[var(--toss-border)]'],
  ['border-gray-800', 'border-[var(--foreground)]'],
  ['border-gray-900', 'border-[var(--foreground)]'],
  ['divide-gray-100', 'divide-[var(--toss-border)]'],
  ['focus:ring-gray-200', 'focus:ring-[var(--toss-border)]'],
  ['focus:ring-blue-500', 'focus:ring-[var(--toss-blue)]/30'],
  ['focus:border-blue-600', 'focus:border-[var(--toss-blue)]'],
];

function walk(dir) {
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.tsx')) {
        let content = fs.readFileSync(full, 'utf8');
        for (const [from, to] of pairs) {
          if (content.includes(from)) content = content.split(from).join(to);
        }
        fs.writeFileSync(full, content, 'utf8');
      }
    }
  } catch (e) {}
}

walk(appDir);
console.log('Done.');
process.exit(0);
