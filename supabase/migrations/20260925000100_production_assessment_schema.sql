create extension if not exists pgcrypto;

create type public.member_role as enum ('admin', 'stakeholder');
create type public.implementation_stage as enum ('planning', 'in_progress', 'post_go_live');
create type public.invitation_status as enum ('pending', 'sent', 'email_failed', 'revoked');
create type public.participation_status as enum ('not_started', 'in_progress', 'completed');
create type public.assessment_status as enum ('draft', 'in_progress', 'submitted');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  sector text not null check (char_length(trim(sector)) between 2 and 120),
  employee_count integer not null check (employee_count > 0),
  erp_platform text not null check (char_length(trim(erp_platform)) between 2 and 120),
  implementation_stage public.implementation_stage not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.stakeholders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null,
  department text not null,
  job_role text not null,
  invitation_status public.invitation_status not null default 'pending',
  assessment_status public.participation_status not null default 'not_started',
  invited_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index stakeholders_org_email_uq on public.stakeholders (organization_id, lower(email));

create table public.assessment_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  respondent_type public.member_role not null,
  assessment_version text not null,
  responses jsonb not null default '{}'::jsonb check (jsonb_typeof(responses) = 'object'),
  active_question_id text not null,
  status public.assessment_status not null default 'draft' check (status <> 'submitted'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, assessment_version)
);

create table public.assessment_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  respondent_type public.member_role not null,
  assessment_version text not null,
  submitted_at timestamptz not null default now(),
  responses jsonb not null check (jsonb_typeof(responses) = 'object'),
  template_snapshot jsonb not null check (jsonb_typeof(template_snapshot) = 'object'),
  dimension_scores jsonb not null check (jsonb_typeof(dimension_scores) = 'array'),
  overall_score numeric(8, 5) not null check (overall_score between 0 and 100),
  overall_maturity_level text not null check (overall_maturity_level in ('Initial', 'Developing', 'Defined', 'Managed', 'Optimising'))
);

-- Keep respondent identity in a separate table with respondent-only access.
-- Assessment records contain no user identifier, and submissions add both rows atomically.
create table public.assessment_respondents (
  assessment_id uuid primary key references public.assessment_records(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  respondent_user_id uuid not null references auth.users(id) on delete restrict,
  respondent_type public.member_role not null,
  assessment_version text not null,
  submitted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index stakeholders_org_status_idx on public.stakeholders (organization_id, assessment_status);
create index assessments_org_submitted_idx on public.assessment_records (organization_id, submitted_at desc);
create index assessment_respondents_user_submitted_idx on public.assessment_respondents (respondent_user_id, submitted_at desc);

create or replace function public.classify_maturity_score(score numeric, bands jsonb)
returns text language sql immutable set search_path = public
as $$
  select band->>'level'
  from jsonb_array_elements(bands) as band
  where score <= (band->>'upperBound')::numeric
  order by (band->>'upperBound')::numeric
  limit 1;
$$;

create or replace function public.validate_assessment_record()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  dimension jsonb;
  question jsonb;
  dimension_total numeric;
  dimension_weight numeric;
  dimension_score numeric;
  weight_total numeric := 0;
  overall_total numeric := 0;
  overall_score numeric;
  item_count integer;
  expected_ids text[] := array[]::text[];
  calculated_scores jsonb := '[]'::jsonb;
  bands jsonb;
  dimension_level text;
  overall_level text;
  answer_value integer;
  expected_dimension_ids text[] := array['leadership', 'communication', 'requirements', 'readiness', 'training', 'resilience'];
begin
  if jsonb_typeof(new.template_snapshot->'dimensions') <> 'array'
    or jsonb_array_length(new.template_snapshot->'dimensions') <> 6
    or new.assessment_version <> 'uccmm-v1'
    or new.assessment_version <> new.template_snapshot->>'version' then
    raise exception 'Assessment template snapshot is invalid.';
  end if;

  bands := coalesce(new.template_snapshot->'maturityBands', '[{"level":"Initial","upperBound":20},{"level":"Developing","upperBound":40},{"level":"Defined","upperBound":60},{"level":"Managed","upperBound":80},{"level":"Optimising","upperBound":100}]'::jsonb);
  if bands <> '[{"level":"Initial","upperBound":20},{"level":"Developing","upperBound":40},{"level":"Defined","upperBound":60},{"level":"Managed","upperBound":80},{"level":"Optimising","upperBound":100}]'::jsonb then
    raise exception 'Assessment maturity bands are invalid.';
  end if;

  for dimension in select value from jsonb_array_elements(new.template_snapshot->'dimensions') loop
    if dimension->>'id' is distinct from expected_dimension_ids[coalesce((dimension->>'order')::integer, 0)]
      or coalesce((dimension->>'order')::integer, 0) not between 1 and 6 then
      raise exception 'Assessment dimensions do not match the approved template.';
    end if;
    item_count := jsonb_array_length(dimension->'questions');
    dimension_total := 0;
    dimension_weight := (dimension->>'weight')::numeric;
    if item_count <> 5 or dimension_weight <> (1::numeric / 6) then raise exception 'Assessment dimension configuration is invalid.'; end if;
    weight_total := weight_total + dimension_weight;

    for question in select value from jsonb_array_elements(dimension->'questions') loop
      if question->>'id' is distinct from (dimension->>'id') || '-' || (question->>'order')
        or coalesce((question->>'order')::integer, 0) not between 1 and 5 then
        raise exception 'Assessment questions do not match the approved template.';
      end if;
      expected_ids := array_append(expected_ids, question->>'id');
      if not (new.responses ? (question->>'id')) then raise exception 'Cannot submit an incomplete assessment.'; end if;
      begin
        answer_value := (new.responses->>(question->>'id'))::integer;
      exception when others then
        raise exception 'Assessment responses must be integer values from 1 to 5.';
      end;
      if answer_value < 1 or answer_value > 5 then raise exception 'Assessment responses must be integer values from 1 to 5.'; end if;
      dimension_total := dimension_total + answer_value;
    end loop;

    dimension_score := (dimension_total / (5 * item_count)) * 100;
    dimension_level := public.classify_maturity_score(dimension_score, bands);
    if dimension_level is null then raise exception 'Assessment maturity bands do not cover the dimension score.'; end if;
    calculated_scores := calculated_scores || jsonb_build_array(jsonb_build_object(
      'dimensionId', dimension->>'id',
      'dimensionName', dimension->>'name',
      'scorePercentage', dimension_score,
      'maturityLevel', dimension_level,
      'itemCount', item_count
    ));
    overall_total := overall_total + dimension_score * dimension_weight;
  end loop;

  if abs(weight_total - 1) > 0.000000001 then raise exception 'Assessment dimension weights must total 1.0.'; end if;
  if cardinality(expected_ids) <> 30
    or (select count(distinct value) from unnest(expected_ids) value) <> 30
    or cardinality(expected_ids) <> (select count(*) from jsonb_object_keys(new.responses)) then
    raise exception 'Assessment responses contain an unknown or duplicate question.';
  end if;

  overall_score := overall_total / weight_total;
  overall_level := public.classify_maturity_score(overall_score, bands);
  if overall_level is null then raise exception 'Assessment maturity bands do not cover the overall score.'; end if;
  new.dimension_scores := calculated_scores;
  new.overall_score := overall_score;
  new.overall_maturity_level := overall_level;
  new.submitted_at := now();
  return new;
end;
$$;

create trigger assessment_record_validate before insert on public.assessment_records
for each row execute function public.validate_assessment_record();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_organization_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_organization_id and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_touch_updated_at before update on public.organizations
for each row execute function public.touch_updated_at();
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger drafts_touch_updated_at before update on public.assessment_drafts
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  metadata jsonb := new.raw_user_meta_data;
  new_organization_id uuid;
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(metadata->>'full_name', ''))
  on conflict (user_id) do update set full_name = excluded.full_name;

  if metadata->>'account_type' = 'admin' then
    if nullif(trim(metadata->>'organization_name'), '') is null
      or nullif(trim(metadata->>'sector'), '') is null
      or nullif(metadata->>'employee_count', '') is null
      or nullif(trim(metadata->>'erp_platform'), '') is null
      or metadata->>'implementation_stage' not in ('planning', 'in_progress', 'post_go_live') then
      raise exception 'Admin organisation profile is incomplete.';
    end if;

    insert into public.organizations (name, sector, employee_count, erp_platform, implementation_stage)
    values (
      trim(metadata->>'organization_name'), trim(metadata->>'sector'),
      (metadata->>'employee_count')::integer, trim(metadata->>'erp_platform'),
      (metadata->>'implementation_stage')::public.implementation_stage
    ) returning id into new_organization_id;
    insert into public.organization_members (organization_id, user_id, role)
    values (new_organization_id, new.id, 'admin');
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.mark_stakeholder_started()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.respondent_type = 'stakeholder' and new.status = 'in_progress' then
    update public.stakeholders set
      assessment_status = 'in_progress', started_at = coalesce(started_at, now())
    where user_id = new.user_id and organization_id = new.organization_id and invitation_status = 'sent'
      and assessment_status = 'not_started';
  end if;
  return new;
end;
$$;
create trigger draft_marks_stakeholder_started after insert or update of status on public.assessment_drafts
for each row execute function public.mark_stakeholder_started();

create or replace function public.sync_assessment_respondent()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.respondent_type = 'stakeholder' then
    update public.stakeholders set
      assessment_status = 'completed', completed_at = new.submitted_at
    where user_id = new.respondent_user_id and organization_id = new.organization_id;
  end if;
  delete from public.assessment_drafts
  where user_id = new.respondent_user_id and assessment_version = new.assessment_version;
  return new;
end;
$$;
create trigger assessment_respondent_sync after insert on public.assessment_respondents
for each row execute function public.sync_assessment_respondent();

create or replace function public.submit_assessment_record(
  p_assessment_id uuid,
  p_organization_id uuid,
  p_respondent_type public.member_role,
  p_assessment_version text,
  p_responses jsonb,
  p_template_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare
  submitted_record public.assessment_records;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.role = p_respondent_type
  ) then
    raise exception 'You are not authorised to submit this assessment.';
  end if;

  insert into public.assessment_records (
    id, organization_id, respondent_type, assessment_version, responses, template_snapshot,
    dimension_scores, overall_score, overall_maturity_level
  ) values (
    p_assessment_id, p_organization_id, p_respondent_type, p_assessment_version, p_responses, p_template_snapshot,
    '[]'::jsonb, 0, 'Initial'
  ) returning * into submitted_record;

  insert into public.assessment_respondents (
    assessment_id, organization_id, respondent_user_id, respondent_type, assessment_version, submitted_at
  ) values (
    submitted_record.id, p_organization_id, auth.uid(), p_respondent_type,
    submitted_record.assessment_version, submitted_record.submitted_at
  );

  return to_jsonb(submitted_record);
end;
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.stakeholders enable row level security;
alter table public.assessment_drafts enable row level security;
alter table public.assessment_records enable row level security;
alter table public.assessment_respondents enable row level security;

create policy organizations_read_member on public.organizations
for select to authenticated using (public.is_org_member(id));
create policy organizations_update_admin on public.organizations
for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy profiles_read_self on public.profiles
for select to authenticated using (user_id = auth.uid());
create policy profiles_update_self on public.profiles
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy members_read_self on public.organization_members
for select to authenticated using (user_id = auth.uid());
create policy stakeholders_read_admin_or_self on public.stakeholders
for select to authenticated using (public.is_org_admin(organization_id) or user_id = auth.uid());

create policy drafts_read_owner on public.assessment_drafts
for select to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy drafts_insert_owner on public.assessment_drafts
for insert to authenticated with check (
  user_id = auth.uid() and public.is_org_member(organization_id)
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = assessment_drafts.organization_id and m.user_id = auth.uid() and m.role = respondent_type
  )
);
create policy drafts_update_owner on public.assessment_drafts
for update to authenticated using (user_id = auth.uid() and public.is_org_member(organization_id))
with check (
  user_id = auth.uid() and public.is_org_member(organization_id)
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = assessment_drafts.organization_id and m.user_id = auth.uid() and m.role = respondent_type
  )
);
create policy drafts_delete_owner on public.assessment_drafts
for delete to authenticated using (user_id = auth.uid());

create policy assessments_read_owner on public.assessment_records
for select to authenticated using (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.assessment_respondents r
    where r.assessment_id = assessment_records.id and r.organization_id = assessment_records.organization_id
      and r.respondent_user_id = auth.uid() and r.respondent_type = assessment_records.respondent_type
  )
);
create policy assessment_respondents_read_self on public.assessment_respondents
for select to authenticated using (
  respondent_user_id = auth.uid() and public.is_org_member(organization_id)
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = assessment_respondents.organization_id and m.user_id = auth.uid()
      and m.role = assessment_respondents.respondent_type
  )
);

create policy assessments_insert_member on public.assessment_records
for insert to authenticated with check (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = assessment_records.organization_id and m.user_id = auth.uid()
      and m.role = assessment_records.respondent_type
  )
);

grant select, update on public.organizations to authenticated;
grant select, update on public.profiles to authenticated;
grant select (organization_id, user_id, role) on public.organization_members to authenticated;
grant select (id, organization_id, full_name, email, department, job_role, invitation_status, assessment_status, invited_at, started_at, completed_at) on public.stakeholders to authenticated;
grant select, insert, update, delete on public.assessment_drafts to authenticated;
grant select on public.assessment_records to authenticated;
grant select on public.assessment_respondents to authenticated;
grant usage on schema public to authenticated;
revoke all on public.organizations, public.profiles, public.organization_members, public.stakeholders,
  public.assessment_drafts, public.assessment_records, public.assessment_respondents from anon;
revoke insert, update, delete on public.assessment_records, public.assessment_respondents from authenticated;
revoke select on public.organization_members, public.stakeholders from authenticated;
grant select (organization_id, user_id, role) on public.organization_members to authenticated;
grant select (id, organization_id, full_name, email, department, job_role, invitation_status, assessment_status, invited_at, started_at, completed_at) on public.stakeholders to authenticated;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
revoke all on function public.classify_maturity_score(numeric, jsonb) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
revoke all on function public.submit_assessment_record(uuid, uuid, public.member_role, text, jsonb, jsonb) from public;
grant execute on function public.submit_assessment_record(uuid, uuid, public.member_role, text, jsonb, jsonb) to authenticated;
