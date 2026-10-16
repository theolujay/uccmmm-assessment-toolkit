import { organisationProfileSchema, type OrganisationProfile } from '@assessment/contracts';
import { getCurrentIdentity } from './auth-service';
import { isDemoMode, requireSupabase } from '../lib/supabase';

export async function getOrganisationProfile(): Promise<OrganisationProfile> {
  const identity = await getCurrentIdentity();
  if (!identity || identity.role !== 'admin') throw new Error('Admin access is required.');
  if (isDemoMode) return {
    name: identity.organizationName,
    sector: 'Logistics',
    employeeCount: 250,
    erpPlatform: 'SAP',
    implementationStage: 'planning',
  };
  const { data, error } = await requireSupabase().from('organizations').select('*').eq('id', identity.organizationId).single();
  if (error) throw error;
  return organisationProfileSchema.parse({
    name: data.name,
    sector: data.sector,
    employeeCount: data.employee_count,
    erpPlatform: data.erp_platform,
    implementationStage: data.implementation_stage,
  });
}

export async function updateOrganisationProfile(input: OrganisationProfile): Promise<void> {
  const profile = organisationProfileSchema.parse(input);
  const identity = await getCurrentIdentity();
  if (!identity || identity.role !== 'admin') throw new Error('Admin access is required.');
  if (isDemoMode) return;
  const { error } = await requireSupabase().from('organizations').update({
    name: profile.name,
    sector: profile.sector,
    employee_count: profile.employeeCount,
    erp_platform: profile.erpPlatform,
    implementation_stage: profile.implementationStage,
  }).eq('id', identity.organizationId);
  if (error) throw error;
}
