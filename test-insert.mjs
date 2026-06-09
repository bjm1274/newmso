import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:3000';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  try {
    console.log('Sending message...');
    const { data, error } = await supabase.from('messages').insert([{
      room_id: 'notice',
      sender_id: '9999',
      content: 'test message',
      reply_to_id: null,
    }]).select('*').single();
    
    if (error) {
      console.error('Insert error:', error);
    } else {
      console.log('Success:', data);
    }
  } catch (e) {
    console.error('Exception:', e);
  }
}

test();
