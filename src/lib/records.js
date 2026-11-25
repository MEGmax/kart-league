// League records and end-of-season awards, from compute()'s output. Pure functions, tested in
// tests/records-lib.test.js. Nothing here is stored: everything is worked out from the cups.

function everyone(m) {
  return m.ranked.concat(m.unranked).filter((s) => s.cp > 0);
}

// The rows sharing the best value (dir 1 = highest, -1 = lowest), or [] when nobody has one.
// `min` is the least value that counts (for dir 1; the most, for dir -1).
export function leaders(rows, value, { dir = 1, min = null } = {}) {
  const vals = rows.map((s) => ({ s, v: value(s) }))
    .filter((x) => x.v != null && Number.isFinite(x.v) && (min == null || x.v * dir >= min * dir));
  if (!vals.length) return [];
  const best = dir > 0 ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v));
  return vals.filter((x) => Math.abs(x.v - best) < 1e-9).map((x) => ({ s: x.s, value: x.v }));
}

// Longest run of cups won in a row (ties for 1st count), over the cups a player raced.
function winStreak(s) {
  let best = 0, run = 0;
  s.log.forEach((l) => { run = l.rank === 1 ? run + 1 : 0; best = Math.max(best, run); });
  return best;
}

// Most races won on one night: { n, date } (race-by-race cups only).
function raceWinsNight(s) {
  const by = {};
  s.log.forEach((l) => { by[l.cup.date] = (by[l.cup.date] || 0) + (l.races || []).filter((x) => x.position === 1).length; });
  const date = Object.keys(by).sort((a, b) => by[b] - by[a] || a.localeCompare(b))[0];
  return date && by[date] ? { n: by[date], date } : null;
}

export function records(m) {
  const rows = everyone(m);
  let best = null, margin = null;
  m.cups.forEach((c) => {
    const info = m.cupInfo.get(c.id);
    if (!info || !info.res.length) return;
    info.res.forEach((r) => {
      if (!r.p) return;
      if (!best || r.pts / info.max > best.pts / best.max) best = { p: r.p, pts: r.pts, max: info.max, cup: c, num: info.num };
    });
    const [a, b] = info.res;
    if (a && b && a.p && a.pts > b.pts && (!margin || a.pts - b.pts > margin.by)) {
      margin = { p: a.p, by: a.pts - b.pts, cup: c, num: info.num };
    }
  });
  const streak = leaders(rows, winStreak, { min: 2 });
  const nightWins = leaders(rows, (s) => { const x = raceWinsNight(s); return x ? x.n : null; }, { min: 1 })
    .map((x) => ({ ...x, date: raceWinsNight(x.s).date }));
  const high = m.rated ? leaders(rows, (s) => s.ratingHigh) : [];
  return {
    bestCup: best,
    biggestMargin: margin,
    winStreak: streak,
    raceWinsNight: nightWins,
    highestRating: high,
  };
}

// Players whose first season is this one (no cups in any earlier season).
export function rookieIds(st, season) {
  const veterans = new Set();
  st.cups.forEach((c) => {
    if ((c.season || 1) < season && c.status !== "racing") (c.results || []).forEach((r) => { if (r.p) veterans.add(r.p); });
  });
  return new Set(st.players.map((p) => p.id).filter((id) => !veterans.has(id)));
}

// The 10 awards. Each is { key, title, blurb, winners: [{ s, value }], final } where `final` means it is
// only decided after the playoffs (League champion) and winners may be empty until then.
export function awards(m, { rookies = null } = {}) {
  const rows = everyone(m);
  const rated = m.rankBy === "rating";
  const champ = m.ranked.length ? [{ s: m.ranked[0], value: rated ? m.ranked[0].rating : m.ranked[0].pct }] : [];
  const tracks = (s) => (s.mapList || []).filter((t) => t.n >= 3);
  return [
    { key: "regular", title: "Regular-season champion", blurb: m.rankBy === "rating" ? "Highest rating when the standings lock" : "Top of the standings when they lock", winners: champ },
    { key: "champion", title: "League champion", blurb: "Playoff winner", winners: [], final: true },
    { key: "mvp", title: "Weekly MVP", blurb: "Biggest rating gain on the latest night", winners: m.mvp ? [{ s: m.mvp.s, value: m.mvp.delta }] : [] },
    { key: "improved", title: "Most improved", blurb: "Biggest rating gain since the season started", winners: m.rated ? leaders(rows, (s) => (s.rating != null ? s.rating - s.ratingStart : null), { min: 0.5 }) : [] },
    { key: "iron", title: "Iron Kart", blurb: "Most cups played", winners: leaders(rows, (s) => s.cp) },
    { key: "consistent", title: "Mr. Consistent", blurb: "Steadiest cup points, 8+ cups", winners: leaders(rows.filter((s) => s.cp >= 8), (s) => s.consistency, { dir: -1 }) },
    { key: "giant", title: "Giant killer", blurb: "Most upsets", winners: leaders(rows, (s) => s.upsets, { min: 1 }) },
    {
      key: "track", title: "Track specialist", blurb: "Best average points on one track, 3+ races there",
      winners: leaders(rows, (s) => (tracks(s).length ? Math.max(...tracks(s).map((t) => t.avgPts)) : null))
        .map((x) => ({ ...x, track: tracks(x.s).sort((a, b) => b.avgPts - a.avgPts)[0].map })),
    },
    { key: "blue", title: "Blue Shell", blurb: "Most last-among-humans cup finishes", winners: leaders(rows, (s) => s.lastAmongHumans, { min: 1 }) },
    {
      key: "rookie", title: "Rookie of the season", blurb: "Top-ranked player in their first season",
      winners: (() => {
        const r = m.ranked.find((s) => !rookies || rookies.has(s.player.id));
        return r ? [{ s: r, value: rated ? r.rating : r.pct }] : [];
      })(),
    },
  ];
}
