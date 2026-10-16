import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { AssessmentDraft } from '@assessment/contracts';
import { clearDraft, draftKey, getDraft, saveDraft } from './storage';

const savedAt = '2026-09-14T12:00:00.000Z';

function draft(respondentKey: string, assessmentVersion = 'uccmm-v1'): AssessmentDraft {
  return {
    id: draftKey(respondentKey, assessmentVersion),
    organisationId: 'organisation-1',
    respondentType: 'stakeholder',
    respondentKey,
    assessmentVersion,
    responses: { 'leadership-1': 4 },
    activeQuestionId: 'leadership-1',
    status: 'in_progress',
    createdAt: savedAt,
    updatedAt: savedAt,
  };
}

describe('assessment draft storage', () => {
  it('restores a draft only for the matching respondent and assessment version', async () => {
    const storedDraft = draft('stakeholder-storage-test');
    await clearDraft(storedDraft.respondentKey, storedDraft.assessmentVersion);
    await clearDraft(storedDraft.respondentKey, 'uccmm-v2');

    await saveDraft(storedDraft);

    await expect(getDraft(storedDraft.respondentKey, storedDraft.assessmentVersion)).resolves.toMatchObject({
      responses: { 'leadership-1': 4 },
      activeQuestionId: 'leadership-1',
    });
    await expect(getDraft(storedDraft.respondentKey, 'uccmm-v2')).resolves.toBeUndefined();

    await clearDraft(storedDraft.respondentKey, storedDraft.assessmentVersion);
  });
});
