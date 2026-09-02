import { createClient } from '@supabase/supabase-js';

const accessCookie = 'assessment_access';
const refreshCookie = 'assessment_refresh';
const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_ANON_KEY ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface AuthCookie {
  name: string;
  value: string;
  options: typeof cookieBase & { maxAge?: number };
}

export function setSession(session: { access_token: string; refresh_token: string; expires_in: number }): AuthCookie[] {
  return [
    {
      name: accessCookie,
      value: session.access_token,
      options: { ...cookieBase, maxAge: session.expires_in * 1000 },
    },
    {
      name: refreshCookie,
      value: session.refresh_token,
      options: { ...cookieBase, maxAge: 30 * 24 * 60 * 60 * 1000 },
    },
  ];
}

export function clearSession(): AuthCookie[] {
  return [
    { name: accessCookie, value: '', options: { ...cookieBase, maxAge: 0 } },
    { name: refreshCookie, value: '', options: { ...cookieBase, maxAge: 0 } },
  ];
}
