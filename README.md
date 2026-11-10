# Kart Night League

Regular-season standings for our Mario Kart Wii league. It's a static site on GitHub Pages with Supabase for accounts and league data.

## How the standings work

- Regular season: 5 weeks, about 4 cups a week (20 cups). Each cup is 4 races.
- Each race is scored 15-12-10-8-7-6-5-4-3-2-1-0, so a cup is out of 60.
- Rank = points earned ÷ points possible in the cups you played.
- You must play at least 50% of cups held so far to be ranked.
- Tiebreakers: cup wins, head-to-head points, total points, then a one-race runoff.
- Top 4 make the playoffs (playoff page is "coming soon").
- Every result records the character used; the site shows each player's most-picked character and a league-wide character chart.

All of these numbers are editable by admins on the Admin page.

## Results photos and unclaimed points

Upload the photo of the standings screen after a cup's 4 races. Human players' rows are highlighted on that screen. With an Anthropic API key saved on your account page, Claude reads every row and records each highlighted player's character and points; CPU rows are dropped.

Highlighted rows that can't be matched to a player are saved as **unclaimed**. They appear on the Unclaimed page, where a signed-in person presses **That was me** (and can correct the character). An admin approves the request on the Admin page and the points move to that person's player, creating one if needed.

## Accounts and roles

Sign-in and data use [Supabase](https://supabase.com) (free plan): email and password or Google sign-in, and a Postgres database. Row level security in `supabase/schema.sql` enforces who can do what:

| Role | Can |
|---|---|
| Visitor (signed out) | View standings, cups, rules |
| Member (anyone who signs up) | Edit their profile; request unclaimed points; submit a cup with a photo for review; withdraw their pending requests and submissions |
| Admin | Add, edit and delete cups; approve or decline point requests and submissions; add players ahead of sign-up and link them to accounts; change league settings; promote or demote members |
| Owner | Everything an admin can do; can't be demoted. Claimed once from the account page |

Admins can add players before those people sign up. Put the person's email on the player: when they create an account with that email and confirm it, it's linked automatically and their registration date shows as a "Joined" badge.

Free Supabase projects pause after 7 days without activity. The `Keep database awake` GitHub Action reads one row every 3 days to prevent that. If the project is ever paused anyway, restore it from the Supabase dashboard.

## Supabase setup (one time)

1. Create a free project at [supabase.com/dashboard](https://supabase.com/dashboard) (pick a nearby region; save the database password somewhere safe).
2. **SQL Editor › New query**: paste all of `supabase/schema.sql`, press **Run**. Re-run it whenever that file changes.
3. **Authentication › URL Configuration**: Site URL `https://megmax.github.io/kart-league/`; add the same under Redirect URLs (and the custom domain later).
4. **Project Settings › API** (or **Connect**): copy the Project URL and the publishable/anon key into `supabase-config.js`.
5. Open the site, create an account, and press **Claim league ownership** on the account page.

### Google sign-in (optional)

1. [Google Cloud Console](https://console.cloud.google.com) › create a project › **APIs & Services › OAuth consent screen**: External, app name "Kart Night League", your email; publish it.
2. **Credentials › Create credentials › OAuth client ID** › Web application. Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Supabase › **Authentication › Sign In / Providers › Google**: enable, paste the client ID and secret, save.

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The site |
| `supabase-config.js` | Supabase project URL and publishable key (not secret) |
| `supabase/schema.sql` | Tables, permissions and save functions; paste into the Supabase SQL editor |
| `.github/workflows/keepalive.yml` | Pings the database every 3 days so the free project doesn't pause |
| `data/league.json` | Fallback data shown only while Supabase isn't configured |
| `CNAME` | Custom domain (added once a domain is set up) |

## Custom domain

1. Buy a domain (Cloudflare Registrar, Porkbun or Namecheap; about $10/yr).
2. At the registrar's DNS settings, add:
   - **Subdomain** (e.g. `kart.example.com`): one `CNAME` record, name `kart`, value `megmax.github.io`.
   - **Root domain** (e.g. `example.com`): four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, plus a `CNAME` for `www` → `megmax.github.io`.
   - On Cloudflare, set these records to **DNS only** (grey cloud) until HTTPS is issued.
3. Tell Claude Code the domain, or in the repo go to Settings › Pages › Custom domain, enter it, save, and tick **Enforce HTTPS** once it's available (can take up to an hour).
