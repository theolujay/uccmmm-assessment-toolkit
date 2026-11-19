import { Fragment, type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@assessment/contracts';
import { useAuth } from '../auth/AuthProvider';

export function RequireRole({ role, children }: { role?: Role; children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="loading-state" aria-live="polite">Checking your session…</main>;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  return <Fragment key={`${user.organizationId}:${user.userId}:${user.role}:${user.email}`}>{children}</Fragment>;
}
