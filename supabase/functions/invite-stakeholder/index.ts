import { failure, jsonResponse, corsHeaders } from '../_shared/http.ts';
import { generatePasscode, requireAdmin, sendInvitationEmail } from '../_shared/admin.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return failure(new Error('Method not allowed.'), 405);

  let auth: Awaited<ReturnType<typeof requireAdmin>> | undefined;
  let newUserId: string | undefined;
  try {
    auth = await requireAdmin(request);
    const body = await request.json();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const department = typeof body.department === 'string' ? body.department.trim() : '';
    const jobRole = typeof body.jobRole === 'string' ? body.jobRole.trim() : '';
    if (fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !department || !jobRole) {
      return failure(new Error('Enter a valid name, email, department, and job role.'));
    }

    const { data: existing, error: lookupError } = await auth.serviceClient.from('stakeholders')
      .select('id').eq('organization_id', auth.organizationId).ilike('email', email).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return failure(new Error('A stakeholder with this email is already in your organisation.'));

    const { data: organization, error: orgError } = await auth.serviceClient.from('organizations')
      .select('name').eq('id', auth.organizationId).single();
    if (orgError) throw orgError;

    const passcode = generatePasscode();
    const { data: created, error: createError } = await auth.serviceClient.auth.admin.createUser({
      email,
      password: passcode,
      email_confirm: true,
      user_metadata: { account_type: 'stakeholder', full_name: fullName },
    });
    if (createError || !created.user) throw createError ?? new Error('Could not create the stakeholder account.');
    newUserId = created.user.id;

    const { error: memberError } = await auth.serviceClient.from('organization_members').insert({
      organization_id: auth.organizationId,
      user_id: newUserId,
      role: 'stakeholder',
    });
    if (memberError) throw memberError;

    const { data: stakeholder, error: stakeholderError } = await auth.serviceClient.from('stakeholders').insert({
      organization_id: auth.organizationId,
      user_id: newUserId,
      full_name: fullName,
      email,
      department,
      job_role: jobRole,
      invitation_status: 'pending',
    }).select('*').single();
    if (stakeholderError) throw stakeholderError;

    try {
      await sendInvitationEmail({ email, fullName, organizationName: organization.name, passcode });
    } catch (emailError) {
      await auth.serviceClient.from('stakeholders').update({ invitation_status: 'email_failed' }).eq('id', stakeholder.id);
      return failure(emailError);
    }

    const { error: statusError } = await auth.serviceClient.from('stakeholders').update({ invitation_status: 'sent' }).eq('id', stakeholder.id);
    if (statusError) throw statusError;
    const { id, organization_id, full_name: savedName, email: savedEmail, department: savedDepartment, job_role, invited_at } = stakeholder;
    return jsonResponse({ stakeholder: {
      id,
      organization_id,
      full_name: savedName,
      email: savedEmail,
      department: savedDepartment,
      job_role,
      invitation_status: 'sent',
      assessment_status: 'not_started',
      invited_at,
      started_at: null,
      completed_at: null,
    } }, 201);
  } catch (error) {
    if (auth && newUserId) {
      await auth.serviceClient.from('stakeholders').delete().eq('user_id', newUserId);
      await auth.serviceClient.from('organization_members').delete().eq('user_id', newUserId);
      await auth.serviceClient.auth.admin.deleteUser(newUserId);
    }
    return failure(error);
  }
});
