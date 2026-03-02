/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rtleqrtcqucntnygzudv.supabase.co';
const supabaseKey = 'sb_publishable_EoUqPt5EyaldLFGhMWrQ-A_qCz-fNHx';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
    const { data: cos } = await supabase.from('companies').select('*').limit(1);
    if (!cos || cos.length === 0) {
        console.log('No companies found');
        return;
    }
    const co = cos[0];
    console.log('Testing update for:', co.name);
    const { error } = await supabase.from('companies').update({ memo: co.memo }).eq('id', co.id);
    if (error) {
        console.error('Update failed:', error);
    } else {
        console.log('Update successful (or RLS allowed it)');
    }
}

testUpdate();
