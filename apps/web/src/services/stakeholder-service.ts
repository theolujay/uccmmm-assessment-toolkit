import { stakeholderInputSchema, stakeholderSchema, type Stakeholder, type StakeholderInput, type ParticipationSummary } from '@assessment/contracts';
import { isDemoMode, requireSupabase } from '../lib/supabase';
import { getCurrentIdentity } from './auth-service';

const demoStakeholdersKey = 'uccmm-demo-stakeholders';

function readDemoStakeholders(): Stakeholder[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const values = JSON.parse(localStorage.getItem(demoStakeholdersKey) ?? '[]') as unknown[];
    return values.map((value) => stakeholderSchema.parse(value));
  } catch {
    return [];
  }
}

function writeDemoStakeholders(values: Stakeholder[]): void {
  localStorage.setItem(demoStakeholdersKey, JSON.stringify(values));
}

function fromDatabaseRow(row: Record<string, unknown>): Stakeholder {
  return stakeholderSchema.parse({
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    email: row.email,
    department: row.department,
    jobRole: row.job_role,
    invitationStatus: row.invitation_status,
    assessmentStatus: row.assessment_status,
    invitedAt: row.invited_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
}

export async function listStakeholders(): Promise<Stakeholder[]> {
  if (isDemoMode) return readDemoStakeholders();
  const client = requireSupabase();
  const identity = await getCurrentIdentity();
  if (!identity || identity.role !== 'admin') throw new Error('Admin access is required to view stakeholders.');
  const { data, error } = await client.from('stakeholders').select('id,organization_id,full_name,email,department,job_role,invitation_status,assessment_status,invited_at,started_at,completed_at').eq('organization_id', identity.organizationId).order('created_at');
  if (error) throw error;
  return (data ?? []).map((row) => fromDatabaseRow(row));
}

export async function getParticipationSummary(): Promise<ParticipationSummary> {
  const stakeholders = await listStakeholders();
  return {
    invited: stakeholders.length,
    completed: stakeholders.filter((person) => person.assessmentStatus === 'completed').length,
    inProgress: stakeholders.filter((person) => person.assessmentStatus === 'in_progress').length,
    notStarted: stakeholders.filter((person) => person.assessmentStatus === 'not_started').length,
  };
}

export async function inviteStakeholder(input: StakeholderInput): Promise<Stakeholder> {
  const parsed = stakeholderInputSchema.parse(input);
  if (isDemoMode) {
    const identity = await getCurrentIdentity();
    if (!identity || identity.role !== 'admin') throw new Error('Admin access is required to invite stakeholders.');
    const person = stakeholderSchema.parse({
      ...parsed,
      id: crypto.randomUUID(),
      organizationId: identity.organizationId,
      invitationStatus: 'pending',
      assessmentStatus: 'not_started',
      invitedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    });
    writeDemoStakeholders([...readDemoStakeholders(), person]);
    return person;
  }

  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('invite-stakeholder', { body: parsed });
  if (error) throw new Error(error.message || 'We could not send the stakeholder invitation.');
  return fromDatabaseRow(data.stakeholder as Record<string, unknown>);
}

export async function manageStakeholder(id: string, action: 'resend' | 'reset_passcode' | 'revoke'): Promise<void> {
  if (isDemoMode) {
    const people = readDemoStakeholders();
    const updated = people.map((person) => person.id === id ? {
      ...person,
      invitationStatus: action === 'revoke' ? 'revoked' as const : 'sent' as const,
    } : person);
    writeDemoStakeholders(updated);
    return;
  }
  const { error } = await requireSupabase().functions.invoke('manage-stakeholder', { body: { id, action } });
  if (error) throw new Error(error.message || 'We could not update this stakeholder access.');
}
