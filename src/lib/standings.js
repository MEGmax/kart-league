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

// Only finished cups count. Where a cup was raced race by race, character and track stats
// use each race; older cups entered from a photo count their one character per cup.
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
    log: [], trend: [], charSeq: [], rc: 0, rposSum: 0, maps: {},
  }));
  function addChar(name, pts, max, win) {
    const cs = chars[name] || (chars[name] = { name, picks: 0, pts: 0, max: 0, wins: 0 });
    cs.picks++; cs.pts += pts; cs.max += max; if (win) cs.wins++;
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
    res.forEach((r) => {
      const rr = r.p ? racesBy[c.id + "|" + r.p] : null;
      if (rr) rr.forEach((x) => { if (x.character) addChar(x.character, x.points, 15, x.position === 1); });
      else if (r.character) addChar(r.character, r.pts, max, r.rank === 1);
      if (!r.p) { unclaimed.push({ cup: c, num: i + 1, r, max, field: res.length }); return; }
      const s = byId.get(r.p);
      s.cp++; s.pts += r.pts; s.max += max;
      if (r.rank === 1) s.wins++;
      if (r.rank <= 3) s.pods++;
      s.finSum += r.rank;
      const cupChars = [];
      if (rr) rr.forEach((x) => {
        if (x.character) { s.charSeq.push(x.character); if (cupChars.indexOf(x.character) < 0) cupChars.push(x.character); }
        s.rc++; s.rposSum += x.position;
        const map = (c.maps || [])[x.race - 1];
        if (map) { const ms = s.maps[map] || (s.maps[map] = { map, n: 0, pts: 0, pos: 0 }); ms.n++; ms.pts += x.points; ms.pos += x.position; }
      }); else if (r.character) { s.charSeq.push(r.character); cupChars.push(r.character); }
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
    chars: Object.keys(chars).map((k) => chars[k]).sort((a, b) => b.picks - a.picks || b.wins - a.wins || a.name.localeCompare(b.name)),
    unclaimed: unclaimed.reverse(),
  };
}

export function liveCups(state) {
  return state ? state.cups.filter((c) => c.status === "racing").sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)) : [];
}
