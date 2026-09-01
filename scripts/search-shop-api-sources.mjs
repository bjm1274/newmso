import fs from 'fs';
import path from 'path';

function searchFiles(dir, pattern) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === '.next' || file === 'dist') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(searchFiles(fullPath, pattern));
    } else if (file.toLowerCase().includes(pattern.toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('Searching for "shop" files in D:\\chart...');
console.log(searchFiles('D:\\chart', 'shop'));

console.log('\nSearching for "api" or "server" files in D:\\chart...');
console.log(searchFiles('D:\\chart', 'api'));
