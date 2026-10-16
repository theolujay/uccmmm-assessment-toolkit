import { openDB, type DBSchema } from 'idb';
import {
  assessmentDraftSchema,
  assessmentRecordSchema,
  type AssessmentDraft,
  type AssessmentRecord,
} from '@assessment/contracts';

interface ToolkitDB extends DBSchema {
  drafts: { key: string; value: AssessmentDraft };
  records: { key: string; value: AssessmentRecord };
}

const databaseName = 'uccmm-assessment-toolkit';

const db = () => openDB<ToolkitDB>(databaseName, 2, {
  upgrade(database) {
    if (!database.objectStoreNames.contains('drafts')) database.createObjectStore('drafts', { keyPath: 'id' });
    if (!database.objectStoreNames.contains('records')) database.createObjectStore('records', { keyPath: 'id' });
  },
});

export function draftKey(respondentKey: string, assessmentVersion: string): string {
  return `${respondentKey}:${assessmentVersion}`;
}

export async function saveDraft(draft: AssessmentDraft): Promise<void> {
  const parsedDraft = assessmentDraftSchema.parse(draft);
  await (await db()).put('drafts', parsedDraft);
}

export async function getDraft(respondentKey: string, assessmentVersion: string): Promise<AssessmentDraft | undefined> {
  const draft = await (await db()).get('drafts', draftKey(respondentKey, assessmentVersion));
  const result = assessmentDraftSchema.safeParse(draft);
  return result.success ? result.data : undefined;
}

export async function clearDraft(respondentKey: string, assessmentVersion: string): Promise<void> {
  await (await db()).delete('drafts', draftKey(respondentKey, assessmentVersion));
}

export async function saveRecord(record: AssessmentRecord): Promise<void> {
  await (await db()).put('records', assessmentRecordSchema.parse(record));
}

export async function getLatestRecord(organisationId: string, respondentType: AssessmentRecord['respondentType']): Promise<AssessmentRecord | undefined> {
  return (await getAssessmentHistory(organisationId, respondentType))[0];
}

export async function getAssessmentHistory(organisationId: string, respondentType: AssessmentRecord['respondentType']): Promise<AssessmentRecord[]> {
  const records = await (await db()).getAll('records');
  return records
    .filter((record) => record.organisationId === organisationId && record.respondentType === respondentType)
    .map((record) => assessmentRecordSchema.safeParse(record))
    .filter((result): result is { success: true; data: AssessmentRecord } => result.success)
    .map((result) => result.data)
    .sort((first, second) => second.submittedAt.localeCompare(first.submittedAt));
}
