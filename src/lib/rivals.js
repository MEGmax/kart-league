// Head-to-head records between league players, from compute()'s output. Pure functions, tested in
// tests/rivals-lib.test.js. A "meeting" is a finished cup both players raced; the one with more points wins it.

// Every pair's record. Returns { ids: [player ids that raced], get(a, b) → { w, l, t, diff, n } | null,
// pairs: [{ a, b, w, l, t, diff, n }] (each pair once, a's side) }.
export function headToHead(m) {
  const rec = new Map();
  const key = (a, b) => a + "|" + b;
  const bump = (a, b, pa, pb) => {
    const k = key(a, b);
    const r = rec.get(k) || { a, b, w: 0, l: 0, t: 0, diff: 0, n: 0 };
    r.n++; r.diff += pa - pb;
    if (pa > pb) r.w++; else if (pa < pb) r.l++; else r.t++;
    rec.set(k, r);
  };
  const ids = new Set();
  m.cups.forEach((c) => {
    const info = m.cupInfo.get(c.id);
    const res = info ? info.res.filter((r) => r.p) : [];
    res.forEach((x) => ids.add(x.p));
    for (let i = 0; i < res.length; i++) {
      for (let j = 0; j < res.length; j++) {
        if (i !== j) bump(res[i].p, res[j].p, res[i].pts, res[j].pts);
      }
    }
  });
  const order = Array.from(ids);
  const pairs = [];
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const r = rec.get(key(order[i], order[j]));
      if (r) pairs.push(r);
    }
  }
  return { ids: order, get: (a, b) => rec.get(key(a, b)) || null, pairs };
}

// The rivalry of the season: the pair with at least `minMeetings` meetings and the closest record
// (smallest win–loss gap, then smallest points gap, then the most meetings).
export function rivalry(h, minMeetings = 6) {
  const list = h.pairs.filter((p) => p.n >= minMeetings)
    .sort((x, y) => Math.abs(x.w - x.l) - Math.abs(y.w - y.l) || Math.abs(x.diff) - Math.abs(y.diff) || y.n - x.n);
  if (!list.length) return null;
  const p = list[0];
  // Say it from the side that's ahead on points.
  return p.diff < 0 ? { a: p.b, b: p.a, w: p.l, l: p.w, t: p.t, diff: -p.diff, n: p.n } : { ...p };
}

// The opponent a player loses to most (nemesis) and beats most (favourite), with the record against them.
export function nemesisAndFavourite(h, id) {
  const opps = h.ids.filter((o) => o !== id).map((o) => ({ id: o, ...h.get(id, o) })).filter((r) => r.n);
  const nemesis = opps.filter((r) => r.l > 0).sort((x, y) => y.l - x.l || x.diff - y.diff)[0] || null;
  const favourite = opps.filter((r) => r.w > 0).sort((x, y) => y.w - x.w || y.diff - x.diff)[0] || null;
  return { nemesis, favourite };
}
