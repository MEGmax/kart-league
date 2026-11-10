# Kart Night League

Static GitHub Pages site (repo MEGmax/kart-league, branch `main`, no build step): `index.html` + `styles.css` + `app.js`.
Accounts and data are in Supabase (Auth: email/password + Google; Postgres with row level security). `supabase-config.js` holds the project URL and publishable key. The client is `@supabase/supabase-js@2.118.0` from jsDelivr.

## Database

`supabase/schema.sql` is the single source of truth: tables (`league`, `players`, `cups`, `photos`, `profiles`, `submissions`, `submission_photos`, `player_invites`, `claims`), RLS policies, and `security definer` functions that re-check roles (`save_cup`, `submit_cup`, `reject_submission`, `save_settings`, `save_players`, `approve_claim`, `reject_claim`, `set_role`, `claim_ownership`, `delete_my_account`). Upgrades to existing tables use `alter table ... add column if not exists` so the file can be re-run on the live database. It is written to be re-runnable. After editing it, the user must paste it into Supabase › SQL Editor and run it; there is no CLI deploy.

Roles are in `profiles.role`: member, admin, owner (exactly one, claimed once). Photos are base64 JPEG text in `photos.data`.

- `cups.results` is a JSON array of `{rid, p, pts, character, raw}`. `p: null` means unclaimed (a human row not yet tied to a player); unclaimed rows still count in the cup's finishing order. `rid` is stable and claims point at it.
- `cups.week` is the season week. League settings (`league.settings`) include `seasonWeeks` and `cupsPerWeek`.
- `players.user_id` links a player to an account; `registered_at` drives the "Joined" badge. `player_invites` (admins only) holds an email that auto-links on email confirmation via the `on_auth_user_confirmed` trigger.

To test schema changes locally, run it in PGlite (`@electric-sql/pglite`, Node 20+) with stubs for `auth.users`, `auth.uid()` (reading `request.jwt.claim.sub`), the `anon`/`authenticated` roles and the `supabase_realtime` publication, then exercise each role with `set role`.

## When the user shares a results-screen photo

Claude Code has no database credentials, so it cannot write cups directly. Read the photo (highlighted rows are humans; for each, the character and points; skip unhighlighted CPU rows), then give the user a table of league players and points to enter on the site's **+ Add cup** page.

## Rules of the data

- `max` is points possible per player for that cup (60 for a standard 4-race cup with 12 racers).
- Standings are computed in `app.js` (`compute`); never store derived numbers.
