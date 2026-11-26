# Night Kart League — Ruleset & Stats Plan

Nov 25, 2026 · @Matthew Grech

## Summary

Season 1 keeps points percentage, with four small patches for weeks 4–5 and the playoffs. Season 2 switches the standings to an Elo-style skill rating, adds 20+ new stats, and gives the league awards, records and rivalries.

- **Now (Season 1, weeks 4–5):** raise qualifying from 10% to 40%, clean up the two stuck "racing" cups, record tracks for every cup, and make each playoff round two cups instead of one.
- **Season 2:** rank by rating, not percentage. Beating a strong player in a cup is worth more than beating a weak one, and a 4-cup hot streak can't outrank 11 cups of steady results.
- **Site:** one new rating module, a `season` column on cups, and updates to the Standings, Playoffs, Stats, Rules and Admin pages (spec below).

Season 1 so far: 12 cups over 3 weeks, 6 racers, 48 races, 23 tracks.

## Season 1 fixes for weeks 4–5

Four patches, all admin settings or process, with no code changes. Announce them before week 4 so nobody is surprised at playoff time.

| Fix | Today | Change to | Why |
| --- | --- | --- | --- |
| Qualifying mark | 10% of cups (2 of 12) | 40% of cups held, rounded up | At 10%, Kieran is 2nd after 4 cups, ahead of Matty G after 11. At 40% the final mark is 9 of 21 cups. |
| Stuck live cups | Cups 10 and 11 still show "being raced now" | Finish or delete both on Join/Admin | They look like open cups on History and can collect stray entries. |
| Tracks | Week 1's 4 cups are "Unknown Cup" | Every cup built in the cup builder before racing | Track stats and the Season 2 meta stats need the 4 tracks for every cup. |
| Playoff rounds | One cup per matchup | Two cups per round, aggregate points; a tie goes to a one-race runoff | One cup is a coin flip: 6 of 12 cups so far were won by 2 points or less, 3 of them ties. |

**What 40% means for each racer (9 cups left in the season):**

| Racer | Cups so far | Needs by end | Still to play |
| --- | --- | --- | --- |
| gsote | 12 | 9 | Done |
| licia | 12 | 9 | Done |
| Matty G | 11 | 9 | Done |
| JJ Siwa | 6 | 9 | 3 |
| Kieran4145 | 4 | 9 | 5 |
| unphyt | 3 | 9 | 6 |

Playoff night format: all four qualifiers race the same two cups together. Seeds 1 v 4 and 2 v 3 compare aggregate points; the two winners race two more cups for the title. That fits one night and matches how the Wii's 4-player split screen works.

## Season 2 ruleset

Season 2 keeps the night-to-night format and scoring and changes how the table is ranked. Rules marked **New** or **Changed** differ from Season 1; the rest carry over word for word from the site's Rules page.

1. **Season format.** 5 weeks of 4 cups (20 cups). Each cup is 4 races. A night that runs over keeps its extra cups in that week.
2. **Standard settings.** 150cc, CPUs on Hard, items Normal, any character and any kart or bike.
3. **Characters (Changed).** Declare one main character when you join the night. You may switch for a cup, but say so before the cup starts so the photo can be matched. Two humans can't share a character in the same cup.
4. **Tracks (New).** Every cup is built in the cup builder before racing, so all 4 tracks are recorded. Each night races 2 of the game's 8 cups, in a rotation that covers all 8 by week 4, plus 2 cups picked by track vote. No track twice in one night.
5. **Race scoring.** The game's 12-racer table: 15-12-10-8-7-6-5-4-3-2-1-0, so a cup is out of 60.
6. **Entering results and the photo check.** Unchanged: enter race by race on Join or record the night from results photos; the end-of-cup photo is the check; only finished cups count.
7. **Ranking stat: skill rating (Changed).** Your rank is your rating. After every cup, each pair of league players in it is scored as a mini-match, and your rating goes up or down depending on who you beat, by how much, and how strong they were. Details in the next section.
8. **Starting ratings (New).** Season 1 players start Season 2 halfway between their final Season 1 rating and 1500. New players start at 1500.
9. **Provisional ratings (New).** Your first 5 cups of the season are provisional: your rating moves 50% faster and shows a "P" badge.
10. **Qualifying (Changed).** To be ranked you need at least 5 cups and 40% of the cups held so far, rounded up. By season's end that is 8 of 20.
11. **Cup wins and podiums.** Unchanged: human players only, most points wins, ties share the place.
12. **Tiebreakers (Changed).** Ratings are compared to the whole point. Equal ratings are split by cup wins, then head-to-head points, then total points, then a one-race runoff on a track an admin picks.
13. **Abandoned cups.** Unchanged: an unfinished cup doesn't count and is raced again from the start.
14. **Playoffs (Changed).** After week 5 the standings lock and the top 4 ranked players make the playoffs, seeded by rating. Each round is 2 cups on aggregate points; a tie goes to a one-race runoff. All four race the semifinal cups together, and the final is 2 more cups. Playoff cups count in stats and records but don't move the locked season rating.
15. **Disputes.** Unchanged: the photo settles it; unreadable photo means agree or replay; admins can correct any cup.

## How the rating works

Each cup is scored as a set of head-to-head matches between the league players in it. With 4 humans, that's 3 matches each per cup. CPUs don't count.

For each opponent, your **result** blends who finished ahead with the margin, so a 43–42 cup is close to a draw and a 60–24 cup is a full win:

```latex
S = \tfrac{1}{2}\,W + \tfrac{1}{2}\,\mathrm{clamp}\!\left(\tfrac{1}{2} + \tfrac{p_\text{you} - p_\text{them}}{60},\ 0,\ 1\right)
```

W is 1 for more points, ½ for a tie, 0 for fewer. Your **expected** result against them comes from the rating gap, and your rating moves by the difference, averaged over your opponents:

```latex
E = \frac{1}{1 + 10^{(R_\text{them} - R_\text{you})/400}} \qquad \Delta R = \frac{K}{n-1}\sum_{\text{opponents}} (S - E)
```

| Setting | Value | Effect |
| --- | --- | --- |
| Starting rating | 1500 | New players start level |
| K (cup weight) | 32 | Most a rating can move in one cup |
| Provisional K | 48 for the first 5 cups | New players find their level faster |
| Margin cap | 30 points | Winning by 30+ in a cup counts as a full win |
| Season carry-over | 50% | Season 2 starts halfway between your Season 1 rating and 1500 |

&#91;embedded content: Night Kart League history page, cups 1–12 (Nov 8–22, 2026), run through the rating described above\]

Under the current points-percentage rules Kieran is 2nd and Matty G 3rd. The rating flips them: Matty G earned his 1523 over 11 cups, while Kieran's 1510 rests on 4 week-1 cups and stays provisional. The top (gsote) and the order below 1500 are close to today's table.

## Stats plan

The plan adds 22 stats and 10 awards across four areas, all computed from data the site already stores. Stats marked † need race-by-race entry, which Season 1 has for cups 5–12 only; the new Tracks rule makes it standard in Season 2.

### Player stats

| Stat | What it measures | Shows on | Season 1 example |
| --- | --- | --- | --- |
| Rating and change | Current rating, change on the last night, season high | Standings row, player drawer | gsote 1582, +20 on Nov 22 |
| Form | Points % over your last 4 cups, with an up/down arrow vs season | Standings row |  |
| Consistency | Spread (standard deviation) of your cup points; lower is steadier | Player drawer | JJ Siwa 6.8 steadiest, Kieran 14.0 swingiest |
| Closer † | Average points in race 4 vs races 1–3 | Player drawer |  |
| Comebacks † | Cups won after trailing a league player after race 2 | Player drawer |  |
| Top-3 race rate † | Share of races finished 1st–3rd out of all 12 racers, CPUs included | Player drawer |  |
| Over/under | Points scored minus what your rating predicted | Player drawer |  |
| Attendance | Cups played of cups held, and nights-in-a-row streak | Standings row |  |

### Head-to-head and rivalries

| Stat | What it measures | Shows on | Season 1 example |
| --- | --- | --- | --- |
| Head-to-head grid | W-L-T and point difference for every pair, from cups both raced | New Rivals page | gsote 9-2-1 vs licia, +144 pts |
| Rivalry of the season | Pair with 6+ meetings and the closest record | Rivals page header | JJ Siwa vs licia: 3-3, licia +2 pts |
| Nemesis and favourite opponent | The player you lose to most and beat most | Player drawer | Matty G's nemesis: gsote, 1-8-2 |
| Upsets | Cup wins over a player rated 75+ points higher | Cup card badge, player drawer |  |

### Awards and records

Records update live on a new Records page; awards are announced after the playoffs.

| Record | Season 1 holder |
| --- | --- |
| Best cup | gsote, 60/60, cup 12 (Nov 22): a perfect cup |
| Biggest winning margin | Kieran4145, by 25 points, cup 1 (Nov 8) |
| Most race wins in one night † |  |
| Longest cup-win streak |  |
| Highest rating reached | gsote, 1582 |

| Award | Goes to |
| --- | --- |
| Regular-season champion | Highest rating when the standings lock |
| League champion | Playoff winner |
| Weekly MVP | Biggest rating gain on a night (shown on the homepage) |
| Most improved | Biggest rating gain from season start |
| Iron Kart | Most cups played |
| Mr. Consistent | Lowest consistency score, 8+ cups |
| Giant killer | Most upsets |
| Track specialist † | Best average points on one track, 3+ races there |
| Blue Shell | Most last-among-humans cup finishes (the fun one) |
| Rookie of the season | Top-rated player in their first season |

### Track and character meta

| Stat | What it measures | Shows on |
| --- | --- | --- |
| Track table † | Times raced, average winning points, last raced | Stats page |
| Chaos index † | How far finishes on a track stray from each player's usual finish | Stats page, track card |
| Track coverage | Tracks raced of 32 (Season 1: 23) and which are still unraced | Stats page, cup builder |
| Character win rate | Cup wins and points % by character, 4+ cups | Stats page (extends the current character chart) |
| Track-vote results | Votes vs times picked, and how voters did on the tracks they voted for | Cup nights page |

## Site spec (megmax/kart-league)

All the math stays in pure functions under `src/lib`, as CLAUDE.md requires, and nothing derived is stored. The one schema change is a `season` column so Season 1 and Season 2 cups can live side by side. Season 1 fixes need no code: they are Admin settings plus finishing the two stuck cups.

### Schema (v9 block in `supabase/schema.sql`)

```sql
-- ---- added in v9: seasons ----
alter table public.cups add column if not exists season int not null default 1 check (season between 1 and 99);
alter table public.submissions add column if not exists season int not null default 1 check (season between 1 and 99);
create index if not exists cups_season on public.cups (season);
```

`save_cup_night`, `submit_cup` and the cup builder's insert take the league's `currentSeason` setting as the cup's season. Existing rows default to 1.

### League settings (`league.settings`, `DEFAULT_LEAGUE` in `constants.js`)

| Key | Season 2 value | Notes |
| --- | --- | --- |
| `currentSeason` | 2 | Season shown by default; History and Stats get a season picker |
| `rankBy` | `"rating"` | `"pct"` keeps Season 1 behaviour, so old seasons render as they were |
| `ratingStart` | 1500 |  |
| `ratingK` / `ratingKProvisional` | 32 / 48 |  |
| `provisionalCups` | 5 | Also the minimum cups to qualify |
| `marginCap` | 30 | Points margin that counts as a full win |
| `carryOver` | 0.5 | Share of last season's rating kept |
| `minParticipation` | 40 | Unchanged key, new value |
| `playoffCupsPerRound` | 2 |  |

`save_settings` replaces the whole object, so the Admin form must send every existing key (`timezone`, `reminderHour` included).

### Code changes

| File | Change |
| --- | --- |
| `src/lib/rating.js` (new) | `rateSeason(cups, players, settings, priorRatings)` walks finished cups in the same order as `compute()` and returns, per player, the rating after every cup, cups played, provisional flag, season high and per-night change. Unclaimed rows are skipped as opponents. |
| `src/lib/standings.js` | `normalize()` reads `season`. `compute(st, {season})` filters cups to one season, calls `rateSeason()` with the previous season's final ratings for carry-over, and adds `rating`, `ratingDelta`, `provisional`, `form`, `consistency`, `overUnder` to each row. `cmp()` sorts by rating when `rankBy` is `"rating"`, then the existing tiebreakers. Qualifying becomes `cp >= max(need, provisionalCups)`. |
| `src/lib/rivals.js` (new) | Head-to-head matrix (W-L-T, point difference), rivalry of the season, nemesis and favourite opponent, upsets. |
| `src/lib/records.js` (new) | League records (best cup, biggest margin, streaks, race wins in a night, highest rating), weekly MVP, and the 10 end-of-season awards. |
| `src/lib/tracks.js` | League-wide track table, chaos index, coverage of the 32 tracks. |
| `StandingsPage.jsx` | Rating replaces % as the big number (% stays as a small stat); ▲/▼ change since last night; "P" badge; form arrow; weekly MVP card on the homepage. |
| `RacerDrawer.jsx` | Rating line chart, consistency, closer, comebacks, top-3 race rate, over/under, nemesis and favourite opponent. |
| `PlayoffsPage.jsx` | Seed by rating; 2-cup aggregate rounds; all four semifinalists race together. |
| `StatsPage.jsx` | Track table, chaos index, coverage, character win rates, track-vote results; season picker. |
| `RivalsPage.jsx`, `RecordsPage.jsx` (new) | Routes `#/rivals` and `#/records`, added to `VIEWS`, the More menu and `pageMeta.js`. |
| `RulesPage.jsx` | Rules text picks the Season 1 or Season 2 list from `rankBy`; adds a "How the rating works" panel with the settings table. |
| `AdminPage.jsx` | Fields for every new setting; a **Start next season** button that bumps `currentSeason` after a confirm. |
| `CupsPage.jsx` | Season picker; "Upset" badge on cups. |

### Tests (`tests/`)

- `rating-lib.test.js`: Season 1's 12 cups reproduce this doc's ratings (gsote 1582, Matty G 1523, Kieran4145 1510); ties score ½; a 30-point margin scores as a full win; provisional K applies to exactly the first 5 cups; carry-over halves the gap to 1500.
- `standings-lib.test.js`: `rankBy: "pct"` output is unchanged for Season 1; rating ranking plus each tiebreaker step.
- `rivals-lib.test.js` and `records-lib.test.js`: Season 1 examples from the stats plan (gsote 9-2-1 vs licia; best cup 60/60).
- `cups-db.test.js`: the `season` column defaults to 1 and is saved by `save_cup_night`.

### Order of work

1. Now: Admin settings for the Season 1 fixes; finish or delete cups 10 and 11.
2. `rating.js` + tests, then wire it into `compute()` behind `rankBy` (Season 1 renders unchanged).
3. v9 schema, settings keys, Admin form and Start next season.
4. Standings, drawer and Playoffs changes.
5. `rivals.js`, `records.js`, the two new pages, then the Stats page additions.
6. Rules page text; announce Season 2 rules to the league before its first night.

## Open questions

- [ ] Is 40% the right Season 1 qualifying mark? It needs Kieran4145 at 5 of the last 9 cups and unphyt at 6.
- [ ] Season 2 length: keep 5 weeks of 4 cups, or go to 6 weeks so the rating has more cups to settle?
- [ ] Should Season 1 ratings carry over at 50%, or should everyone restart at 1500?
- [ ] Margin in the rating: keep the 50/50 blend, or score wins only? Wins only puts gsote at 1608 and Matty G at 1527, with the same top three.
- [ ] Playoff night: is two cups per round, all four racing together, workable in one evening?
- [ ] Blue Shell award: in or out?
