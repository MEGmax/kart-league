# Kart Night League

Regular-season standings for our Mario Kart Wii league. It's a React + MUI site, built with Vite and deployed
to GitHub Pages by a GitHub Actions workflow, with Supabase for accounts and league data.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # production build to dist/ (what GitHub Actions deploys)
npm test         # tests: the schema in an in-memory Postgres (PGlite), plus the email and calendar code
npm run email:preview   # dry run of cup night emails; writes them to email-previews/
```

Needs Node 20+. Pushing to `main` builds and deploys automatically via `.github/workflows/deploy.yml` —
in the repo's **Settings › Pages**, the source must be set to **GitHub Actions** (not "Deploy from a branch").

## How the standings work

- Regular season: 5 weeks, about 4 cups a week (20 cups). Each cup is 4 races.
- Each race is scored 15-12-10-8-7-6-5-4-3-2-1-0, so a cup is out of 60.
- Rank = points earned ÷ points possible in the cups you played.
- You must play at least 50% of cups held so far to be ranked.
- Tiebreakers: cup wins, head-to-head points, total points, then a one-race runoff.
- Top 4 make the playoffs: a seeded single-elimination bracket (projected on the Playoffs page until the season ends; top seeds get byes if the field isn't a power of two).
- Every result records the character used; the site shows each player's most-picked character and a league-wide character chart.

All of these numbers are editable by admins on the Admin page.

## Cup night workflow

1. **Build the cup** (admin, before racing): Cup builder › pick 4 tracks by hand, from a template (the 8 game cups are built in; save your own like "Cursed Cup"), or at random. **Lock in & start racing**. The tracks can't change after this.
2. **After each race**: every racer opens **Race night** and enters their finishing position (1st–12th) and character. Points come from the 15-12-10-8-7-6-5-4-3-2-1-0 table. Admins can enter or fix results for anyone. Two people claiming the same place gets flagged.
3. **After the cup**: an admin presses **Finish cup**, adds the results-screen photo, and the site compares the photo's totals with what everyone entered (Claude reads the photo if an Anthropic key is saved on the account page). Fix anything that's off, then **Finalize**. Only finalized cups count. Highlighted photo rows nobody entered can be saved as unclaimed points.

Admins can reopen a finished race-by-race cup on Race night, or fix any finished cup with **Edit results** on the Cups page.

## Recording a whole night afterwards

When you raced specific cups and everyone kept the same character all night, record the night in one go with
**+ Add results** (`#/add`), or **Record results** on a past cup night (which brings in its cups and everyone who was in):

1. **Cups raced, in order**: game cups and your templates come with their 4 tracks; a custom cup takes any 4 tracks (or none).
2. **Racers and their characters**: each racer once, as a league player, a new player, or unclaimed (a guest), with the one character they used all night.
3. **Results**: per cup, either the cup totals from the results screen or each race's finishing place (track stats fill in). A blank racer sat that cup out.
   Add each cup's results photo; with an Anthropic key saved on the account page, Claude reads it and fills in the points, matching
   highlighted rows to racers **by character** (then by name). Totals that disagree with the photo are flagged in red; highlighted rows
   that match nobody can be added as unclaimed.

Admins save straight to the standings (`save_cup_night`, one transaction for every cup). Members submit the night instead: one
submission per cup sharing a batch id, reviewed together from the Admin page in the same editor. An unsaved night is kept in the
browser as a draft (without photos).

## Cup nights

Admins schedule cup nights on the **Cup nights** page (or from the homepage card): a date and time, the cups
(optional: with none it shows "Cup TBD", and cups can be assigned later) and notes. Times are stored in UTC and
shown in each visitor's own time zone. The homepage shows the next cup night with who's in. Signed-in people
press **I'm in** or **Leave**; signed-out visitors get a prompt to sign in. Cancelled nights stay listed, marked
as cancelled, and past nights are folded away at the bottom of the page.

### Cup night emails

Off by default. People turn on **Email me about cup nights** on their account page, and only they get:

| When | Who | Email |
|---|---|---|
| An admin schedules a cup night | Everyone opted in | Invite with the details, an **I'm in** button and a calendar file (.ics) |
| Its date/time or cups change | Everyone opted in | Update; the calendar entry updates in place (same UID, higher SEQUENCE) |
| It's cancelled | Opted-in people who got the invite or an update | Cancellation; removes the calendar entry (METHOD:CANCEL) |
| The day of, from 9am league time | Opted-in people who are in | Reminder |

Every email has an unsubscribe link (and a one-click unsubscribe header for Gmail and Apple Mail) that turns
the setting off. Note-only edits don't send anything.

How it works: scheduling, editing or cancelling adds rows to `email_outbox` in the same database transaction,
so the admin's save stays fast and never fails because of email. A pg_cron job calls the `send-emails` Edge
Function each minute while something is waiting. It sends each email with the row id as the provider's
idempotency key, so a retry can't double-send. Failures retry with backoff, up to 5 tries. Emails that no
longer apply are dropped when they're picked up (the person opted out, a newer update replaced it, the night
was cancelled or already started). Another pg_cron job queues reminders every 15 minutes, at most one per
person per night.

The league time zone (`timezone`, default `America/Toronto`) and reminder hour (`reminderHour`, default 9) are
league settings. Until the Admin page exists, change them in the SQL editor:
`update league set settings = settings || '{"timezone": "America/Vancouver", "reminderHour": 10}' where id = 1;`

**Right now emails are log-only.** Nothing is sent until the steps below are done, and pending emails simply
wait in the outbox. Stale ones are dropped when sending starts, so nobody gets a pile of old invites.

#### Turning emails on

1. **Domain.** Resend (and every other provider) only sends to other people from a domain you've verified, so
   this waits on the custom domain. At [resend.com](https://resend.com) (free: 3,000 emails/month, 100/day),
   add the domain, add the DNS records it lists, and create an API key.
2. **Secrets.** Copy `.env.example` to `.env`, fill it in (`EMAIL_MODE=send`, `RESEND_API_KEY`, `EMAIL_FROM`,
   and a random `CRON_SECRET`), then:
   ```sh
   npx supabase login     # opens the browser; uses a personal access token, not the project's API keys
   npx supabase secrets set --env-file .env --project-ref ikbcapdpatjwozjdgcqk
   npx supabase functions deploy send-emails --no-verify-jwt --project-ref ikbcapdpatjwozjdgcqk
   npx supabase functions deploy unsubscribe --no-verify-jwt --project-ref ikbcapdpatjwozjdgcqk
   ```
   (`--no-verify-jwt`: send-emails checks `CRON_SECRET` itself, and unsubscribe has to work from a mail app.)
   You can deploy with `EMAIL_MODE=log` first and watch Edge Functions › send-emails › Logs.
3. **Database.** Supabase › Database › Extensions: turn on **pg_cron** and **pg_net**. In the SQL editor run
   `select vault.create_secret('<the same CRON_SECRET>', 'email_worker_secret');`, then re-run
   `supabase/schema.sql`. It schedules the two jobs once the extensions and the secret exist.

#### Trying it locally

`npm run email:preview` runs the whole flow (invite → cups assigned → reminder → cancellation) against an
in-memory copy of the schema with three sample accounts. It prints what would be sent and to whom, and writes
every email as HTML, text and .ics to `email-previews/`. To run the reminder job as if it were a particular time:
`npm run email:preview -- --remind-at 2026-11-20T14:05Z`. On the live database, `select public.queue_event_reminders();`
in the SQL editor queues today's reminders immediately (the sender picks them up within a minute once it's set up).

## Stats

Per cup and racer: finishing position, character, points, and a race-by-race grid. Per racer overall: points percentage, total points, average points per cup, average race finish, average cup finish, wins, podiums, character usage %, last 3 characters, strongest and weakest tracks, and full cup history.

## Character art

Character images appear next to racers in cups, the leaderboard, the podium, player cards and Race night. Characters without an image (currently Daisy, Toadette, Rosalina, Funky Kong, Dry Bowser and Mii) show a colored initial badge instead. To add one, see the top of `tools/characters.py`.

The artwork belongs to Nintendo; it's used here as a fan site and should be removed if Nintendo asks.

## Unclaimed points

Highlighted rows on a results photo that aren't matched to anyone are saved as **unclaimed**. They appear on the Unclaimed page, where a signed-in person presses **That was me** (and can correct the character). An admin approves the request on the Admin page and the points move to that person's player, creating one if needed.

## Accounts and roles

Sign-in and data use [Supabase](https://supabase.com) (free plan): email and password or Google sign-in, and a Postgres database. Row level security in `supabase/schema.sql` enforces who can do what:

| Role | Can |
|---|---|
| Visitor (signed out) | View standings, cups, rules |
| Member (anyone who signs up) | Edit their profile; say they're in for cup nights; opt in to cup night emails; request unclaimed points; submit a night's cups with photos for review; withdraw their pending requests and submissions; delete their account |
| Admin | Schedule, edit and cancel cup nights; add, edit and delete cups; approve or decline point requests and submissions; add players ahead of sign-up and link them to accounts; change league settings; promote or demote members |
| Owner | Everything an admin can do; can't be demoted. Claimed once from the account page |

Admins can add players before those people sign up. Put the person's email on the player: when they create an account with that email and confirm it, it's linked automatically and their registration date shows as a "Joined" badge.

Free Supabase projects pause after 7 days without activity. The `Keep database awake` GitHub Action reads one row every 3 days to prevent that. If the project is ever paused anyway, restore it from the Supabase dashboard.

## Supabase setup (one time)

1. Create a free project at [supabase.com/dashboard](https://supabase.com/dashboard) (pick a nearby region; save the database password somewhere safe).
2. **SQL Editor › New query**: paste all of `supabase/schema.sql`, press **Run**. Re-run it whenever that file changes.
3. **Authentication › URL Configuration**: Site URL `https://megmax.github.io/kart-league/`; add the same under Redirect URLs (and the custom domain later).
4. **Project Settings › API** (or **Connect**): copy the Project URL and the publishable/anon key into `src/lib/supabaseClient.js`.
5. Open the site, create an account, and press **Claim league ownership** on the account page.

### Google sign-in (optional)

1. [Google Cloud Console](https://console.cloud.google.com) › create a project › **APIs & Services › OAuth consent screen**: External, app name "Kart Night League", your email; publish it.
2. **Credentials › Create credentials › OAuth client ID** › Web application. Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Supabase › **Authentication › Sign In / Providers › Google**: enable, paste the client ID and secret, save.

## Files

| Path | What it is |
|---|---|
| `src/` | The React app (components, pages, context providers, standings math) |
| `src/lib/night.js`, `src/components/night/` | Recording a cup night: validation, photo matching by character, save payloads; the Add page's editors |
| `src/lib/readPhoto.js` | Reads a results photo with Claude (`@anthropic-ai/sdk`, the visitor's own key, kept in their browser) |
| `index.html`, `vite.config.js` | Vite entry point and build config (`base: "/kart-league/"` for GitHub Pages) |
| `src/lib/supabaseClient.js` | Supabase project URL and publishable key (not secret) |
| `supabase/schema.sql` | Tables, permissions and save functions; paste into the Supabase SQL editor |
| `supabase/functions/` | Edge Functions for cup night emails (`send-emails`, `unsubscribe`) and their shared email/.ics code (`_shared/`) |
| `.env.example` | Settings for those Edge Functions (Resend key, sender, mode) |
| `tests/`, `scripts/lib/localdb.js` | Vitest tests; the schema runs in PGlite with stand-ins for Supabase's auth |
| `scripts/email-preview.mjs` | `npm run email:preview`: local dry run of the cup night emails |
| `.github/workflows/deploy.yml` | Builds the app and deploys `dist/` to GitHub Pages on every push to `main` |
| `.github/workflows/keepalive.yml` | Pings the database every 3 days so the free Supabase project doesn't pause |
| `data/league.json` | Legacy fallback data from the old static site; no longer read by the app |
| `public/assets/characters/` | Character portraits (`name-face.webp`) and full art (`name.webp`) used around the site |
| `tools/characters.py` | Rebuilds `public/assets/characters/` from the full-size images in `data/character pngs/` (kept out of git) |
| `CNAME` | Custom domain (added once a domain is set up) |

## Custom domain

1. Buy a domain (Cloudflare Registrar, Porkbun or Namecheap; about $10/yr).
2. At the registrar's DNS settings, add:
   - **Subdomain** (e.g. `kart.example.com`): one `CNAME` record, name `kart`, value `megmax.github.io`.
   - **Root domain** (e.g. `example.com`): four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, plus a `CNAME` for `www` → `megmax.github.io`.
   - On Cloudflare, set these records to **DNS only** (grey cloud) until HTTPS is issued.
3. Tell Claude Code the domain, or in the repo go to Settings › Pages › Custom domain, enter it, save, and tick **Enforce HTTPS** once it's available (can take up to an hour).
