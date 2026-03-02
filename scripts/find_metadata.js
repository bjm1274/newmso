/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rtleqrtcqucntnygzudv.supabase.co';
const supabaseKey = 'sb_publishable_EoUqPt5EyaldLFGhMWrQ-A_qCz-fNHr';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findMetadataTable() {
    // Try common table names
    const tables = ['system_configs', 'app_settings', 'metadata', 'org_layout'];
    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(1);
        if (!error) {
            console.log(`Table found: ${t}`, data);
            return;
        }
    }
    console.log('No common metadata tables found.');
}

findMetadataTable();
