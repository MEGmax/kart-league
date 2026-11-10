(function () {
"use strict";

// ---------- configuration ----------
var CONFIG = {
  owner: "MEGmax",
  repo: "kart-league",
  branch: "main",
  dataPath: "data/league.json",
  photoDir: "photos",
  model: "claude-opus-5-5",
  sdkUrl: "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm"
};
var KEY_GH = "kl.githubToken", KEY_AI = "kl.anthropicKey";

var RACE_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];
var CUP_NAMES = ["Mushroom Cup", "Flower Cup", "Star Cup", "Special Cup", "Shell Cup", "Banana Cup", "Leaf Cup", "Lightning Cup", "Other"];
var COLORS = ["#E5484D", "#0090FF", "#30A46C", "#F76B15", "#8E4EC6", "#E93D82", "#12A594", "#D9A400", "#6E56CF", "#A18072", "#3E63DD", "#7C8A2E"];
var VIEWS = ["standings", "cups", "playoffs", "rules", "add", "admin"];
var DEFAULT_LEAGUE = { name: "Kart Night League", season: "Season 1", seasonLength: 20, playoffSpots: 4, minParticipation: 50, defaultMax: 60 };

function normalize(raw) {
  raw = raw || {};
  var L = Object.assign({}, DEFAULT_LEAGUE, raw.league || {});
  return {
    v: 1, league: L,
    players: (raw.players || []).map(function (p) { return { id: p.id, name: p.name, color: p.color || COLORS[0], aliases: p.aliases || [] }; }),
    cups: (raw.cups || []).map(function (c) { return Object.assign({ notes: "", photo: null }, c, { results: (c.results || []).slice() }); })
  };
}

// Example data, shown only while the league has no cups yet.
var DEMO = (function () {
  var names = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan"];
  var players = names.map(function (n, i) { return { id: "d" + i, name: n, color: COLORS[i], aliases: [] }; });
  var pts = [[52, 47, 41, 38, 30, 25], [44, 55, 39, 33, 41, 0], [49, 38, 50, 29, 35, 41], [57, 42, 36, 44, 0, 31], [41, 49, 45, 37, 33, 28], [46, 51, 40, 0, 38, 35], [53, 39, 47, 41, 30, 0], [48, 44, 52, 36, 40, 29]];
  var cupn = CUP_NAMES.slice(0, 8);
  var cups = pts.map(function (row, ci) {
    var d = new Date(2026, 8, 4 + ci * 7);
    return { id: "dc" + ci, cup: cupn[ci], date: d.toISOString().slice(0, 10), max: 60, notes: "", photo: null, addedAt: ci,
      results: row.map(function (p, pi) { return { p: "d" + pi, pts: p, raw: names[pi] }; }).filter(function (r) { return r.pts > 0; }) };
  });
  return { v: 1, league: Object.assign({}, DEFAULT_LEAGUE), players: players, cups: cups };
})();

var state = null;
var caps = { canEdit: false, images: false, ghLogin: "", checking: false };
var ui = { view: "standings", sel: null, confirmDel: null, flash: "", busy: false, error: "", loadError: "", adminMsg: "" };
var draft = null, readCtl = null, settingsDraft = null;

// ---------- small helpers ----------
function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fmtDate(iso) { if (!iso) return ""; var d = new Date(iso + "T12:00:00"); if (isNaN(d)) return esc(iso); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: (d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined) }); }
function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; }
function posHTML(n) { return '<span class="pos' + (n <= 3 ? " p" + n : "") + '">' + n + "<sup>" + ord(n) + "</sup></span>"; }
function pctTxt(x) { return (x * 100).toFixed(1) + "%"; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function nextColor(st) { var used = st.players.map(function (p) { return p.color; }); for (var i = 0; i < COLORS.length; i++) if (used.indexOf(COLORS[i]) < 0) return COLORS[i]; return COLORS[st.players.length % COLORS.length]; }
function playerName(st, id) { var p = st.players.find(function (x) { return x.id === id; }); return p ? p.name : "Unknown"; }
function safePhoto(p) { return typeof p === "string" && /^photos\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(p) ? p : null; }

// ---------- standings math ----------
function compute(st) {
  var L = st.league;
  var cups = st.cups.slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || "") || ((a.addedAt || 0) - (b.addedAt || 0)); });
  var byId = new Map();
  st.players.forEach(function (p) { byId.set(p.id, { player: p, cp: 0, pts: 0, max: 0, wins: 0, pods: 0, finSum: 0, best: null, log: [], trend: [] }); });
  var cupInfo = new Map();
  cups.forEach(function (c, i) {
    var max = Number(c.max) || L.defaultMax;
    var res = c.results.filter(function (r) { return byId.has(r.p); }).map(function (r) { return { p: r.p, pts: Number(r.pts) || 0, raw: r.raw }; });
    res.sort(function (a, b) { return b.pts - a.pts; });
    res.forEach(function (r, k) { r.rank = (k > 0 && r.pts === res[k - 1].pts) ? res[k - 1].rank : k + 1; });
    cupInfo.set(c.id, { num: i + 1, res: res, max: max });
    res.forEach(function (r) {
      var s = byId.get(r.p);
      s.cp++; s.pts += r.pts; s.max += max;
      if (r.rank === 1) s.wins++;
      if (r.rank <= 3) s.pods++;
      s.finSum += r.rank;
      if (!s.best || r.pts / max > s.best.pts / s.best.max) s.best = { pts: r.pts, max: max, cup: c, num: i + 1 };
      s.log.push({ cup: c, num: i + 1, pts: r.pts, max: max, rank: r.rank, field: res.length });
      s.trend.push(s.pts / s.max);
    });
  });
  var total = cups.length;
  var need = total ? Math.max(1, Math.ceil(L.minParticipation / 100 * total)) : 0;
  var rows = Array.from(byId.values()).map(function (s) { s.pct = s.max ? s.pts / s.max : 0; s.avg = s.cp ? s.finSum / s.cp : null; s.qualified = s.cp > 0 && s.cp >= need; return s; });
  function h2h(a, b) { var d = 0; a.log.forEach(function (l) { var o = cupInfo.get(l.cup.id).res.find(function (r) { return r.p === b.player.id; }); if (o) d += l.pts - o.pts; }); return d; }
  function cmp(a, b) {
    var d = Math.round((b.pct - a.pct) * 1e6); if (d) return d;
    if (b.wins !== a.wins) return b.wins - a.wins;
    var h = h2h(a, b); if (h) return -h;
    if (b.pts !== a.pts) return b.pts - a.pts;
    return a.player.name.localeCompare(b.player.name);
  }
  var ranked = rows.filter(function (r) { return r.qualified; }).sort(cmp);
  var unranked = rows.filter(function (r) { return !r.qualified && r.cp > 0; }).sort(function (a, b) { return b.cp - a.cp || b.pct - a.pct; });
  ranked.forEach(function (r, i) { r.rank = i + 1; r.back = (ranked[0].pct - r.pct) * 100; });
  return { cups: cups, cupInfo: cupInfo, total: total, need: need, ranked: ranked, unranked: unranked, byId: byId };
}

// ---------- rendering ----------
var app = document.getElementById("app");
function render() {
  if (!state) {
    app.innerHTML = '<div class="wrap loading">' + (ui.loadError ? '<span class="error">' + esc(ui.loadError) + "</span>" : '<span class="spin"></span>Loading standings…') + "</div>";
    return;
  }
  var demo = state.cups.length === 0;
  var st = demo ? DEMO : state;
  var m = compute(st);
  var L = state.league;
  document.title = L.name;
  var v = ui.view;
  if (v === "add" && !caps.canEdit) v = "admin";
  var body = v === "standings" ? viewStandings(st, m, demo) : v === "cups" ? viewCups(st, m, demo) : v === "playoffs" ? viewPlayoffs(st, m, demo) : v === "rules" ? viewRules(L) : v === "admin" ? viewAdmin() : viewAdd();
  app.innerHTML = mast(L, compute(state)) + navHTML(v) + '<main class="wrap">' + body + "</main>" +
    '<footer class="wrap foot"><span>' + esc(L.name) + " · " + esc(L.season) + '</span><a href="#admin">' + (caps.canEdit ? "Commissioner tools" : "Commissioner") + "</a></footer>" +
    (ui.flash ? '<div class="flash" role="status">' + esc(ui.flash) + "</div>" : "");
}
function mast(L, m) {
  var n = Math.max(1, Number(L.seasonLength) || 20), done = Math.min(m.total, n), segs = "";
  for (var i = 0; i < n; i++) segs += '<i class="seg' + (i < done ? " on" : "") + '"></i>';
  var left = Math.max(0, n - m.total);
  return '<header class="wrap mast"><div class="eyebrow">' + esc(L.season) + " · Regular season</div><h1>" + esc(L.name) + '</h1><div class="progress"><div class="progress-label"><span><b>' + m.total + " of " + n + "</b> cups played</span><span>" + (left ? left + " to go before playoffs" : "Regular season complete") + '</span></div><div class="track" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))" aria-hidden="true">' + segs + "</div></div></header>";
}
function navHTML(v) {
  function t(id, label, extra) { return '<a class="tab" href="#' + id + '"' + (v === id ? ' aria-current="page"' : "") + ">" + label + (extra || "") + "</a>"; }
  return '<nav class="nav"><div class="wrap">' + t("standings", "Standings") + t("cups", "Cups") + t("playoffs", "Playoffs", '<span class="soon">SOON</span>') + t("rules", "Rules") + '<span class="nav-spacer"></span>' + (caps.canEdit ? '<a class="btn btn-primary btn-sm" href="#add" data-act="new-cup">+ Add cup</a>' : "") + "</div></nav>";
}
function demoNote() {
  return '<div class="note"><span><b>Example standings.</b> These made-up results show how the table works. They disappear when the first real cup is added.</span>' + (caps.canEdit ? '<a class="btn btn-primary btn-sm" href="#add" data-act="new-cup">Add the first cup</a>' : "") + "</div>";
}
function formPips(s) {
  return '<span class="form">' + s.log.slice(-5).map(function (l) { return '<span class="pip' + (l.rank <= 3 ? " r" + l.rank : "") + '" title="' + esc(l.cup.cup) + ": " + l.rank + ord(l.rank) + " of " + l.field + '">' + l.rank + "</span>"; }).join("") + "</span>";
}
var TABLE_HEAD = '<thead><tr><th class="l">Pos</th><th class="l">Player</th><th>Cups</th><th>Pts</th><th>Pct</th><th class="opt">Back</th><th>Wins</th><th class="opt">Podiums</th><th class="opt">Avg fin</th><th class="l opt">Last 5</th></tr></thead>';
function viewStandings(st, m, demo) {
  var L = st.league, out = "";
  if (demo) out += demoNote();
  var lead = m.ranked[0];
  var mostWins = m.ranked.concat(m.unranked).slice().sort(function (a, b) { return b.wins - a.wins; })[0];
  var bestCup = null; m.byId.forEach(function (s) { if (s.best && (!bestCup || s.best.pts / s.best.max > bestCup.best.pts / bestCup.best.max)) bestCup = s; });
  if (lead) {
    out += '<div class="strip">' +
      tile("Leader", lead.player.name, pctTxt(lead.pct) + " of possible points") +
      tile("Most cup wins", mostWins && mostWins.wins ? mostWins.player.name : "None yet", mostWins && mostWins.wins ? mostWins.wins + " win" + (mostWins.wins === 1 ? "" : "s") : "") +
      tile("Best single cup", bestCup ? bestCup.player.name : "–", bestCup ? bestCup.best.pts + "/" + bestCup.best.max + " in " + bestCup.best.cup.cup : "") +
      tile("Qualifying mark", m.need + " cup" + (m.need === 1 ? "" : "s"), L.minParticipation + "% of cups played so far") +
      "</div>";
  }
  out += '<section class="section-h"><h2>Standings</h2><span class="muted small">Ranked by points percentage · top ' + L.playoffSpots + " make the playoffs</span></section>";
  if (!m.ranked.length) out += '<div class="panel empty"><b>No qualified players yet.</b><span class="muted">Players appear here once they have played ' + m.need + " cups.</span></div>";
  else {
    out += '<div class="tbl-wrap"><table>' + TABLE_HEAD + "<tbody>";
    m.ranked.forEach(function (s, i) {
      out += rowHTML(s, s.rank);
      if (i === L.playoffSpots - 1 && m.ranked.length > L.playoffSpots) out += '<tr class="cut"><td colspan="10"><div class="cutline">Playoff line</div></td></tr>';
    });
    out += "</tbody></table></div>";
  }
  if (m.unranked.length) {
    out += '<section class="section-h"><h2>Not yet qualified</h2><span class="muted small">Need ' + m.need + " cups to be ranked</span></section>";
    out += '<div class="tbl-wrap"><table>' + TABLE_HEAD + "<tbody>";
    m.unranked.forEach(function (s) { out += rowHTML(s, null); });
    out += "</tbody></table></div>";
  }
  var sel = ui.sel && m.byId.get(ui.sel);
  if (sel && sel.cp) out += detailHTML(sel);
  else if (m.ranked.length) out += '<p class="muted small" style="margin:0">Select a player to see their season.</p>';
  return out;
}
function tile(k, v, s) { return '<div class="tile"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span><span class="s">' + esc(s) + "</span></div>"; }
function rowHTML(s, rank) {
  var p = s.player;
  return '<tr class="row' + (ui.sel === p.id ? " sel" : "") + '" data-act="sel" data-key="' + esc(p.id) + '" tabindex="0">' +
    '<td class="l">' + (rank ? posHTML(rank) : '<span class="pos">–</span>') + "</td>" +
    '<td class="l"><span class="who"><span class="dot" style="background:' + esc(p.color) + '"></span><span class="name">' + esc(p.name) + "</span></span></td>" +
    '<td class="num">' + s.cp + "</td>" +
    '<td class="num">' + s.pts + '<span class="muted">/' + s.max + "</span></td>" +
    '<td><div class="pct">' + pctTxt(s.pct) + '</div><div class="bar"><i style="width:' + (s.pct * 100).toFixed(1) + '%"></i></div></td>' +
    '<td class="num opt">' + (rank ? (rank === 1 ? "–" : "−" + s.back.toFixed(1)) : "") + "</td>" +
    '<td class="num">' + s.wins + "</td>" +
    '<td class="num opt">' + s.pods + "</td>" +
    '<td class="num opt">' + (s.avg != null ? s.avg.toFixed(2) : "–") + "</td>" +
    '<td class="l opt">' + formPips(s) + "</td></tr>";
}
function sparkSVG(trend) {
  var W = 320, H = 110, pl = 40, pr = 12, pt = 12, pb = 20;
  if (trend.length < 2) return '<p class="muted small">The trend line appears after a second cup.</p>';
  var lo = Math.min.apply(null, trend), hi = Math.max.apply(null, trend);
  lo = Math.max(0, Math.floor((lo - 0.03) * 20) / 20); hi = Math.min(1, Math.ceil((hi + 0.03) * 20) / 20); if (hi - lo < 0.1) hi = Math.min(1, lo + 0.1);
  function x(i) { return pl + (W - pl - pr) * i / (trend.length - 1); }
  function y(v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)); }
  var pts = trend.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
  var area = "M" + x(0).toFixed(1) + "," + (H - pb) + " L" + pts.split(" ").join(" L") + " L" + x(trend.length - 1).toFixed(1) + "," + (H - pb) + " Z";
  var last = trend[trend.length - 1];
  var lbl = 'font-size="10" style="fill:var(--muted);font-family:var(--f-data)"';
  return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Points percentage after each cup">' +
    '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(hi) + '" y2="' + y(hi) + '" style="stroke:var(--line)" stroke-width="1"/>' +
    '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(lo) + '" y2="' + y(lo) + '" style="stroke:var(--line)" stroke-width="1"/>' +
    '<text x="' + (pl - 6) + '" y="' + (y(hi) + 4) + '" text-anchor="end" ' + lbl + ">" + Math.round(hi * 100) + "%</text>" +
    '<text x="' + (pl - 6) + '" y="' + (y(lo) + 4) + '" text-anchor="end" ' + lbl + ">" + Math.round(lo * 100) + "%</text>" +
    '<path d="' + area + '" style="fill:var(--accent-soft)"/>' +
    '<polyline points="' + pts + '" fill="none" style="stroke:var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + x(trend.length - 1) + '" cy="' + y(last) + '" r="4" style="fill:var(--accent)"/>' +
    '<text x="' + pl + '" y="' + (H - 5) + '" ' + lbl + ">Cup 1</text>" +
    '<text x="' + (W - pr) + '" y="' + (H - 5) + '" text-anchor="end" ' + lbl + ">Latest</text></svg>";
}
function detailHTML(s) {
  var p = s.player;
  var log = s.log.slice().reverse().map(function (l) { return '<tr><td class="l num">' + l.num + '</td><td class="l">' + esc(l.cup.cup) + '</td><td class="l muted">' + fmtDate(l.cup.date) + '</td><td class="num">' + l.pts + '<span class="muted">/' + l.max + '</span></td><td class="num">' + l.rank + ord(l.rank) + '<span class="muted"> of ' + l.field + "</span></td></tr>"; }).join("");
  return '<section class="panel panel-pad detail"><div class="detail-head"><h3><span class="dot" style="width:14px;height:14px;background:' + esc(p.color) + '"></span>' + esc(p.name) + '</h3><button class="btn btn-sm" data-act="unsel">Close</button></div>' +
    '<div class="stats">' + stat("Pct", pctTxt(s.pct)) + stat("Points", s.pts + "/" + s.max) + stat("Cups", s.cp) + stat("Wins", s.wins) + stat("Podiums", s.pods) + stat("Avg finish", s.avg != null ? s.avg.toFixed(2) : "–") + stat("Best cup", s.best ? s.best.pts + "/" + s.best.max : "–") + "</div>" +
    '<div class="cols"><div><div class="eyebrow" style="margin-bottom:6px">Season pct, cup by cup</div>' + sparkSVG(s.trend) + '</div><div style="min-width:0"><div class="eyebrow" style="margin-bottom:6px">Cup log</div><div style="overflow-x:auto"><table class="mini"><thead><tr><th class="l">#</th><th class="l">Cup</th><th class="l">Date</th><th>Pts</th><th>Finish</th></tr></thead><tbody>' + log + "</tbody></table></div></div></div></section>";
}
function stat(k, v) { return '<div class="stat"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + "</span></div>"; }

function viewCups(st, m, demo) {
  var out = "";
  if (demo) out += demoNote();
  out += '<section class="section-h"><h2>Cup log</h2><span class="muted small">' + m.total + " cup" + (m.total === 1 ? "" : "s") + " recorded · newest first</span></section>";
  if (!m.cups.length) return out + '<div class="panel empty"><b>No cups yet.</b></div>';
  out += '<div class="cup-list">';
  m.cups.slice().reverse().forEach(function (c) {
    var info = m.cupInfo.get(c.id);
    var rows = info.res.map(function (r) {
      var p = st.players.find(function (x) { return x.id === r.p; });
      return '<div class="res-row"><span class="r' + (r.rank <= 3 ? " p" + r.rank : "") + '">' + r.rank + '</span><span class="n">' + esc(p ? p.name : "?") + '</span><span class="hbar"><i style="width:' + (r.pts / info.max * 100).toFixed(1) + "%;background:" + esc(p ? p.color : "var(--muted)") + '"></i></span><span class="t">' + r.pts + '<span class="muted">/' + info.max + "</span></span></div>";
    }).join("");
    var actions = "";
    if (caps.canEdit && !demo) {
      actions = ui.confirmDel === c.id
        ? '<div class="cup-actions"><span class="small"><b>Delete Cup ' + info.num + '?</b> Its results leave the standings.</span><button class="btn btn-danger btn-sm" data-act="del-yes" data-key="' + esc(c.id) + '"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Deleting…" : "Delete cup") + '</button><button class="btn btn-sm" data-act="del-no">Keep it</button></div>'
        : '<div class="cup-actions"><button class="btn btn-sm" data-act="edit-cup" data-key="' + esc(c.id) + '">Edit</button><button class="btn btn-sm" data-act="del-ask" data-key="' + esc(c.id) + '">Delete</button></div>';
    }
    var ph = safePhoto(c.photo);
    var photo = ph ? '<a class="photo" href="' + esc(ph) + '" target="_blank" rel="noopener"><img data-photo="1" src="' + esc(ph) + '" alt="Results screen photo for ' + esc(c.cup) + '" loading="lazy"></a>' : "";
    out += '<article class="panel cup"><div style="min-width:0"><div class="cup-head"><span class="cup-no">#' + info.num + '</span><span class="cup-name">' + esc(c.cup) + '</span><span class="muted small">' + fmtDate(c.date) + (info.max !== 60 ? " · max " + info.max + " pts" : "") + "</span></div>" +
      (c.notes ? '<p class="small muted" style="margin:6px 0 0">' + esc(c.notes) + "</p>" : "") +
      '<div class="res">' + rows + "</div>" + actions + "</div>" + photo + "</article>";
  });
  return out + "</div>" + (ui.error ? '<div class="error">' + esc(ui.error) + "</div>" : "");
}

function viewPlayoffs(st, m, demo) {
  var L = st.league, K = Number(L.playoffSpots) || 4;
  var seeds = m.ranked.slice(0, K);
  var out = '<section class="panel soon-hero"><div class="flag" aria-hidden="true"></div><div class="eyebrow">Playoffs</div><h2>Coming soon</h2><p style="margin:0;max-width:60ch">The playoff bracket opens after the regular season ends at Cup ' + L.seasonLength + ". The top " + K + " qualified players by points percentage get in. Format, race count and seeding perks will be announced before then.</p></section>";
  if (seeds.length >= 2) {
    out += '<section class="section-h"><h2>If the season ended today</h2><span class="muted small">' + (demo ? "From the example standings" : "Projected from current standings") + "</span></section>";
    var pairs = []; for (var i = 0; i < Math.floor(seeds.length / 2); i++) pairs.push([seeds[i], seeds[seeds.length - 1 - i], i + 1, seeds.length - i]);
    out += '<div class="bracket">' + pairs.map(function (pr) {
      return '<div class="match">' + [0, 1].map(function (j) { var s = pr[j]; return '<div><span class="seed">' + pr[2 + j] + '</span><span class="dot" style="background:' + esc(s.player.color) + '"></span><span class="name">' + esc(s.player.name) + '</span><span class="nav-spacer"></span><span class="num muted small">' + pctTxt(s.pct) + "</span></div>"; }).join("") + "</div>";
    }).join("") + (seeds.length % 2 ? '<div class="match"><div><span class="seed">' + Math.ceil(seeds.length / 2) + '</span><span class="name">' + esc(seeds[Math.floor(seeds.length / 2)].player.name) + '</span><span class="nav-spacer"></span><span class="chip">Bye</span></div></div>' : "") + "</div>";
  }
  return out;
}

function viewRules(L) {
  var pt = RACE_POINTS.map(function (p, i) { return "<span><b>" + p + "</b><small>" + (i + 1) + ord(i + 1) + "</small></span>"; }).join("");
  var out = '<section class="section-h"><h2>Regular season rules</h2><span class="muted small">' + esc(L.season) + "</span></section>" +
    '<div class="panel panel-pad rules"><ol>' +
    "<li><h4>Race scoring</h4><p>Every race is scored with the game's 12-racer points table. A cup is 4 races, so the most anyone can score in a cup is " + L.defaultMax + ' points.</p><div class="ptable">' + pt + "</div></li>" +
    "<li><h4>Standard settings</h4><p>150cc, CPUs on Hard, items Normal, any kart or bike. If a cup is raced with different settings that change the points available (no CPUs, fewer races), the commissioner records that cup's max points so percentages stay fair.</p></li>" +
    "<li><h4>The photo is the record</h4><p>When a cup ends, someone takes an iPhone photo of the final results screen before anyone presses a button. The commissioner uploads it here. CPU racers are ignored; only league players are recorded.</p></li>" +
    "<li><h4>Ranking stat: points percentage</h4><p>Your rank is your points earned divided by the points you could have earned in the cups you played. Missing a cup doesn't lower your percentage.</p></li>" +
    "<li><h4>Qualifying</h4><p>To be ranked you must have played at least " + L.minParticipation + "% of the cups held so far, rounded up. Everyone else is listed under Not yet qualified until they catch up.</p></li>" +
    "<li><h4>Cup wins and podiums</h4><p>Finishing order counts league players only. The league player with the most points in a cup wins it; 2nd and 3rd complete the podium. Players tied on points share the place.</p></li>" +
    "<li><h4>Tiebreakers</h4><p>Equal percentages are split by, in order: cup wins, head-to-head points across cups both players played, total points, then a single-race runoff on a track the commissioner picks.</p></li>" +
    "<li><h4>Abandoned cups</h4><p>A cup that isn't finished (power cut, rage quit, controller disconnect that ends it) doesn't count and is raced again from the start. No make-up cups for missed nights.</p></li>" +
    "<li><h4>Season length and playoffs</h4><p>The regular season is " + L.seasonLength + " cups. After that the standings lock and the top " + L.playoffSpots + " qualified players advance to the playoffs.</p></li>" +
    "<li><h4>Disputes</h4><p>The photo settles it. If a photo is unreadable, players in that cup agree on the scores or the cup is replayed. The commissioner can correct any recorded cup.</p></li>" +
    "</ol></div>";
  if (caps.canEdit) out += settingsHTML();
  return out;
}
function settingsHTML() {
  var s = settingsDraft || (settingsDraft = clone({ league: state.league, players: state.players }));
  var counts = {}; state.cups.forEach(function (c) { c.results.forEach(function (r) { counts[r.p] = (counts[r.p] || 0) + 1; }); });
  var pl = s.players.map(function (p, i) {
    return '<tr><td><span class="dot" style="background:' + esc(p.color) + '"></span></td><td class="l"><input id="pl-' + esc(p.id) + '" data-set="pname" data-i="' + i + '" value="' + esc(p.name) + '" aria-label="Player name"></td><td class="l small muted">' + (counts[p.id] || 0) + " cups" + (p.aliases && p.aliases.length ? " · also reads as " + esc(p.aliases.join(", ")) : "") + "</td><td>" + (counts[p.id] ? "" : '<button class="btn btn-sm" data-act="rm-player" data-i="' + i + '">Remove</button>') + "</td></tr>";
  }).join("");
  return '<section class="section-h"><h2>Commissioner settings</h2><span class="muted small">Only visible on a device with the commissioner key</span></section>' +
    '<div class="panel panel-pad" style="display:grid;gap:16px"><div class="form-grid">' +
    field("League name", "set-name", "text", s.league.name, "name") +
    field("Season", "set-season", "text", s.league.season, "season") +
    field("Cups in regular season", "set-len", "number", s.league.seasonLength, "seasonLength") +
    field("Playoff spots", "set-spots", "number", s.league.playoffSpots, "playoffSpots") +
    field("Qualifying % of cups", "set-min", "number", s.league.minParticipation, "minParticipation") +
    field("Default max points per cup", "set-max", "number", s.league.defaultMax, "defaultMax") +
    "</div>" + (s.players.length ? '<div><div class="eyebrow" style="margin-bottom:6px">Players</div><div style="overflow-x:auto"><table class="mini"><tbody>' + pl + "</tbody></table></div></div>" : '<p class="muted small" style="margin:0">Players are added automatically when you save a cup.</p>') +
    (ui.error && ui.view === "rules" ? '<div class="error">' + esc(ui.error) + "</div>" : "") +
    '<div><button class="btn btn-primary" data-act="save-settings"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Saving…" : "Save settings") + "</button></div></div>";
}
function field(label, id, type, val, key) { return '<label class="f" for="' + id + '">' + esc(label) + '<input id="' + id + '" type="' + type + '" data-set="league" data-key="' + key + '" value="' + esc(val) + '"' + (type === "number" ? ' min="1" step="1"' : "") + "></label>"; }

// ---------- commissioner page ----------
function viewAdmin() {
  var gh = lsGet(KEY_GH), ak = lsGet(KEY_AI);
  var ghStatus = caps.checking ? '<span class="busy small"><span class="spin"></span>Checking…</span>'
    : caps.canEdit ? '<span class="ok small">Connected as ' + esc(caps.ghLogin) + "</span>"
    : gh ? '<span class="error small">This token can\'t save to ' + esc(CONFIG.owner + "/" + CONFIG.repo) + "</span>" : '<span class="muted small">Not set</span>';
  return '<section class="section-h"><h2>Commissioner</h2><span class="muted small">Keys are kept only in this browser</span></section>' +
    '<div class="panel panel-pad keys">' +
    '<p style="margin:0">Saving cups and reading photos needs two keys on this device. They\'re stored in this browser only and are never added to the site or the repo. Use your own phone or laptop, not a shared one.</p>' +
    (ui.adminMsg ? '<div class="note">' + esc(ui.adminMsg) + "</div>" : "") +
    '<div><label class="f" for="k-gh">GitHub token (required to save)</label><div class="keyrow"><input id="k-gh" type="password" autocomplete="off" placeholder="github_pat_…" value="' + esc(gh) + '"><button class="btn btn-sm" data-act="save-gh">Save</button>' + ghStatus + "</div>" +
    '<ol class="steps"><li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub › New fine-grained token</a>.</li><li>Repository access: <b>Only select repositories</b> › <code>' + esc(CONFIG.repo) + "</code>.</li><li>Permissions › Repository › <b>Contents: Read and write</b>. Nothing else.</li><li>Generate, copy and paste it here.</li></ol></div>" +
    '<div><label class="f" for="k-ai">Anthropic API key (optional, reads photos automatically)</label><div class="keyrow"><input id="k-ai" type="password" autocomplete="off" placeholder="sk-ant-…" value="' + esc(ak) + '"><button class="btn btn-sm" data-act="save-ai">Save</button>' + (ak ? '<span class="ok small">Saved</span>' : '<span class="muted small">Not set: you\'ll type scores by hand</span>') + "</div>" +
    '<p class="small muted" style="margin:6px 0 0">Create one in the <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a>. Each photo costs a few cents. Set a monthly spend limit there to be safe.</p></div>' +
    '<div class="keyrow">' + (caps.canEdit ? '<a class="btn btn-primary" href="#add" data-act="new-cup">+ Add a cup</a>' : "") + '<button class="btn" data-act="forget">Remove both keys from this device</button></div>' +
    "</div>";
}

// ---------- add / edit cup ----------
function newDraft() { return { id: null, cup: CUP_NAMES[0], date: today(), max: state ? state.league.defaultMax : 60, notes: "", rows: [], photoBlob: null, photoUrl: null, photo: null, reading: false, saving: false, error: "", info: "", skipPhoto: false }; }
function editDraft(c) {
  var d = newDraft(); d.id = c.id; d.cup = c.cup; d.date = c.date; d.max = c.max; d.notes = c.notes || ""; d.photo = safePhoto(c.photo);
  d.rows = c.results.map(function (r) { return { raw: r.raw || playerName(state, r.p), pts: String(r.pts), assign: r.p, newName: "" }; });
  return d;
}
function viewAdd() {
  var d = draft || (draft = newDraft());
  var out = '<section class="section-h"><h2>' + (d.id ? "Edit cup" : "Add a cup") + '</h2><a class="btn btn-sm" href="#cups" data-act="cancel-draft">Cancel</a></section>';
  out += '<div class="panel panel-pad" style="display:grid;gap:16px">';
  var img = d.photoUrl || d.photo;
  if (img) {
    out += '<div class="preview"><img src="' + esc(img) + '" alt="Results screen photo"><div style="display:grid;gap:10px;align-content:start">';
    if (d.reading) out += '<div class="busy"><span class="spin"></span>Claude is reading the results screen…</div><div><button class="btn btn-sm" data-act="stop-read">Stop</button></div>';
    else {
      out += '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (caps.images && d.photoBlob ? '<button class="btn btn-sm" data-act="read">Read photo again</button>' : "") + '<label class="btn btn-sm" for="photo-in">Use a different photo</label></div>';
      if (!caps.images) out += '<p class="small muted" style="margin:0">Add an Anthropic API key on the <a href="#admin">Commissioner page</a> to read photos automatically. For now, type the scores below.</p>';
    }
    out += '<input id="photo-in" type="file" accept="image/*" hidden></div></div>';
  } else {
    out += '<label class="drop" for="photo-in" id="drop"><input id="photo-in" type="file" accept="image/*"><b>Add the results-screen photo</b><span class="muted small">' + (caps.images ? "Claude reads the names and points for you. You check them before saving." : "It's saved with the cup as the record. Type the scores below.") + '</span><span class="btn btn-primary btn-sm">Choose photo</span></label>';
  }
  if (d.info) out += '<div class="note">' + esc(d.info) + "</div>";
  if (d.error) out += '<div class="error">' + esc(d.error) + "</div>";
  out += '<div class="form-grid"><label class="f" for="d-cup">Cup<select id="d-cup" data-d="cup">' + CUP_NAMES.map(function (n) { return "<option" + (n === d.cup ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label>" +
    '<label class="f" for="d-date">Date<input id="d-date" type="date" data-d="date" value="' + esc(d.date) + '"></label>' +
    '<label class="f" for="d-max">Max points per player<input id="d-max" type="number" min="1" step="1" data-d="max" value="' + esc(d.max) + '"></label></div>';
  var opts = function (sel) { return '<option value="ignore"' + (sel === "ignore" ? " selected" : "") + ">Not in league (CPU)</option>" + state.players.map(function (p) { return '<option value="' + esc(p.id) + '"' + (sel === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + '<option value="new"' + (sel === "new" ? " selected" : "") + ">+ New player…</option>"; };
  out += '<div><div class="eyebrow" style="margin-bottom:6px">Results</div>';
  if (d.rows.length) {
    out += '<div style="overflow-x:auto"><table class="rows-tbl"><thead><tr><th class="l">Name on screen</th><th>Points</th><th class="l">League player</th><th></th></tr></thead><tbody>' +
      d.rows.map(function (r, i) {
        return '<tr class="' + (r.assign === "ignore" ? "ign" : "") + '"><td class="l"><input id="r-raw-' + i + '" data-r="raw" data-i="' + i + '" value="' + esc(r.raw) + '" aria-label="Name on screen"></td>' +
          '<td><input class="ptsin" id="r-pts-' + i + '" type="number" min="0" step="1" inputmode="numeric" data-r="pts" data-i="' + i + '" value="' + esc(r.pts) + '" aria-label="Points"></td>' +
          '<td class="l"><div style="display:grid;gap:4px;min-width:170px"><select id="r-as-' + i + '" data-r="assign" data-i="' + i + '" aria-label="League player">' + opts(r.assign) + "</select>" +
          (r.assign === "new" ? '<input id="r-new-' + i + '" data-r="newName" data-i="' + i + '" value="' + esc(r.newName) + '" placeholder="New player name" aria-label="New player name">' : "") + "</div></td>" +
          '<td><button class="btn btn-sm" data-act="rm-row" data-i="' + i + '" aria-label="Remove row">✕</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  } else out += '<p class="muted small" style="margin:0 0 8px">No rows yet. ' + (caps.images ? "Add a photo above, or " : "") + "add a row for each league player.</p>";
  out += '<div style="margin-top:8px"><button class="btn btn-sm" data-act="add-row">+ Add row</button></div></div>';
  out += '<label class="f" for="d-notes">Notes (optional)<textarea id="d-notes" data-d="notes" placeholder="Anything worth remembering about this cup">' + esc(d.notes) + "</textarea></label>";
  out += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" data-act="save-cup"' + (d.saving || d.reading ? " disabled" : "") + ">" + (d.saving ? "Saving…" : d.id ? "Save changes" : "Save cup") + '</button><span class="muted small">Saving commits to GitHub. The public site updates about a minute later.</span></div>';
  return out + "</div>";
}
function matchPlayer(st, name) {
  var n = String(name || "").trim().toLowerCase(); if (!n) return null;
  return st.players.find(function (p) { return p.name.toLowerCase() === n || (p.aliases || []).some(function (a) { return a.toLowerCase() === n; }); }) || null;
}
function mapRow(r) {
  var name = String(r && r.name || "").trim();
  var pts = (r && r.points != null && !isNaN(Number(r.points))) ? String(Math.round(Number(r.points))) : "";
  var m = matchPlayer(state, name);
  return { raw: name, pts: pts, assign: m ? m.id : (r && r.cpu ? "ignore" : "new"), newName: m ? "" : name };
}
function prepImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      try {
        var s = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("encode")); }, "image/jpeg", 0.86);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
    fr.onerror = function () { reject(fr.error); };
    fr.readAsDataURL(blob);
  });
}
function onPhoto(file) {
  if (!file || !draft) return;
  draft.error = ""; draft.info = "";
  prepImage(file).then(function (blob) {
    if (draft.photoUrl) URL.revokeObjectURL(draft.photoUrl);
    draft.photoBlob = blob; draft.photoUrl = URL.createObjectURL(blob); draft.skipPhoto = false;
    render();
    if (caps.images) readPhoto();
  }).catch(function () {
    draft.error = "This browser can't open that photo format. On iPhone, set Settings › Camera › Formats to Most Compatible, or screenshot the photo and upload the screenshot.";
    render();
  });
}

// ---------- reading the photo with Claude ----------
var RESULT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["cup", "rows"],
  properties: {
    cup: { type: ["string", "null"] },
    rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["pos", "name", "points", "cpu"],
      properties: { pos: { type: "integer" }, name: { type: "string" }, points: { type: ["integer", "null"] }, cpu: { type: "boolean" } } } }
  }
};
var sdkPromise = null;
function loadSDK() {
  if (!sdkPromise) sdkPromise = import(CONFIG.sdkUrl).then(function (m) { return m.default; }, function (e) { sdkPromise = null; throw e; });
  return sdkPromise;
}
function readPrompt() {
  var known = state.players.map(function (p) { return [p.name].concat(p.aliases || []).join(" / "); }).join("; ") || "(none yet)";
  return "This is a phone photo of a TV showing the final results screen of Mario Kart Wii after a 4-race cup (Grand Prix or VS race). " +
    "The screen lists up to 12 racers from 1st down, each with total points for the cup (per race: 15,12,10,8,7,6,5,4,3,2,1,0, so at most 60).\n" +
    "Human players show their Mii or player names. Computer racers show character names such as Mario, Luigi, Peach, Daisy, Yoshi, Birdo, Toad, Toadette, Koopa Troopa, Diddy Kong, Donkey Kong, Bowser, Bowser Jr., Wario, Waluigi, King Boo, Rosalina, Funky Kong, Dry Bones, Dry Bowser, Baby Mario, Baby Luigi, Baby Peach, Baby Daisy; mark those rows cpu: true.\n" +
    "League players we already know (use these exact spellings when a row clearly matches one): " + known + ".\n" +
    "Read every row you can, in screen order. If a points value is unreadable, use null. Set cup to the cup name if it is visible on screen, otherwise null.";
}
function readPhoto() {
  var key = lsGet(KEY_AI);
  if (!key || !draft || !draft.photoBlob) return;
  if (readCtl) readCtl.abort();
  var ctl = readCtl = new AbortController();
  var d = draft;
  d.reading = true; d.error = ""; d.info = ""; render();
  var Anthropic;
  loadSDK().then(function (A) {
    Anthropic = A;
    return blobToBase64(d.photoBlob);
  }).then(function (b64) {
    var client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    return client.beta.messages.create({
      model: CONFIG.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: RESULT_SCHEMA } },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: readPrompt() }
      ] }]
    }, { signal: ctl.signal });
  }).then(function (response) {
    if (ctl !== readCtl) return;
    if (response.stop_reason === "refusal") throw { code: "refused" };
    if (response.stop_reason === "max_tokens") throw { code: "no_rows" };
    var text = response.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
    var out; try { out = JSON.parse(text); } catch (e) { throw { code: "no_rows" }; }
    var rows = out && Array.isArray(out.rows) ? out.rows : [];
    if (!rows.length) throw { code: "no_rows" };
    if (out.cup) { var g = String(out.cup).toLowerCase().split(" ")[0]; var hit = CUP_NAMES.find(function (n) { return n.toLowerCase().split(" ")[0] === g; }); if (hit) d.cup = hit; }
    d.rows = rows.map(mapRow);
    var lp = d.rows.filter(function (r) { return r.assign !== "ignore"; }).length;
    d.info = "Read " + rows.length + " racers; " + lp + " look like league players. Check every score against the photo before saving.";
  }).catch(function (e) {
    if (ctl === readCtl) d.error = readErr(e, Anthropic);
  }).then(function () {
    if (ctl === readCtl) { readCtl = null; d.reading = false; render(); }
  });
}
function readErr(e, A) {
  if (e && e.code === "refused") return "Claude declined to read that photo. Type the scores below.";
  if (e && e.code === "no_rows") return "No results table found in that photo. Retake it straight on with the whole list in frame, or type the scores below.";
  if (A) {
    if (e instanceof A.APIUserAbortError) return "";
    if (e instanceof A.AuthenticationError) return "Anthropic rejected the API key. Check it on the Commissioner page.";
    if (e instanceof A.PermissionDeniedError) return "This API key isn't allowed to use " + CONFIG.model + ". Check the key's workspace in the Anthropic Console.";
    if (e instanceof A.RateLimitError) return "Too many requests, or the key's spend limit was reached. Wait a minute and press Read photo again.";
    if (e instanceof A.BadRequestError) return "Anthropic couldn't process that photo (" + (e.message || "bad request") + "). Try another photo or type the scores below.";
    if (e instanceof A.APIConnectionError) return "Couldn't reach Anthropic. Check your connection and press Read photo again.";
    if (e instanceof A.APIError) return "Reading the photo failed (error " + e.status + "). Press Read photo again, or type the scores below.";
  }
  if (e && e.name === "AbortError") return "";
  if (!A) return "Couldn't load the Claude library. Check your connection and press Read photo again.";
  return "Reading the photo failed. Press Read photo again, or type the scores below.";
}

// ---------- GitHub storage ----------
function ghFetch(path, opts) {
  opts = opts || {};
  var headers = Object.assign({ "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Authorization": "Bearer " + lsGet(KEY_GH) }, opts.headers || {});
  return fetch("https://api.github.com" + path, Object.assign({}, opts, { headers: headers, cache: "no-store" })).then(function (r) {
    if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var err = new Error(j.message || ("GitHub error " + r.status)); err.status = r.status; throw err; });
    return r.status === 204 ? null : r.json();
  });
}
function repoPath(p) { return "/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/contents/" + p; }
function b64ToUtf8(b64) { var bin = atob(b64.replace(/\s/g, "")); var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
function utf8ToB64(str) { var bytes = new TextEncoder().encode(str), bin = ""; for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function getRemoteData() {
  return ghFetch(repoPath(CONFIG.dataPath) + "?ref=" + CONFIG.branch).then(function (j) { return { sha: j.sha, data: normalize(JSON.parse(b64ToUtf8(j.content))) }; });
}
function ghErrText(e) {
  var s = e && e.status;
  if (s === 401) return "GitHub rejected the token. It may have expired. Update it on the Commissioner page.";
  if (s === 403 || s === 404) return "The GitHub token can't write to " + CONFIG.owner + "/" + CONFIG.repo + ". Make sure it has Contents: Read and write on that repo.";
  if (s === 409 || s === 422) return "Someone saved at the same moment. Press save again.";
  if (!s) return "Couldn't reach GitHub. Check your connection and try again.";
  return "GitHub error " + s + ": " + (e.message || "save failed") + ".";
}
// Applies `mutate` to the latest data on GitHub (not this page's copy) and commits it.
function commit(mutate, message, view, flash) {
  function attempt(n) {
    return getRemoteData().then(function (cur) {
      var next = mutate(clone(cur.data));
      return ghFetch(repoPath(CONFIG.dataPath), { method: "PUT", body: JSON.stringify({ message: message, content: utf8ToB64(JSON.stringify(next, null, 2) + "\n"), sha: cur.sha, branch: CONFIG.branch }) })
        .then(function () { return next; });
    }).catch(function (e) {
      if ((e.status === 409 || e.status === 422) && n === 0) return attempt(1);
      throw e;
    });
  }
  return attempt(0).then(function (next) {
    state = next; draft = null; settingsDraft = null; ui.flash = flash;
    flashLater();
    if (location.hash !== "#" + view) location.hash = view; else render();
  });
}
function uploadPhoto(blob, cupId) {
  var path = CONFIG.photoDir + "/" + cupId + "-" + Date.now().toString(36) + ".jpg";
  return blobToBase64(blob).then(function (b64) {
    return ghFetch(repoPath(path), { method: "PUT", body: JSON.stringify({ message: "Add results photo", content: b64, branch: CONFIG.branch }) });
  }).then(function () { return path; });
}
function checkToken() {
  var t = lsGet(KEY_GH);
  if (!t) { caps.canEdit = false; caps.ghLogin = ""; render(); return Promise.resolve(); }
  caps.checking = true; render();
  return Promise.all([ghFetch("/repos/" + CONFIG.owner + "/" + CONFIG.repo), ghFetch("/user").catch(function () { return {}; })]).then(function (r) {
    caps.canEdit = !!(r[0].permissions && r[0].permissions.push);
    caps.ghLogin = r[1].login || "GitHub";
  }).catch(function () { caps.canEdit = false; }).then(function () {
    caps.checking = false;
    if (caps.canEdit) refreshFromGitHub();
    render();
  });
}
// Commissioners read straight from GitHub so they never see a stale copy while Pages rebuilds.
function refreshFromGitHub() {
  getRemoteData().then(function (cur) { state = cur.data; render(); }).catch(function () {});
}

// ---------- validation and saving ----------
function validateDraft(d) {
  var max = Number(d.max);
  if (!d.date) return "Pick the date the cup was raced.";
  if (!(max > 0 && Math.round(max) === max)) return "Max points per player must be a whole number above 0.";
  var active = d.rows.filter(function (r) { return r.assign !== "ignore"; });
  if (!active.length) return "Add at least one league player's result.";
  var seen = {};
  for (var i = 0; i < active.length; i++) {
    var r = active[i], p = r.pts === "" ? NaN : Number(r.pts);
    var label = r.raw || r.newName || "a row";
    if (!(p >= 0 && p <= max && Math.round(p) === p)) return "Points for " + label + " must be a whole number from 0 to " + max + ".";
    var key;
    if (r.assign === "new") { var nm = String(r.newName || "").trim(); if (!nm) return "Give the new player from " + label + " a name."; var ex = matchPlayer(state, nm); key = ex ? ex.id : "new:" + nm.toLowerCase(); }
    else key = r.assign;
    if (seen[key]) return "The same league player is picked on two rows. Each player can appear once per cup.";
    seen[key] = 1;
  }
  return "";
}
function saveDraft() {
  var d = draft; if (!d || d.saving) return;
  var err = validateDraft(d);
  if (err) { d.error = err; render(); return; }
  d.saving = true; d.error = ""; render();
  var cupId = d.id || uid();
  var photo = Promise.resolve(d.photo);
  if (d.photoBlob && !d.skipPhoto) photo = uploadPhoto(d.photoBlob, cupId).catch(function (e) { throw { photo: true, e: e }; });
  var rows = d.rows.filter(function (r) { return r.assign !== "ignore"; }).map(clone);
  photo.then(function (photoPath) {
    return commit(function (next) {
      var results = [];
      rows.forEach(function (r) {
        var pid = r.assign;
        if (pid === "new" || !next.players.some(function (p) { return p.id === pid; })) {
          var nm = String(r.newName || r.raw).trim();
          var ex = matchPlayer(next, nm);
          if (ex) pid = ex.id; else { var np = { id: uid(), name: nm, color: nextColor(next), aliases: [] }; next.players.push(np); pid = np.id; }
        }
        var p = next.players.find(function (x) { return x.id === pid; });
        var raw = String(r.raw || "").trim();
        if (p && raw && raw.toLowerCase() !== p.name.toLowerCase() && !p.aliases.some(function (a) { return a.toLowerCase() === raw.toLowerCase(); })) p.aliases.push(raw);
        results.push({ p: pid, pts: Number(r.pts), raw: raw });
      });
      var old = next.cups.find(function (c) { return c.id === cupId; });
      var cup = { id: cupId, cup: d.cup, date: d.date, max: Number(d.max), results: results, photo: photoPath || null, notes: String(d.notes || "").trim(), addedAt: old ? old.addedAt : Date.now() };
      if (old) next.cups[next.cups.indexOf(old)] = cup; else next.cups.push(cup);
      return next;
    }, (d.id ? "Update " : "Add ") + d.cup + " (" + d.date + ")", "cups", d.id ? "Cup updated. The public site refreshes in about a minute." : "Cup saved. The public site refreshes in about a minute.");
  }).catch(function (e) {
    if (e && e.photo) { d.skipPhoto = true; d.error = "The photo couldn't be saved (" + ghErrText(e.e) + ") Press Save again to save the results without it."; }
    else d.error = ghErrText(e);
  }).then(function () { d.saving = false; if (draft === d) render(); });
}
function saveSettings() {
  var s = settingsDraft; if (!s || ui.busy) return;
  var L = s.league, n = { name: String(L.name || "").trim(), season: String(L.season || "").trim(), seasonLength: Number(L.seasonLength), playoffSpots: Number(L.playoffSpots), minParticipation: Number(L.minParticipation), defaultMax: Number(L.defaultMax) };
  var err = "";
  if (!n.name) err = "Give the league a name.";
  else if (!n.season) err = "Give the season a name.";
  else if (!(n.seasonLength >= 1 && n.seasonLength <= 200 && Math.round(n.seasonLength) === n.seasonLength)) err = "Cups in regular season must be a whole number from 1 to 200.";
  else if (!(n.playoffSpots >= 2 && n.playoffSpots <= 32 && Math.round(n.playoffSpots) === n.playoffSpots)) err = "Playoff spots must be a whole number from 2 to 32.";
  else if (!(n.minParticipation >= 0 && n.minParticipation <= 100)) err = "Qualifying % must be between 0 and 100.";
  else if (!(n.defaultMax >= 1 && Math.round(n.defaultMax) === n.defaultMax)) err = "Default max points must be a whole number above 0.";
  else if (s.players.some(function (p) { return !String(p.name).trim(); })) err = "Every player needs a name.";
  if (err) { ui.error = err; render(); return; }
  var names = {}; s.players.forEach(function (p) { names[p.id] = String(p.name).trim(); });
  var removed = state.players.filter(function (p) { return !(p.id in names); }).map(function (p) { return p.id; });
  ui.busy = true; ui.error = ""; render();
  commit(function (next) {
    next.league = Object.assign({}, next.league, n);
    next.players = next.players.filter(function (p) { return removed.indexOf(p.id) < 0; }).map(function (p) { return p.id in names ? Object.assign({}, p, { name: names[p.id] }) : p; });
    return next;
  }, "Update league settings", "rules", "Settings saved").catch(function (e) { ui.error = ghErrText(e); }).then(function () { ui.busy = false; render(); });
}

var flashT = null;
function flashLater() { clearTimeout(flashT); flashT = setTimeout(function () { ui.flash = ""; render(); }, 5000); }

// ---------- events ----------
function setView() {
  var h = (location.hash || "").replace("#", "");
  ui.view = VIEWS.indexOf(h) >= 0 ? h : "standings";
  ui.confirmDel = null; ui.error = ""; ui.adminMsg = "";
  if (ui.view === "add" && !draft && state) draft = newDraft();
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", setView);
document.addEventListener("click", function (e) {
  var t = e.target.closest("[data-act]"); if (!t) return;
  var act = t.getAttribute("data-act"), id = t.getAttribute("data-key"), i = Number(t.getAttribute("data-i"));
  if (act === "sel") { ui.sel = ui.sel === id ? null : id; render(); }
  else if (act === "unsel") { ui.sel = null; render(); }
  else if (act === "new-cup") { if (!draft || draft.id) { draft = newDraft(); if (ui.view === "add") render(); } }
  else if (act === "cancel-draft") { if (readCtl) readCtl.abort(); draft = null; }
  else if (act === "edit-cup") { var c = state.cups.find(function (x) { return x.id === id; }); if (c) { draft = editDraft(c); if (ui.view === "add") render(); else location.hash = "add"; } }
  else if (act === "del-ask") { ui.confirmDel = id; render(); }
  else if (act === "del-no") { ui.confirmDel = null; render(); }
  else if (act === "del-yes") {
    var cupName = (state.cups.find(function (x) { return x.id === id; }) || {}).cup || "cup";
    ui.busy = true; ui.error = ""; render();
    commit(function (next) { next.cups = next.cups.filter(function (x) { return x.id !== id; }); return next; }, "Delete " + cupName, "cups", "Cup deleted")
      .catch(function (er) { ui.error = ghErrText(er); }).then(function () { ui.busy = false; ui.confirmDel = null; render(); });
  }
  else if (act === "read") { readPhoto(); }
  else if (act === "stop-read") { if (readCtl) readCtl.abort(); readCtl = null; if (draft) draft.reading = false; render(); }
  else if (act === "add-row") { var free = state.players.find(function (p) { return !draft.rows.some(function (r) { return r.assign === p.id; }); }); draft.rows.push({ raw: free ? free.name : "", pts: "", assign: free ? free.id : "new", newName: "" }); render(); }
  else if (act === "rm-row") { draft.rows.splice(i, 1); render(); }
  else if (act === "save-cup") { saveDraft(); }
  else if (act === "rm-player") { settingsDraft.players.splice(i, 1); render(); }
  else if (act === "save-settings") { saveSettings(); }
  else if (act === "save-gh") { lsSet(KEY_GH, document.getElementById("k-gh").value.trim()); ui.adminMsg = ""; checkToken(); }
  else if (act === "save-ai") { lsSet(KEY_AI, document.getElementById("k-ai").value.trim()); caps.images = !!lsGet(KEY_AI); ui.adminMsg = caps.images ? "Anthropic key saved on this device." : "Anthropic key removed."; render(); }
  else if (act === "forget") { lsSet(KEY_GH, ""); lsSet(KEY_AI, ""); caps.canEdit = false; caps.images = false; caps.ghLogin = ""; ui.adminMsg = "Both keys were removed from this browser."; render(); }
});
document.addEventListener("keydown", function (e) {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("tr.row")) { e.preventDefault(); e.target.click(); }
});
document.addEventListener("input", function (e) {
  var t = e.target;
  if (t.dataset.d && draft) draft[t.dataset.d] = t.value;
  else if (t.dataset.r && draft) { var row = draft.rows[Number(t.dataset.i)]; if (row && t.dataset.r !== "assign") row[t.dataset.r] = t.value; }
  else if (t.dataset.set === "league" && settingsDraft) settingsDraft.league[t.dataset.key] = t.value;
  else if (t.dataset.set === "pname" && settingsDraft) settingsDraft.players[Number(t.dataset.i)].name = t.value;
});
document.addEventListener("change", function (e) {
  var t = e.target;
  if (t.id === "photo-in") { onPhoto(t.files && t.files[0]); t.value = ""; }
  else if (t.dataset.r === "assign" && draft) { var row = draft.rows[Number(t.dataset.i)]; row.assign = t.value; if (t.value === "new" && !row.newName) row.newName = row.raw; render(); var n = document.getElementById("r-new-" + t.dataset.i); if (n) n.focus(); }
});
document.addEventListener("dragover", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); onPhoto(e.dataTransfer.files[0]); } });
document.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "IMG" && t.dataset.photo) { var a = t.closest(".photo"); if (a) a.hidden = true; } }, true);

// ---------- boot ----------
var h0 = (location.hash || "").replace("#", ""); ui.view = VIEWS.indexOf(h0) >= 0 ? h0 : "standings";
caps.images = !!lsGet(KEY_AI);
render();
fetch(CONFIG.dataPath + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}).then(function (j) { if (!state) state = normalize(j); }).catch(function () {
  if (!state) ui.loadError = "Couldn't load the league data. Refresh the page to try again.";
}).then(function () {
  if (ui.view === "add" && !draft && state) draft = newDraft();
  render();
});
checkToken();
})();
