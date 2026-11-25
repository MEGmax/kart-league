import { DEFAULT_LEAGUE } from "./constants";
import { rateSeason, ratingSettings, expected, upsets as findUpsets } from "./rating";

// The season new cups go into and the standings show by default (league.settings.currentSeason).
export function currentSeason(league) {
  return Math.max(1, Math.round(Number(league && league.currentSeason) || 1));
}

// How a season is ranked: "rating" (Season 2 on) or "pct" (points percentage, Season 1). A season that has
// ended keeps the rule it was played under (seasonRankBy, recorded by Start next season).
export function rankByFor(league, season) {
  const past = league && league.seasonRankBy && league.seasonRankBy[season];
  if (past) return past;
  if (season < currentSeason(league)) return "pct";
  return league && league.rankBy === "rating" ? "rating" : "pct";
}

// Every season that has cups, plus the current one, oldest first.
export function seasonsOf(st) {
  const set = new Set([currentSeason(st.league)]);
  st.cups.forEach((c) => set.add(c.season || 1));
  return Array.from(set).sort((a, b) => a - b);
}

function cupOrder(a, b) {
  return (a.week - b.week) || (a.date || "").localeCompare(b.date || "") || ((a.addedAt || 0) - (b.addedAt || 0));
}

// Ratings for one season, carrying each player's final rating over from the season before.
export function seasonRatings(st, season) {
  let prior = {}, rated = null;
  for (let s = 1; s <= season; s++) {
    const cups = st.cups.filter((c) => c.status !== "racing" && (c.season || 1) === s).sort(cupOrder);
    rated = rateSeason(cups, st.players, st.league, prior);
    if (s < season) { prior = {}; rated.players.forEach((x, id) => { prior[id] = x.rating; }); }
  }
  return rated;
}

export function normalize(raw) {
  raw = raw || {};
  const L = { ...DEFAULT_LEAGUE, ...(raw.league || {}) };
  delete L.seasonLength;
  return {
    league: L,
    players: (raw.players || []).map((p) => ({
      id: p.id, name: p.name, color: p.color || "#E5484D", aliases: p.aliases || [],
      userId: p.userId || p.user_id || null, registeredAt: p.registeredAt || p.registered_at || null,
    })),
    cups: (raw.cups || []).map((c) => ({
      notes: "", hasPhoto: false, ...c,
      week: Number(c.week) || 1, season: Number(c.season) || 1, status: c.status || "complete", maps: c.maps || [],
      results: (c.results || []).map((r, i) => ({
        rid: r.rid || "r" + i, p: r.p || null, pts: Number(r.pts) || 0, character: r.character || "", raw: r.raw || "",
      })),
    })),
    races: (raw.races || []).map((r) => ({
      cupId: r.cupId || r.cup_id, race: Number(r.race), playerId: r.playerId || r.player_id,
      position: Number(r.position), points: Number(r.points), character: r.character || "",
      enteredAt: Number(r.enteredAt || r.entered_at) || 0,
    })),
    templates: (raw.templates || []).map((t) => ({ id: t.id, name: t.name, maps: t.maps || [] })),
  };
}

// Only finished cups count. Character stats are per race: where a cup was raced race by race they use
// each race; a cup entered from its totals counts as its 4 races with the character recorded for it.
// "Cup wins" are known for every cup; "race wins" only where races were recorded.
//
// opts.season: the season to show (default: the current one), or "all" for every season's cups together
// (no ratings then; for pages that look cups up by id, like claims and the unclaimed list).
export function compute(st, opts = {}) {
  const L = st.league;
  const season = opts.season === "all" ? "all" : Number(opts.season) || currentSeason(L);
  const cups = st.cups
    .filter((c) => c.status !== "racing" && (season === "all" || (c.season || 1) === season))
    .sort(cupOrder);
  const cupIdx = {};
  cups.forEach((c, i) => { cupIdx[c.id] = i; });
  const races = (st.races || [])
    .filter((r) => r.cupId in cupIdx)
    .sort((a, b) => (cupIdx[a.cupId] - cupIdx[b.cupId]) || (a.race - b.race));
  const racesBy = {};
  races.forEach((r) => { (racesBy[r.cupId + "|" + r.playerId] = racesBy[r.cupId + "|" + r.playerId] || []).push(r); });

  const byId = new Map(), chars = {}, unclaimed = [], byWeek = {};
  st.players.forEach((p) => byId.set(p.id, {
    player: p, cp: 0, pts: 0, max: 0, wins: 0, pods: 0, finSum: 0, best: null,
    log: [], trend: [], charSeq: [], rc: 0, rposSum: 0, raceWins: 0, maps: {},
    top3: 0, r4: { n: 0, pts: 0 }, r13: { n: 0, pts: 0 }, comebacks: 0, lastAmongHumans: 0,
  }));
  // picks = races raced with the character; racesKnown = those with a recorded finishing place.
  function addChar(name, { races, pts, max, raceWins = 0, racesKnown = 0, cupWin = false }) {
    const cs = chars[name] || (chars[name] = { name, picks: 0, pts: 0, max: 0, cupWins: 0, raceWins: 0, racesKnown: 0 });
    cs.picks += races; cs.pts += pts; cs.max += max; cs.raceWins += raceWins; cs.racesKnown += racesKnown;
    if (cupWin) cs.cupWins++;
  }
  const cupInfo = new Map();
  cups.forEach((c, i) => {
    byWeek[c.week] = (byWeek[c.week] || 0) + 1;
    const max = Number(c.max) || L.defaultMax;
    // Unclaimed rows are league humans too, so they keep their place in the finishing order.
    const res = c.results
      .filter((r) => !r.p || byId.has(r.p))
      .map((r) => ({ rid: r.rid, p: r.p || null, pts: Number(r.pts) || 0, character: r.character || "", raw: r.raw }));
    res.sort((a, b) => b.pts - a.pts);
    res.forEach((r, k) => { r.rank = (k > 0 && r.pts === res[k - 1].pts) ? res[k - 1].rank : k + 1; });
    const hasRaces = res.some((r) => r.p && racesBy[c.id + "|" + r.p]);
    cupInfo.set(c.id, { num: i + 1, res, max, week: c.week, hasRaces });
    const racesInCup = Math.max(1, Math.round(max / 15)) || 4;
    res.forEach((r) => {
      const rr = r.p ? racesBy[c.id + "|" + r.p] : null;
      if (rr) {
        const used = {};
        rr.forEach((x) => {
          if (!x.character) return;
          used[x.character] = (used[x.character] || 0) + 1;
          addChar(x.character, { races: 1, pts: x.points, max: 15, raceWins: x.position === 1 ? 1 : 0, racesKnown: 1 });
        });
        // A cup win goes to the character used most in that cup.
        const main = Object.keys(used).sort((a, b) => used[b] - used[a])[0];
        if (main && r.rank === 1) addChar(main, { races: 0, pts: 0, max: 0, cupWin: true });
      } else if (r.character) {
        addChar(r.character, { races: racesInCup, pts: r.pts, max, cupWin: r.rank === 1 });
      }
      if (!r.p) { unclaimed.push({ cup: c, num: i + 1, r, max, field: res.length }); return; }
      const s = byId.get(r.p);
      s.cp++; s.pts += r.pts; s.max += max;
      if (r.rank === 1) s.wins++;
      if (r.rank <= 3) s.pods++;
      const claimed = res.filter((x) => x.p);
      if (claimed.length > 1 && r.pts === Math.min(...claimed.map((x) => x.pts))) s.lastAmongHumans++;
      // A comeback: won the cup after trailing a league player after race 2 (race-by-race cups only).
      if (r.rank === 1 && rr) {
        const after2 = (pid) => (racesBy[c.id + "|" + pid] || []).filter((x) => x.race <= 2).reduce((a, x) => a + x.points, 0);
        const mine = after2(r.p);
        if (claimed.some((o) => o.p !== r.p && racesBy[c.id + "|" + o.p] && after2(o.p) > mine)) s.comebacks++;
      }
      s.finSum += r.rank;
      const cupChars = [];
      if (rr) rr.forEach((x) => {
        if (x.character) { s.charSeq.push(x.character); if (cupChars.indexOf(x.character) < 0) cupChars.push(x.character); }
        s.rc++; s.rposSum += x.position; if (x.position === 1) s.raceWins++;
        if (x.position <= 3) s.top3++;
        const bucket = x.race === 4 ? s.r4 : x.race < 4 ? s.r13 : null;
        if (bucket) { bucket.n++; bucket.pts += x.points; }
        const map = (c.maps || [])[x.race - 1];
        if (map) { const ms = s.maps[map] || (s.maps[map] = { map, n: 0, pts: 0, pos: 0 }); ms.n++; ms.pts += x.points; ms.pos += x.position; }
      }); else if (r.character) { for (let k = 0; k < racesInCup; k++) s.charSeq.push(r.character); cupChars.push(r.character); }
      if (!s.best || r.pts / max > s.best.pts / s.best.max) s.best = { pts: r.pts, max, cup: c, num: i + 1 };
      s.log.push({ cup: c, num: i + 1, pts: r.pts, max, rank: r.rank, field: res.length, character: cupChars[0] || "", chars: cupChars, races: rr || [] });
      s.trend.push(s.pts / s.max);
    });
  });

  const total = cups.length;
  const rankBy = season === "all" ? "pct" : rankByFor(L, season);
  const rated = season === "all" ? null : seasonRatings(st, season);
  const cfg = ratingSettings(L);
  const need = total ? Math.max(1, Math.ceil((L.minParticipation / 100) * total)) : 0;
  const minCups = rankBy === "rating" ? Math.max(need, cfg.provisional) : need;
  // League nights (dates raced) this season, oldest first, for attendance streaks and "since last night".
  const nights = Array.from(new Set(cups.map((c) => c.date || ""))).sort();
  const lastNight = nights[nights.length - 1] || null;
  const upsetList = rated ? findUpsets(cups, rated) : [];
  upsetList.forEach((u) => { const info = cupInfo.get(u.cupId); if (info) info.upset = u; });
  const rows = Array.from(byId.values()).map((s) => {
    s.pct = s.max ? s.pts / s.max : 0;
    s.avg = s.cp ? s.finSum / s.cp : null;
    s.qualified = s.cp > 0 && s.cp >= minCups;
    rateRow(s, { rated, cfg, cupInfo, nights, lastNight, total });
    s.upsets = upsetList.filter((u) => u.winner === s.player.id).length;
    s.avgPtsCup = s.cp ? s.pts / s.cp : null;
    s.avgRace = s.rc ? s.rposSum / s.rc : null;
    const cc = {};
    s.charSeq.forEach((c) => { cc[c] = (cc[c] || 0) + 1; });
    s.charList = Object.keys(cc)
      .map((k) => ({ name: k, n: cc[k], share: cc[k] / s.charSeq.length }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    s.main = s.charList[0] || null;
    s.last3 = s.charSeq.slice(-3).reverse();
    s.mapList = Object.keys(s.maps)
      .map((k) => { const m = s.maps[k]; return { map: m.map, n: m.n, avgPts: m.pts / m.n, avgPos: m.pos / m.n }; })
      .sort((a, b) => b.avgPts - a.avgPts || b.n - a.n);
    return s;
  });

  function h2h(a, b) {
    let d = 0;
    a.log.forEach((l) => {
      const o = cupInfo.get(l.cup.id).res.find((r) => r.p === b.player.id);
      if (o) d += l.pts - o.pts;
    });
    return d;
  }
  function cmp(a, b) {
    // Ratings are compared to the whole point; percentages to a ten-thousandth of a percent.
    const d = rankBy === "rating" ? Math.round(b.rating) - Math.round(a.rating) : Math.round((b.pct - a.pct) * 1e6);
    if (d) return d;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const h = h2h(a, b);
    if (h) return -h;
    if (b.pts !== a.pts) return b.pts - a.pts;
    return a.player.name.localeCompare(b.player.name);
  }
  const ranked = rows.filter((r) => r.qualified).sort(cmp);
  const unranked = rows.filter((r) => !r.qualified && r.cp > 0).sort((a, b) => b.cp - a.cp || b.pct - a.pct);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
    r.back = rankBy === "rating" ? Math.round(ranked[0].rating) - Math.round(r.rating) : (ranked[0].pct - r.pct) * 100;
  });
  // Weekly MVP: the biggest rating gain on the latest night.
  let mvp = null;
  if (rated && lastNight) {
    rows.forEach((r) => {
      if (r.cp && r.lastNight && r.lastNight.date === lastNight && r.lastNight.delta > 0 && (!mvp || r.lastNight.delta > mvp.delta)) {
        mvp = { s: r, date: lastNight, delta: r.lastNight.delta };
      }
    });
  }

  const weeks = Object.keys(byWeek).map(Number);
  return {
    cups, cupInfo, total, need, minCups, ranked, unranked, byId, byWeek, season, rankBy, rated, nights, lastNight, mvp,
    upsets: upsetList,
    curWeek: weeks.length ? Math.max(...weeks) : 1,
    plan: seasonPlan(L, byWeek),
    chars: Object.keys(chars).map((k) => chars[k])
      .sort((a, b) => b.picks - a.picks || b.cupWins - a.cupWins || b.pts / (b.max || 1) - a.pts / (a.max || 1) || a.name.localeCompare(b.name)),
    // Newest cup first; within a cup, in finishing order.
    unclaimed: unclaimed.sort((a, b) => b.num - a.num || a.r.rank - b.r.rank),
  };
}

// Rating and the per-player extras the standings and the racer drawer show.
function rateRow(s, { rated, cfg, cupInfo, nights, lastNight, total }) {
  const sd = (xs) => {
    if (xs.length < 2) return null;
    const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / xs.length);
  };
  // Consistency: spread of cup points (scaled to a 60-point cup); lower is steadier.
  s.consistency = sd(s.log.map((l) => (l.pts / l.max) * 60));
  // Form: points percentage over the last 4 cups, and how that compares with the season.
  const recent = s.log.slice(-4);
  const rp = recent.reduce((a, l) => a + l.pts, 0), rm = recent.reduce((a, l) => a + l.max, 0);
  s.form = recent.length >= 2 && rm ? { pct: rp / rm, cups: recent.length, vsSeason: rp / rm - (s.max ? s.pts / s.max : 0) } : null;
  // Closer: average points in race 4 minus the average in races 1–3.
  s.closer = s.r4.n && s.r13.n ? s.r4.pts / s.r4.n - s.r13.pts / s.r13.n : null;
  s.top3Rate = s.rc ? s.top3 / s.rc : null;
  // Attendance: cups played of cups held, and the run of league nights in a row raced up to the latest.
  const mine = new Set(s.log.map((l) => l.cup.date || ""));
  let streak = 0;
  for (let i = nights.length - 1; i >= 0 && mine.has(nights[i]); i--) streak++;
  s.attendance = { played: s.cp, held: total, streak };

  const r = rated && rated.players.get(s.player.id);
  if (!r) {
    Object.assign(s, { rating: null, ratingStart: null, ratingHigh: null, provisional: false, ratingHistory: [], lastNight: null, ratingDelta: null, overUnder: null });
    return;
  }
  s.rating = r.rating; s.ratingStart = r.start; s.ratingHigh = r.high; s.provisional = r.provisional;
  s.ratingHistory = r.history;
  s.lastNight = r.nights.length ? r.nights[r.nights.length - 1] : null;
  s.ratingDelta = s.lastNight && s.lastNight.date === lastNight ? s.lastNight.delta : null;
  // Over/under: average points margin per opponent minus the margin the ratings predicted
  // ((2E − 1) × the margin cap), per cup, averaged over the season.
  const per = [];
  s.log.forEach((l) => {
    const rc = rated.cups.get(l.cup.id);
    if (!rc || !(s.player.id in rc.before)) return;
    const opp = cupInfo.get(l.cup.id).res.filter((o) => o.p && o.p !== s.player.id && o.p in rc.before);
    if (!opp.length) return;
    let d = 0;
    opp.forEach((o) => {
      const actual = Math.max(-cfg.cap, Math.min(cfg.cap, l.pts - o.pts));
      d += actual - (2 * expected(rc.before[s.player.id], rc.before[o.p]) - 1) * cfg.cap;
    });
    per.push(d / opp.length);
  });
  s.overUnder = per.length ? per.reduce((a, x) => a + x, 0) / per.length : null;
}

// The season's shape, in one place, for everything that counts cups: seasonWeeks weeks of cupsPerWeek
// cups each, except that a week that ran over keeps the cups it actually had. The current week is the
// next one once a week has its full count of cups (and the season isn't over).
export function seasonPlan(league, byWeek) {
  const W = Math.max(1, Number(league.seasonWeeks) || 5);
  const per = Math.max(1, Number(league.cupsPerWeek) || 4);
  const lastWeek = Math.max(W, ...Object.keys(byWeek).map(Number));
  const weeks = [];
  let played = 0, total = 0;
  for (let w = 1; w <= lastWeek; w++) {
    const n = byWeek[w] || 0;
    weeks.push({ week: w, played: n, slots: Math.max(per, n) });
    played += n;
    total += Math.max(per, n);
  }
  const playedWeeks = weeks.filter((x) => x.played > 0).map((x) => x.week);
  const latest = playedWeeks.length ? Math.max(...playedWeeks) : 0;
  const latestDone = latest > 0 && (byWeek[latest] || 0) >= per;
  const seasonDone = latest >= W && latestDone;
  const current = !latest ? 1 : latestDone && !seasonDone ? latest + 1 : latest;
  return {
    weeks, perWeek: per, seasonWeeks: W, played, total, left: Math.max(0, total - played),
    current, seasonDone,
    // The week just finished, when the current week hasn't started yet.
    justFinished: latestDone && current > latest ? latest : null,
  };
}

// A player's address in links (#/standings/gsote): their name, or their id if two names would collide.
function nameSlug(p) {
  return String(p.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function playerSlug(players, p) {
  const s = nameSlug(p);
  return s && players.filter((x) => nameSlug(x) === s).length === 1 ? s : p.id;
}
export function playerFromSlug(players, slug) {
  const s = String(slug || "").toLowerCase();
  return players.find((p) => playerSlug(players, p) === s) || players.find((p) => p.id === slug) || null;
}

export function liveCups(state) {
  return state ? state.cups.filter((c) => c.status === "racing").sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)) : [];
}
