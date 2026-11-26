# Night Kart League design

The site should read like a league table in a printed race programme or on a broadcast, not like an
analytics dashboard. The brand is the NKL logo (navy and red), the character art, the track pictures and
the kart in the hero. Everything else stays quiet, so those carry the personality.

Design for a 375px phone first, then check 1280px.

## Type: two families

| Family | Used for |
|---|---|
| **Rubik Mono One** (display) | The wordmark ("Night Kart League" in the hero and footer) and page titles (`PageTitle`). Nothing else. |
| **Barlow** 400 / 500 / 600 / 700 / 800, plus 700 and 800 italic | Everything else, numbers included. `font-variant-numeric: tabular-nums` is set on `body`, so columns line up without a monospace font. |

Space Grotesk and JetBrains Mono are dropped.

| Role | Size / weight (phone → desktop) | Notes |
|---|---|---|
| Wordmark | clamp(28px, 7.6vw, 48px), display | No skew, no text shadow. |
| Page title | 22px → 28px, display | No accent bar in front. |
| Section heading | 20px, Barlow 700 | Normal case. |
| Rank numeral | 26px, Barlow 800 italic | The one "racing" flourish. |
| Table figure (rating) | 22px, Barlow 700 | |
| Body | 16px, Barlow 400/500 | |
| Name in a row | 18px, Barlow 700 | |
| Meta / secondary | 14px minimum, Barlow 500, `muted` | Nothing under 14px except bottom-tab labels (12px, 600). |
| Table header | 14px, Barlow 600, `muted` | Normal case. No uppercase letter-spaced labels anywhere. |

## Colour: every colour means something

| Token | Hex | Meaning | Contrast on `bg` |
|---|---|---|---|
| `bg` | `#0D1238` | The one page background. Flat, with no gradients or glows. | |
| `raised` | `#161C4A` | Things that float over the page: drawer, dialogs, menus, tooltips, inputs, the podium steps. | |
| `line` | `#2A3270` | Hairline between table rows and list items. | |
| `rule` | `#4A5390` | The heavier rule under a table header, and outlined buttons. | |
| `ink` | `#F4F5FB` | Text. | 16.6:1 |
| `muted` | `#B3BADD` | Secondary text, at 14px or larger only. | 9.5:1 |
| `gold` | `#FFD23F` | The leader / 1st place, and the primary action button. | 12.5:1 |
| `red` | `#EF3B32` | The playoff line (and the logo's red in the brand stripe). | 4.6:1 (line) |
| `redText` | `#FF6B62` | Text in red: the "Playoff line" label, errors. | 6.5:1 |
| `up` / `down` | `#3DDC84` / `#FF6B72` | A rating that went up or down, always next to an ▲ or ▼ so colour isn't the only signal. | 10.1 / 6.6:1 |
| `link` | `#7FD8FF` | Text links (underlined). | 11.4:1 |
| `silver` / `bronze` | `#C9D2E8` / `#E58F4E` | **The podium only.** | |
| `navy` / `brandRed` | `#1E2571` / `#DC251D` | The logo's own colours: the hero band and the navy, white and red stripe. | |

Rules:

- Rank numbers outside the podium are plain `ink`. 1st place uses `gold`, everyone else plain.
- Medal colours (gold, silver and bronze together) appear only on the Home podium.
- Player colours are no longer drawn on screen: no rings around faces, no bars, no dots. They meant nothing to anyone else.
- No progress bars that repeat a number printed beside them.

## Spacing

The base is 8px (MUI `spacing(1)`), on a 4 / 8 / 12 / 16 / 24 / 32 / 48 scale.

- 16px page gutter on phones and 32px on desktop. The content is at most 1152px wide.
- 32px between sections on a page and 48px before the footer.
- Table rows are 64px tall, which keeps a tap target of at least 44px. List items are 12px top and bottom.

## Borders and cards

The default is **no box**. Content sits on the page and is grouped by spacing, alignment and headings.

A border or surface is allowed only when it separates something:

- **Hairline rules** (`line`) between table rows and list items. A heavier `rule` goes under table headers.
- **Raised surfaces** (`raised`, radius 12) for things that float: the racer drawer, dialogs, menus and tooltips.
- **Form fields and outlined buttons** (radius 8).
- **Alerts** (info/success/error), because they interrupt the page.
- **Pictures** (track images, character art, result photos) get radius 8 and no border.

Never put a panel inside a panel. A table is never wrapped in a bordered box.

## A table row

A row on a phone (375px):

```
 1   (face)  gsote                      1597
             14 of 14 cups · 11 wins     ▲36
```

- **Rank**: 40px column, Barlow 800 italic 26px. Gold for 1st, otherwise `ink`. "–" for an unranked row.
- **Face**: 36px circle on `raised`, with no ring. The character name isn't shown here; it's in the drawer.
- **Name**: Barlow 700 18px. A small outlined "P" marks a provisional rating.
- **Meta line**: 14px `muted`, only what a racer checks (cups played, cup wins).
- **Rating**: right-aligned, Barlow 700 22px. The last night's change sits under it in `up`/`down` with an arrow.
- The whole row is a link, at least 64px tall, with a `#121848` hover and a gold focus ring.
- On desktop (≥900px) the meta line becomes real columns: Cups · Wins · Points · Last night · Rating, under a header row with a 2px `rule` underline.
- **The playoff line** is a 2px solid `red` rule across the full table after the last playoff spot, labelled "Playoff line" in `redText` at the right.
- **Not yet qualified** players follow in the same table under a plain group label. Their numbers are `muted`.

## One hero per page

| Page | Hero | Stepped down |
|---|---|---|
| Home | The standings table | Podium (compact, above it); "This week" notes as plain sentences (beside on desktop, below on phone) |
| Schedule | The season strip (cups as pips grouped by night, sticky) and the latest cup: track pictures, full results, race grid | Upcoming nights as rows; older cups as compact result lists under their night, with race grids folded away |
| Stats | The two headline leaderboards, Cup wins and Points a cup (bigger rows, top 5) | Seven smaller leaderboards (top 3), three across on desktop |
| Join | The live cup (or "no cup tonight" plus the next night) | Track vote |
| Rules | The numbered rules | How the rating works |

## Motion

Only the hero kart moves. It parks when `prefers-reduced-motion` is set, as it does now. Hover feedback is
a background change, not a lift or tilt.
