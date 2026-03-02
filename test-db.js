/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(url, key);
s.from('inventory_logs').select('*').limit(1).then(r => console.log(Object.keys(r.data[0] || {})));
