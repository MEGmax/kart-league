# Kart Night League

Regular-season standings for our Mario Kart Wii league. It's a static site on GitHub Pages with Firebase for accounts and league data.

## How the standings work

- Each race is scored 15-12-10-8-7-6-5-4-3-2-1-0, so a 4-race cup is out of 60.
- Rank = points earned ÷ points possible in the cups you played.
- You must play at least 50% of cups held so far to be ranked.
- Tiebreakers: cup wins, head-to-head points, total points, then a one-race runoff.
- 20-cup regular season; top 4 make the playoffs (playoff page is "coming soon").

All of these numbers are editable by admins on the Admin page. Full rules are on the site.

## Accounts and roles

Sign-in is handled by Firebase (email and password, or Google). League data lives in Cloud Firestore, and `firestore.rules` enforces who can do what:

| Role | Can |
|---|---|
| Visitor (signed out) | View standings, cups, rules |
| Member (anyone who signs up) | Edit their profile; submit a cup with a photo for review; withdraw their pending submissions |
| Admin | Add, edit and delete cups; approve or reject submissions; change league settings and players; promote or demote members |
| Owner | Everything an admin can do; can't be demoted. Claimed once from the account page |

With an Anthropic API key saved on their account page (stored only in that browser), anyone adding or submitting a cup gets Claude to read the names and points from the photo.

## Firebase setup (one time)

1. [Firebase console](https://console.firebase.google.com) › **Add project** (Analytics off is fine).
2. **Build › Authentication › Get started › Sign-in method**: enable **Email/Password** and **Google**.
3. **Authentication › Settings › Authorized domains**: add `megmax.github.io` (and the custom domain once you have one).
4. **Build › Firestore Database › Create database**, production mode, any nearby location.
5. **Firestore › Rules**: replace everything with the contents of `firestore.rules`, then **Publish**. Do this again whenever that file changes.
6. **Project settings › General › Your apps › Web (`</>`)**: register an app and copy the `firebaseConfig` object into `firebase-config.js`.
7. Open the site, create an account, and press **Claim league ownership** on the account page.

## Custom domain

1. Buy a domain (Cloudflare Registrar, Porkbun or Namecheap; about $10/yr).
2. At the registrar's DNS settings, add:
   - **Subdomain** (e.g. `kart.example.com`): one `CNAME` record, name `kart`, value `megmax.github.io`.
   - **Root domain** (e.g. `example.com`): four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, plus a `CNAME` for `www` → `megmax.github.io`.
   - On Cloudflare, set these records to **DNS only** (grey cloud) until HTTPS is issued.
3. Tell Claude Code the domain, or in the repo go to Settings › Pages › Custom domain, enter it, save, and tick **Enforce HTTPS** once it's available (can take up to an hour).
