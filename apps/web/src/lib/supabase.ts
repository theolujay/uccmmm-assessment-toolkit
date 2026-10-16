import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export const isDemoMode = !supabase && (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true');

export function requireSupabase() {
  if (!supabase) throw new Error('Connect Supabase to use production accounts and shared data.');
  return supabase;
}
