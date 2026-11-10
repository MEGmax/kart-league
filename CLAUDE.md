# Kart Night League

Static GitHub Pages site (repo MEGmax/kart-league, branch `main`, no build step): `index.html` + `styles.css` + `app.js`.
Accounts and data are in Supabase (Auth: email/password + Google; Postgres with row level security). `supabase-config.js` holds the project URL and publishable key. The client is `@supabase/supabase-js@2.118.0` from jsDelivr.

## Database

`supabase/schema.sql` is the single source of truth: tables (`league`, `players`, `cups`, `photos`, `profiles`, `submissions`, `submission_photos`), RLS policies, and `security definer` functions that re-check roles (`save_cup`, `submit_cup`, `reject_submission`, `save_settings`, `set_role`, `claim_ownership`, `delete_my_account`). It is written to be re-runnable. After editing it, the user must paste it into Supabase › SQL Editor and run it; there is no CLI deploy.

Roles are in `profiles.role`: member, admin, owner (exactly one, claimed once). Photos are base64 JPEG text in `photos.data`.

To test schema changes locally, run it in PGlite (`@electric-sql/pglite`, Node 20+) with stubs for `auth.users`, `auth.uid()` (reading `request.jwt.claim.sub`), the `anon`/`authenticated` roles and the `supabase_realtime` publication, then exercise each role with `set role`.

## When the user shares a results-screen photo

Claude Code has no database credentials, so it cannot write cups directly. Read the photo (rows: position, on-screen name, points; skip CPU character names), then give the user a table of league players and points to enter on the site's **+ Add cup** page.

## Rules of the data

- `max` is points possible per player for that cup (60 for a standard 4-race cup with 12 racers).
- Standings are computed in `app.js` (`compute`); never store derived numbers.
