// One racer's season in numbers for the Stats page, from compute()'s output and headToHead(). Pure
// functions, tested in tests/player-stats-lib.test.js. Nothing here is stored.
import { bestTracks } from "./tracks.js";

// Share of meetings won, a tie counting half.
const rate = (r) => (r.w + r.t / 2) / r.n;

// The opponent a racer has the best and the worst record against, among those met at least `min` times.
// Best: highest share won, then more meetings, then points difference. `worst` is null when it would be
// the same opponent as `best` (only one opponent met often enough).
export function recordsVs(h, id, { min = 3 } = {}) {
  const opps = h.ids.filter((o) => o !== id).map((o) => ({ id: o, ...h.get(id, o) })).filter((r) => r.n >= min);
  if (!opps.length) return { best: null, worst: null };
  const best = opps.slice().sort((x, y) => rate(y) - rate(x) || y.n - x.n || y.diff - x.diff)[0];
  const worst = opps.slice().sort((x, y) => rate(x) - rate(y) || y.n - x.n || x.diff - y.diff)[0];
  return { best, worst: worst.id === best.id ? null : worst };
}

// Longest run of cup wins in a row, in the order the racer raced them.
export function winStreak(log) {
  let best = 0, run = 0;
  (log || []).forEach((l) => { run = l.rank === 1 ? run + 1 : 0; best = Math.max(best, run); });
  return best;
}

// Everything the Stats page shows for one racer, or null if they haven't raced this season.
export function playerSheet(m, h, id) {
  const s = m.byId.get(id);
  if (!s || !s.cp) return null;
  const best = s.log.reduce((b, l) => (!b || l.pts / l.max > b.pts / b.max || (l.pts / l.max === b.pts / b.max && l.pts > b.pts) ? l : b), null);
  const chars = {};
  s.log.forEach((l) => { if (l.character) chars[l.character] = (chars[l.character] || 0) + 1; });
  const main = Object.entries(chars).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const { best: bestVs, worst: worstVs } = recordsVs(h, id);
  return {
    cups: s.cp,
    held: m.cups.length,
    wins: s.wins,
    podiums: s.pods,
    lasts: s.lastAmongHumans,
    raceWins: s.raceWins,
    races: s.rc,
    avgPts: s.avgPtsCup,
    avgFinish: s.avg,
    bestCup: best ? { pts: best.pts, max: best.max, num: best.num, cup: best.cup } : null,
    winStreak: winStreak(s.log),
    character: main ? { name: main[0], cups: main[1] } : null,
    bestTrack: bestTracks(s.log, { minRaces: 2 })[0] || null,
    bestVs,
    worstVs,
  };
}

// A leaderboard: the entries with a value (null/undefined left out), highest first, with shared places for
// ties (1, 1, 3). Ties keep their input order.
//   entries: [{ id, ... }]; value(entry) → number | null; returns [{ ...entry, value, place }]
export function leaderboard(entries, value) {
  const list = entries.map((e) => ({ ...e, value: value(e) })).filter((e) => e.value != null && !Number.isNaN(e.value));
  list.sort((a, b) => b.value - a.value);
  list.forEach((e, i) => { e.place = i && e.value === list[i - 1].value ? list[i - 1].place : i + 1; });
  return list;
}
