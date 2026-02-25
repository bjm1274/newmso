const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rtleqrtcqucntnygzudv.supabase.co';
const supabaseKey = 'sb_publishable_EoUqPt5EyaldLFGhMWrQ-A_qCz-fNHx';
const supabase = createClient(supabaseUrl, supabaseKey);

async function listTables() {
    // We can't directly list tables with standard API easily without RPC or similar,
    // but we can try to guess or use the 'org_teams' table which we know exists.
    const { data: teams, error: e1 } = await supabase.from('org_teams').select('*').limit(1);
    console.log('org_teams columns:', teams ? Object.keys(teams[0]) : 'None', e1);

    const { data: cos, error: e2 } = await supabase.from('companies').select('*').limit(1);
    console.log('companies columns:', cos ? Object.keys(cos[0]) : 'None', e2);
}

listTables();
