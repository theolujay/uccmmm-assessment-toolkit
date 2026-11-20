import { afterEach, expect, it, vi } from 'vitest';
import { getMaturityTargets, updateMaturityTargets } from './maturity-target-service';

const mocks = vi.hoisted(() => ({ isDemoMode: false, from: vi.fn(), getCurrentIdentity: vi.fn() }));
vi.mock('../lib/supabase', () => ({ get isDemoMode() { return mocks.isDemoMode; }, requireSupabase: () => ({ from: mocks.from }) }));
vi.mock('./auth-service', () => ({ getCurrentIdentity: mocks.getCurrentIdentity }));

const admin = { userId: 'mock-admin', role: 'admin', organizationId: 'org-test', email: 'admin@example.test' };

afterEach(() => {
  mocks.isDemoMode = false;
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('requires an Admin session before reading or writing targets', async () => {
  for (const identity of [null, { ...admin, role: 'stakeholder' }]) {
    mocks.getCurrentIdentity.mockResolvedValue(identity);
    await expect(getMaturityTargets()).rejects.toThrow('Admin access is required.');
    await expect(updateMaturityTargets({ leadership: 80 })).rejects.toThrow('Admin access is required.');
  }
  expect(mocks.from).not.toHaveBeenCalled();
});

it('reads and replaces the validated live configuration for the current organization only', async () => {
  mocks.getCurrentIdentity.mockResolvedValue(admin);
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), single: vi.fn() };
  mocks.from.mockReturnValue(query);
  query.single.mockResolvedValueOnce({ data: { maturity_targets: { communication: 80 } }, error: null })
    .mockResolvedValueOnce({ data: { id: admin.organizationId }, error: null });
  await expect(getMaturityTargets()).resolves.toEqual({ communication: 80 });
  expect(query.select).toHaveBeenCalledWith('maturity_targets');
  await expect(updateMaturityTargets({})).resolves.toBeUndefined();
  expect(query.update).toHaveBeenCalledWith({ maturity_targets: {} });
  expect(query.eq.mock.calls).toEqual([['id', admin.organizationId], ['id', admin.organizationId]]);
  expect(mocks.from.mock.calls).toEqual([['organizations'], ['organizations']]);
  await expect(updateMaturityTargets({ leadership: 99.5 })).rejects.toThrow();
  expect(query.update).toHaveBeenCalledTimes(1);

  const error = { message: 'No row was updated.' };
  query.single.mockResolvedValueOnce({ data: null, error });
  await expect(updateMaturityTargets({ leadership: 75 })).rejects.toEqual(error);
});

it('isolates demo configuration by account and supports clearing all targets', async () => {
  mocks.isDemoMode = true;
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  mocks.getCurrentIdentity.mockResolvedValue(admin);
  await expect(getMaturityTargets()).resolves.toEqual({});
  await updateMaturityTargets({ leadership: 80 });
  mocks.getCurrentIdentity.mockResolvedValue({ ...admin, email: 'other-admin@example.test' });
  await expect(getMaturityTargets()).resolves.toEqual({});
  await updateMaturityTargets({ leadership: 20 });
  mocks.getCurrentIdentity.mockResolvedValue({ ...admin, email: ' ADMIN@example.test ' });
  await expect(getMaturityTargets()).resolves.toEqual({ leadership: 80 });
  await updateMaturityTargets({});
  await expect(getMaturityTargets()).resolves.toEqual({});
  expect(mocks.from).not.toHaveBeenCalled();
});
