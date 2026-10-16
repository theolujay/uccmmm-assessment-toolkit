import {
  assessmentDraftSchema,
  assessmentRecordSchema,
  assessmentTemplate,
  createAssessmentRecord,
  type AssessmentDraft,
  type AssessmentRecord,
  type AssessmentResponses,
  type Role,
} from '@assessment/contracts';
import { clearDraft, draftKey, getAssessmentHistory as getStoredAssessmentHistory, getDraft, getLatestRecord, saveDraft, saveRecord } from '../lib/storage';
import { isDemoMode, requireSupabase, supabase } from '../lib/supabase';
import { getCurrentIdentity } from './auth-service';

interface AssessmentContext {
  organisationId: string;
  respondentKey: string;
  respondentType: Role;
  userId: string;
}

async function getAssessmentContext(): Promise<AssessmentContext> {
  const identity = await getCurrentIdentity();
  if (!identity) throw new Error('Sign in before starting an assessment.');
  return {
    organisationId: identity.organizationId,
    respondentKey: identity.userId,
    respondentType: identity.role,
    userId: identity.userId,
  };
}

function createDraft(context: AssessmentContext, now = new Date().toISOString()): AssessmentDraft {
  return {
    id: crypto.randomUUID(),
    organisationId: context.organisationId,
    respondentKey: context.respondentKey,
    respondentType: context.respondentType,
    assessmentVersion: assessmentTemplate.version,
    responses: {},
    activeQuestionId: assessmentTemplate.dimensions[0].questions[0].id,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

function draftFromRow(row: Record<string, unknown>, context: AssessmentContext): AssessmentDraft | undefined {
  const parsed = assessmentDraftSchema.safeParse({
    id: row.id,
    organisationId: row.organization_id,
    respondentKey: context.respondentKey,
    respondentType: row.respondent_type,
    assessmentVersion: row.assessment_version,
    responses: row.responses,
    activeQuestionId: row.active_question_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  return parsed.success ? parsed.data : undefined;
}

function recordFromRow(row: Record<string, unknown>): AssessmentRecord {
  return assessmentRecordSchema.parse({
    id: row.id as string,
    organisationId: row.organization_id as string,
    respondentType: row.respondent_type as Role,
    assessmentVersion: row.assessment_version as string,
    submittedAt: row.submitted_at as string,
    responses: row.responses as AssessmentResponses,
    templateSnapshot: row.template_snapshot as AssessmentRecord['templateSnapshot'],
    dimensionScores: row.dimension_scores as AssessmentRecord['dimensionScores'],
    overallScore: Number(row.overall_score),
    overallMaturityLevel: row.overall_maturity_level as AssessmentRecord['overallMaturityLevel'],
  });
}

export async function loadActiveDraft(): Promise<AssessmentDraft> {
  const context = await getAssessmentContext();
  const localDraft = await getDraft(context.respondentKey, assessmentTemplate.version);
  if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
    const { data, error } = await supabase.from('assessment_drafts').select('*')
      .eq('user_id', context.userId).eq('assessment_version', assessmentTemplate.version).maybeSingle();
    if (!error && data) {
      const remoteDraft = draftFromRow(data, context);
      if (remoteDraft && (!localDraft || remoteDraft.updatedAt >= localDraft.updatedAt)) {
        await saveDraft(remoteDraft);
        return remoteDraft;
      }
    } else if (error && !localDraft) {
      throw new Error(`We could not load your saved progress: ${error.message}`);
    }
  }
  if (localDraft) return localDraft;
  const draft = createDraft(context);
  await saveDraft(draft);
  return draft;
}

export async function saveActiveDraft(input: {
  responses: AssessmentResponses;
  activeQuestionId: string;
}): Promise<AssessmentDraft> {
  const context = await getAssessmentContext();
  const existingDraft = await getDraft(context.respondentKey, assessmentTemplate.version) ?? createDraft(context);
  const draft: AssessmentDraft = {
    ...existingDraft,
    responses: input.responses,
    activeQuestionId: input.activeQuestionId,
    status: Object.keys(input.responses).length === 0 ? 'draft' : 'in_progress',
    updatedAt: new Date().toISOString(),
  };
  await saveDraft(draft);

  if (supabase && typeof navigator !== 'undefined' && navigator.onLine) {
    const { error } = await supabase.from('assessment_drafts').upsert({
      id: draft.id,
      organization_id: context.organisationId,
      user_id: context.userId,
      respondent_type: context.respondentType,
      assessment_version: draft.assessmentVersion,
      responses: draft.responses,
      active_question_id: draft.activeQuestionId,
      status: draft.status,
      created_at: draft.createdAt,
      updated_at: draft.updatedAt,
    }, { onConflict: 'user_id,assessment_version' });
    if (error) throw new Error(`Your answer is saved on this device but could not sync: ${error.message}`);
  }
  return draft;
}

export async function submitActiveAssessment(responses: AssessmentResponses): Promise<AssessmentRecord> {
  const context = await getAssessmentContext();
  const draft = await getDraft(context.respondentKey, assessmentTemplate.version) ?? createDraft(context);
  const record = createAssessmentRecord({
    id: draft.id,
    organisationId: context.organisationId,
    respondentType: context.respondentType,
    submittedAt: new Date().toISOString(),
    template: assessmentTemplate,
    responses,
  });

  await saveRecord(record);
  if (supabase) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('submit_assessment_record', {
      p_assessment_id: record.id,
      p_organization_id: context.organisationId,
      p_respondent_type: context.respondentType,
      p_assessment_version: record.assessmentVersion,
      p_responses: record.responses,
      p_template_snapshot: record.templateSnapshot,
    });
    if (error) {
      const { data: existingRecord } = await client.from('assessment_records').select('id').eq('id', record.id).maybeSingle();
      if (!existingRecord) throw new Error(`Your assessment is saved on this device but could not be submitted: ${error.message}`);
    }
    if (data) {
      const serverRecord = recordFromRow(data as Record<string, unknown>);
      await saveRecord(serverRecord);
      await clearDraft(context.respondentKey, assessmentTemplate.version);
      return serverRecord;
    }
  }
  await clearDraft(context.respondentKey, assessmentTemplate.version);
  if (supabase) {
    await supabase.from('assessment_drafts').delete().eq('user_id', context.userId).eq('assessment_version', assessmentTemplate.version);
  }
  return record;
}

export async function getAssessmentHistory(): Promise<AssessmentRecord[]> {
  const context = await getAssessmentContext();
  if (supabase) {
    const { data: respondentRows, error: respondentError } = await supabase.from('assessment_respondents')
      .select('assessment_id,submitted_at').eq('respondent_user_id', context.userId).order('submitted_at', { ascending: false });
    if (respondentError) throw respondentError;
    const assessmentIds = (respondentRows ?? []).map((row) => row.assessment_id);
    if (assessmentIds.length === 0) return [];
    const { data, error } = await supabase.from('assessment_records').select('*').in('id', assessmentIds);
    if (error) throw error;
    return (data ?? []).map((row) => recordFromRow(row))
      .sort((first, second) => second.submittedAt.localeCompare(first.submittedAt));
  }
  return getStoredAssessmentHistory(context.organisationId, context.respondentType);
}

export async function getLatestAssessment(): Promise<AssessmentRecord | undefined> {
  return (await getAssessmentHistory())[0];
}

export async function getLocalOrLatestAssessment(): Promise<AssessmentRecord | undefined> {
  const context = await getAssessmentContext();
  if (isDemoMode) return getLatestRecord(context.organisationId, context.respondentType);
  return getLatestAssessment();
}

export function activeDraftKey(respondentKey: string): string {
  return draftKey(respondentKey, assessmentTemplate.version);
}
