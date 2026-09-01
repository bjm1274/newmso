import fs from 'fs';
import path from 'path';
import os from 'os';

function searchForToken(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const p = path.join(dir, f);
      try {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          if (f === '.wrangler' || f === 'wrangler' || f === 'config') {
            searchForToken(p);
          }
        } else if (f === 'default.json' || f === 'config.json') {
          console.log('Found config at:', p);
          const content = fs.readFileSync(p, 'utf-8');
          if (content.includes('oauth_token')) {
            console.log('FOUND TOKEN IN:', p);
            return p;
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

const home = os.homedir();
searchForToken(path.join(home, 'AppData', 'Roaming'));
searchForToken(path.join(home, 'AppData', 'Local'));
searchForToken(home);
