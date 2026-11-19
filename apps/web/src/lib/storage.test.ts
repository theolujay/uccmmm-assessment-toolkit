import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { assessmentTemplate, createAssessmentRecord, type AssessmentDraft } from '@assessment/contracts';
import { clearDraft, getAssessmentHistory, getDraft, saveDraft, saveRecord } from './storage';

const savedAt = '2026-09-14T12:00:00.000Z';

describe('assessment draft storage', () => {
  it('round-trips a UUID-keyed draft only for the matching respondent and version', async () => {
    const storedDraft: AssessmentDraft = {
      id: crypto.randomUUID(), organisationId: 'organisation-1', respondentType: 'stakeholder',
      respondentKey: 'stakeholder-storage-test', assessmentVersion: assessmentTemplate.version,
      responses: { 'leadership-1': 4 }, evidence: { 'leadership-1': 'Private draft note\nSecond line' },
      activeQuestionId: 'leadership-1', status: 'in_progress', createdAt: savedAt, updatedAt: savedAt,
    };

    await saveDraft(storedDraft);
    await expect(getDraft(storedDraft.respondentKey, storedDraft.assessmentVersion)).resolves.toEqual(storedDraft);
    await expect(getDraft(storedDraft.respondentKey, 'uccmm-v2')).resolves.toBeUndefined();
    await expect(getDraft('other-stakeholder', storedDraft.assessmentVersion)).resolves.toBeUndefined();
    await clearDraft(storedDraft.respondentKey, storedDraft.assessmentVersion);
    await expect(getDraft(storedDraft.respondentKey, storedDraft.assessmentVersion)).resolves.toBeUndefined();
  });
});

describe('submitted assessment storage', () => {
  it('returns evidence only to the record owner, not to another stakeholder or an admin', async () => {
    const record = createAssessmentRecord({
      id: crypto.randomUUID(), organisationId: 'organisation-1', respondentType: 'stakeholder',
      submittedAt: savedAt, template: assessmentTemplate,
      responses: Object.fromEntries(assessmentTemplate.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, 4]))),
      evidence: { 'leadership-1': 'Private submitted note' },
    });
    await saveRecord(record, 'owner');
    await expect(getAssessmentHistory(record.organisationId, 'stakeholder', 'owner')).resolves.toEqual([record]);
    await expect(getAssessmentHistory(record.organisationId, 'stakeholder', 'other-stakeholder')).resolves.toEqual([]);
    await expect(getAssessmentHistory(record.organisationId, 'admin', 'admin-user')).resolves.toEqual([]);
  });
});
