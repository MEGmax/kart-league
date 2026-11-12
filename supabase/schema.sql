-- Kart Night League database.
-- Paste this whole file into Supabase › SQL Editor and press Run. Safe to run again after edits.
--
-- Roles live in profiles.role: 'member' (everyone who signs up), 'admin', 'owner' (claimed once).
-- Row level security decides who can read and write each table; the functions at the bottom do
-- multi-step saves in one transaction and re-check the caller's role.

-- ============ tables ============

create table if not exists public.league (
  id int primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb
);

create table if not exists public.players (
  id text primary key,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#E5484D' check (char_length(color) <= 9),
  aliases text[] not null default '{}'
);

create table if not exists public.cups (
  id text primary key,
  cup text not null check (char_length(cup) <= 40),
  date date not null,
  max int not null check (max > 0),
  results jsonb not null default '[]'::jsonb,
  notes text not null default '' check (char_length(notes) <= 500),
  has_photo boolean not null default false,
  added_at bigint not null,
  added_by uuid references auth.users on delete set null
);

create table if not exists public.photos (
  cup_id text primary key references public.cups on delete cascade,
  data text not null check (char_length(data) < 1400000)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  email text not null default '',
  role text not null default 'member' check (role in ('member', 'admin', 'owner')),
  color text not null default '#0090FF' check (char_length(color) <= 9),
  favorite_character text not null default '' check (char_length(favorite_character) <= 40),
  favorite_vehicle text not null default '' check (char_length(favorite_vehicle) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_owner on public.profiles (role) where role = 'owner';

create table if not exists public.submissions (
  id text primary key,
  cup text not null check (char_length(cup) <= 40),
  date date not null,
  max int not null check (max > 0),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) <= 24),
  notes text not null default '' check (char_length(notes) <= 500),
  has_photo boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null default auth.uid() references auth.users on delete cascade,
  submitter_name text not null default '',
  submitted_at bigint not null,
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at bigint,
  review_note text check (char_length(review_note) <= 200),
  cup_id text
);

create table if not exists public.submission_photos (
  id text primary key references public.submissions on delete cascade,
  data text not null check (char_length(data) < 1400000),
  submitted_by uuid not null default auth.uid() references auth.users on delete cascade
);

-- ---- added in v2: weeks, characters, player accounts, point claims ----
alter table public.players add column if not exists user_id uuid unique references auth.users on delete set null;
alter table public.players add column if not exists registered_at timestamptz;
alter table public.players add column if not exists created_at timestamptz not null default now();
alter table public.cups add column if not exists week int not null default 1 check (week between 1 and 52);
alter table public.submissions add column if not exists week int not null default 1 check (week between 1 and 52);

-- Email an admin attached to a player; the account that signs up and confirms it is linked to that player. Admins only.
create table if not exists public.player_invites (
  player_id text primary key references public.players on delete cascade,
  email text not null unique check (email = lower(email) and char_length(email) <= 254)
);

-- "That was me" requests for unclaimed points.
create table if not exists public.claims (
  id text primary key,
  cup_id text not null references public.cups on delete cascade,
  rid text not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  character text not null default '' check (char_length(character) <= 40),
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at bigint not null,
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at bigint,
  review_note text check (char_length(review_note) <= 200),
  player_id text,
  unique (cup_id, rid, user_id)
);

-- ---- added in v3: cup builder, templates, per-race results ----
alter table public.cups add column if not exists status text not null default 'complete' check (status in ('racing', 'complete'));
alter table public.cups add column if not exists maps text[] not null default '{}';
alter table public.cups add column if not exists template_id text;

-- Reusable track lists, e.g. "Cursed Cup". Everyone reads; admins write.
create table if not exists public.cup_templates (
  id text primary key,
  name text not null check (char_length(name) between 1 and 40),
  maps text[] not null check (array_length(maps, 1) = 4),
  created_by uuid references auth.users on delete set null,
  created_at bigint not null
);

-- One row per player per race, entered on the honour system (or by an admin).
create table if not exists public.race_results (
  cup_id text not null references public.cups on delete cascade,
  race int not null check (race between 1 and 4),
  player_id text not null references public.players on delete cascade,
  position int not null check (position between 1 and 12),
  points int not null check (points between 0 and 15),
  character text not null default '' check (char_length(character) <= 40),
  entered_by uuid references auth.users on delete set null,
  entered_at bigint not null,
  primary key (cup_id, race, player_id)
);

-- ============ helpers ============

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'owner'));
$$;

create or replace function public.league_has_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where role = 'owner');
$$;

-- Every new sign-up gets a member profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, email, color)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
                  nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                  nullif(trim(new.raw_user_meta_data->>'name'), ''),
                  nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                  'Racer'), 40),
    coalesce(new.email, ''),
    (array['#E5484D','#0090FF','#30A46C','#F76B15','#8E4EC6','#E93D82','#12A594','#D9A400','#6E56CF','#A18072','#3E63DD','#7C8A2E'])[1 + floor(random() * 12)::int]
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- True while a result in a cup has no player.
create or replace function public.result_unclaimed(p_cup text, p_rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cups c, jsonb_array_elements(c.results) r
                 where c.id = p_cup and r->>'rid' = p_rid and r->>'p' is null);
$$;

-- When someone confirms an email an admin invited, link them to that player.
create or replace function public.link_invited_player() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    update players p set user_id = new.id, registered_at = now()
      from player_invites i
      where i.player_id = p.id and i.email = lower(coalesce(new.email, '')) and p.user_id is null
        and not exists (select 1 from players x where x.user_id = new.id);
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after insert or update of email_confirmed_at on auth.users
  for each row execute function public.link_invited_player();

-- A cup's tracks are fixed once it exists.
create or replace function public.lock_cup_maps() returns trigger
language plpgsql as $$
begin
  if old.maps is distinct from new.maps and cardinality(old.maps) > 0 then
    raise exception 'This cup''s tracks are locked and can''t be changed.';
  end if;
  return new;
end $$;
drop trigger if exists cups_lock_maps on public.cups;
create trigger cups_lock_maps before update on public.cups for each row execute function public.lock_cup_maps();

create or replace function public.race_points(p_position int) returns int
language sql immutable as $$ select (array[15,12,10,8,7,6,5,4,3,2,1,0])[p_position] $$;

-- ============ row level security ============

alter table public.league enable row level security;
alter table public.players enable row level security;
alter table public.cups enable row level security;
alter table public.photos enable row level security;
alter table public.profiles enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_photos enable row level security;
alter table public.player_invites enable row level security;
alter table public.claims enable row level security;
alter table public.cup_templates enable row level security;
alter table public.race_results enable row level security;

-- Public league data: anyone reads; admins write.
do $$
declare t text;
begin
  foreach t in array array['league', 'players', 'cups', 'photos', 'cup_templates'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "admins write" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "admins write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Profiles: read your own (admins read all); edit only your own profile fields.
drop policy if exists "read own or admin" on public.profiles;
drop policy if exists "update own" on public.profiles;
create policy "read own or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, color, favorite_character, favorite_vehicle, updated_at) on public.profiles to authenticated;

-- Submissions: members create and see their own; admins see and review all.
drop policy if exists "read own or admin" on public.submissions;
drop policy if exists "create own pending" on public.submissions;
drop policy if exists "admins update" on public.submissions;
drop policy if exists "withdraw own pending or admin" on public.submissions;
create policy "read own or admin" on public.submissions for select to authenticated using (submitted_by = auth.uid() or public.is_admin());
create policy "create own pending" on public.submissions for insert to authenticated with check (submitted_by = auth.uid() and status = 'pending' and reviewed_by is null);
create policy "admins update" on public.submissions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "withdraw own pending or admin" on public.submissions for delete to authenticated using (public.is_admin() or (submitted_by = auth.uid() and status = 'pending'));

drop policy if exists "read own or admin" on public.submission_photos;
drop policy if exists "create own" on public.submission_photos;
drop policy if exists "delete own or admin" on public.submission_photos;
create policy "read own or admin" on public.submission_photos for select to authenticated using (submitted_by = auth.uid() or public.is_admin());
create policy "create own" on public.submission_photos for insert to authenticated with check (submitted_by = auth.uid());
create policy "delete own or admin" on public.submission_photos for delete to authenticated using (public.is_admin() or submitted_by = auth.uid());

drop policy if exists "admins only" on public.player_invites;
create policy "admins only" on public.player_invites for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Claims: request for yourself on points that are still unclaimed; see your own; admins review.
drop policy if exists "read own or admin" on public.claims;
drop policy if exists "request own" on public.claims;
drop policy if exists "admins update" on public.claims;
drop policy if exists "withdraw own pending or admin" on public.claims;
create policy "read own or admin" on public.claims for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "request own" on public.claims for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null and player_id is null and public.result_unclaimed(cup_id, rid));
create policy "admins update" on public.claims for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "withdraw own pending or admin" on public.claims for delete to authenticated using (public.is_admin() or (user_id = auth.uid() and status = 'pending'));

-- Race results: everyone reads; all writes go through enter_race / clear_race (below), which check who you are.
drop policy if exists "public read" on public.race_results;
create policy "public read" on public.race_results for select to anon, authenticated using (true);
revoke insert, update, delete on public.race_results from anon, authenticated;

-- ============ actions ============

-- First signed-in person to call this becomes the owner. Works once.
create or replace function public.claim_ownership() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  lock table profiles in share row exclusive mode;
  if exists (select 1 from profiles where role = 'owner') then raise exception 'This league already has an owner.'; end if;
  update profiles set role = 'owner', updated_at = now() where id = auth.uid();
end $$;

-- Admins promote or demote members. Nobody can change the owner.
create or replace function public.set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can change roles.'; end if;
  if p_role not in ('member', 'admin') then raise exception 'Role must be member or admin.'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'owner') then raise exception 'The owner''s role can''t be changed.'; end if;
  update profiles set role = p_role, updated_at = now() where id = p_user;
end $$;

-- Add or update a cup (and any new players), optionally approving the submission it came from.
create or replace function public.save_cup(p_cup jsonb, p_players jsonb default '[]'::jsonb, p_photo text default null, p_submission text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can save cups.'; end if;
  if exists (select r->>'p' from jsonb_array_elements(p_cup->'results') r where r->>'p' is not null group by 1 having count(*) > 1) then
    raise exception 'The same player appears twice in this cup.';
  end if;
  insert into players (id, name, color, aliases)
    select x->>'id', x->>'name', x->>'color', coalesce(array(select jsonb_array_elements_text(x->'aliases')), '{}')
    from jsonb_array_elements(p_players) x
  on conflict (id) do update set name = excluded.name, color = excluded.color, aliases = excluded.aliases;
  insert into cups (id, cup, date, week, max, results, notes, has_photo, added_at, added_by)
  values (p_cup->>'id', p_cup->>'cup', (p_cup->>'date')::date, coalesce((p_cup->>'week')::int, 1), (p_cup->>'max')::int, p_cup->'results',
          coalesce(p_cup->>'notes', ''), coalesce((p_cup->>'has_photo')::boolean, false), (p_cup->>'added_at')::bigint, auth.uid())
  on conflict (id) do update set cup = excluded.cup, date = excluded.date, week = excluded.week, max = excluded.max, results = excluded.results,
    notes = excluded.notes, has_photo = excluded.has_photo;
  if p_photo is not null then
    insert into photos (cup_id, data) values (p_cup->>'id', p_photo) on conflict (cup_id) do update set data = excluded.data;
  end if;
  if p_submission is not null then
    update submissions set status = 'approved', reviewed_by = auth.uid(), reviewed_at = (extract(epoch from now()) * 1000)::bigint, cup_id = p_cup->>'id'
      where id = p_submission;
    delete from submission_photos where id = p_submission;
  end if;
end $$;

create or replace function public.reject_submission(p_id text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can review submissions.'; end if;
  update submissions set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = (extract(epoch from now()) * 1000)::bigint,
    review_note = left(coalesce(p_note, ''), 200) where id = p_id;
  delete from submission_photos where id = p_id;
end $$;

-- Members submit a cup and its photo together. Runs as the caller, so the policies above apply.
create or replace function public.submit_cup(p_sub jsonb, p_photo text default null) returns void
language plpgsql security invoker set search_path = public as $$
begin
  insert into submissions (id, cup, date, week, max, rows, notes, has_photo, status, submitted_by, submitter_name, submitted_at)
  values (p_sub->>'id', p_sub->>'cup', (p_sub->>'date')::date, coalesce((p_sub->>'week')::int, 1), (p_sub->>'max')::int, p_sub->'rows', coalesce(p_sub->>'notes', ''),
          p_photo is not null, 'pending', auth.uid(),
          coalesce((select display_name from profiles where id = auth.uid()), ''), (extract(epoch from now()) * 1000)::bigint);
  if p_photo is not null then
    insert into submission_photos (id, data, submitted_by) values (p_sub->>'id', p_photo, auth.uid());
  end if;
end $$;

-- League settings and player renames/removals. Players with recorded cups can't be removed.
create or replace function public.save_settings(p_settings jsonb, p_names jsonb default '[]'::jsonb, p_removed text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can change league settings.'; end if;
  insert into league (id, settings) values (1, p_settings) on conflict (id) do update set settings = excluded.settings;
  update players p set name = x->>'name' from jsonb_array_elements(p_names) x where p.id = x->>'id';
  delete from players p where p.id = any(p_removed)
    and not exists (select 1 from cups c, jsonb_array_elements(c.results) r where r->>'p' = p.id);
end $$;

-- Admins add, rename, remove players and set each player's invite email or linked account.
-- p_players: [{id, name, color?, email?, user_id?, remove?}]; "user_id": "" unlinks.
create or replace function public.save_players(p_players jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb; pid text; em text;
begin
  if not is_admin() then raise exception 'Only admins can manage players.'; end if;
  for x in select * from jsonb_array_elements(p_players) loop
    pid := x->>'id';
    if coalesce((x->>'remove')::boolean, false) then
      if exists (select 1 from cups c, jsonb_array_elements(c.results) r where r->>'p' = pid) then
        raise exception '% has recorded cups and can''t be removed.', coalesce(x->>'name', 'That player');
      end if;
      delete from players where id = pid;
      continue;
    end if;
    insert into players (id, name, color) values (pid, trim(x->>'name'), coalesce(nullif(x->>'color', ''), '#0090FF'))
      on conflict (id) do update set name = excluded.name;
    em := lower(trim(coalesce(x->>'email', '')));
    if em = '' then delete from player_invites where player_id = pid;
    else
      begin
        insert into player_invites (player_id, email) values (pid, em) on conflict (player_id) do update set email = excluded.email;
      exception when unique_violation then
        raise exception 'The email % is already attached to another player.', em;
      end;
    end if;
    if x ? 'user_id' then
      begin
        update players set user_id = nullif(x->>'user_id', '')::uuid,
          registered_at = (select created_at from profiles where id = nullif(x->>'user_id', '')::uuid)
          where id = pid and user_id is distinct from nullif(x->>'user_id', '')::uuid;
      exception when unique_violation then
        raise exception 'That account is already linked to another player.';
      end;
    end if;
    -- An invited email that already belongs to a confirmed account links right away.
    if em <> '' then
      update players p set user_id = u.id, registered_at = pr.created_at
        from auth.users u join profiles pr on pr.id = u.id
        where p.id = pid and p.user_id is null and lower(u.email) = em and u.email_confirmed_at is not null
          and not exists (select 1 from players y where y.user_id = u.id);
    end if;
  end loop;
end $$;

-- Give unclaimed points to the account that asked for them (creating its player if needed).
create or replace function public.approve_claim(p_claim text) returns void
language plpgsql security definer set search_path = public as $$
declare cl claims; pl players; prof profiles; cu cups; newres jsonb; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not is_admin() then raise exception 'Only admins can review claims.'; end if;
  select * into cl from claims where id = p_claim for update;
  if not found then raise exception 'That request no longer exists.'; end if;
  if cl.status <> 'pending' then raise exception 'That request was already reviewed.'; end if;
  select * into cu from cups where id = cl.cup_id for update;
  if not found then raise exception 'That cup was deleted.'; end if;
  if not exists (select 1 from jsonb_array_elements(cu.results) r where r->>'rid' = cl.rid and r->>'p' is null) then
    raise exception 'Those points were already given to someone.';
  end if;
  select * into pl from players where user_id = cl.user_id;
  if not found then
    select * into prof from profiles where id = cl.user_id;
    if not found then raise exception 'That account no longer exists.'; end if;
    insert into players (id, name, color, aliases, user_id, registered_at)
      values ('p' || substr(md5(random()::text || clock_timestamp()::text), 1, 12), prof.display_name, prof.color, '{}', cl.user_id, prof.created_at)
      returning * into pl;
  end if;
  if exists (select 1 from jsonb_array_elements(cu.results) r where r->>'p' = pl.id) then
    raise exception '% already has a result in this cup.', pl.name;
  end if;
  select jsonb_agg(case when r->>'rid' = cl.rid
           then r || jsonb_build_object('p', pl.id) || (case when cl.character <> '' then jsonb_build_object('character', cl.character) else '{}'::jsonb end)
           else r end order by ord)
    into newres from jsonb_array_elements(cu.results) with ordinality as t(r, ord);
  update cups set results = newres where id = cu.id;
  update claims set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now_ms, player_id = pl.id where id = cl.id;
  update claims set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now_ms, review_note = 'Those points went to another player.'
    where cup_id = cl.cup_id and rid = cl.rid and status = 'pending' and id <> cl.id;
end $$;

create or replace function public.reject_claim(p_claim text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can review claims.'; end if;
  update claims set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = (extract(epoch from now()) * 1000)::bigint,
    review_note = left(coalesce(p_note, ''), 200) where id = p_claim and status = 'pending';
end $$;

-- Build a cup from 4 tracks and open it for racing. Its tracks are locked from here on.
create or replace function public.create_cup(p_cup jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m text[] := array(select jsonb_array_elements_text(p_cup->'maps'));
begin
  if not is_admin() then raise exception 'Only admins can create cups.'; end if;
  if cardinality(m) <> 4 or exists (select 1 from unnest(m) x where coalesce(trim(x), '') = '') then
    raise exception 'Pick all 4 tracks.';
  end if;
  insert into cups (id, cup, date, week, max, results, notes, has_photo, added_at, added_by, status, maps, template_id)
  values (p_cup->>'id', left(trim(p_cup->>'cup'), 40), (p_cup->>'date')::date, coalesce((p_cup->>'week')::int, 1),
          coalesce((p_cup->>'max')::int, 60), '[]'::jsonb, '', false, (extract(epoch from now()) * 1000)::bigint, auth.uid(),
          'racing', m, nullif(p_cup->>'template_id', ''));
end $$;

-- Your own player, created from your profile the first time you need one.
create or replace function public.my_player_id() returns text
language plpgsql security definer set search_path = public as $$
declare pid text; prof profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select id into pid from players where user_id = auth.uid();
  if pid is null then
    select * into prof from profiles where id = auth.uid();
    if not found then raise exception 'Your profile is still being set up. Refresh and try again.'; end if;
    pid := 'p' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    insert into players (id, name, color, aliases, user_id, registered_at) values (pid, prof.display_name, prof.color, '{}', auth.uid(), prof.created_at);
  end if;
  return pid;
end $$;

-- Record a finishing position for one race. Racers enter their own; admins can enter for anyone (p_player).
create or replace function public.enter_race(p_cup text, p_race int, p_position int, p_character text default '', p_player text default null) returns void
language plpgsql security definer set search_path = public as $$
declare pid text; st text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select status into st from cups where id = p_cup;
  if st is null then raise exception 'That cup doesn''t exist.'; end if;
  if st <> 'racing' then raise exception 'This cup is finished. Ask an admin to reopen it to change results.'; end if;
  if p_race not between 1 and 4 then raise exception 'Race must be 1 to 4.'; end if;
  if p_position not between 1 and 12 then raise exception 'Position must be 1st to 12th.'; end if;
  if p_player is not null then
    if not is_admin() then raise exception 'Only admins can enter results for someone else.'; end if;
    if not exists (select 1 from players where id = p_player) then raise exception 'That player doesn''t exist.'; end if;
    pid := p_player;
  else
    pid := my_player_id();
  end if;
  insert into race_results (cup_id, race, player_id, position, points, character, entered_by, entered_at)
  values (p_cup, p_race, pid, p_position, race_points(p_position), left(coalesce(p_character, ''), 40), auth.uid(), (extract(epoch from now()) * 1000)::bigint)
  on conflict (cup_id, race, player_id) do update set position = excluded.position, points = excluded.points,
    character = excluded.character, entered_by = excluded.entered_by, entered_at = excluded.entered_at;
end $$;

create or replace function public.clear_race(p_cup text, p_race int, p_player text default null) returns void
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select status from cups where id = p_cup) is distinct from 'racing' then raise exception 'This cup is finished.'; end if;
  if p_player is not null then
    if not is_admin() then raise exception 'Only admins can clear someone else''s result.'; end if;
    pid := p_player;
  else
    select id into pid from players where user_id = auth.uid();
  end if;
  delete from race_results where cup_id = p_cup and race = p_race and player_id = pid;
end $$;

-- Close a cup: totals come from the race entries; the character is the one used most in the cup (latest wins ties).
-- p_unclaimed: [{pts, character}] for highlighted photo rows nobody entered.
create or replace function public.finish_cup(p_cup text, p_photo text default null, p_unclaimed jsonb default '[]'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not is_admin() then raise exception 'Only admins can finish cups.'; end if;
  if (select status from cups where id = p_cup) is distinct from 'racing' then raise exception 'That cup isn''t in progress.'; end if;
  with tot as (
    select player_id, sum(points) pts from race_results where cup_id = p_cup group by player_id
  ), ch as (
    select distinct on (player_id) player_id, character from (
      select player_id, character, count(*) n, max(race) last_race from race_results
      where cup_id = p_cup and character <> '' group by player_id, character
    ) x order by player_id, n desc, last_race desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('rid', 'p_' || t.player_id, 'p', t.player_id, 'pts', t.pts,
           'character', coalesce(c.character, ''), 'raw', '') order by t.pts desc), '[]'::jsonb)
    into res from tot t left join ch c using (player_id);
  select res || coalesce(jsonb_agg(jsonb_build_object('rid', 'u' || substr(md5(random()::text || ord::text), 1, 10), 'p', null,
           'pts', (u->>'pts')::int, 'character', coalesce(u->>'character', ''), 'raw', '')), '[]'::jsonb)
    into res from jsonb_array_elements(p_unclaimed) with ordinality as t(u, ord);
  if jsonb_array_length(res) = 0 then raise exception 'Nobody has entered any results for this cup yet.'; end if;
  update cups set results = res, status = 'complete', has_photo = has_photo or p_photo is not null where id = p_cup;
  if p_photo is not null then
    insert into photos (cup_id, data) values (p_cup, p_photo) on conflict (cup_id) do update set data = excluded.data;
  end if;
end $$;

-- Reopen a finished, race-by-race cup so entries can be corrected. Finishing it again rebuilds its totals.
create or replace function public.reopen_cup(p_cup text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can reopen cups.'; end if;
  if not exists (select 1 from race_results where cup_id = p_cup) then raise exception 'Only cups raced race-by-race can be reopened.'; end if;
  update cups set status = 'racing' where id = p_cup;
  update claims set status = 'rejected', review_note = 'The cup was reopened.' where cup_id = p_cup and status = 'pending';
end $$;

-- Lets a signed-in person delete their own account. The owner can't.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from profiles where id = auth.uid() and role = 'owner') then raise exception 'The owner''s account can''t be deleted.'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.claim_ownership, public.set_role, public.save_cup, public.reject_submission,
  public.submit_cup, public.save_settings, public.delete_my_account, public.save_players, public.approve_claim,
  public.reject_claim, public.create_cup, public.my_player_id, public.enter_race, public.clear_race, public.finish_cup,
  public.reopen_cup from public, anon;
grant execute on function public.claim_ownership, public.set_role, public.save_cup, public.reject_submission,
  public.submit_cup, public.save_settings, public.delete_my_account, public.save_players, public.approve_claim,
  public.reject_claim, public.create_cup, public.my_player_id, public.enter_race, public.clear_race, public.finish_cup,
  public.reopen_cup to authenticated;
grant execute on function public.is_admin, public.league_has_owner, public.result_unclaimed, public.race_points to anon, authenticated;

-- ============ live updates ============
do $$
declare t text;
begin
  foreach t in array array['league', 'players', 'cups', 'submissions', 'profiles', 'claims', 'race_results', 'cup_templates'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
