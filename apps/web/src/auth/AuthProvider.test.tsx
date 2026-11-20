// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/AppShell';
import { PublicAuthRoutes, RequireRole } from '../components/RequireRole';
import { getCurrentIdentity, IdentityTransportError, signOut, type AuthIdentity } from '../services/auth-service';
import { AuthProvider, useAuth } from './AuthProvider';
import { createOfflineRecoveryStore } from './offline-recovery';

const { config, subscribe } = vi.hoisted(() => ({
  config: { demo: false },
  subscribe: vi.fn<(callback: (event: AuthChangeEvent, session: Session | null) => void) => { data: { subscription: { unsubscribe: () => void } } }>(),
}));
vi.mock('../lib/supabase', () => ({
  get supabase() { return config.demo ? null : { auth: { onAuthStateChange: subscribe } }; },
  get isDemoMode() { return config.demo; },
}));
vi.mock('../services/auth-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/auth-service')>(),
  getCurrentIdentity: vi.fn(),
  signOut: vi.fn(),
}));

const backend = 'https://my-project.example.com';
const store = createOfflineRecoveryStore(backend)!;
const account: AuthIdentity = {
  userId: '838cb47a-8e6b-452d-8acf-1e0a92db2036',
  organizationId: 'b65adbb2-8053-4ba9-adf7-44b318d33495',
  role: 'admin',
  email: 'admin@example.com',
  fullName: 'Test Admin',
  organizationName: 'Test Organisation',
};
const otherAccount: AuthIdentity = { ...account, userId: '94e2f3ae-5b87-44f9-9805-c2d703f38ee5', role: 'stakeholder', email: 'other@example.com' };
const mounted = vi.fn();
let online: boolean;
let auth: ReturnType<typeof useAuth>;
let authEvent: Parameters<typeof subscribe>[0];

function OuterAuth() {
  auth = useAuth();
  const location = useLocation();
  return <output aria-label="outer auth">{location.pathname}:{auth.user?.email ?? 'no user'}:{auth.offlineRecovery ? 'recovery' : 'normal'}</output>;
}

function Assessment() {
  const { user, offlineRecovery } = useAuth();
  useEffect(() => { mounted(); }, []);
  return <p>Assessment for {user?.email} ({offlineRecovery ? 'local' : 'verified'})</p>;
}

function start(path: string) {
  return render(<AuthProvider><MemoryRouter initialEntries={[path]}>
    <OuterAuth />
    <Routes>
      <Route element={<PublicAuthRoutes />}>
        <Route path="/" element={<Navigate to="/sign-in" replace />} />
        <Route path="/sign-in" element={<p>Sign in page</p>} />
      </Route>
      <Route element={<RequireRole allowOfflineRecovery><AppShell /></RequireRole>}>
        <Route path="/assessment" element={<Assessment />} />
      </Route>
      <Route path="/results" element={<RequireRole><p>Results page</p></RequireRole>} />
      <Route path="/admin" element={<RequireRole role="admin"><p>Admin page</p></RequireRole>} />
    </Routes>
  </MemoryRouter></AuthProvider>);
}

function changeConnectivity(value: boolean) {
  act(() => {
    online = value;
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

function deferVerification() {
  let resolve!: (user: AuthIdentity | null) => void;
  const result = new Promise<AuthIdentity | null>((done) => { resolve = done; });
  vi.mocked(getCurrentIdentity).mockReturnValueOnce(result);
  return async (user: AuthIdentity | null) => { await act(async () => { resolve(user); }); };
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', backend);
  vi.resetAllMocks();
  localStorage.clear();
  config.demo = false;
  online = false;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.mocked(getCurrentIdentity).mockResolvedValue(account);
  subscribe.mockImplementation((callback) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('trusted-device assessment recovery', () => {
  it.each(['/', '/sign-in', '/assessment', '/admin', '/results'])('opens only assessment from %s on an offline cold start', (path) => {
    store.write(account);
    start(path);
    expect(getCurrentIdentity).not.toHaveBeenCalled();
    expect(screen.getByText('Assessment for admin@example.com (local)')).toBeTruthy();
    expect(screen.getByLabelText('outer auth').textContent).toBe('/assessment:no user:recovery');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText('Admin page')).toBeNull();
    expect(screen.queryByText('Results page')).toBeNull();
    expect(screen.queryByText('Sign in page')).toBeNull();
    expect(auth.offlineRecoveryEnabled).toBe(true);
  });

  it('requires explicit production opt-in from a verified online user', async () => {
    const first = start('/assessment');
    expect(screen.getByText('Sign in page')).toBeTruthy();
    expect(() => auth.enableOfflineRecovery()).toThrow();
    expect(getCurrentIdentity).not.toHaveBeenCalled();
    first.unmount();

    online = true;
    start('/assessment');
    await screen.findByText('Assessment for admin@example.com (verified)');
    expect(auth.offlineRecoveryEnabled).toBe(false);
    expect(store.read()).toBeNull();
    act(() => auth.enableOfflineRecovery());
    expect(auth.offlineRecoveryEnabled).toBe(true);
    expect(auth.offlineRecovery).toBe(false);
    expect(store.read()?.identity.userId).toBe(account.userId);
    changeConnectivity(false);
    expect(screen.getByText('Assessment for admin@example.com (local)')).toBeTruthy();
    expect(() => auth.enableOfflineRecovery()).toThrow();
  });

  it('never reads or grants recovery through demo', async () => {
    const grant = store.write(account);
    online = true;
    config.demo = true;
    start('/assessment');
    await screen.findByText('Assessment for admin@example.com (verified)');
    expect(auth.offlineRecoveryEnabled).toBe(false);
    expect(() => auth.enableOfflineRecovery()).toThrow();
    expect(store.read()).toEqual(grant);
  });

  it('expires a running recovery session and rejects an expired grant at startup', () => {
    vi.useFakeTimers();
    const grant = store.write(account);
    const view = start('/assessment');
    expect(auth.offlineRecovery).toBe(true);
    act(() => { vi.advanceTimersByTime(grant.expiresAt - Date.now()); });
    expect(screen.getByText('Sign in page')).toBeTruthy();
    expect(auth.offlineRecoveryEnabled).toBe(false);
    view.unmount();
    start('/assessment');
    expect(screen.getByText('Sign in page')).toBeTruthy();
    expect(getCurrentIdentity).not.toHaveBeenCalled();
  });

  it('keeps the same assessment mounted until a matching reconnect verifies', async () => {
    const grant = store.write(account);
    start('/assessment');
    const finish = deferVerification();
    changeConnectivity(true);
    expect(getCurrentIdentity).toHaveBeenCalledOnce();
    expect(auth.offlineRecovery).toBe(true);
    expect(auth.user).toBeNull();
    expect(screen.getByText('Assessment for admin@example.com (local)')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    await finish(account);
    expect(screen.getByRole('navigation')).toBeTruthy();
    expect(screen.getByText('Assessment for admin@example.com (verified)')).toBeTruthy();
    expect(auth.offlineRecovery).toBe(false);
    expect(auth.offlineRecoveryEnabled).toBe(true);
    expect(mounted).toHaveBeenCalledOnce();
    expect(store.read()).toEqual(grant);
  });

  it('stays local after a transport failure but exits on a definite denial', async () => {
    store.write(account);
    start('/assessment');
    vi.mocked(getCurrentIdentity).mockRejectedValueOnce(new IdentityTransportError(new TypeError('failed to fetch')));
    await act(async () => changeConnectivity(true));
    expect(auth.offlineRecovery).toBe(true);
    expect(screen.getByText('Assessment for admin@example.com (local)')).toBeTruthy();
    vi.mocked(getCurrentIdentity).mockResolvedValueOnce(null);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry connection' })));
    expect(screen.getByText('Sign in page')).toBeTruthy();
    expect(store.read()).toBeNull();
    changeConnectivity(false);
    expect(auth.offlineRecovery).toBe(false);
  });

  it('starts recovery when Wi-Fi is up but the backend is unreachable, without ignoring a later denial', async () => {
    store.write(account);
    online = true;
    vi.mocked(getCurrentIdentity).mockRejectedValueOnce(new IdentityTransportError(new TypeError('failed to fetch')));
    start('/assessment');
    await screen.findByText('Assessment for admin@example.com (local)');
    expect(auth.offlineRecovery).toBe(true);
    await act(async () => {
      const finish = deferVerification();
      void auth.refresh();
      online = false;
      window.dispatchEvent(new Event('offline'));
      await finish(null);
    });
    expect(store.read()).toBeNull();
    expect(auth.offlineRecovery).toBe(false);
  });

  it.each([
    otherAccount,
    { ...account, organizationId: otherAccount.userId },
    { ...account, role: 'stakeholder' as const },
    { ...account, email: otherAccount.email },
  ])('revokes the grant and remounts on a verified identity mismatch (%j)', async (verifiedUser) => {
    store.write(account);
    start('/assessment');
    vi.mocked(getCurrentIdentity).mockResolvedValueOnce(verifiedUser);
    changeConnectivity(true);
    await screen.findByText(`Assessment for ${verifiedUser.email} (verified)`);
    expect(store.read()).toBeNull();
    expect(auth.offlineRecoveryEnabled).toBe(false);
    await waitFor(() => expect(mounted).toHaveBeenCalledTimes(2));
  });

  it.each(['forget', 'cross-tab removal', 'cross-tab sign-out', 'account switch'])('exits on %s and ignores a late verification', async (action) => {
    store.write(account);
    start('/assessment');
    const finish = deferVerification();
    changeConnectivity(true);
    if (action === 'forget') {
      fireEvent.click(screen.getByRole('button', { name: 'Forget this device' }));
    } else if (action === 'cross-tab removal') {
      const oldValue = localStorage.getItem(store.key);
      store.clear();
      act(() => window.dispatchEvent(new StorageEvent('storage', { key: store.key, oldValue, storageArea: localStorage })));
    } else if (action === 'cross-tab sign-out') {
      act(() => authEvent('SIGNED_OUT', null));
    } else {
      online = false;
      act(() => authEvent('SIGNED_IN', { user: { id: otherAccount.userId, email: otherAccount.email } } as Session));
    }
    expect(screen.getByText('Sign in page')).toBeTruthy();
    expect(store.read()).toBeNull();
    await finish(account);
    expect(screen.getByText('Sign in page')).toBeTruthy();
    expect(auth.user).toBeNull();
  });

  it('removes the grant immediately on local sign-out, even if Supabase sign-out fails', async () => {
    online = true;
    store.write(account);
    start('/assessment');
    await screen.findByText('Assessment for admin@example.com (verified)');
    vi.mocked(signOut).mockRejectedValueOnce(new Error('Network unreachable'));
    await act(async () => { await expect(auth.signOut()).rejects.toThrow('Network unreachable'); });
    expect(auth.offlineRecoveryEnabled).toBe(false);
    expect(store.read()).toBeNull();
    await act(async () => { await auth.signOut(); });
    await waitFor(() => expect(auth.user).toBeNull());
  });
});
