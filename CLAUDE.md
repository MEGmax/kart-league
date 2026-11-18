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
- `src/pages/` — one component per nav tab, routed with `react-router-dom`'s `HashRouter` (so GitHub Pages needs no server-side rewrite rules): `StandingsPage` (with the `NextCupNight` card), `EventsPage` (`#/events`, `#/events/:id`), `UnsubscribePage`, `CupsPage`, `RaceNightPage`, `AddPage`, `BuildPage`, `UnclaimedPage`, `PlayoffsPage`, `RulesPage`, `AdminPage` (admin tab shown to admins only) and `AccountPage`.
- `AddPage` (`#/add`) records a whole cup night: specific cups (game cups/templates/custom tracks, or `UNKNOWN_CUP` "Unknown Cup" with no tracks for random tracks nobody remembers), each racer's usual character (a cell's `character` overrides it for one cup; picking a player already in the lineup for a racer who never shared a cup with them merges the two via `mergeRacers`), and per-cup totals or race-by-race places. Modes: admin save (`save_cup_night`), member submit (one `submit_cup` per cup sharing `submissions.batch`), admin review (`?review=<batch>`), edit one finished cup (`?edit=<cupId>`), start from a cup night (`?event=<id>`). Logic lives in `src/lib/night.js` (pure, tested in `tests/night-lib.test.js`); UI pieces in `src/components/night/`.
- `src/lib/gemini.js` — reads a results photo with Gemini (`gemini-4-hydrogen`; plain `fetch` to `generateContent` with `responseJsonSchema` and high media resolution, no SDK) so the same code runs in the browser and in Node. Returns `{screen: race|standings|other, cup, rows: [{pos, name, character, points (total), gained (+N), human, highlight}]}`. `src/lib/readPhoto.js` wraps it for the site with the visitor's own key (`localStorage` `kl.geminiKey`, set on the Account page); used by the Add page and Race night's Finish panel, where rows are matched to racers by character, then name (`matchPhotoRows`).
- `npm run backlog -- <folder>` (`scripts/read-backlog.mjs`, run with vite-node so it can import `src/lib`) reads a folder of a night's photos with `GEMINI_API_KEY` from `.env`: EXIF order (`scripts/lib/exif.js`), HEIC converted with macOS `sips` (cup photos turned upright using Gemini's `rotate`), skips images without camera info (screenshots) unless `--include-screenshots`, caches readings in `<folder>/gemini-reads.json`, and writes `backlog.md` plus `backlog-import.json` (git-ignored, includes photos). `src/lib/backlog.js` (pure, tested in `tests/backlog-lib.test.js`) groups photos into cups by running totals (an end-of-cup screen closes a cup once its race count is 4 or unknown), keys humans by character (plus highlight color when two share one), derives race places from the change in totals checked against `+N`, names cups "Unknown Cup", and `nightFromBacklog()` turns the file into an Add-page night (**Import a backlog file** button); `--who Luigi=Gerrard` names who played a character, otherwise players are guessed from their most-picked character.
- `src/lib/accountData.js` — `useMyData()` (your claims/submissions) and `useAdminData()`; both refetch when `LeagueDataContext`'s `version` bumps after a realtime reload.
- `src/lib/events.js` — cup night helpers (upcoming/past split, "Cup TBD", local time formatting). `LeagueDataContext` exposes `events` (with `going` attendee lists).
- `src/theme.js` — the MUI dark theme: NKL brand palette (logo navy `#1E2571` / red `#DC251D` on a deep navy background; gold stays the primary/action color so red never reads as a destructive button), `brandStripe` (the logo's navy|white|red split, used as trim), and fonts (Rubik Mono One / Space Grotesk / JetBrains Mono).
- Branding: the source logo is `data/nkllogo1.png`; `public/brand/nkl-logo.png`, `public/favicon.png` and `public/apple-touch-icon.png` are resized from it. Components use `LOGO_SRC` from `src/lib/constants.js` (header, standings hero, footer, sign-in). `PageTitle`/`SectionTitle` in `src/components/PageBits.jsx` (and the exported `titleBar` sx) give headings the red/navy accent bar.

## Database

`supabase/schema.sql` is the single source of truth: tables (`league`, `players`, `cups`, `photos`, `profiles`, `submissions`, `submission_photos`, `player_invites`, `claims`, `cup_templates`, `race_results`, `events`, `event_commitments`, `email_tokens`, `email_outbox`), RLS policies, and `security definer` functions that re-check roles (`create_cup`, `enter_race`, `clear_race`, `finish_cup`, `reopen_cup`, `my_player_id`, `save_cup`, `submit_cup`, `reject_submission`, `save_settings`, `save_players`, `approve_claim`, `reject_claim`, `set_role`, `save_cup_night`, `claim_ownership`, `delete_my_account`, `create_event`, `update_event`, `cancel_event`, `join_event`, `leave_event`, `event_attendees`, `unsubscribe_email`; service role only: `queue_event_reminders`, `claim_emails`, `complete_email`). Upgrades to existing tables use `alter table ... add column if not exists` so the file can be re-run on the live database. It is written to be re-runnable. After editing it, the user must paste it into Supabase › SQL Editor and run it; there is no CLI deploy for the schema (only the Edge Functions use the CLI).

Roles are in `profiles.role`: member, admin, owner (exactly one, claimed once). Photos are base64 JPEG text in `photos.data`.

- `cups.results` is a JSON array of `{rid, p, pts, character, raw}`. `p: null` means unclaimed (a human row not yet tied to a player); unclaimed rows still count in the cup's finishing order. `rid` is stable and claims point at it.
- `cups.status` is `racing` (built, results being entered on Race night) or `complete` (counts in standings). `cups.maps` holds the 4 tracks and is locked by the `cups_lock_maps` trigger once set. `race_results` has one row per player per race (position 1-12, points from `race_points()`); members write only through `enter_race`/`clear_race`. `finish_cup` builds `cups.results` from them.
- `save_cup_night(p_cups, p_players)` (admins) saves several finished cups in one transaction: creates new players, upserts each cup (`complete`; existing tracks and `added_at` are kept), replaces its `race_results` when a cup has a `races` key (rejecting shared places and race points that don't add up to the totals), and approves the cup's `submission` if given. Photos are upserted into `photos` afterwards by the client. `finish_cup` keeps a reopened cup's existing unclaimed rows.
- `cups.week` is the season week. League settings (`league.settings`) include `seasonWeeks` and `cupsPerWeek`.
- `players.user_id` links a player to an account; `registered_at` drives the "Joined" badge. `player_invites` (admins only) holds an email that auto-links on email confirmation via the `on_auth_user_confirmed` trigger.

- `events.cups` is a text array of cup names in order; empty = "Cup TBD". `events.sequence` is the .ics SEQUENCE (bumped on date/time or cup changes and on cancel); the .ics UID is `cup-night-<id>@kart-league`. Cancelling is a soft cancel (`status = 'cancelled'`).
- Cup night emails go through `email_outbox` (unique per event/user/kind/sequence), drained by the `send-emails` Edge Function via pg_cron; `profiles.email_cup_nights` is the opt-in. Edge Functions are deployed with `npx supabase functions deploy` (see README › Cup night emails). Emails are log-only until a Resend domain is set up. `league.settings` also holds `timezone` and `reminderHour`; `save_settings` replaces the whole settings object, so an admin settings form must keep those keys.

`npm test` runs Vitest: `tests/events-db.test.js` loads `schema.sql` into PGlite via `scripts/lib/localdb.js` (stubs for auth, roles and realtime) and exercises each role. To test other schema changes locally, run it in PGlite (`@electric-sql/pglite`, Node 20+) with stubs for `auth.users`, `auth.uid()` (reading `request.jwt.claim.sub`), the `anon`/`authenticated` roles and the `supabase_realtime` publication, then exercise each role with `set role`.

## When the user shares a results-screen photo

Claude Code has no database credentials, so it cannot write cups directly. Read the photo (highlighted rows are humans; for each, the character and points; skip unhighlighted CPU rows), then give the user a table of league players and points to enter on the site's **+ Add cup** page. For a whole folder of a night's photos, run `npm run backlog -- <folder>` and have the user import `backlog-import.json` on the Add page.

## Rules of the data

- `max` is points possible per player for that cup (60 for a standard 4-race cup with 12 racers).
- Standings are computed in `src/lib/standings.js` (`compute`); never store derived numbers.
