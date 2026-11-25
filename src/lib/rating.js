// Skill rating (Elo-style), the Season 2 ranking stat. Pure functions, tested in tests/rating-lib.test.js.
//
// Each finished cup is scored as head-to-head matches between the league players in it (CPUs and unclaimed
// rows don't count). Against each opponent your result blends who finished ahead with the margin:
//   S = ½·W + ½·clamp(½ + (you − them) / (2·marginCap), 0, 1)      W = 1 more points, ½ tie, 0 fewer
// your expected result comes from the rating gap, and your rating moves by the difference, averaged over
// your opponents:
//   E = 1 / (1 + 10^((R_them − R_you) / 400))        ΔR = K / (n − 1) · Σ (S − E)
// Everyone in a cup is rated against the ratings from before that cup. K is the provisional K for a
// player's first `provisionalCups` cups of the season. Cups in weeks after the regular season (playoffs)
// don't move ratings.

export const RATING_DEFAULTS = {
  ratingStart: 1500, ratingK: 32, ratingKProvisional: 48, provisionalCups: 5, marginCap: 30, carryOver: 0.5,
};

export function ratingSettings(league) {
  const L = league || {};
  const num = (k) => (Number.isFinite(Number(L[k])) && L[k] !== "" && L[k] != null ? Number(L[k]) : RATING_DEFAULTS[k]);
  return {
    start: num("ratingStart"), K: num("ratingK"), Kp: num("ratingKProvisional"),
    provisional: Math.max(0, Math.round(num("provisionalCups"))), cap: Math.max(1, num("marginCap")),
    carry: Math.min(1, Math.max(0, num("carryOver"))), weeks: Number(L.seasonWeeks) || Infinity,
  };
}

// One head-to-head result, 0..1, from the two players' cup points.
export function matchScore(you, them, cap = 30, { margin = true } = {}) {
  const W = you > them ? 1 : you < them ? 0 : 0.5;
  if (!margin) return W;
  const M = Math.min(1, Math.max(0, 0.5 + (you - them) / (2 * cap)));
  return 0.5 * W + 0.5 * M;
}

export function expected(rYou, rThem) {
  return 1 / (1 + Math.pow(10, (rThem - rYou) / 400));
}

// Where a returning player starts a season: `carry` of the way from the start rating to last season's.
export function carryOver(prior, cfg) {
  return cfg.start + cfg.carry * (prior - cfg.start);
}

// cups: finished cups of one season, in compute()'s order ({ id, date, week, results: [{ p, pts }] }).
// priorRatings: { [playerId]: last season's final rating } (missing = new player).
// Returns {
//   players: Map id → { start, rating, cp, provisional, high, history: [{ cupId, date, before, after }],
//                       nights: [{ date, delta, after }] },
//   cups: Map cupId → { before: { id: rating }, after: { id: rating }, delta: { id: change } },
//   nights: [date, …] oldest first,
// }
export function rateSeason(cups, players, league, priorRatings = {}, opts = {}) {
  const cfg = ratingSettings(league);
  const byId = new Map();
  const ensure = (id) => {
    let s = byId.get(id);
    if (!s) {
      const start = priorRatings[id] != null ? carryOver(priorRatings[id], cfg) : cfg.start;
      s = { id, start, rating: start, cp: 0, provisional: true, high: start, history: [], nights: [] };
      byId.set(id, s);
    }
    return s;
  };
  (players || []).forEach((p) => ensure(p.id));
  const perCup = new Map(), nights = [];

  (cups || []).forEach((c) => {
    if ((Number(c.week) || 1) > cfg.weeks) return; // playoffs: ratings are locked
    const res = (c.results || []).filter((r) => r.p).map((r) => ({ p: r.p, pts: Number(r.pts) || 0 }));
    const seen = new Set();
    const field = res.filter((r) => (seen.has(r.p) ? false : (seen.add(r.p), true)));
    if (field.length < 2) return;
    const before = {}, after = {}, delta = {};
    field.forEach((r) => { before[r.p] = ensure(r.p).rating; });
    field.forEach((a) => {
      const s = byId.get(a.p);
      let sum = 0;
      field.forEach((b) => {
        if (b === a) return;
        sum += matchScore(a.pts, b.pts, cfg.cap, opts) - expected(before[a.p], before[b.p]);
      });
      const K = s.cp < cfg.provisional ? cfg.Kp : cfg.K;
      delta[a.p] = (K / (field.length - 1)) * sum;
    });
    field.forEach((r) => {
      const s = byId.get(r.p);
      s.rating = before[r.p] + delta[r.p];
      s.cp++;
      s.high = Math.max(s.high, s.rating);
      after[r.p] = s.rating;
      s.history.push({ cupId: c.id, date: c.date || "", before: before[r.p], after: s.rating });
      const last = s.nights[s.nights.length - 1];
      if (last && last.date === (c.date || "")) { last.delta += delta[r.p]; last.after = s.rating; }
      else s.nights.push({ date: c.date || "", delta: delta[r.p], after: s.rating });
    });
    if (nights[nights.length - 1] !== (c.date || "")) nights.push(c.date || "");
    perCup.set(c.id, { before, after, delta });
  });
  byId.forEach((s) => { s.provisional = s.cp < cfg.provisional; });
  return { players: byId, cups: perCup, nights, cfg };
}

// The rating gained on one night, everyone who raced it, biggest gain first.
export function nightGains(rated, date) {
  const out = [];
  rated.players.forEach((s) => {
    const n = s.nights.find((x) => x.date === date);
    if (n) out.push({ id: s.id, delta: n.delta, after: n.after });
  });
  return out.sort((a, b) => b.delta - a.delta);
}

// Upsets: a cup won outright over a league player in it rated `gap`+ points higher before the cup.
// Returns [{ cupId, winner, over: [ids] }].
export function upsets(cups, rated, gap = 75) {
  const out = [];
  (cups || []).forEach((c) => {
    const rc = rated.cups.get(c.id);
    if (!rc) return;
    const res = (c.results || []).filter((r) => r.p && r.p in rc.before);
    if (res.length < 2) return;
    const top = Math.max(...res.map((r) => Number(r.pts) || 0));
    const winners = res.filter((r) => (Number(r.pts) || 0) === top);
    if (winners.length !== 1) return;
    const w = winners[0].p;
    const over = res.filter((r) => r.p !== w && rc.before[r.p] - rc.before[w] >= gap).map((r) => r.p);
    if (over.length) out.push({ cupId: c.id, winner: w, over });
  });
  return out;
}
