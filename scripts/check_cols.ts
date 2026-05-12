import { supabase } from './lib/supabase';

async function checkCols() {
    const { data, error } = await supabase.from('staff_members').select('*').limit(1);
    if (error) {
        console.error(error);
    } else {
        console.log("Columns:", Object.keys(data[0] || {}).join(", "));
        console.log("Sample Data:", data[0]);
    }
}
checkCols();
