// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfflineRecoveryStore, offlineRecoveryLifetime } from './offline-recovery';
import type { AuthIdentity } from '../services/auth-service';

const identity: AuthIdentity = {
  userId: '838cb47a-8e6b-452d-8acf-1e0a92db2036',
  organizationId: 'b65adbb2-8053-4ba9-adf7-44b318d33495',
  email: 'user@example.com',
  role: 'stakeholder',
  fullName: 'Test User',
  organizationName: 'Test Organisation',
};
const now = new Date('2026-11-19T12:00:00Z');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe('offline recovery grant storage', () => {
  it('stores only the draft identity and expiration under the configured backend', () => {
    const store = createOfflineRecoveryStore('https://one.example.com/relay/')!;
    const grant = store.write(identity);
    expect(grant).toEqual({
      identity: { userId: identity.userId, organizationId: identity.organizationId, email: identity.email, role: identity.role },
      expiresAt: +now + offlineRecoveryLifetime,
    });
    const saved = localStorage.getItem(store.key)!;
    expect(JSON.parse(saved)).toEqual({ backend: 'https://one.example.com/relay', ...grant });
    expect(createOfflineRecoveryStore('https://one.example.com/relay')!.read()).toEqual(grant);
    for (const backend of ['https://two.example.com/relay', 'https://one.example.com/other']) {
      const other = createOfflineRecoveryStore(backend)!;
      expect(other.read()).toBeNull();
      localStorage.setItem(other.key, saved);
      expect(other.read()).toBeNull();
    }
  });

  it('fails closed on invalid configuration, corrupt records, and invalid identities', () => {
    expect(createOfflineRecoveryStore(undefined)).toBeNull();
    expect(createOfflineRecoveryStore('not a URL')).toBeNull();
    const store = createOfflineRecoveryStore('https://one.example.com')!;
    localStorage.setItem(store.key, 'not JSON');
    expect(store.read()).toBeNull();
    const grant = store.write(identity);
    const saved = JSON.parse(localStorage.getItem(store.key)!);
    for (const patch of [{ userId: 'mock-stakeholder' }, { organizationId: null }, { email: 1 }, { role: 'owner' }]) {
      localStorage.setItem(store.key, JSON.stringify({ ...saved, identity: { ...grant.identity, ...patch } }));
      expect(store.read()).toBeNull();
    }
    localStorage.setItem(store.key, JSON.stringify({ ...saved, expiresAt: +now + offlineRecoveryLifetime + 1 }));
    expect(store.read()).toBeNull();
  });

  it('expires at seven days without extending on read', () => {
    const store = createOfflineRecoveryStore('https://one.example.com')!;
    const grant = store.write(identity);
    vi.setSystemTime(grant.expiresAt - 1);
    expect(store.read()).toEqual(grant);
    vi.setSystemTime(grant.expiresAt);
    expect(store.read()).toBeNull();
  });
});
