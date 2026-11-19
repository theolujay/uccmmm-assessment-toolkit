import { openDB, type DBSchema } from 'idb';
import {
  assessmentDraftSchema,
  assessmentRecordSchema,
  type AssessmentDraft,
  type AssessmentRecord,
} from '@assessment/contracts';

interface ToolkitDB extends DBSchema {
  drafts: { key: string; value: AssessmentDraft; indexes: { byRespondentVersion: [string, string] } };
  records: { key: string; value: AssessmentRecord & { respondentKey: string }; indexes: { byRespondent: string } };
}

const databaseName = 'uccmm-assessment-toolkit';

const db = () => openDB<ToolkitDB>(databaseName, 3, {
  upgrade(database, oldVersion, _newVersion, transaction) {
    const drafts = database.objectStoreNames.contains('drafts')
      ? transaction.objectStore('drafts')
      : database.createObjectStore('drafts', { keyPath: 'id' });
    if (oldVersion < 3) drafts.createIndex('byRespondentVersion', ['respondentKey', 'assessmentVersion']);
    const records = database.objectStoreNames.contains('records')
      ? transaction.objectStore('records')
      : database.createObjectStore('records', { keyPath: 'id' });
    if (oldVersion < 3) records.createIndex('byRespondent', 'respondentKey');
  },
});

export async function saveDraft(draft: AssessmentDraft): Promise<void> {
  const parsedDraft = assessmentDraftSchema.parse(draft);
  await (await db()).put('drafts', parsedDraft);
}

export async function getDraft(respondentKey: string, assessmentVersion: string): Promise<AssessmentDraft | undefined> {
  const drafts = await (await db()).getAllFromIndex('drafts', 'byRespondentVersion', [respondentKey, assessmentVersion]);
  // Older clients could create multiple drafts because lookups did not match the stored UUID key.
  for (const draft of drafts.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))) {
    const result = assessmentDraftSchema.safeParse(draft);
    if (result.success) return result.data;
  }
  return undefined;
}

export async function clearDraft(respondentKey: string, assessmentVersion: string): Promise<void> {
  const transaction = (await db()).transaction('drafts', 'readwrite');
  const keys = await transaction.store.index('byRespondentVersion').getAllKeys([respondentKey, assessmentVersion]);
  await Promise.all([...keys.map((key) => transaction.store.delete(key)), transaction.done]);
}

export async function saveRecord(record: AssessmentRecord, respondentKey: string): Promise<void> {
  await (await db()).put('records', { ...assessmentRecordSchema.parse(record), respondentKey });
}

export async function getAssessmentHistory(organisationId: string, respondentType: AssessmentRecord['respondentType'], respondentKey: string): Promise<AssessmentRecord[]> {
  const records = await (await db()).getAllFromIndex('records', 'byRespondent', respondentKey);
  return records
    .filter((record) => record.organisationId === organisationId && record.respondentType === respondentType)
    .map((record) => assessmentRecordSchema.safeParse(record))
    .filter((result): result is { success: true; data: AssessmentRecord } => result.success)
    .map((result) => result.data)
    .sort((first, second) => second.submittedAt.localeCompare(first.submittedAt));
}
