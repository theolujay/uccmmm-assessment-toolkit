import 'fake-indexeddb/auto';
import { assessmentTemplate, calculateAssessmentScores } from '@assessment/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import { getDraft } from '../lib/storage';
import { loadActiveDraft, saveActiveDraft, submitActiveAssessment } from './assessment-service';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ isDemoMode: false, supabase: { from, rpc }, requireSupabase: () => ({ rpc }) }));

afterEach(() => vi.unstubAllGlobals());

it('restores and syncs a draft and includes the latest evidence in the submission RPC', async () => {
  const identity = { userId: 'stakeholder-sync-test', organizationId: 'org-sync-test', role: 'stakeholder' as const, email: 'respondent@example.com' };
  const id = crypto.randomUUID();
  const remoteEvidence = { 'leadership-1': 'Synced from another device' };
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({
    error: null,
    data: {
      id, organization_id: identity.organizationId, respondent_type: identity.role, assessment_version: assessmentTemplate.version,
      responses: {}, evidence: remoteEvidence, active_question_id: 'leadership-1', status: 'in_progress',
      created_at: '2026-09-14T10:00:00+00:00', updated_at: '2026-09-14T12:00:00.345678+00:00',
    },
  }) };
  from.mockReturnValue({ ...query, upsert });
  vi.stubGlobal('navigator', { onLine: true });

  await expect(loadActiveDraft(identity)).resolves.toMatchObject({ id, evidence: remoteEvidence, updatedAt: '2026-09-14T12:00:00.345Z' });
  expect(query.eq).toHaveBeenCalledWith('user_id', identity.userId);

  const evidence = { 'leadership-1': 'Updated offline\nSecond line' };
  const responses = Object.fromEntries(assessmentTemplate.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, 4])));
  const input = { activeQuestionId: 'leadership-1', responses, evidence };
  vi.stubGlobal('navigator', { onLine: false });
  await saveActiveDraft(identity, input);
  expect(upsert).not.toHaveBeenCalled();
  await expect(getDraft(identity.userId, assessmentTemplate.version)).resolves.toMatchObject({ id, evidence, responses });

  vi.stubGlobal('navigator', { onLine: true });
  await saveActiveDraft(identity, input);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id, user_id: identity.userId, responses, evidence }), { onConflict: 'user_id,assessment_version' });

  const scores = calculateAssessmentScores(assessmentTemplate, responses);
  rpc.mockResolvedValue({ error: null, data: {
    id, organization_id: identity.organizationId, respondent_type: identity.role, assessment_version: assessmentTemplate.version,
    submitted_at: '2026-09-14T12:00:01+00:00', responses, evidence, template_snapshot: assessmentTemplate,
    dimension_scores: scores.dimensionScores, overall_score: scores.overallScore, overall_maturity_level: scores.overallMaturityLevel,
  } });
  await expect(submitActiveAssessment(identity, responses, evidence)).resolves.toMatchObject({ id, responses, evidence });
  expect(rpc).toHaveBeenCalledWith('submit_assessment_record', expect.objectContaining({ p_assessment_id: id, p_responses: responses, p_evidence: evidence }));
  await expect(getDraft(identity.userId, assessmentTemplate.version)).resolves.toBeUndefined();
});
