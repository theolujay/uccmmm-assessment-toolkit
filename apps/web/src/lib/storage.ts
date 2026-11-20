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
  // Ask the browser to flush the transaction before showing the draft as saved.
  const transaction = (await db()).transaction('drafts', 'readwrite', { durability: 'strict' });
  await Promise.all([transaction.store.put(parsedDraft), transaction.done]);
}

type DraftScope = Pick<AssessmentDraft, 'organisationId' | 'respondentType'>;

function matchesScope(draft: DraftScope, scope?: DraftScope): boolean {
  return !scope || (draft.organisationId === scope.organisationId && draft.respondentType === scope.respondentType);
}

export async function getDraft(respondentKey: string, assessmentVersion: string, scope?: DraftScope): Promise<AssessmentDraft | undefined> {
  const drafts = await (await db()).getAllFromIndex('drafts', 'byRespondentVersion', [respondentKey, assessmentVersion]);
  // Older clients could create multiple drafts because lookups did not match the stored UUID key.
  for (const draft of drafts.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))) {
    const result = assessmentDraftSchema.safeParse(draft);
    if (result.success && matchesScope(result.data, scope)) return result.data;
  }
  return undefined;
}

export async function clearDraft(respondentKey: string, assessmentVersion: string, scope?: DraftScope): Promise<void> {
  const transaction = (await db()).transaction('drafts', 'readwrite');
  const drafts = await transaction.store.index('byRespondentVersion').getAll([respondentKey, assessmentVersion]);
  await Promise.all([...drafts.filter((draft) => matchesScope(draft, scope)).map(({ id }) => transaction.store.delete(id)), transaction.done]);
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
