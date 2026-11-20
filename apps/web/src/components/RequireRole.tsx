import { Fragment, type ReactElement } from 'react';
import { matchPath, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@assessment/contracts';
import { AssessmentAuthScope, useAuth } from '../auth/AuthProvider';
import { accountKey } from '../auth/offline-recovery';

export function RequireRole({ role, allowOfflineRecovery = false, children }: { role?: Role; allowOfflineRecovery?: boolean; children: ReactElement }) {
  const { user, loading, offlineRecovery } = useAuth();
  const location = useLocation();
  const isRecoveryRoute = !role && allowOfflineRecovery && matchPath('/assessment', location.pathname);
  if (offlineRecovery && !isRecoveryRoute) return <Navigate to="/assessment" replace />;
  if (!offlineRecovery) {
    if (loading) return <main className="loading-state" aria-live="polite">Checking your session…</main>;
    if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
    if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }
  if (isRecoveryRoute) return <AssessmentAuthScope>{children}</AssessmentAuthScope>;
  return user ? <Fragment key={accountKey(user)}>{children}</Fragment> : null;
}

export function PublicAuthRoutes() {
  const { offlineRecovery } = useAuth();
  return offlineRecovery ? <Navigate to="/assessment" replace /> : <Outlet />;
}
