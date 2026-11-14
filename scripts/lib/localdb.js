// An in-memory Postgres (PGlite) loaded with supabase/schema.sql and just enough of Supabase around it:
// auth.users, auth.uid(), the anon/authenticated/service_role roles and the realtime publication.
// Used by the tests and by `npm run email:preview`. Nothing here touches the live database.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SCHEMA = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create publication supabase_realtime;
`;

export async function localDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(SCHEMA);
  return db;
}

// Sign-up: the schema's trigger creates the profile. Then set role and email preference directly.
export async function addUser(db, { email, name, role = "member", optIn = false }) {
  const { rows } = await db.query(
    "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, now(), $2) returning id",
    [email, { display_name: name || email.split("@")[0] }],
  );
  const id = rows[0].id;
  await db.query("update public.profiles set role = $2, email_cup_nights = $3 where id = $1", [id, role, optIn]);
  return id;
}

// Run one statement as a signed-in user (uid), as a signed-out visitor (uid null), or as the service role.
export async function as(db, who, sql, params = []) {
  const role = who === "service" ? "service_role" : who ? "authenticated" : "anon";
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who && who !== "service" ? who : ""]);
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export async function setLeague(db, settings) {
  await db.query(
    "insert into public.league (id, settings) values (1, $1) on conflict (id) do update set settings = excluded.settings",
    [settings],
  );
}
