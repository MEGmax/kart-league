import { DEFAULT_LEAGUE } from "./constants";

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
      week: Number(c.week) || 1, status: c.status || "complete", maps: c.maps || [],
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
export function compute(st) {
  const L = st.league;
  const cups = st.cups
    .filter((c) => c.status !== "racing")
    .sort((a, b) => (a.week - b.week) || (a.date || "").localeCompare(b.date || "") || ((a.addedAt || 0) - (b.addedAt || 0)));
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
      s.finSum += r.rank;
      const cupChars = [];
      if (rr) rr.forEach((x) => {
        if (x.character) { s.charSeq.push(x.character); if (cupChars.indexOf(x.character) < 0) cupChars.push(x.character); }
        s.rc++; s.rposSum += x.position; if (x.position === 1) s.raceWins++;
        const map = (c.maps || [])[x.race - 1];
        if (map) { const ms = s.maps[map] || (s.maps[map] = { map, n: 0, pts: 0, pos: 0 }); ms.n++; ms.pts += x.points; ms.pos += x.position; }
      }); else if (r.character) { for (let k = 0; k < racesInCup; k++) s.charSeq.push(r.character); cupChars.push(r.character); }
      if (!s.best || r.pts / max > s.best.pts / s.best.max) s.best = { pts: r.pts, max, cup: c, num: i + 1 };
      s.log.push({ cup: c, num: i + 1, pts: r.pts, max, rank: r.rank, field: res.length, character: cupChars[0] || "", chars: cupChars, races: rr || [] });
      s.trend.push(s.pts / s.max);
    });
  });

  const total = cups.length;
  const need = total ? Math.max(1, Math.ceil((L.minParticipation / 100) * total)) : 0;
  const rows = Array.from(byId.values()).map((s) => {
    s.pct = s.max ? s.pts / s.max : 0;
    s.avg = s.cp ? s.finSum / s.cp : null;
    s.qualified = s.cp > 0 && s.cp >= need;
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
    const d = Math.round((b.pct - a.pct) * 1e6);
    if (d) return d;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const h = h2h(a, b);
    if (h) return -h;
    if (b.pts !== a.pts) return b.pts - a.pts;
    return a.player.name.localeCompare(b.player.name);
  }
  const ranked = rows.filter((r) => r.qualified).sort(cmp);
  const unranked = rows.filter((r) => !r.qualified && r.cp > 0).sort((a, b) => b.cp - a.cp || b.pct - a.pct);
  ranked.forEach((r, i) => { r.rank = i + 1; r.back = (ranked[0].pct - r.pct) * 100; });

  const weeks = Object.keys(byWeek).map(Number);
  return {
    cups, cupInfo, total, need, ranked, unranked, byId, byWeek,
    curWeek: weeks.length ? Math.max(...weeks) : 1,
    plan: seasonPlan(L, byWeek),
    chars: Object.keys(chars).map((k) => chars[k])
      .sort((a, b) => b.picks - a.picks || b.cupWins - a.cupWins || b.pts / (b.max || 1) - a.pts / (a.max || 1) || a.name.localeCompare(b.name)),
    // Newest cup first; within a cup, in finishing order.
    unclaimed: unclaimed.sort((a, b) => b.num - a.num || a.r.rank - b.r.rank),
  };
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
