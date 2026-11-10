# Kart Night League

Static GitHub Pages site (repo MEGmax/kart-league, branch `main`, no build step): `index.html` + `styles.css` + `app.js`.
Accounts and data are in Firebase: Auth (email/password + Google) and Cloud Firestore. `firebase-config.js` holds the project config.

## Firestore layout

- `league/main`: settings `{name, season, seasonLength, playoffSpots, minParticipation, defaultMax}`
- `players/{id}`: `{name, color, aliases[]}`
- `cups/{id}`: `{cup, date, max, results: [{p, pts, raw}], notes, hasPhoto, addedAt, addedBy}`
- `photos/{cupId}`: `{data: base64 JPEG}` (kept under 1 MiB)
- `users/{uid}`: `{displayName, email, role: member|admin, color, favoriteCharacter, favoriteVehicle, createdAt, updatedAt}`
- `config/owner`: `{uid}`, the permanent owner, claimed once from the account page
- `submissions/{id}` + `submissionPhotos/{id}`: member-submitted cups awaiting admin review

`firestore.rules` is the source of truth for permissions. After editing it, the user must paste it into Firebase console › Firestore › Rules and publish (no CLI deploy is set up).

## When the user shares a results-screen photo

Claude Code has no Firebase credentials, so it cannot write cups directly. Read the photo (rows: position, on-screen name, points; skip CPU character names), then give the user a table of league players and points to enter on the site's **+ Add cup** page.

## Rules of the data

- `max` is points possible per player for that cup (60 for a standard 4-race cup with 12 racers).
- Standings are computed in `app.js` (`compute`); never store derived numbers.
