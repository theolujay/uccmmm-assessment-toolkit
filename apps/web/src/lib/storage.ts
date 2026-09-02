import { openDB } from 'idb';
import type { DBSchema } from 'idb';
interface ToolkitDB extends DBSchema { drafts: { key: string; value: { id: string; responses: Record<string, number>; updatedAt: string }; }; }
const db = () => openDB<ToolkitDB>('assessment-toolkit', 1, { upgrade(database) { database.createObjectStore('drafts', { keyPath: 'id' }); } });
export async function saveDraft(id: string, responses: Record<string, number>) { await (await db()).put('drafts', { id, responses, updatedAt: new Date().toISOString() }); }
export async function getDraft(id: string) { return (await db()).get('drafts', id); }
