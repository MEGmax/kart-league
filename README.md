# Kart Night League

Regular-season standings for our Mario Kart Wii league. It's a static site on GitHub Pages: the page reads `data/league.json`, and every cup is a commit.

## How the standings work

- Each race is scored 15-12-10-8-7-6-5-4-3-2-1-0, so a 4-race cup is out of 60.
- Rank = points earned ÷ points possible in the cups you played.
- You must play at least 50% of cups held so far to be ranked.
- Tiebreakers: cup wins, head-to-head points, total points, then a one-race runoff.
- 20-cup regular season; top 4 make the playoffs (playoff page is "coming soon").

All of these numbers are editable on the Rules page by the commissioner. Full rules are on the site.

## Adding a cup

**On the site (phone or laptop).** Open the site, scroll to the bottom, tap **Commissioner**, and paste:

1. A **GitHub fine-grained token**: github.com › Settings › Developer settings › Fine-grained tokens › Generate. Repository access: only `kart-league`. Permissions: **Contents: Read and write**. Nothing else.
2. Optionally, an **Anthropic API key** (console.anthropic.com › API keys) so Claude reads the photo for you. Each photo costs a few cents; set a spend limit on the key.

Both are stored only in that browser's local storage. Then **+ Add cup**, upload the results-screen photo, check the scores, save. The site updates about a minute later.

**From Claude Code.** Open this folder in Claude Code, drop in the photo, and say "add this cup". See `CLAUDE.md`.

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The site |
| `data/league.json` | League settings, players and every cup's results |
| `photos/` | Results-screen photos, one per cup |
| `CNAME` | Custom domain (added once a domain is set up) |

## Custom domain

1. Buy a domain (Cloudflare Registrar, Porkbun or Namecheap; about $10/yr).
2. At the registrar's DNS settings, add:
   - **Subdomain** (e.g. `kart.example.com`): one `CNAME` record, name `kart`, value `megmax.github.io`.
   - **Root domain** (e.g. `example.com`): four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, plus a `CNAME` for `www` → `megmax.github.io`.
   - On Cloudflare, set these records to **DNS only** (grey cloud) until HTTPS is issued.
3. Tell Claude Code the domain, or in the repo go to Settings › Pages › Custom domain, enter it, save, and tick **Enforce HTTPS** once it's available (can take up to an hour).
