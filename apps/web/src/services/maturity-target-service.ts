import { maturityTargetsSchema, type MaturityTargets } from '@assessment/contracts';
import { isDemoMode, requireSupabase } from '../lib/supabase';
import { getCurrentIdentity, type AuthIdentity } from './auth-service';

type TargetIdentity = Pick<AuthIdentity, 'role' | 'userId' | 'organizationId' | 'email'>;

function demoTargetKey(identity: TargetIdentity): string {
  // Demo accounts share simulated org and user IDs; include the normalized sign-in email.
  return `uccmm-demo-maturity-targets:${JSON.stringify([identity.organizationId, identity.userId, identity.email.trim().toLowerCase()])}`;
}

// Use the submitting account rather than re-reading a session that may have switched accounts.
export function getDemoMaturityTargets(identity: TargetIdentity): MaturityTargets {
  if (!isDemoMode || identity.role !== 'admin') return {};
  try {
    const parsed = maturityTargetsSchema.safeParse(JSON.parse(localStorage.getItem(demoTargetKey(identity)) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

async function requireAdmin(): Promise<AuthIdentity> {
  const identity = await getCurrentIdentity();
  if (!identity || identity.role !== 'admin') throw new Error('Admin access is required.');
  return identity;
}

export async function getMaturityTargets(): Promise<MaturityTargets> {
  const identity = await requireAdmin();
  if (isDemoMode) return getDemoMaturityTargets(identity);
  const { data, error } = await requireSupabase().from('organizations')
    .select('maturity_targets').eq('id', identity.organizationId).single();
  if (error) throw error;
  return maturityTargetsSchema.parse(data.maturity_targets);
}

export async function updateMaturityTargets(input: MaturityTargets): Promise<void> {
  const identity = await requireAdmin();
  const targets = maturityTargetsSchema.parse(input);
  if (isDemoMode) {
    if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
    localStorage.setItem(demoTargetKey(identity), JSON.stringify(targets));
    return;
  }
  const { error } = await requireSupabase().from('organizations')
    .update({ maturity_targets: targets }).eq('id', identity.organizationId).select('id').single();
  if (error) throw error;
}
