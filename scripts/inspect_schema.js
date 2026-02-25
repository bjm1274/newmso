const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rtleqrtcqucntnygzudv.supabase.co';
const supabaseKey = 'sb_publishable_EoUqPt5EyaldLFGhMWrQ-A_qCz-fNHx';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    const { data, error } = await supabase.from('staff_members').select('*').limit(1);
    if (error) {
        console.error('Error:', error);
        return;
    }
    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
        console.log('Sample Data:', data[0]);
    } else {
        console.log('No data found in staff_members');
    }
}

inspectSchema();
