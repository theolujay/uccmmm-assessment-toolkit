-- Run with psql as the migration owner on a disposable, migrated database.
-- In the same session, set fr4.template to JSON.stringify(assessmentTemplate)
-- from packages/contracts/src/index.ts. Test rows are rolled back.
\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts = on;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', '{}'),
  ('00000000-0000-4000-8000-000000000002', '{}');
insert into public.organizations (id, name, sector, employee_count, erp_platform, implementation_stage)
values ('00000000-0000-4000-8000-000000000003', 'FR4 test org', 'Testing', 10, 'Test ERP', 'planning');
insert into public.organization_members (organization_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'admin'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'stakeholder');
insert into public.stakeholders (organization_id, user_id, full_name, email, department, job_role, invitation_status)
values ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
  'FR4 stakeholder', 'stakeholder@example.test', 'Testing', 'Tester', 'sent');

do $$
begin
  assert to_regprocedure('public.submit_assessment_record(uuid,uuid,public.member_role,text,jsonb,jsonb)') is null,
    'Old overload still exists';
  assert not has_function_privilege('anon',
    'public.submit_assessment_record(uuid,uuid,public.member_role,text,jsonb,jsonb,jsonb)', 'execute'),
    'Anonymous callers must not execute the RPC';
end;
$$;

set local role authenticated;
do $$
declare
  admin_user constant uuid := '00000000-0000-4000-8000-000000000001';
  stakeholder_user constant uuid := '00000000-0000-4000-8000-000000000002';
  org constant uuid := '00000000-0000-4000-8000-000000000003';
  admin_record constant uuid := '00000000-0000-4000-8000-000000000004';
  stakeholder_record constant uuid := '00000000-0000-4000-8000-000000000005';
  legacy_record constant uuid := '00000000-0000-4000-8000-000000000006';
  template constant jsonb := current_setting('fr4.template')::jsonb;
  notes constant jsonb := jsonb_build_object('leadership-1', repeat('é', 1000),
    'communication-5', repeat(U&'\+01F600', 500), 'resilience-1', '');
  responses jsonb;
  invalid jsonb;
  submitted jsonb;
begin
  select jsonb_object_agg(q->>'id', 3) into responses
  from jsonb_array_elements(template->'dimensions') d cross join lateral jsonb_array_elements(d->'questions') q;

  perform set_config('request.jwt.claim.sub', stakeholder_user::text, true);
  insert into public.assessment_drafts (organization_id, user_id, respondent_type, assessment_version, active_question_id)
  values (org, stakeholder_user, 'stakeholder', 'uccmm-v1', 'leadership-1');
  assert (select evidence = '{}'::jsonb from public.assessment_drafts where user_id = stakeholder_user), 'Draft default';
  insert into public.assessment_drafts (organization_id, user_id, respondent_type, assessment_version, active_question_id, status, evidence)
  values (org, stakeholder_user, 'stakeholder', 'uccmm-v1', 'leadership-1', 'in_progress', notes)
  on conflict (user_id, assessment_version) do update set evidence = excluded.evidence, status = excluded.status;
  assert (select evidence = notes from public.assessment_drafts where user_id = stakeholder_user), 'Draft upsert';

  foreach invalid in array array[null::jsonb, 'null', '[]', '"note"', '{"leadership-6":"bad key"}',
    '{"unknown-1":"bad dimension"}', '{"leadership-1":42}', '{"leadership-1":null}', '{"leadership-1":{}}',
    jsonb_build_object('leadership-1', repeat('é', 1001)),
    jsonb_build_object('leadership-1', repeat('a', 999) || U&'\+01F600')]
  loop
    begin
      insert into public.assessment_drafts (organization_id, user_id, respondent_type, assessment_version, active_question_id, evidence)
      values (org, stakeholder_user, 'stakeholder', 'uccmm-v1', 'leadership-1', invalid)
      on conflict (user_id, assessment_version) do nothing;
      raise exception 'Draft INSERT accepted invalid evidence';
    exception when check_violation then null;
    end;
    begin
      update public.assessment_drafts set evidence = invalid where user_id = stakeholder_user;
      raise exception 'Draft UPDATE accepted invalid evidence';
    exception when check_violation then null;
    end;
    begin
      perform public.submit_assessment_record(stakeholder_record, org, 'stakeholder', 'uccmm-v1', responses, template, invalid);
      raise exception 'RPC accepted invalid evidence';
    exception when check_violation then null;
    end;
  end loop;
  assert (select evidence = notes from public.assessment_drafts where user_id = stakeholder_user), 'Invalid writes altered the draft';
  assert not exists (select 1 from public.assessment_respondents where assessment_id = stakeholder_record), 'Invalid RPC linked a respondent';

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  assert not exists (select 1 from public.assessment_drafts where user_id = stakeholder_user), 'Admin can read stakeholder draft';
  begin
    perform public.submit_assessment_record(admin_record, org, 'admin', 'uccmm-v1', responses,
      jsonb_set(template, '{dimensions,0,weight}', '0.16666666666666665'), notes);
    raise exception 'RPC accepted a different weight';
  exception when raise_exception then
    if sqlerrm <> 'Assessment dimension configuration is invalid.' then raise; end if;
  end;
  submitted := public.submit_assessment_record(admin_record, org, 'admin', 'uccmm-v1', responses, template, notes);
  assert submitted->'evidence' = notes and submitted->'template_snapshot' = template, 'Admin RPC result';
  assert (submitted->>'overall_score')::numeric = 60 and submitted->>'overall_maturity_level' = 'Defined', 'Score or band changed';
  assert (select evidence = notes from public.assessment_records where id = admin_record), 'Admin owner read';
  submitted := public.submit_assessment_record(p_assessment_id => legacy_record, p_organization_id => org,
    p_respondent_type => 'admin', p_assessment_version => 'uccmm-v1', p_responses => responses, p_template_snapshot => template);
  assert submitted->'evidence' = '{}'::jsonb, 'Legacy named RPC default';
  insert into public.assessment_drafts (organization_id, user_id, respondent_type, assessment_version, active_question_id, evidence)
  values (org, admin_user, 'admin', 'uccmm-v1', 'leadership-1', notes);

  perform set_config('request.jwt.claim.sub', stakeholder_user::text, true);
  assert not exists (select 1 from public.assessment_drafts where user_id = admin_user), 'Stakeholder can read admin draft';
  assert not exists (select 1 from public.assessment_records where id in (admin_record, legacy_record)), 'Stakeholder can read admin records';
  submitted := public.submit_assessment_record(stakeholder_record, org, 'stakeholder', 'uccmm-v1', responses, template, notes);
  assert submitted->'evidence' = notes, 'Stakeholder RPC result';
  assert (select evidence = notes from public.assessment_records where id = stakeholder_record), 'Stakeholder owner read';
  assert not exists (select 1 from public.assessment_drafts where user_id = stakeholder_user), 'Submission did not clear draft';
  assert (select assessment_status = 'completed' from public.stakeholders where organization_id = org), 'Submission did not complete participation';

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  assert not exists (select 1 from public.assessment_records where id = stakeholder_record), 'Admin can read stakeholder record';
end;
$$;

reset role;
do $$
begin
  begin
    update public.assessment_records set evidence = '{"leadership-1":false}'
    where id = '00000000-0000-4000-8000-000000000004';
    raise exception 'Privileged record UPDATE accepted invalid evidence';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
\echo FR4 evidence regression passed
