import type { AdminRegistrationInput, Role } from '@assessment/contracts';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { isDemoMode, requireSupabase, supabase } from '../lib/supabase';

const demoSessionKey = 'uccmm-demo-session';

export interface AuthIdentity {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  organizationId: string;
  organizationName: string;
}

export class IdentityTransportError extends Error {
  constructor(cause: unknown) {
    super('The authentication service could not be reached.', { cause });
  }
}

type DemoSession = AuthIdentity;

function readDemoSession(): DemoSession | null {
  if (!isDemoMode || typeof sessionStorage === 'undefined') return null;
  try {
    const saved = sessionStorage.getItem(demoSessionKey);
    if (!saved) {
      const oldRole = sessionStorage.getItem('uccmm-mock-role');
      if (oldRole === 'admin' || oldRole === 'stakeholder') return {
        userId: `mock-${oldRole}`,
        email: oldRole === 'admin' ? 'admin@gmail.com' : 'adeshinaogbeni@gmail.com',
        fullName: oldRole === 'admin' ? 'Admin' : 'Stakeholder',
        role: oldRole,
        organizationId: 'mock-lagos-logistics',
        organizationName: 'Lagos Logistics Ltd',
      };
    }
    const value = JSON.parse(saved ?? 'null') as DemoSession | null;
    return value && (value.role === 'admin' || value.role === 'stakeholder') ? value : null;
  } catch {
    return null;
  }
}

function writeDemoSession(session: DemoSession | null): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem('uccmm-mock-role');
  if (session) sessionStorage.setItem(demoSessionKey, JSON.stringify(session));
  else sessionStorage.removeItem(demoSessionKey);
}

export async function getCurrentIdentity(): Promise<AuthIdentity | null> {
  if (!supabase) return readDemoSession();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (isAuthRetryableFetchError(userError)) throw new IdentityTransportError(userError);
  if (userError || !user) return null;
  const { data, error, status } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', user.id)
    .maybeSingle();
  // PostgREST uses status 0 when fetch fails without an HTTP response.
  if (error && status === 0) throw new IdentityTransportError(error);
  if (error) throw error;
  if (!data) return null;
  const organization = data.organizations as unknown as { name: string } | null;
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle();
  return {
    userId: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? user.user_metadata.full_name ?? '',
    role: data.role as Role,
    organizationId: data.organization_id,
    organizationName: organization?.name ?? '',
  };
}

export async function signIn(email: string, password: string, expectedRole: Role): Promise<AuthIdentity> {
  if (!supabase) {
    if (!isDemoMode) throw new Error('Authentication is not configured for this deployment.');
    const demo: DemoSession = {
      userId: `mock-${expectedRole}`,
      email,
      fullName: email.split('@')[0],
      role: expectedRole,
      organizationId: 'mock-lagos-logistics',
      organizationName: 'Lagos Logistics Ltd',
    };
    writeDemoSession(demo);
    return demo;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('The email or passcode is incorrect.');
  const identity = await getCurrentIdentity();
  if (!identity) {
    await supabase.auth.signOut();
    throw new Error('This account has not been added to an organisation yet. Contact the organisation admin.');
  }
  if (identity.role !== expectedRole) {
    await supabase.auth.signOut();
    throw new Error(`This account is registered as ${identity.role}. Choose that user type and try again.`);
  }
  return identity;
}

export async function registerAdmin(input: AdminRegistrationInput): Promise<boolean> {
  if (!supabase) {
    if (!isDemoMode) throw new Error('Authentication is not configured for this deployment.');
    const identity: DemoSession = {
      userId: 'mock-admin',
      email: input.email,
      fullName: input.fullName,
      role: 'admin',
      organizationId: 'mock-lagos-logistics',
      organizationName: input.organisation.name,
    };
    writeDemoSession(identity);
    return false;
  }

  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        account_type: 'admin',
        full_name: input.fullName,
        organization_name: input.organisation.name,
        sector: input.organisation.sector,
        employee_count: input.organisation.employeeCount,
        erp_platform: input.organisation.erpPlatform,
        implementation_stage: input.organisation.implementationStage,
      },
    },
  });
  if (error) throw new Error(error.message);
  if (!data.session) return true;
  return false;
}

export async function signOut(): Promise<void> {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
  writeDemoSession(null);
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) {
    if (isDemoMode) return;
    throw new Error('Password recovery is not configured for this deployment.');
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}
