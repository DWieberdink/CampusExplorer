-- CampusExplorer auth / approval bootstrap
-- Run in Supabase SQL Editor before HE migrations.
-- Replace ADMIN_EMAIL in policies when provisioning.

create table if not exists public.users (
  id bigint generated always as identity primary key,
  "Name" text,
  "Title" text,
  "E_Mail" text unique,
  "Role" text default 'Viewer',
  auth_user_id uuid unique references auth.users (id) on delete cascade,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now()
);

create index if not exists users_approval_status_idx
  on public.users (approval_status);

create index if not exists users_auth_user_id_idx
  on public.users (auth_user_id);

alter table public.users enable row level security;

drop policy if exists "Users can view own row" on public.users;
create policy "Users can view own row"
  on public.users for select
  using (auth_user_id = auth.uid());

drop policy if exists "Admin can view all users" on public.users;
create policy "Admin can view all users"
  on public.users for select
  using ((auth.jwt() ->> 'email') = 'higher.ed@perkinseastman.com');

drop policy if exists "Admin can update users" on public.users;
create policy "Admin can update users"
  on public.users for update
  using ((auth.jwt() ->> 'email') = 'higher.ed@perkinseastman.com')
  with check ((auth.jwt() ->> 'email') = 'higher.ed@perkinseastman.com');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    auth_user_id = new.id,
    approval_status = case
      when new.email = 'higher.ed@perkinseastman.com' then 'approved'
      else 'pending'
    end,
    approved_at = null,
    approved_by = null,
    "Name" = coalesce(new.raw_user_meta_data ->> 'name', "Name"),
    "Title" = coalesce(new.raw_user_meta_data ->> 'title', "Title"),
    "Role" = coalesce(new.raw_user_meta_data ->> 'role', "Role")
  where "E_Mail" = new.email
    and auth_user_id is null;

  if not exists (select 1 from public.users where auth_user_id = new.id) then
    insert into public.users (
      "Name", "Title", "E_Mail", "Role", auth_user_id, approval_status
    ) values (
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      coalesce(new.raw_user_meta_data ->> 'title', 'untitled'),
      new.email,
      coalesce(new.raw_user_meta_data ->> 'role', 'Viewer'),
      new.id,
      case
        when new.email = 'higher.ed@perkinseastman.com' then 'approved'
        else 'pending'
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where auth_user_id = auth.uid()
      and approval_status = 'approved'
  );
$$;
