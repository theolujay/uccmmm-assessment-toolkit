-- Run with psql as the migration owner on a disposable, migrated database.
\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts = on;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000801', '{}'),
  ('00000000-0000-4000-8000-000000000802', '{}');
insert into public.organizations (id, name, sector, employee_count, erp_platform, implementation_stage) values
  ('00000000-0000-4000-8000-000000000803', 'FR8 test org', 'Testing', 10, 'Test ERP', 'planning'),
  ('00000000-0000-4000-8000-000000000804', 'FR8 other org', 'Testing', 10, 'Test ERP', 'planning');
insert into public.organization_members (organization_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000801', 'admin'),
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000802', 'stakeholder');

set local role authenticated;
do $$
declare
  admin_user constant uuid := '00000000-0000-4000-8000-000000000801';
  stakeholder_user constant uuid := '00000000-0000-4000-8000-000000000802';
  org constant uuid := '00000000-0000-4000-8000-000000000803';
  other_org constant uuid := '00000000-0000-4000-8000-000000000804';
  baseline_id constant uuid := '00000000-0000-4000-8000-000000000805';
  next_baseline_id constant uuid := '00000000-0000-4000-8000-000000000806';
  stakeholder_id constant uuid := '00000000-0000-4000-8000-000000000807';
  initial_targets constant jsonb := '{"leadership":20,"resilience":100}';
  changed_targets constant jsonb := '{"training":73}';
  template jsonb;
  responses jsonb;
  invalid jsonb;
  submitted jsonb;
begin
  -- A minimal scoring-valid uccmm-v1 template keeps this test self-contained.
  select jsonb_build_object('version', 'uccmm-v1', 'dimensions', jsonb_agg(jsonb_build_object(
    'id', dimension_id, 'name', dimension_id, 'order', dimension_order, 'weight', 1::numeric / 6,
    'questions', (select jsonb_agg(jsonb_build_object('id', dimension_id || '-' || n, 'order', n) order by n)
      from generate_series(1, 5) as question(n))
  ) order by dimension_order)) into template
  from unnest(array['leadership', 'communication', 'requirements', 'readiness', 'training', 'resilience'])
    with ordinality as dimension(dimension_id, dimension_order);
  select jsonb_object_agg(q->>'id', 3) into responses
  from jsonb_array_elements(template->'dimensions') d cross join lateral jsonb_array_elements(d->'questions') q;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  assert (select maturity_targets = '{}'::jsonb from public.organizations where id = org), 'Organization defaults to no targets';
  update public.organizations set maturity_targets = initial_targets where id = org;
  assert found, 'Admin could not update their organization';
  assert (select maturity_targets = initial_targets from public.organizations where id = org), 'Admin update did not persist';
  update public.organizations set maturity_targets = initial_targets where id = other_org;
  assert not found, 'Admin updated another organization';
  assert not exists (select 1 from public.organizations where id = other_org), 'Admin read another organization';

  foreach invalid in array array[null::jsonb, 'null', '[]', 'true', '{"unknown":70}', '{"__proto__":70}', '{"leadership":19}',
    '{"leadership":101}', '{"leadership":55.5}', '{"leadership":"70"}', '{"leadership":null}', '{"leadership":{}}']
  loop
    begin
      update public.organizations set maturity_targets = invalid where id = org;
      raise exception 'Invalid target configuration was accepted: %', invalid;
    exception when check_violation or not_null_violation then null;
    end;
  end loop;
  assert (select maturity_targets = initial_targets from public.organizations where id = org), 'Invalid updates changed the configuration';

  -- The existing RPC still accepts submissions without p_evidence or a target parameter.
  submitted := public.submit_assessment_record(baseline_id, org, 'admin', 'uccmm-v1', responses, template);
  assert submitted->'target_snapshot' = initial_targets, 'Baseline did not capture the current targets';
  assert submitted->'evidence' = '{}'::jsonb, 'Evidence default changed';
  assert (select target_snapshot = initial_targets from public.assessment_records where id = baseline_id), 'Admin cannot read their snapshot';

  update public.organizations set maturity_targets = changed_targets where id = org;
  assert (select target_snapshot = initial_targets from public.assessment_records where id = baseline_id), 'Config update changed the baseline';
  submitted := public.submit_assessment_record(next_baseline_id, org, 'admin', 'uccmm-v1', responses, template);
  assert submitted->'target_snapshot' = changed_targets, 'New baseline did not capture changed targets';

  begin
    update public.assessment_records set target_snapshot = changed_targets where id = baseline_id;
    assert not found, 'Admin was able to change a submitted snapshot';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', stakeholder_user::text, true);
  update public.organizations set maturity_targets = '{}'::jsonb where id = org;
  assert not found, 'Stakeholder updated the organization targets';
  assert not exists (select 1 from public.assessment_records where id in (baseline_id, next_baseline_id)), 'Stakeholder read an Admin baseline';
  begin
    perform public.submit_assessment_record(stakeholder_id, org, 'admin', 'uccmm-v1', responses, template);
    raise exception 'Stakeholder was able to submit an Admin baseline';
  exception when raise_exception then
    if sqlerrm <> 'You are not authorised to submit this assessment.' then raise; end if;
  end;
  submitted := public.submit_assessment_record(stakeholder_id, org, 'stakeholder', 'uccmm-v1', responses, template);
  assert submitted->'target_snapshot' = '{}'::jsonb, 'Stakeholder submission captured organization targets';
  assert (select target_snapshot = '{}'::jsonb from public.assessment_records where id = stakeholder_id), 'Stakeholder cannot read their own record';

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  assert not exists (select 1 from public.assessment_records where id = stakeholder_id), 'Admin read a stakeholder record';
  assert (select maturity_targets = changed_targets from public.organizations where id = org), 'Stakeholder changed the configuration';
  update public.organizations set maturity_targets = '{}'::jsonb where id = org;
  assert (select maturity_targets = '{}'::jsonb from public.organizations where id = org), 'Admin could not clear all targets';
end;
$$;

reset role;
do $$
declare
  baseline_id constant uuid := '00000000-0000-4000-8000-000000000805';
  snapshot jsonb;
begin
  -- Even privileged inserts cannot supply their own snapshot; the organization is now unset.
  insert into public.assessment_records (organization_id, respondent_type, assessment_version, responses,
    template_snapshot, dimension_scores, overall_score, overall_maturity_level, target_snapshot)
  select organization_id, 'admin', assessment_version, responses, template_snapshot, '[]', 0, 'Initial', '{"training":80}'
  from public.assessment_records where id = baseline_id returning target_snapshot into snapshot;
  assert snapshot = '{}'::jsonb, 'Insert used a supplied snapshot instead of the unset configuration';

  begin
    update public.assessment_records set target_snapshot = '{"leadership":75}' where id = baseline_id;
    raise exception 'Privileged update changed an existing snapshot';
  exception when check_violation then null;
  end;
  assert (select target_snapshot = '{"leadership":20,"resilience":100}'::jsonb from public.assessment_records where id = baseline_id),
    'Original baseline snapshot did not survive configuration changes';
end;
$$;
rollback;
\echo FR8 maturity targets regression passed
