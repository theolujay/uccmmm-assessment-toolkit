-- The key set matches the six dimensions in the uccmm-v1 contract.
create function public.valid_maturity_targets(targets jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog
as $$
declare
  entry record;
  percentage numeric;
begin
  if jsonb_typeof(targets) is distinct from 'object' then return false; end if;
  for entry in select key, value from jsonb_each(targets) loop
    if entry.key collate "C" not in ('leadership', 'communication', 'requirements', 'readiness', 'training', 'resilience')
      or jsonb_typeof(entry.value) <> 'number' then
      return false;
    end if;
    percentage := entry.value::numeric;
    if percentage < 20 or percentage > 100 or percentage <> trunc(percentage) then return false; end if;
  end loop;
  return true;
end;
$$;

-- Keep the existing organization policies: only its admins can update the row.
alter table public.organizations
  add column maturity_targets jsonb not null default '{}'::jsonb,
  add constraint organizations_maturity_targets_valid check (public.valid_maturity_targets(maturity_targets));

alter table public.assessment_records
  add column target_snapshot jsonb not null default '{}'::jsonb,
  add constraint assessment_records_target_snapshot_valid check (
    public.valid_maturity_targets(target_snapshot)
    and (respondent_type = 'admin' or target_snapshot = '{}'::jsonb)
  );

-- Derive the snapshot for every insert without trusting client input or changing the submission RPC.
create function public.capture_assessment_target_snapshot()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  new.target_snapshot := '{}'::jsonb;
  if new.respondent_type = 'admin' then
    new.target_snapshot := coalesce((
      select o.maturity_targets from public.organizations o where o.id = new.organization_id
    ), '{}'::jsonb);
  end if;
  return new;
end;
$$;

revoke all on function public.capture_assessment_target_snapshot() from public, anon, authenticated;

create trigger assessment_record_capture_targets
before insert on public.assessment_records
for each row execute function public.capture_assessment_target_snapshot();

-- Existing RLS and grants deny client record updates; protect the snapshot from privileged writes too.
create function public.prevent_assessment_target_snapshot_change()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  if new.target_snapshot is distinct from old.target_snapshot then
    raise check_violation using message = 'An assessment target snapshot cannot be changed.';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_assessment_target_snapshot_change() from public, anon, authenticated;

create trigger assessment_record_target_snapshot_immutable
before update on public.assessment_records
for each row execute function public.prevent_assessment_target_snapshot_change();
