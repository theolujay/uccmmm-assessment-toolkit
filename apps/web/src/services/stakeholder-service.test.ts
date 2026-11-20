import { createClient } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';
import { listStakeholders } from './stakeholder-service';

const { getCurrentIdentity, requireSupabase } = vi.hoisted(() => ({ getCurrentIdentity: vi.fn(), requireSupabase: vi.fn() }));
vi.mock('./auth-service', () => ({ getCurrentIdentity }));
vi.mock('../lib/supabase', () => ({ isDemoMode: false, requireSupabase }));
beforeEach(() => vi.resetAllMocks());

it('lists only the Admin’s organisation and sorts by columns granted to authenticated users', async () => {
  const fetch = vi.fn(async (request: Request) => {
    expect(request.method).toBe('GET');
    const url = new URL(request.url);
    expect(url.pathname).toBe('/rest/v1/stakeholders');
    expect(url.searchParams.get('organization_id')).toBe('eq.demo-org');
    const selected = url.searchParams.get('select')?.split(',');
    expect(selected).not.toContain('created_at');
    expect(url.searchParams.get('order')).toBe('invited_at.asc,id.asc');
    expect(selected).toEqual(expect.arrayContaining(['invited_at', 'id']));
    return Response.json([]);
  });
  requireSupabase.mockReturnValue(createClient('https://supabase.example.test', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(new Request(input, init)) },
  }));
  getCurrentIdentity.mockResolvedValue({ role: 'admin', organizationId: 'demo-org' });
  await expect(listStakeholders()).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledOnce();
});

it('does not query the participant list for a stakeholder', async () => {
  const from = vi.fn();
  requireSupabase.mockReturnValue({ from });
  getCurrentIdentity.mockResolvedValue({ role: 'stakeholder', organizationId: 'demo-org' });
  await expect(listStakeholders()).rejects.toThrow('Admin access is required');
  expect(from).not.toHaveBeenCalled();
});
