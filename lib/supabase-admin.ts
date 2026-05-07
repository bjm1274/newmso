import { createClient } from '@supabase/supabase-js';

function getServiceConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return { supabaseUrl, serviceKey };
}

export function getServiceSupabaseUrl() {
  return getServiceConfig().supabaseUrl;
}

export function createServiceClient() {
  const { supabaseUrl, serviceKey } = getServiceConfig();

  return createClient(supabaseUrl, serviceKey);
}
