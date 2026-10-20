
-- Mid-term periods: additive migration draft.
-- Review against the live database schema before applying.

begin;

-- 1. Create a separate record for each mid-term.
create table if not exists public.midterm_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  official_date date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'finalized')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  constraint midterm_periods_name_unique unique (name),
  constraint finalized_period_has_timestamp
    check (
      (status = 'finalized' and finalized_at is not null)
      or status <> 'finalized'
    )
);

create index if not exists midterm_periods_date_idx
  on public.midterm_periods (official_date);

-- 2. Add period references without deleting legacy period text.
alter table public.student_midterm_marks
  add column if not exists period_id uuid
  references public.midterm_periods(id) on delete restrict;

alter table public.midterm_reports
  add column if not exists period_id uuid
  references public.midterm_periods(id) on delete restrict;

-- 3. Create a period record for each distinct legacy period name.
-- Existing marks and reports keep their original data.
do $$
declare
  legacy_period record;
  new_period_id uuid;
  period_date date;
begin
  for legacy_period in
    select period_name
    from (
      select distinct period as period_name
      from public.student_midterm_marks
      where period is not null and btrim(period) <> ''

      union

      select distinct period as period_name
      from public.midterm_reports
      where period is not null and btrim(period) <> ''
    ) legacy
  loop
    select id
      into new_period_id
      from public.midterm_periods
      where name = legacy_period.period_name;

    if new_period_id is null then
      -- Legacy periods did not store a reliable official date.
      -- Use the migration date as a placeholder and review it later.
      period_date := current_date;

      insert into public.midterm_periods (
        name,
        official_date,
        status,
        finalized_at
      )
      values (
        legacy_period.period_name,
        period_date,
        'open',
        null
      )
      returning id into new_period_id;
    end if;

    update public.student_midterm_marks
      set period_id = new_period_id
      where period = legacy_period.period_name
        and period_id is null;

    update public.midterm_reports
      set period_id = new_period_id
      where period = legacy_period.period_name
        and period_id is null;
  end loop;
end;
$$;

-- 4. Prevent changes to marks belonging to a finalized period.
create or replace function public.prevent_finalized_midterm_mark_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected_period_id uuid;
  affected_status text;
begin
  if tg_op = 'DELETE' then
    affected_period_id := old.period_id;
  else
    affected_period_id := new.period_id;
  end if;

  if tg_op = 'UPDATE'
     and old.period_id is distinct from new.period_id then
    raise exception 'A mark cannot be moved between mid-term periods.';
  end if;

  if affected_period_id is null then
    raise exception 'A mid-term period must be selected before saving a mark.';
  end if;

  select status
    into affected_status
    from public.midterm_periods
    where id = affected_period_id
    for share;

  if affected_status is null then
    raise exception 'The selected mid-term period does not exist.';
  end if;

  if affected_status = 'finalized' then
    raise exception 'This mid-term has been finalized; its marks cannot be changed.';
  end if;

  if affected_status <> 'open' then
    raise exception 'This mid-term is not open for mark entry.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_finalized_midterm_mark_changes
  on public.student_midterm_marks;

create trigger prevent_finalized_midterm_mark_changes
before insert or update or delete
on public.student_midterm_marks
for each row
execute function public.prevent_finalized_midterm_mark_changes();

-- 5. Do not automatically set period_id NOT NULL yet.
-- First verify that every legacy mark and report has been mapped.

commit;
