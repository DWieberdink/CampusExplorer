-- RLS for HE tables — approved dashboard users read; admin manages
-- Requires public.is_approved() from sql/setup.sql

alter table public.he_sync_campuses enable row level security;
alter table public.he_campus_directory enable row level security;
alter table public.he_enrollment_fall enable row level security;
alter table public.he_enrollment_activity enable row level security;
alter table public.he_completions enable row level security;
alter table public.he_sync_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'he_sync_campuses',
    'he_campus_directory',
    'he_enrollment_fall',
    'he_enrollment_activity',
    'he_completions'
  ]
  loop
    execute format('drop policy if exists "Approved users read %1$s" on public.%1$s', t);
    execute format(
      'create policy "Approved users read %1$s" on public.%1$s for select using (public.is_approved())',
      t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'he_sync_campuses',
    'he_campus_directory',
    'he_enrollment_fall',
    'he_enrollment_activity',
    'he_completions',
    'he_sync_log'
  ]
  loop
    execute format('drop policy if exists "Admin manages %1$s" on public.%1$s', t);
    execute format(
      'create policy "Admin manages %1$s" on public.%1$s for all
        using ((auth.jwt() ->> ''email'') = ''higher.ed@perkinseastman.com'')
        with check ((auth.jwt() ->> ''email'') = ''higher.ed@perkinseastman.com'')',
      t
    );
  end loop;
end $$;

drop policy if exists "Approved users read he_sync_log" on public.he_sync_log;
create policy "Approved users read he_sync_log"
  on public.he_sync_log for select
  using (public.is_approved());
