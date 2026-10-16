import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1';

export async function requireAdmin(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new Error('Authentication is required.');
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !anonKey || !serviceKey) throw new Error('Server authentication is not configured.');

  const userClient = createClient(projectUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) throw new Error('Your session has expired. Sign in and try again.');

  const serviceClient = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: membership, error } = await serviceClient.from('organization_members')
    .select('organization_id, role').eq('user_id', user.id).maybeSingle();
  if (error || !membership || membership.role !== 'admin') throw new Error('Admin access is required.');
  return { user, organizationId: membership.organization_id as string, serviceClient };
}

export function generatePasscode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(28));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

export async function sendInvitationEmail(input: { email: string; fullName: string; organizationName: string; passcode: string }) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('INVITATION_FROM_EMAIL');
  const appUrl = Deno.env.get('APP_BASE_URL');
  if (!apiKey || !from || !appUrl) throw new Error('Invitation email is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `You are invited to complete the UCCMM assessment for ${input.organizationName}`,
      html: `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#101828;max-width:600px;margin:auto"><h1>You have been invited</h1><p>Hello ${escapeHtml(input.fullName)},</p><p>${escapeHtml(input.organizationName)} has invited you to complete its User-Centred Change Management Maturity Model assessment.</p><p><a href="${escapeHtml(appUrl)}/sign-in">Open the assessment toolkit</a></p><p>Sign in as a stakeholder using:</p><p><strong>Email:</strong> ${escapeHtml(input.email)}<br><strong>Passcode:</strong> ${escapeHtml(input.passcode)}</p><p>Your individual answers and result are private from organisation administrators.</p></main>`,
    }),
  });
  if (!response.ok) throw new Error(`Email service returned ${response.status}.`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
