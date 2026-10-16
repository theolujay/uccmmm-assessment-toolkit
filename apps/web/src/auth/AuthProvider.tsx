import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getCurrentIdentity, signOut as signOutUser, type AuthIdentity } from '../services/auth-service';
import { isDemoMode, supabase } from '../lib/supabase';

interface AuthContextValue {
  user: AuthIdentity | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setUser(await getCurrentIdentity());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!supabase) {
      if (isDemoMode && typeof sessionStorage !== 'undefined') {
        void refresh();
      } else {
        setLoading(false);
      }
      return;
    }
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => { void refresh(); }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    refresh,
    signOut: async () => {
      await signOutUser();
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
