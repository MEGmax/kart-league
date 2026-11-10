# Kart Night League

Static GitHub Pages site (repo MEGmax/kart-league, branch `main`). No build step: `index.html` + `styles.css` + `app.js` read `data/league.json`.

## Adding a cup from a results-screen photo

When the user shares a photo of the Mario Kart Wii end-of-cup results screen:

1. `git pull` first; the commissioner may have saved cups from the site.
2. Read every row: position, name on screen, total points. Computer racers have character names (Mario, Luigi, Peach, Toad, Bowser, etc.) and are not recorded. Human players show Mii names.
3. Match names to `players` in `data/league.json` by `name` or any entry in `aliases` (case-insensitive). If a name is new, ask the user whether it's a new player or an existing one under a different name before adding anyone.
4. Show the user the parsed table (name → player → points) and get a yes before writing. Ask which cup it was (Mushroom, Flower, Star, Special, Shell, Banana, Leaf, Lightning, or Other) and the date if not obvious; default date is today.
5. Copy the photo to `photos/<cupId>.jpg` (downscale to ≤2000px long edge, e.g. `sips -Z 2000 -s format jpeg`).
6. Append to `cups`, keep 2-space JSON formatting:
   ```json
   { "id": "<base36 time + random>", "cup": "Star Cup", "date": "YYYY-MM-DD", "max": 60,
     "results": [{ "p": "<player id>", "pts": 52, "raw": "<name as shown on screen>" }],
     "photo": "photos/<cupId>.jpg", "notes": "", "addedAt": <ms epoch> }
   ```
   New player: `{ "id": "<base36>", "name": "...", "color": "<unused color from COLORS in app.js>", "aliases": [] }`. If the on-screen name differs from the player's name, add it to that player's `aliases`.
7. Validate: points are whole numbers 0..max, each player at most once per cup. Then commit (`Add Star Cup (2026-11-14)`) and push. The site updates about a minute after the push.

## Rules of the data

- `max` is points possible per player for that cup (60 for a standard 4-race cup with 12 racers).
- Standings are computed in `app.js` (`compute`); never store derived numbers in the JSON.
