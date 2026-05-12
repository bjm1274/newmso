/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (urlMatch && keyMatch) {
    const url = new URL(urlMatch[1].trim() + '/rest/v1/staff_members?select=*&limit=1');
    const key = keyMatch[1].trim();

    https.get(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            const parsed = JSON.parse(data);
            console.log("Columns:", Object.keys(parsed[0] || {}).join(', '));
            console.log("Data:", parsed[0]);
        });
    }).on('error', err => console.error(err));
} else {
    console.log("No env found");
}
