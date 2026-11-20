import type { AuthIdentity } from '../services/auth-service';

type OfflineIdentity = Pick<AuthIdentity, 'userId' | 'organizationId' | 'role' | 'email'>;

export interface OfflineRecoveryGrant {
  identity: OfflineIdentity;
  expiresAt: number;
}

export const offlineRecoveryLifetime = 7 * 24 * 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function accountKey({ organizationId, userId, role, email }: OfflineIdentity): string {
  return JSON.stringify([organizationId, userId, role, email]);
}

function parseIdentity(value: unknown): OfflineIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const { userId, organizationId, role, email } = value as Partial<Record<keyof OfflineIdentity, unknown>>;
  if (typeof userId !== 'string' || !uuid.test(userId) || typeof organizationId !== 'string' || !uuid.test(organizationId)) return null;
  if (role !== 'admin' && role !== 'stakeholder') return null;
  if (typeof email !== 'string' || email.length > 320 || (email !== '' && !/^[^\s@]+@[^\s@]+$/.test(email))) return null;
  return { userId, organizationId, role, email };
}

export function createOfflineRecoveryStore(backendUrl: string | undefined) {
  let backend: string;
  try {
    const url = new URL(backendUrl ?? '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    backend = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }

  const key = `uccmm-offline-recovery:v1:${backend}`;
  return {
    key,
    read(): OfflineRecoveryGrant | null {
      try {
        const value: { backend?: unknown; identity?: unknown; expiresAt?: unknown } | null = JSON.parse(window.localStorage.getItem(key) ?? 'null');
        if (!value || value.backend !== backend) return null;
        const { expiresAt } = value;
        const now = Date.now();
        if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + offlineRecoveryLifetime) return null;
        const identity = parseIdentity(value.identity);
        return identity ? { identity, expiresAt } : null;
      } catch {
        return null;
      }
    },
    write(user: AuthIdentity): OfflineRecoveryGrant {
      const identity = parseIdentity(user);
      if (!identity) throw new Error('This account cannot be used for offline recovery.');
      const grant = { identity, expiresAt: Date.now() + offlineRecoveryLifetime };
      try {
        window.localStorage.setItem(key, JSON.stringify({ backend, ...grant }));
      } catch {
        throw new Error('Offline recovery could not be enabled because browser storage is unavailable.');
      }
      return grant;
    },
    clear(): void {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Some browser settings deny storage; in-memory access is revoked separately.
      }
    },
  };
}
