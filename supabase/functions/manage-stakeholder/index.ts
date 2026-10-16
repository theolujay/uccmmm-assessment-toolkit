import { failure, jsonResponse, corsHeaders } from '../_shared/http.ts';
import { generatePasscode, requireAdmin, sendInvitationEmail } from '../_shared/admin.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return failure(new Error('Method not allowed.'), 405);
  try {
    const { serviceClient, organizationId } = await requireAdmin(request);
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const action = body.action;
    if (!id || !['resend', 'reset_passcode', 'revoke'].includes(action)) return failure(new Error('Invalid stakeholder access action.'));

    const { data: stakeholder, error } = await serviceClient.from('stakeholders').select('*, organizations(name)')
      .eq('id', id).eq('organization_id', organizationId).single();
    if (error || !stakeholder) return failure(new Error('Stakeholder not found.'), 404);

    if (action === 'revoke') {
      const { error: banError } = await serviceClient.auth.admin.updateUserById(stakeholder.user_id, { ban_duration: '876000h' });
      if (banError) throw banError;
      const { error: membershipError } = await serviceClient.from('organization_members').delete()
        .eq('user_id', stakeholder.user_id).eq('organization_id', organizationId);
      if (membershipError) throw membershipError;
      const { error: statusError } = await serviceClient.from('stakeholders').update({ invitation_status: 'revoked' }).eq('id', id);
      if (statusError) throw statusError;
      return jsonResponse({ success: true });
    }

    const passcode = generatePasscode();
    // Keep access disabled until the replacement passcode has actually been emailed.
    const { error: banError } = await serviceClient.auth.admin.updateUserById(stakeholder.user_id, { ban_duration: '876000h' });
    if (banError) throw banError;
    const { error: removeMembershipError } = await serviceClient.from('organization_members').delete()
      .eq('user_id', stakeholder.user_id).eq('organization_id', organizationId);
    if (removeMembershipError) throw removeMembershipError;
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(stakeholder.user_id, { password: passcode });
    if (updateError) throw updateError;
    try {
      await sendInvitationEmail({
        email: stakeholder.email,
        fullName: stakeholder.full_name,
        organizationName: stakeholder.organizations.name,
        passcode,
      });
    } catch (emailError) {
      await serviceClient.from('stakeholders').update({ invitation_status: 'email_failed' }).eq('id', id);
      return failure(emailError);
    }
    const { error: unbanError } = await serviceClient.auth.admin.updateUserById(stakeholder.user_id, { ban_duration: 'none' });
    if (unbanError) throw unbanError;
    const { error: membershipError } = await serviceClient.from('organization_members').upsert({
      organization_id: organizationId,
      user_id: stakeholder.user_id,
      role: 'stakeholder',
    }, { onConflict: 'user_id' });
    if (membershipError) throw membershipError;
    const { error: statusError } = await serviceClient.from('stakeholders').update({ invitation_status: 'sent' }).eq('id', id);
    if (statusError) throw statusError;
    return jsonResponse({ success: true });
  } catch (error) {
    return failure(error);
  }
});
