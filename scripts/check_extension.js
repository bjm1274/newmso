const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rtleqrtcqucntnygzudv.supabase.co';
const supabaseKey = 'sb_publishable_EoUqPt5EyaldLFGhMWrQ-A_qCz-fNHx';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    const { data, error } = await supabase.from('staff_members').select('*').limit(1);
    if (error) {
        console.error('Error fetching staff_members:', error);
        return;
    }
    if (data && data.length > 0) {
        console.log('Columns found:', Object.keys(data[0]));
        console.log('Has extension?:', Object.keys(data[0]).includes('extension'));
    } else {
        console.log('No data in staff_members to check columns.');
    }
}

checkColumns();
