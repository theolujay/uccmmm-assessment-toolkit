import 'fake-indexeddb/auto';
import { assessmentTemplate, calculateAssessmentScores } from '@assessment/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import { getDraft } from '../lib/storage';
import { getAssessmentHistory, loadActiveDraft, saveActiveDraft, submitActiveAssessment, syncActiveDraft } from './assessment-service';
import { updateMaturityTargets } from './maturity-target-service';

const mocks = vi.hoisted(() => ({ isDemoMode: false, from: vi.fn(), rpc: vi.fn(), getCurrentIdentity: vi.fn() }));
const { from, rpc } = mocks;
vi.mock('../lib/supabase', () => ({
  get isDemoMode() { return mocks.isDemoMode; },
  get supabase() { return mocks.isDemoMode ? null : { from, rpc }; },
  requireSupabase: () => ({ from, rpc }),
}));
vi.mock('./auth-service', () => ({ getCurrentIdentity: mocks.getCurrentIdentity }));

afterEach(() => {
  mocks.isDemoMode = false;
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

const completeResponses = Object.fromEntries(assessmentTemplate.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, 4])));

it('restores and syncs a draft and includes the latest evidence in the submission RPC', async () => {
  const identity = { userId: 'stakeholder-sync-test', organizationId: 'org-sync-test', role: 'stakeholder' as const, email: 'respondent@example.com' };
  const id = crypto.randomUUID();
  const remoteEvidence = { 'leadership-1': 'Synced from another device' };
  const upsert = vi.fn().mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ error: null }) });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({
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
  const responses = completeResponses;
  const input = { activeQuestionId: 'leadership-1', responses, evidence };
  vi.stubGlobal('navigator', { onLine: false });
  const saved = await saveActiveDraft(identity, input);
  await syncActiveDraft(identity, saved);
  expect(upsert).not.toHaveBeenCalled();
  await expect(getDraft(identity.userId, assessmentTemplate.version)).resolves.toMatchObject({ id, evidence, responses });

  vi.stubGlobal('navigator', { onLine: true });
  from.mockClear();
  const recovered = await loadActiveDraft(identity, { localOnly: true });
  expect(from).not.toHaveBeenCalled();
  expect(recovered).toMatchObject({ id, responses, evidence });
  await syncActiveDraft(identity, recovered);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id, user_id: identity.userId, responses, evidence }), { onConflict: 'user_id,assessment_version' });

  const scores = calculateAssessmentScores(assessmentTemplate, responses);
  rpc.mockResolvedValue({ error: null, data: {
    id, organization_id: identity.organizationId, respondent_type: identity.role, assessment_version: assessmentTemplate.version,
    submitted_at: '2026-09-14T12:00:01+00:00', responses, evidence, template_snapshot: assessmentTemplate,
    dimension_scores: scores.dimensionScores, overall_score: scores.overallScore, overall_maturity_level: scores.overallMaturityLevel,
  } });
  await expect(submitActiveAssessment(identity, responses, evidence)).resolves.toMatchObject({ id, responses, evidence, targetSnapshot: {} });
  expect(rpc).toHaveBeenCalledWith('submit_assessment_record', expect.objectContaining({ p_assessment_id: id, p_responses: responses, p_evidence: evidence }));
  await expect(getDraft(identity.userId, assessmentTemplate.version)).resolves.toBeUndefined();
});

it('offline recovery cannot create a new draft or open one from another organisation or role', async () => {
  const identity = { userId: 'recovery-scope', organizationId: 'org-a', role: 'stakeholder' as const, email: 'respondent@example.test' };
  vi.stubGlobal('navigator', { onLine: true });
  await saveActiveDraft(identity, { responses: { 'leadership-1': 2 }, evidence: { 'leadership-1': 'Private' }, activeQuestionId: 'leadership-2' });
  await expect(loadActiveDraft({ ...identity, organizationId: 'org-b' }, { localOnly: true })).rejects.toThrow('no saved assessment');
  await expect(loadActiveDraft({ ...identity, role: 'admin' }, { localOnly: true })).rejects.toThrow('no saved assessment');
  await expect(loadActiveDraft({ ...identity, userId: 'other-user' }, { localOnly: true })).rejects.toThrow('no saved assessment');
  expect(from).not.toHaveBeenCalled();
  await expect(loadActiveDraft(identity, { localOnly: true })).resolves.toMatchObject({ activeQuestionId: 'leadership-2', evidence: { 'leadership-1': 'Private' } });
});

it('uses the authoritative target snapshot from the RPC, including on a recovered submission', async () => {
  const identity = { userId: 'admin-recovery-test', organizationId: 'org-recovery-test', role: 'admin' as const, email: 'admin@example.com' };
  const responses = completeResponses;
  const scores = calculateAssessmentScores(assessmentTemplate, responses);
  const evidence = { 'leadership-1': 'Original evidence' };
  const targetSnapshot = { leadership: 80 };
  vi.stubGlobal('navigator', { onLine: false });
  const draft = await loadActiveDraft(identity);
  const row = {
    id: draft.id, organization_id: identity.organizationId, respondent_type: identity.role, assessment_version: assessmentTemplate.version,
    submitted_at: '2026-09-14T12:00:01+00:00', responses, evidence, template_snapshot: assessmentTemplate, target_snapshot: targetSnapshot,
    dimension_scores: scores.dimensionScores, overall_score: scores.overallScore, overall_maturity_level: scores.overallMaturityLevel,
  };
  await expect(submitActiveAssessment(identity, responses, {})).rejects.toThrow('Reconnect');
  expect(rpc).not.toHaveBeenCalled();
  vi.stubGlobal('navigator', { onLine: true });
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'Response lost' } });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: row }) };
  const deleteDraft = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
  from.mockReturnValueOnce(query).mockReturnValueOnce(deleteDraft);
  await expect(submitActiveAssessment(identity, responses, {})).resolves.toMatchObject({ id: draft.id, evidence, targetSnapshot });
  expect(from).toHaveBeenCalledWith('assessment_records');
  expect(query.eq).toHaveBeenCalledWith('id', draft.id);
  expect(deleteDraft.eq.mock.calls).toEqual([['id', draft.id], ['user_id', identity.userId]]);

  const nextDraft = await saveActiveDraft(identity, { responses, evidence, activeQuestionId: 'leadership-1' });
  const nextSnapshot = { training: 95 };
  rpc.mockResolvedValueOnce({ data: { ...row, id: nextDraft.id, target_snapshot: nextSnapshot }, error: null });
  await expect(submitActiveAssessment(identity, responses, evidence)).resolves.toMatchObject({ id: nextDraft.id, targetSnapshot: nextSnapshot });
  for (const [, args] of rpc.mock.calls) expect(args).not.toHaveProperty('p_target_snapshot');
});

it('captures only the submitting demo Admin’s targets without changing historical snapshots', async () => {
  mocks.isDemoMode = true;
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  const admin = { userId: 'mock-admin', organizationId: 'mock-org', role: 'admin' as const, email: 'admin@example.test' };
  const other = { ...admin, email: 'other@example.test' };
  mocks.getCurrentIdentity.mockResolvedValue(admin);
  await updateMaturityTargets({ leadership: 80 });
  mocks.getCurrentIdentity.mockResolvedValue(other);
  await updateMaturityTargets({ leadership: 40 });

  const record = await submitActiveAssessment(admin, completeResponses, { 'leadership-1': 'Demo evidence' });
  expect(record.targetSnapshot).toEqual({ leadership: 80 });
  await expect(getAssessmentHistory()).resolves.toEqual([]);
  await expect(submitActiveAssessment({ ...admin, role: 'stakeholder', userId: 'mock-stakeholder' }, completeResponses, {}))
    .resolves.toMatchObject({ targetSnapshot: {} });

  mocks.getCurrentIdentity.mockResolvedValue(admin);
  await updateMaturityTargets({ leadership: 100 });
  await expect(getAssessmentHistory()).resolves.toEqual([record]);
  await expect(submitActiveAssessment(admin, completeResponses, {})).resolves.toMatchObject({ targetSnapshot: { leadership: 100 } });
  expect(rpc).not.toHaveBeenCalled();
});
