alter table public.assessment_drafts add column evidence jsonb not null default '{}'::jsonb;
alter table public.assessment_records add column evidence jsonb not null default '{}'::jsonb;

create function public.validate_assessment_evidence(evidence jsonb, assessment_version text)
returns void language plpgsql immutable set search_path = pg_catalog
as $$
declare
  entry record;
  note text;
begin
  if jsonb_typeof(evidence) is distinct from 'object' then
    raise check_violation using message = 'Assessment evidence must be a JSON object.';
  end if;
  if evidence = '{}'::jsonb then return; end if;

  if assessment_version is distinct from 'uccmm-v1' then
    raise check_violation using message = 'Assessment evidence is not supported for this assessment version.';
  end if;

  for entry in select key, value from jsonb_each(evidence) loop
    if entry.key collate "C" !~ '^(leadership|communication|requirements|readiness|training|resilience)-[1-5]$' then
      raise check_violation using message = 'Assessment evidence contains an unknown question.';
    end if;
    if jsonb_typeof(entry.value) <> 'string' then
      raise check_violation using message = 'Assessment evidence values must be strings.';
    end if;

    note := entry.value #>> '{}';
    -- PostgreSQL counts code points; the textarea counts astral characters twice.
    if char_length(note) + regexp_count(note collate "C", U&'[\+010000-\+10FFFF]') > 1000 then
      raise check_violation using message = 'Assessment evidence must be at most 1000 UTF-16 code units per question.';
    end if;
  end loop;
end;
$$;

revoke all on function public.validate_assessment_evidence(jsonb, text) from public, anon, authenticated;

create function public.validate_assessment_evidence_write()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform public.validate_assessment_evidence(new.evidence, new.assessment_version);
  return new;
end;
$$;

revoke all on function public.validate_assessment_evidence_write() from public, anon, authenticated;

create trigger assessment_draft_evidence_validate
before insert or update of evidence, assessment_version on public.assessment_drafts
for each row execute function public.validate_assessment_evidence_write();

-- Record inserts are checked by validate_assessment_record; cover privileged updates too.
create trigger assessment_record_evidence_update_validate
before update of evidence, assessment_version on public.assessment_records
for each row execute function public.validate_assessment_evidence_write();

create or replace function public.validate_assessment_record()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  dimension jsonb;
  question jsonb;
  dimension_total numeric;
  dimension_weight numeric;
  canonical_dimension_weight constant numeric := 1::numeric / 6;
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
  perform public.validate_assessment_evidence(new.evidence, new.assessment_version);

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
    -- Accept the exact JSON.stringify representation of the JS template's 1 / 6.
    if item_count <> 5 or (dimension_weight is distinct from canonical_dimension_weight
      and dimension_weight is distinct from 0.16666666666666666::numeric) then
      raise exception 'Assessment dimension configuration is invalid.';
    end if;
    -- Use the original PostgreSQL weight for scoring regardless of wire representation.
    dimension_weight := canonical_dimension_weight;
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

-- Replace, rather than overload, so callers omitting p_evidence still resolve to one RPC.
drop function public.submit_assessment_record(uuid, uuid, public.member_role, text, jsonb, jsonb);

create function public.submit_assessment_record(
  p_assessment_id uuid,
  p_organization_id uuid,
  p_respondent_type public.member_role,
  p_assessment_version text,
  p_responses jsonb,
  p_template_snapshot jsonb,
  p_evidence jsonb default '{}'::jsonb
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
    dimension_scores, overall_score, overall_maturity_level, evidence
  ) values (
    p_assessment_id, p_organization_id, p_respondent_type, p_assessment_version, p_responses, p_template_snapshot,
    '[]'::jsonb, 0, 'Initial', p_evidence
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

revoke all on function public.submit_assessment_record(uuid, uuid, public.member_role, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.submit_assessment_record(uuid, uuid, public.member_role, text, jsonb, jsonb, jsonb) to authenticated;
