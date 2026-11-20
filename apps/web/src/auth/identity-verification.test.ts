import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentIdentity, IdentityTransportError } from '../services/auth-service';

const { getUser, membership } = vi.hoisted(() => ({ getUser: vi.fn(), membership: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: membership }) }) }) },
}));

beforeEach(() => vi.resetAllMocks());

describe('identity verification failures', () => {
  it('marks SDK retryable auth fetch errors as transport failures', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError('Could not fetch', 0) });
    await expect(getCurrentIdentity()).rejects.toBeInstanceOf(IdentityTransportError);
    expect(membership).not.toHaveBeenCalled();
  });

  it.each([new AuthSessionMissingError(), new AuthApiError('Session invalid', 401, 'session_not_found')])('returns no identity on %s', async (error) => {
    getUser.mockResolvedValue({ data: { user: null }, error });
    await expect(getCurrentIdentity()).resolves.toBeNull();
    expect(membership).not.toHaveBeenCalled();
  });

  it('distinguishes membership fetch failure from HTTP denial and missing membership', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null });
    const fetchError = { message: 'Failed to fetch', code: '' };
    const denied = { message: 'Permission denied', code: '42501' };
    membership.mockResolvedValueOnce({ error: fetchError, status: 0 });
    membership.mockResolvedValueOnce({ error: denied, status: 403 });
    membership.mockResolvedValueOnce({ data: null, error: null, status: 200 });
    await expect(getCurrentIdentity()).rejects.toBeInstanceOf(IdentityTransportError);
    await expect(getCurrentIdentity()).rejects.toBe(denied);
    await expect(getCurrentIdentity()).resolves.toBeNull();
  });
});
