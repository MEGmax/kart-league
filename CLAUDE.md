# Kart Night League

React + MUI site (repo MEGmax/kart-league, branch `main`), built with Vite and deployed to GitHub Pages
by `.github/workflows/deploy.yml` (push to `main` triggers a build and a GitHub Actions Pages deploy — Pages
must be set to "GitHub Actions" in repo settings, not "Deploy from a branch"). Source lives under `src/`;
`vite.config.js` sets `base: "/kart-league/"` to match the Pages URL. Run `npm install` then `npm run dev`
locally (needs Node 20+; this repo was scaffolded and built with Node 24 via nvm since the system default
was Node 16). Character art is served as static files from `public/assets/characters/`.

Accounts and data are in Supabase (Auth: email/password + Google; Postgres with row level security). The
project URL and publishable key live in `src/lib/supabaseClient.js` — safe to publish; access is enforced
by RLS in `supabase/schema.sql`. The client is `@supabase/supabase-js@2.118.0` via npm (not a CDN import).

## Frontend structure

- `src/context/AuthContext.jsx` — session, profile, role helpers (`isAdmin`, `isOwner`), sign in/up/out, Google OAuth, password reset/update.
- `src/context/LeagueDataContext.jsx` — loads `league`/`players`/`cups`/`race_results`/`cup_templates`/`events` (+ `event_attendees()`) and subscribes to Postgres realtime changes.
- `src/lib/standings.js` — `normalize()`/`compute()`, ported 1:1 from the old `app.js`. Pure functions; standings math lives only here.
- `src/lib/demo.js` — the example/demo season shown when a league has no real cups yet.
- `src/pages/` — one component per nav tab, routed with `react-router-dom`'s `HashRouter` (so GitHub Pages needs no server-side rewrite rules). `StandingsPage` (with the `NextCupNight` card at the top), `EventsPage` (`#/events`, `#/events/:id`), `UnsubscribePage`, `CupsPage`, `RaceNightPage` and `AccountPage` are built; `unclaimed`, `playoffs`, `rules`, `add`, `build`, and `admin` are still `ComingSoonPage` placeholders to be filled in incrementally. Race night's Finish cup panel doesn't yet have Claude read the results photo (the old site did, using an Anthropic key saved on the Account page).
- `src/lib/events.js` — cup night helpers (upcoming/past split, "Cup TBD", local time formatting). `LeagueDataContext` exposes `events` (with `going` attendee lists).
- `src/theme.js` — the MUI dark theme; palette and fonts (Rubik Mono One / Space Grotesk / JetBrains Mono) carried over from the old `styles.css`.

## Database

`supabase/schema.sql` is the single source of truth: tables (`league`, `players`, `cups`, `photos`, `profiles`, `submissions`, `submission_photos`, `player_invites`, `claims`, `cup_templates`, `race_results`, `events`, `event_commitments`, `email_tokens`, `email_outbox`), RLS policies, and `security definer` functions that re-check roles (`create_cup`, `enter_race`, `clear_race`, `finish_cup`, `reopen_cup`, `my_player_id`, `save_cup`, `submit_cup`, `reject_submission`, `save_settings`, `save_players`, `approve_claim`, `reject_claim`, `set_role`, `claim_ownership`, `delete_my_account`, `create_event`, `update_event`, `cancel_event`, `join_event`, `leave_event`, `event_attendees`, `unsubscribe_email`; service role only: `queue_event_reminders`, `claim_emails`, `complete_email`). Upgrades to existing tables use `alter table ... add column if not exists` so the file can be re-run on the live database. It is written to be re-runnable. After editing it, the user must paste it into Supabase › SQL Editor and run it; there is no CLI deploy for the schema (only the Edge Functions use the CLI).

Roles are in `profiles.role`: member, admin, owner (exactly one, claimed once). Photos are base64 JPEG text in `photos.data`.

- `cups.results` is a JSON array of `{rid, p, pts, character, raw}`. `p: null` means unclaimed (a human row not yet tied to a player); unclaimed rows still count in the cup's finishing order. `rid` is stable and claims point at it.
- `cups.status` is `racing` (built, results being entered on Race night) or `complete` (counts in standings). `cups.maps` holds the 4 tracks and is locked by the `cups_lock_maps` trigger once set. `race_results` has one row per player per race (position 1-12, points from `race_points()`); members write only through `enter_race`/`clear_race`. `finish_cup` builds `cups.results` from them.
- `cups.week` is the season week. League settings (`league.settings`) include `seasonWeeks` and `cupsPerWeek`.
- `players.user_id` links a player to an account; `registered_at` drives the "Joined" badge. `player_invites` (admins only) holds an email that auto-links on email confirmation via the `on_auth_user_confirmed` trigger.

- `events.cups` is a text array of cup names in order; empty = "Cup TBD". `events.sequence` is the .ics SEQUENCE (bumped on date/time or cup changes and on cancel); the .ics UID is `cup-night-<id>@kart-league`. Cancelling is a soft cancel (`status = 'cancelled'`).
- Cup night emails go through `email_outbox` (unique per event/user/kind/sequence), drained by the `send-emails` Edge Function via pg_cron; `profiles.email_cup_nights` is the opt-in. Edge Functions are deployed with `npx supabase functions deploy` (see README › Cup night emails). Emails are log-only until a Resend domain is set up. `league.settings` also holds `timezone` and `reminderHour`; `save_settings` replaces the whole settings object, so an admin settings form must keep those keys.

`npm test` runs Vitest: `tests/events-db.test.js` loads `schema.sql` into PGlite via `scripts/lib/localdb.js` (stubs for auth, roles and realtime) and exercises each role. To test other schema changes locally, run it in PGlite (`@electric-sql/pglite`, Node 20+) with stubs for `auth.users`, `auth.uid()` (reading `request.jwt.claim.sub`), the `anon`/`authenticated` roles and the `supabase_realtime` publication, then exercise each role with `set role`.

## When the user shares a results-screen photo

Claude Code has no database credentials, so it cannot write cups directly. Read the photo (highlighted rows are humans; for each, the character and points; skip unhighlighted CPU rows), then give the user a table of league players and points to enter on the site's **+ Add cup** page.

## Rules of the data

- `max` is points possible per player for that cup (60 for a standard 4-race cup with 12 racers).
- Standings are computed in `src/lib/standings.js` (`compute`); never store derived numbers.
