import { supabase } from '@/lib/supabase';
import { chunkArray } from './메신저방데이터-utils';

export async function selectMessageReactionRows(messageIds: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunkArray(messageIds)) {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, emoji, user_id, staff_members(id, name, company, department, position, photo_url)')
      .in('message_id', chunk);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

export async function selectMessageBookmarkRows(userId: string, messageIds: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunkArray(messageIds)) {
    const { data, error } = await supabase
      .from('message_bookmarks')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', chunk);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}
