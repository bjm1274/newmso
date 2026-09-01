import fs from 'fs';
import path from 'path';
import os from 'os';

function findConfig(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        findConfig(p);
      } else if (f.endsWith('default.json') || f.includes('config')) {
        console.log('Found config file:', p);
      }
    }
  } catch (e) {}
}

const home = os.homedir();
console.log('Searching in', home);
findConfig(path.join(home, 'AppData', 'Roaming'));
findConfig(path.join(home, '.wrangler'));
