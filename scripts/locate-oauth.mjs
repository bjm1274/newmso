import fs from 'fs';
import path from 'path';
import os from 'os';

function searchJsonFiles(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        searchJsonFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const text = fs.readFileSync(fullPath, 'utf-8');
          if (text.includes('oauth_token') || text.includes('refresh_token')) {
            console.log('Found OAuth json at:', fullPath);
            const data = JSON.parse(text);
            const token = data.oauth_token || data.token;
            console.log('Token value:', token ? token.substring(0, 15) : 'none');
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

const home = os.homedir();
console.log('Searching in AppData...');
searchJsonFiles(path.join(home, 'AppData'));
