import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getCurrentIdentity, IdentityTransportError, signOut as signOutUser, type AuthIdentity } from '../services/auth-service';
import { isDemoMode, supabase } from '../lib/supabase';
import { accountKey, createOfflineRecoveryStore, type OfflineRecoveryGrant } from './offline-recovery';

interface AuthContextValue {
  user: AuthIdentity | null;
  loading: boolean;
  offlineRecovery: boolean;
  offlineRecoveryEnabled: boolean;
  enableOfflineRecovery: () => void;
  disableOfflineRecovery: () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

type Session =
  | { kind: 'checking' | 'signed-out' }
  | { kind: 'verified'; user: AuthIdentity }
  | { kind: 'recovery'; grant: OfflineRecoveryGrant };

const AuthContext = createContext<AuthContextValue | null>(null);
const RecoveryIdentityContext = createContext<AuthIdentity | null>(null);
const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const sameGrant = (a: OfflineRecoveryGrant, b: OfflineRecoveryGrant | null) =>
  b !== null && a.expiresAt === b.expiresAt && accountKey(a.identity) === accountKey(b.identity);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => supabase && !isDemoMode ? createOfflineRecoveryStore(import.meta.env.VITE_SUPABASE_URL) : null);
  const [state, setState] = useState<{ session: Session; grant: OfflineRecoveryGrant | null }>(() => {
    const grant = store?.read() ?? null;
    if (supabase && browserOffline()) return { session: grant ? { kind: 'recovery', grant } : { kind: 'signed-out' }, grant };
    return { session: { kind: 'checking' }, grant };
  });
  const current = useRef(state);
  const requestVersion = useRef(0);
  const pauseAutomaticAuth = useRef(false);
  const signingOut = useRef(false);

  const publish = useCallback((session: Session, grant: OfflineRecoveryGrant | null) => {
    current.current = { session, grant };
    setState(current.current);
  }, []);

  const exitRecovery = useCallback((grant: OfflineRecoveryGrant | null) => {
    ++requestVersion.current;
    pauseAutomaticAuth.current = true;
    publish({ kind: 'signed-out' }, grant);
  }, [publish]);

  const syncGrant = useCallback(() => {
    const grant = store?.read() ?? null;
    const { session } = current.current;
    if (session.kind === 'recovery' && !sameGrant(session.grant, grant)) exitRecovery(grant);
    else publish(session, grant);
  }, [exitRecovery, publish, store]);

  const refresh = useCallback(async () => {
    if (signingOut.current) return;
    const grant = store?.read() ?? null;
    const { session } = current.current;
    if (session.kind === 'recovery' && !sameGrant(session.grant, grant)) {
      exitRecovery(grant);
      return;
    }
    if (supabase && browserOffline()) {
      // A pending verification can still report a denial; going offline must not discard it.
      const matches = grant && (session.kind !== 'verified' || accountKey(session.user) === accountKey(grant.identity));
      if (matches && !pauseAutomaticAuth.current) publish({ kind: 'recovery', grant }, grant);
      else publish(session.kind === 'checking' ? { kind: 'signed-out' } : session, grant);
      return;
    }

    pauseAutomaticAuth.current = false;
    const version = ++requestVersion.current;
    let user: AuthIdentity | null;
    try {
      user = await getCurrentIdentity();
    } catch (error) {
      if (version !== requestVersion.current) return;
      if (error instanceof IdentityTransportError) {
        if (current.current.session.kind === 'recovery') syncGrant();
        else {
          const localGrant = store?.read() ?? null;
          // A Wi-Fi link can remain up during an ISP outage. Fall back only on transport failure.
          const active = current.current.session;
          const matches = localGrant && (active.kind !== 'verified' || accountKey(active.user) === accountKey(localGrant.identity));
          publish(matches ? { kind: 'recovery', grant: localGrant } : { kind: 'signed-out' }, localGrant);
        }
        return;
      }
      user = null;
    }
    if (version !== requestVersion.current) return;
    if (!user) {
      store?.clear();
      publish({ kind: 'signed-out' }, null);
      return;
    }
    let verifiedGrant = store?.read() ?? null;
    const active = current.current.session;
    if (active.kind === 'recovery' && !sameGrant(active.grant, verifiedGrant)) {
      exitRecovery(verifiedGrant);
      return;
    }
    if (verifiedGrant && accountKey(user) !== accountKey(verifiedGrant.identity)) {
      store?.clear();
      verifiedGrant = null;
    }
    if (supabase && browserOffline()) {
      publish(verifiedGrant ? { kind: 'recovery', grant: verifiedGrant } : { kind: 'signed-out' }, verifiedGrant);
    } else {
      publish({ kind: 'verified', user }, verifiedGrant);
    }
  }, [exitRecovery, publish, store, syncGrant]);

  const enableOfflineRecovery = useCallback(() => {
    const { session } = current.current;
    if (!store || session.kind !== 'verified' || browserOffline() || signingOut.current) {
      throw new Error('Sign in online to enable offline recovery on this device.');
    }
    publish(session, store.write(session.user));
  }, [publish, store]);

  const disableOfflineRecovery = useCallback(() => {
    store?.clear();
    const { session } = current.current;
    if (session.kind === 'recovery') exitRecovery(null);
    else publish(session, null);
  }, [exitRecovery, publish, store]);

  const signOut = useCallback(async () => {
    disableOfflineRecovery();
    signingOut.current = true;
    ++requestVersion.current;
    try {
      await signOutUser();
      pauseAutomaticAuth.current = true;
      publish({ kind: 'signed-out' }, null);
    } finally {
      signingOut.current = false;
    }
  }, [disableOfflineRecovery, publish]);

  useEffect(() => {
    void refresh();
    if (!supabase) return () => { ++requestVersion.current; };

    let authTimer: number | undefined;
    const retry = () => { if (!pauseAutomaticAuth.current) void refresh(); };
    const onStorage = (event: StorageEvent) => {
      if (!store || (event.storageArea !== null && event.storageArea !== window.localStorage)) return;
      if (event.key !== store.key && event.key !== null) return;
      if (event.newValue === null && current.current.session.kind === 'recovery') exitRecovery(store.read());
      else syncGrant();
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
      window.clearTimeout(authTimer);
      if (event === 'SIGNED_OUT') {
        ++requestVersion.current;
        store?.clear();
        publish({ kind: 'signed-out' }, null);
        return;
      }

      // An SDK session is only a signal to invalidate/recheck, never a verified identity.
      const { session } = current.current;
      const grant = store?.read();
      const differs = (identity: Pick<AuthIdentity, 'userId' | 'email'>) =>
        authSession && (identity.userId !== authSession.user.id || identity.email !== (authSession.user.email ?? ''));
      const switched = (grant && differs(grant.identity)) || (session.kind === 'recovery' && differs(session.grant.identity)) ||
        (session.kind === 'verified' && differs(session.user));
      if (switched) {
        ++requestVersion.current;
        store?.clear();
        publish({ kind: browserOffline() || pauseAutomaticAuth.current ? 'signed-out' : 'checking' }, null);
      }
      if ((event === 'INITIAL_SESSION' && !switched) || browserOffline() || signingOut.current || pauseAutomaticAuth.current) return;
      const version = requestVersion.current;
      // Do not call Supabase again inside its auth callback or supersede a newer manual refresh.
      authTimer = window.setTimeout(() => { if (version === requestVersion.current) retry(); }, 0);
    });
    window.addEventListener('online', retry);
    window.addEventListener('offline', retry);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', syncGrant);
    window.addEventListener('pageshow', syncGrant);
    return () => {
      ++requestVersion.current;
      subscription.unsubscribe();
      window.clearTimeout(authTimer);
      window.removeEventListener('online', retry);
      window.removeEventListener('offline', retry);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', syncGrant);
      window.removeEventListener('pageshow', syncGrant);
    };
  }, [exitRecovery, publish, refresh, store, syncGrant]);

  useEffect(() => {
    if (!state.grant) return;
    const timer = window.setTimeout(syncGrant, Math.max(0, state.grant.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state.grant, syncGrant]);

  const { session, grant } = state;
  const user = session.kind === 'verified' ? session.user : null;
  const recoveryIdentity = useMemo<AuthIdentity | null>(() => session.kind === 'recovery'
    ? { ...session.grant.identity, fullName: '', organizationName: '' }
    : null, [session]);
  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading: session.kind === 'checking',
    offlineRecovery: session.kind === 'recovery',
    offlineRecoveryEnabled: session.kind === 'recovery' || (!!user && !!grant && accountKey(user) === accountKey(grant.identity)),
    enableOfflineRecovery,
    disableOfflineRecovery,
    refresh,
    signOut,
  }), [user, session.kind, grant, enableOfflineRecovery, disableOfflineRecovery, refresh, signOut]);

  return <AuthContext.Provider value={value}><RecoveryIdentityContext.Provider value={recoveryIdentity}>{children}</RecoveryIdentityContext.Provider></AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

/** Only the assessment route should mount this scope. The outer auth context has no recovery user. */
export function AssessmentAuthScope({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const recoveryIdentity = useContext(RecoveryIdentityContext);
  const user = auth.offlineRecovery ? recoveryIdentity : auth.user;
  if (!user) return null;
  return <AuthContext.Provider value={auth.offlineRecovery ? { ...auth, user } : auth}>
    <Fragment key={accountKey(user)}>{children}</Fragment>
  </AuthContext.Provider>;
}
