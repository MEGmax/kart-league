(function () {
"use strict";

// ---------- configuration ----------
var CONFIG = {
  firebaseVersion: "12.19.0",
  legacyDataPath: "data/league.json",
  model: "claude-opus-5-5",
  sdkUrl: "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm"
};
var FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;
var KEY_AI = "kl.anthropicKey";

var RACE_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];
var CUP_NAMES = ["Mushroom Cup", "Flower Cup", "Star Cup", "Special Cup", "Shell Cup", "Banana Cup", "Leaf Cup", "Lightning Cup", "Other"];
var COLORS = ["#E5484D", "#0090FF", "#30A46C", "#F76B15", "#8E4EC6", "#E93D82", "#12A594", "#D9A400", "#6E56CF", "#A18072", "#3E63DD", "#7C8A2E"];
var CHARACTERS = ["Mario", "Luigi", "Peach", "Daisy", "Yoshi", "Birdo", "Toad", "Toadette", "Koopa Troopa", "Diddy Kong", "Donkey Kong", "Bowser", "Bowser Jr.", "Wario", "Waluigi", "King Boo", "Rosalina", "Funky Kong", "Dry Bones", "Dry Bowser", "Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy", "Mii"];
var VIEWS = ["standings", "cups", "playoffs", "rules", "add", "account", "admin"];
var DEFAULT_LEAGUE = { name: "Kart Night League", season: "Season 1", seasonLength: 20, playoffSpots: 4, minParticipation: 50, defaultMax: 60 };

// ---------- state ----------
var FB = null;                       // Firebase modules + instances once loaded
var live = { league: undefined, players: undefined, cups: undefined };
var state = null;                    // {league, players, cups} assembled from `live`
var me = { ready: !FIREBASE_CONFIG, user: null, profile: null, ownerUid: null, ownerKnown: false };
var adminData = { pending: [], users: [] };
var mySubs = [];
var photoCache = {};                 // cupId -> data URL | "loading" | "none"
var userUnsubs = [];
var ui = { view: "standings", sel: null, confirmDel: null, flash: "", busy: false, error: "", loadError: "", msg: "",
  authMode: "signin", form: { email: "", password: "", name: "" }, confirmDeleteAccount: false, rejectId: null, rejectNote: "" };
var draft = null, readCtl = null, settingsDraft = null, profileDraft = null;

// ---------- helpers ----------
function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fmtDate(iso) { if (!iso) return ""; var d = new Date(iso + "T12:00:00"); if (isNaN(d)) return esc(iso); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: (d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined) }); }
function fmtWhen(ms) { if (!ms) return ""; var d = new Date(ms); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; }
function posHTML(n) { return '<span class="pos' + (n <= 3 ? " p" + n : "") + '">' + n + "<sup>" + ord(n) + "</sup></span>"; }
function pctTxt(x) { return (x * 100).toFixed(1) + "%"; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function nextColor(players) { var used = players.map(function (p) { return p.color; }); for (var i = 0; i < COLORS.length; i++) if (used.indexOf(COLORS[i]) < 0) return COLORS[i]; return COLORS[players.length % COLORS.length]; }
function playerName(id) { var p = state.players.find(function (x) { return x.id === id; }); return p ? p.name : "Unknown"; }
function signedIn() { return !!me.user; }
function isOwner() { return !!(me.user && me.ownerUid && me.ownerUid === me.user.uid); }
function isAdmin() { return isOwner() || !!(me.profile && me.profile.role === "admin"); }
function roleOf(u) { return u.id === me.ownerUid ? "owner" : (u.role || "member"); }
function roleLabel(r) { return r === "owner" ? "Owner" : r === "admin" ? "Admin" : "Member"; }
function myName() { return (me.profile && me.profile.displayName) || (me.user && (me.user.displayName || (me.user.email || "").split("@")[0])) || "Racer"; }

function normalize(raw) {
  raw = raw || {};
  return {
    league: Object.assign({}, DEFAULT_LEAGUE, raw.league || {}),
    players: (raw.players || []).map(function (p) { return { id: p.id, name: p.name, color: p.color || COLORS[0], aliases: p.aliases || [] }; }),
    cups: (raw.cups || []).map(function (c) { return Object.assign({ notes: "", hasPhoto: false }, c, { results: (c.results || []).slice() }); })
  };
}

// Example data, shown only while the league has no cups yet.
var DEMO = (function () {
  var names = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan"];
  var players = names.map(function (n, i) { return { id: "d" + i, name: n, color: COLORS[i], aliases: [] }; });
  var pts = [[52, 47, 41, 38, 30, 25], [44, 55, 39, 33, 41, 0], [49, 38, 50, 29, 35, 41], [57, 42, 36, 44, 0, 31], [41, 49, 45, 37, 33, 28], [46, 51, 40, 0, 38, 35], [53, 39, 47, 41, 30, 0], [48, 44, 52, 36, 40, 29]];
  var cups = pts.map(function (row, ci) {
    var d = new Date(2026, 8, 4 + ci * 7);
    return { id: "dc" + ci, cup: CUP_NAMES[ci], date: d.toISOString().slice(0, 10), max: 60, notes: "", hasPhoto: false, addedAt: ci,
      results: row.map(function (p, pi) { return { p: "d" + pi, pts: p, raw: names[pi] }; }).filter(function (r) { return r.pts > 0; }) };
  });
  return { league: Object.assign({}, DEFAULT_LEAGUE), players: players, cups: cups };
})();

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
  if ((v === "add" && !signedIn()) || (v === "admin" && !isAdmin())) v = "account";
  var body = v === "standings" ? viewStandings(st, m, demo) : v === "cups" ? viewCups(st, m, demo) : v === "playoffs" ? viewPlayoffs(st, m, demo)
    : v === "rules" ? viewRules(L) : v === "account" ? viewAccount() : v === "admin" ? viewAdmin() : viewAdd();
  app.innerHTML = mast(L, compute(state)) + navHTML(v) + '<main class="wrap">' + body + "</main>" +
    '<footer class="wrap foot"><span>' + esc(L.name) + " · " + esc(L.season) + "</span>" + (FIREBASE_CONFIG ? '<a href="#account">' + (signedIn() ? "Your account" : "Sign in or create an account") + "</a>" : "") + "</footer>" +
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
  var right = "";
  if (FIREBASE_CONFIG) {
    if (isAdmin()) right += t("admin", "Admin", adminData.pending.length ? '<span class="soon">' + adminData.pending.length + "</span>" : "");
    if (isAdmin()) right += '<a class="btn btn-primary btn-sm" href="#add" data-act="new-cup">+ Add cup</a>';
    else if (signedIn()) right += '<a class="btn btn-primary btn-sm" href="#add" data-act="new-cup">+ Submit cup</a>';
    right += signedIn()
      ? '<a class="acct' + (v === "account" ? " on" : "") + '" href="#account" title="Your account"><span class="dot" style="background:' + esc((me.profile && me.profile.color) || "var(--muted)") + '"></span>' + esc(myName()) + "</a>"
      : (me.ready ? '<a class="btn btn-sm" href="#account">Sign in</a>' : "");
  }
  return '<nav class="nav"><div class="wrap">' + t("standings", "Standings") + t("cups", "Cups") + t("playoffs", "Playoffs", '<span class="soon">SOON</span>') + t("rules", "Rules") + '<span class="nav-spacer"></span>' + right + "</div></nav>";
}
function demoNote() {
  return '<div class="note"><span><b>Example standings.</b> These made-up results show how the table works. They disappear when the first real cup is added.</span>' + (isAdmin() ? '<a class="btn btn-primary btn-sm" href="#add" data-act="new-cup">Add the first cup</a>' : "") + "</div>";
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
    if (isAdmin() && !demo) {
      actions = ui.confirmDel === c.id
        ? '<div class="cup-actions"><span class="small"><b>Delete Cup ' + info.num + '?</b> Its results leave the standings.</span><button class="btn btn-danger btn-sm" data-act="del-yes" data-key="' + esc(c.id) + '"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Deleting…" : "Delete cup") + '</button><button class="btn btn-sm" data-act="del-no">Keep it</button></div>'
        : '<div class="cup-actions"><button class="btn btn-sm" data-act="edit-cup" data-key="' + esc(c.id) + '">Edit</button><button class="btn btn-sm" data-act="del-ask" data-key="' + esc(c.id) + '">Delete</button></div>';
    }
    var photo = "";
    if (c.hasPhoto && !demo) {
      var src = photoCache[c.id];
      if (!src) loadPhoto(c.id);
      photo = src && src !== "loading" && src !== "none" ? '<a class="photo" href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" alt="Results screen photo for ' + esc(c.cup) + '"></a>' : "";
    }
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
  return '<section class="section-h"><h2>Regular season rules</h2><span class="muted small">' + esc(L.season) + "</span></section>" +
    '<div class="panel panel-pad rules"><ol>' +
    "<li><h4>Race scoring</h4><p>Every race is scored with the game's 12-racer points table. A cup is 4 races, so the most anyone can score in a cup is " + L.defaultMax + ' points.</p><div class="ptable">' + pt + "</div></li>" +
    "<li><h4>Standard settings</h4><p>150cc, CPUs on Hard, items Normal, any kart or bike. If a cup is raced with different settings that change the points available (no CPUs, fewer races), the admins record that cup's max points so percentages stay fair.</p></li>" +
    "<li><h4>The photo is the record</h4><p>When a cup ends, someone takes an iPhone photo of the final results screen before anyone presses a button. Any member can submit it; an admin approves it before it counts. CPU racers are ignored; only league players are recorded.</p></li>" +
    "<li><h4>Ranking stat: points percentage</h4><p>Your rank is your points earned divided by the points you could have earned in the cups you played. Missing a cup doesn't lower your percentage.</p></li>" +
    "<li><h4>Qualifying</h4><p>To be ranked you must have played at least " + L.minParticipation + "% of the cups held so far, rounded up. Everyone else is listed under Not yet qualified until they catch up.</p></li>" +
    "<li><h4>Cup wins and podiums</h4><p>Finishing order counts league players only. The league player with the most points in a cup wins it; 2nd and 3rd complete the podium. Players tied on points share the place.</p></li>" +
    "<li><h4>Tiebreakers</h4><p>Equal percentages are split by, in order: cup wins, head-to-head points across cups both players played, total points, then a single-race runoff on a track an admin picks.</p></li>" +
    "<li><h4>Abandoned cups</h4><p>A cup that isn't finished (power cut, rage quit, controller disconnect that ends it) doesn't count and is raced again from the start. No make-up cups for missed nights.</p></li>" +
    "<li><h4>Season length and playoffs</h4><p>The regular season is " + L.seasonLength + " cups. After that the standings lock and the top " + L.playoffSpots + " qualified players advance to the playoffs.</p></li>" +
    "<li><h4>Disputes</h4><p>The photo settles it. If a photo is unreadable, players in that cup agree on the scores or the cup is replayed. Admins can correct any recorded cup.</p></li>" +
    "</ol></div>";
}

// ---------- account page ----------
function viewAccount() {
  if (!FIREBASE_CONFIG) return '<div class="panel empty"><b>Accounts aren\'t switched on yet.</b></div>';
  if (!me.ready) return '<div class="loading"><span class="spin"></span>Checking your sign-in…</div>';
  if (!signedIn()) return authFormHTML();
  var p = profileDraft || (profileDraft = me.profile ? { displayName: me.profile.displayName || "", color: me.profile.color || COLORS[0], favoriteCharacter: me.profile.favoriteCharacter || "", favoriteVehicle: me.profile.favoriteVehicle || "" } : null);
  var role = isOwner() ? "owner" : (me.profile && me.profile.role) || "member";
  var out = '<section class="section-h"><h2>Your account</h2><span class="chip">' + roleLabel(role) + "</span></section>";
  if (ui.msg) out += '<div class="note">' + esc(ui.msg) + "</div>";
  if (me.ownerKnown && !me.ownerUid) {
    out += '<div class="panel panel-pad keys"><b>This league has no owner yet.</b><p style="margin:0">The owner is the permanent admin: they can promote other admins and can\'t be demoted. Only claim this if you run the league. It can be claimed once.</p><div><button class="btn btn-primary" data-act="claim"' + (ui.busy ? " disabled" : "") + ">Claim league ownership</button></div></div>";
  }
  if (!p) return out + '<div class="loading"><span class="spin"></span>Setting up your profile…</div>';
  var swatches = COLORS.map(function (c) { return '<button type="button" class="swatch' + (p.color === c ? " on" : "") + '" style="background:' + c + '" data-act="pick-color" data-key="' + c + '" aria-label="Color ' + c + '"' + (p.color === c ? ' aria-pressed="true"' : "") + "></button>"; }).join("");
  out += '<div class="panel panel-pad keys"><div class="eyebrow">Profile</div><div class="form-grid">' +
    '<label class="f" for="p-name">Display name<input id="p-name" maxlength="40" data-p="displayName" value="' + esc(p.displayName) + '"></label>' +
    '<label class="f" for="p-char">Favorite character<select id="p-char" data-p="favoriteCharacter"><option value="">None</option>' + CHARACTERS.map(function (c) { return "<option" + (c === p.favoriteCharacter ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label>" +
    '<label class="f" for="p-veh">Favorite kart or bike<input id="p-veh" maxlength="40" data-p="favoriteVehicle" value="' + esc(p.favoriteVehicle) + '" placeholder="e.g. Flame Runner"></label></div>' +
    '<div><div class="f" style="margin-bottom:6px">Color</div><div class="swatches">' + swatches + "</div></div>" +
    (ui.error && ui.view === "account" ? '<div class="error">' + esc(ui.error) + "</div>" : "") +
    '<div><button class="btn btn-primary" data-act="save-profile"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Saving…" : "Save profile") + "</button></div></div>";

  // submissions
  out += '<section class="section-h"><h2>Your submissions</h2><a class="btn btn-sm" href="#add" data-act="new-cup">' + (isAdmin() ? "+ Add cup" : "+ Submit a cup") + "</a></section>";
  if (!mySubs.length) out += '<p class="muted small" style="margin:0">' + (isAdmin() ? "As an admin, cups you add go straight into the standings." : "Cups you submit show up here while an admin reviews them.") + "</p>";
  else out += '<div class="tbl-wrap"><table class="mini"><thead><tr><th class="l">Cup</th><th class="l">Raced</th><th class="l">Sent</th><th class="l">Status</th><th></th></tr></thead><tbody>' +
    mySubs.map(function (s) {
      return '<tr><td class="l">' + esc(s.cup) + '</td><td class="l">' + fmtDate(s.date) + '</td><td class="l muted">' + fmtWhen(s.submittedAt) + '</td><td class="l"><span class="chip st-' + esc(s.status) + '">' + esc(s.status) + "</span>" + (s.reviewNote ? ' <span class="small muted">' + esc(s.reviewNote) + "</span>" : "") + "</td><td>" +
        (s.status === "pending" ? '<button class="btn btn-sm" data-act="withdraw" data-key="' + esc(s.id) + '">Withdraw</button>' : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>";

  // sign-in & security
  var isPw = me.user.providerData.some(function (d) { return d.providerId === "password"; });
  var ak = lsGet(KEY_AI);
  out += '<section class="section-h"><h2>Sign-in and security</h2></section><div class="panel panel-pad keys">' +
    '<div class="small">Signed in as <b>' + esc(me.user.email || "") + "</b>" + (isPw ? " with a password" : " with Google") + ".</div>" +
    '<div class="keyrow">' + (isPw ? '<button class="btn btn-sm" data-act="reset-pw">Email me a password reset link</button>' : "") + '<button class="btn btn-sm" data-act="signout">Sign out</button></div>' +
    '<div><label class="f" for="k-ai">Anthropic API key (optional, this device only)</label><div class="keyrow"><input id="k-ai" type="password" autocomplete="off" placeholder="sk-ant-…" value="' + esc(ak) + '"><button class="btn btn-sm" data-act="save-ai">Save</button>' + (ak ? '<span class="ok small">Saved</span>' : "") + "</div>" +
    '<p class="small muted" style="margin:6px 0 0">With a key, Claude reads the names and points from a results photo for you. It\'s stored in this browser only and costs a few cents per photo. Create one in the <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a> and set a spend limit.</p></div>' +
    (isOwner() ? "" : ui.confirmDeleteAccount
      ? '<div class="keyrow"><span class="small"><b>Delete your account?</b> Your profile is removed and you\'re signed out. Cups already in the standings stay.</span><button class="btn btn-danger btn-sm" data-act="delete-account-yes">Delete account</button><button class="btn btn-sm" data-act="delete-account-no">Keep it</button></div>'
      : '<div><button class="btn-link small" data-act="delete-account">Delete my account</button></div>') +
    "</div>";
  return out;
}
function authFormHTML() {
  var up = ui.authMode === "signup", f = ui.form;
  return '<section class="section-h"><h2>' + (up ? "Create an account" : "Sign in") + "</h2></section>" +
    '<div class="panel panel-pad keys" style="max-width:440px">' +
    '<button class="btn google" data-act="google"' + (ui.busy ? " disabled" : "") + '><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>' +
    '<div class="or"><span>or with email</span></div>' +
    '<form id="auth-form" style="display:grid;gap:12px">' +
    (up ? '<label class="f" for="a-name">Display name<input id="a-name" maxlength="40" autocomplete="nickname" data-a="name" value="' + esc(f.name) + '" required></label>' : "") +
    '<label class="f" for="a-email">Email<input id="a-email" type="email" autocomplete="email" data-a="email" value="' + esc(f.email) + '" required></label>' +
    '<label class="f" for="a-pw">Password<input id="a-pw" type="password" autocomplete="' + (up ? "new-password" : "current-password") + '" minlength="6" data-a="password" value="' + esc(f.password) + '" required></label>' +
    (up ? '<span class="small muted">At least 6 characters.</span>' : "") +
    (ui.error && ui.view === "account" ? '<div class="error">' + esc(ui.error) + "</div>" : "") +
    (ui.msg ? '<div class="note">' + esc(ui.msg) + "</div>" : "") +
    '<button class="btn btn-primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "One moment…" : up ? "Create account" : "Sign in") + "</button></form>" +
    '<div class="keyrow small">' + (up ? 'Already have an account? <button class="btn-link" data-act="auth-mode" data-key="signin">Sign in</button>'
      : 'New here? <button class="btn-link" data-act="auth-mode" data-key="signup">Create an account</button><span class="nav-spacer"></span><button class="btn-link" data-act="forgot">Forgot password?</button>') + "</div>" +
    "</div>";
}

// ---------- admin page ----------
function viewAdmin() {
  var out = '<section class="section-h"><h2>Submissions to review</h2><span class="muted small">' + adminData.pending.length + " waiting</span></section>";
  if (!adminData.pending.length) out += '<p class="muted small" style="margin:0">Nothing waiting. Cups that members submit appear here.</p>';
  else out += '<div class="cup-list">' + adminData.pending.slice().sort(function (a, b) { return a.submittedAt - b.submittedAt; }).map(function (s) {
    var rows = (s.rows || []).filter(function (r) { return r.assign !== "ignore"; });
    return '<article class="panel panel-pad" style="display:grid;gap:10px"><div class="cup-head"><span class="cup-name">' + esc(s.cup) + '</span><span class="muted small">raced ' + fmtDate(s.date) + " · sent by " + esc(s.submitterName || "a member") + " " + fmtWhen(s.submittedAt) + (s.hasPhoto ? " · photo attached" : "") + "</span></div>" +
      '<div class="small">' + rows.map(function (r) { return "<b>" + esc(r.assign === "new" ? r.newName + " (new)" : playerName(r.assign)) + "</b> " + esc(r.pts); }).join(" · ") + "</div>" +
      (ui.rejectId === s.id
        ? '<div class="keyrow"><input id="rej-note" data-rej="1" maxlength="200" placeholder="Reason (shown to the member)" value="' + esc(ui.rejectNote) + '"><button class="btn btn-danger btn-sm" data-act="reject-yes" data-key="' + esc(s.id) + '">Reject</button><button class="btn btn-sm" data-act="reject-no">Cancel</button></div>'
        : '<div class="keyrow"><button class="btn btn-primary btn-sm" data-act="review" data-key="' + esc(s.id) + '">Review and approve</button><button class="btn btn-sm" data-act="reject" data-key="' + esc(s.id) + '">Reject</button></div>') +
      "</article>";
  }).join("") + "</div>";
  out += settingsHTML();
  out += '<section class="section-h"><h2>Members</h2><span class="muted small">' + adminData.users.length + " account" + (adminData.users.length === 1 ? "" : "s") + "</span></section>";
  out += '<div class="tbl-wrap"><table class="mini"><thead><tr><th class="l">Name</th><th class="l">Email</th><th class="l">Role</th></tr></thead><tbody>' +
    adminData.users.slice().sort(function (a, b) { return (a.displayName || "").localeCompare(b.displayName || ""); }).map(function (u) {
      var r = roleOf(u);
      var ctl = r === "owner" ? '<span class="chip">Owner</span>'
        : '<select data-role="' + esc(u.id) + '" aria-label="Role for ' + esc(u.displayName) + '"><option value="member"' + (r === "member" ? " selected" : "") + '>Member</option><option value="admin"' + (r === "admin" ? " selected" : "") + ">Admin</option></select>";
      return '<tr><td class="l"><span class="who"><span class="dot" style="background:' + esc(u.color || "var(--muted)") + '"></span>' + esc(u.displayName || "—") + (me.user && u.id === me.user.uid ? ' <span class="muted small">(you)</span>' : "") + '</span></td><td class="l small muted">' + esc(u.email || "") + '</td><td class="l">' + ctl + "</td></tr>";
    }).join("") + "</tbody></table></div>";
  return out;
}
function settingsHTML() {
  var s = settingsDraft || (settingsDraft = clone({ league: state.league, players: state.players }));
  var counts = {}; state.cups.forEach(function (c) { c.results.forEach(function (r) { counts[r.p] = (counts[r.p] || 0) + 1; }); });
  var pl = s.players.map(function (p, i) {
    return '<tr><td><span class="dot" style="background:' + esc(p.color) + '"></span></td><td class="l"><input id="pl-' + esc(p.id) + '" data-set="pname" data-i="' + i + '" value="' + esc(p.name) + '" aria-label="Player name"></td><td class="l small muted">' + (counts[p.id] || 0) + " cups" + (p.aliases && p.aliases.length ? " · also reads as " + esc(p.aliases.join(", ")) : "") + "</td><td>" + (counts[p.id] ? "" : '<button class="btn btn-sm" data-act="rm-player" data-i="' + i + '">Remove</button>') + "</td></tr>";
  }).join("");
  return '<section class="section-h"><h2>League settings</h2><span class="muted small">Admins only</span></section>' +
    '<div class="panel panel-pad" style="display:grid;gap:16px"><div class="form-grid">' +
    field("League name", "set-name", "text", s.league.name, "name") +
    field("Season", "set-season", "text", s.league.season, "season") +
    field("Cups in regular season", "set-len", "number", s.league.seasonLength, "seasonLength") +
    field("Playoff spots", "set-spots", "number", s.league.playoffSpots, "playoffSpots") +
    field("Qualifying % of cups", "set-min", "number", s.league.minParticipation, "minParticipation") +
    field("Default max points per cup", "set-max", "number", s.league.defaultMax, "defaultMax") +
    "</div>" + (s.players.length ? '<div><div class="eyebrow" style="margin-bottom:6px">Players</div><div style="overflow-x:auto"><table class="mini"><tbody>' + pl + "</tbody></table></div></div>" : '<p class="muted small" style="margin:0">Players are added automatically when a cup is saved.</p>') +
    (ui.error && ui.view === "admin" ? '<div class="error">' + esc(ui.error) + "</div>" : "") +
    '<div><button class="btn btn-primary" data-act="save-settings"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Saving…" : "Save settings") + "</button></div></div>";
}
function field(label, id, type, val, key) { return '<label class="f" for="' + id + '">' + esc(label) + '<input id="' + id + '" type="' + type + '" data-set="league" data-key="' + key + '" value="' + esc(val) + '"' + (type === "number" ? ' min="1" step="1"' : "") + "></label>"; }

// ---------- add / edit / submit / review a cup ----------
// draft.mode: "add" (admin, new cup), "edit" (admin, existing cup), "submit" (member), "review" (admin approving a submission)
function newDraft() { return { mode: isAdmin() ? "add" : "submit", id: null, cup: CUP_NAMES[0], date: today(), max: state ? state.league.defaultMax : 60, notes: "", rows: [], photoB64: null, photoUrl: null, photoChanged: false, reading: false, saving: false, error: "", info: "" }; }
function editDraft(c) {
  var d = newDraft(); d.mode = "edit"; d.id = c.id; d.cup = c.cup; d.date = c.date; d.max = c.max; d.notes = c.notes || "";
  var src = photoCache[c.id]; if (src && src.indexOf("data:") === 0) { d.photoUrl = src; d.photoB64 = src.split(",")[1]; }
  d.rows = c.results.map(function (r) { return { raw: r.raw || playerName(r.p), pts: String(r.pts), assign: r.p, newName: "" }; });
  return d;
}
function reviewDraft(s) {
  var d = newDraft(); d.mode = "review"; d.id = s.id; d.cup = s.cup; d.date = s.date; d.max = s.max; d.notes = s.notes || ""; d.submitter = s.submitterName || "a member";
  d.rows = (s.rows || []).map(function (r) {
    var known = r.assign !== "new" && r.assign !== "ignore" && state.players.some(function (p) { return p.id === r.assign; });
    return { raw: r.raw || "", pts: String(r.pts), assign: known || r.assign === "ignore" ? r.assign : "new", newName: r.newName || r.raw || "" };
  });
  if (s.hasPhoto) {
    d.photoLoading = true;
    FB.fs.getDoc(FB.fs.doc(FB.db, "submissionPhotos", s.id)).then(function (snap) {
      if (snap.exists()) { d.photoB64 = snap.data().data; d.photoUrl = "data:image/jpeg;base64," + d.photoB64; d.photoChanged = true; }
    }).catch(function () {}).then(function () { d.photoLoading = false; if (draft === d) render(); });
  }
  return d;
}
function viewAdd() {
  var d = draft || (draft = newDraft());
  if (d.mode === "add" || d.mode === "submit") d.mode = isAdmin() ? "add" : "submit"; // follow the current role
  var title ={ add: "Add a cup", edit: "Edit cup", submit: "Submit a cup", review: "Review submission" }[d.mode];
  var out = '<section class="section-h"><h2>' + title + '</h2><a class="btn btn-sm" href="' + (d.mode === "review" ? "#admin" : d.mode === "submit" ? "#account" : "#cups") + '" data-act="cancel-draft">Cancel</a></section>';
  if (d.mode === "submit") out += '<div class="note">An admin checks your submission against the photo before it counts in the standings.</div>';
  if (d.mode === "review") out += '<div class="note">Sent by ' + esc(d.submitter) + ". Check the scores against the photo, fix anything, then approve.</div>";
  out += '<div class="panel panel-pad" style="display:grid;gap:16px">';
  var hasKey = !!lsGet(KEY_AI);
  if (d.photoLoading) out += '<div class="busy small"><span class="spin"></span>Loading the photo…</div>';
  else if (d.photoUrl) {
    out += '<div class="preview"><img src="' + d.photoUrl + '" alt="Results screen photo"><div style="display:grid;gap:10px;align-content:start">';
    if (d.reading) out += '<div class="busy"><span class="spin"></span>Claude is reading the results screen…</div><div><button class="btn btn-sm" data-act="stop-read">Stop</button></div>';
    else {
      out += '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (hasKey ? '<button class="btn btn-sm" data-act="read">Read photo' + (d.rows.length ? " again" : "") + "</button>" : "") + '<label class="btn btn-sm" for="photo-in">Use a different photo</label></div>';
      if (!hasKey) out += '<p class="small muted" style="margin:0">Add an Anthropic API key on your <a href="#account">account page</a> to read photos automatically. For now, type the scores below.</p>';
    }
    out += '<input id="photo-in" type="file" accept="image/*" hidden></div></div>';
  } else {
    out += '<label class="drop" for="photo-in" id="drop"><input id="photo-in" type="file" accept="image/*"><b>Add the results-screen photo</b><span class="muted small">' + (hasKey ? "Claude reads the names and points for you. You check them before saving." : "It's kept with the cup as the record. Type the scores below.") + '</span><span class="btn btn-primary btn-sm">Choose photo</span></label>';
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
  } else out += '<p class="muted small" style="margin:0 0 8px">No rows yet. ' + (hasKey ? "Add a photo above, or " : "") + "add a row for each league player.</p>";
  out += '<div style="margin-top:8px"><button class="btn btn-sm" data-act="add-row">+ Add row</button></div></div>';
  out += '<label class="f" for="d-notes">Notes (optional)<textarea id="d-notes" data-d="notes" maxlength="500" placeholder="Anything worth remembering about this cup">' + esc(d.notes) + "</textarea></label>";
  var label = d.saving ? "Saving…" : { add: "Save cup", edit: "Save changes", submit: "Submit for review", review: "Approve and add to standings" }[d.mode];
  out += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" data-act="save-cup"' + (d.saving || d.reading || d.photoLoading ? " disabled" : "") + ">" + label + "</button>" +
    (d.mode === "submit" ? '<span class="muted small">You can withdraw it from your account page while it\'s pending.</span>' : '<span class="muted small">Updates the standings for everyone right away.</span>') + "</div>";
  return out + "</div>";
}
function matchPlayer(players, name) {
  var n = String(name || "").trim().toLowerCase(); if (!n) return null;
  return players.find(function (p) { return p.name.toLowerCase() === n || (p.aliases || []).some(function (a) { return a.toLowerCase() === n; }); }) || null;
}
function mapRow(r) {
  var name = String(r && r.name || "").trim();
  var pts = (r && r.points != null && !isNaN(Number(r.points))) ? String(Math.round(Number(r.points))) : "";
  var m = matchPlayer(state.players, name);
  return { raw: name, pts: pts, assign: m ? m.id : (r && r.cpu ? "ignore" : "new"), newName: m ? "" : name };
}
// Downscales to JPEG and keeps the base64 under Firestore's 1 MiB document limit.
function prepImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var tries = [[1600, 0.82], [1280, 0.75], [1024, 0.7], [800, 0.65]];
      (function next(i) {
        var t = tries[i], s = Math.min(1, t[0] / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        var b64 = c.toDataURL("image/jpeg", t[1]).split(",")[1];
        if (b64.length < 900000 || i === tries.length - 1) resolve(b64); else next(i + 1);
      })(0);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
function onPhoto(file) {
  if (!file || !draft) return;
  var d = draft;
  d.error = ""; d.info = "";
  prepImage(file).then(function (b64) {
    d.photoB64 = b64; d.photoUrl = "data:image/jpeg;base64," + b64; d.photoChanged = true;
    render();
    if (lsGet(KEY_AI)) readPhoto();
  }).catch(function () {
    d.error = "This browser can't open that photo format. On iPhone, set Settings › Camera › Formats to Most Compatible, or screenshot the photo and upload the screenshot.";
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
    "Human players show their Mii or player names. Computer racers show character names such as " + CHARACTERS.slice(0, -1).join(", ") + "; mark those rows cpu: true.\n" +
    "League players we already know (use these exact spellings when a row clearly matches one): " + known + ".\n" +
    "Read every row you can, in screen order. If a points value is unreadable, use null. Set cup to the cup name if it is visible on screen, otherwise null.";
}
function readPhoto() {
  var key = lsGet(KEY_AI);
  if (!key || !draft || !draft.photoB64) return;
  if (readCtl) readCtl.abort();
  var ctl = readCtl = new AbortController();
  var d = draft, Anthropic;
  d.reading = true; d.error = ""; d.info = ""; render();
  loadSDK().then(function (A) {
    Anthropic = A;
    var client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    return client.beta.messages.create({
      model: CONFIG.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: RESULT_SCHEMA } },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: d.photoB64 } },
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
    if (e instanceof A.AuthenticationError) return "Anthropic rejected the API key. Check it on your account page.";
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

// ---------- Firebase ----------
function fsErr(e) {
  var c = e && e.code;
  if (c === "permission-denied") return "You don't have permission to do that. If your role just changed, refresh the page.";
  if (c === "unavailable") return "Couldn't reach the server. Check your connection and try again.";
  if (c === "invalid-argument" || c === "out-of-range") return "That was rejected as invalid. A photo may be too large; try a smaller one.";
  if (c === "resource-exhausted") return "The league's free database quota is used up for today. Try again tomorrow.";
  return "Saving failed" + (c ? " (" + c + ")" : "") + ". Try again.";
}
function authErr(e) {
  var c = e && e.code;
  var map = {
    "auth/invalid-credential": "That email and password don't match an account.",
    "auth/wrong-password": "That email and password don't match an account.",
    "auth/user-not-found": "That email and password don't match an account.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/email-already-in-use": "There's already an account with that email. Sign in instead, or use Google if you signed up with it.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/missing-password": "Enter your password.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/popup-closed-by-user": "",
    "auth/cancelled-popup-request": "",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
    "auth/account-exists-with-different-credential": "This email already has an account with a password. Sign in with your password.",
    "auth/unauthorized-domain": "Sign-in isn't enabled for this web address yet. Add it under Firebase › Authentication › Settings › Authorized domains.",
    "auth/operation-not-allowed": "This sign-in method isn't switched on in Firebase yet.",
    "auth/network-request-failed": "Couldn't reach the sign-in server. Check your connection.",
    "auth/requires-recent-login": "For security, sign out and sign back in, then try again."
  };
  return c in map ? map[c] : "Sign-in failed" + (c ? " (" + c + ")" : "") + ".";
}
function loadFirebase() {
  var base = "https://www.gstatic.com/firebasejs/" + CONFIG.firebaseVersion + "/";
  return Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]).then(function (mods) {
    var fbApp = mods[0].initializeApp(FIREBASE_CONFIG);
    FB = { a: mods[1], fs: mods[2], auth: mods[1].getAuth(fbApp), db: mods[2].getFirestore(fbApp) };
  });
}
function assemble() {
  if (live.league === undefined || live.players === undefined || live.cups === undefined) return;
  state = normalize({ league: live.league, players: live.players, cups: live.cups });
  render();
}
function startPublicListeners() {
  var fs = FB.fs, db = FB.db;
  function fail(e) { if (!state) { ui.loadError = "Couldn't load the standings (" + (e.code || "error") + "). Refresh to try again."; render(); } }
  fs.onSnapshot(fs.doc(db, "league", "main"), function (s) { live.league = s.exists() ? s.data() : {}; assemble(); }, fail);
  fs.onSnapshot(fs.collection(db, "players"), function (q) { live.players = q.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); }); assemble(); }, fail);
  fs.onSnapshot(fs.collection(db, "cups"), function (q) { live.cups = q.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); }); assemble(); }, fail);
  fs.onSnapshot(fs.doc(db, "config", "owner"), function (s) { me.ownerUid = s.exists() ? s.data().uid : null; me.ownerKnown = true; onRoleMaybeChanged(); }, function () { me.ownerKnown = true; });
}
function loadPhoto(id) {
  if (photoCache[id] || !FB) return;
  photoCache[id] = "loading";
  FB.fs.getDoc(FB.fs.doc(FB.db, "photos", id)).then(function (s) {
    photoCache[id] = s.exists() && s.data().data ? "data:image/jpeg;base64," + s.data().data : "none";
  }).catch(function () { photoCache[id] = "none"; }).then(render);
}
var pendingSignupName = "";
function startAuth() {
  FB.a.onAuthStateChanged(FB.auth, function (user) {
    userUnsubs.forEach(function (u) { u(); }); userUnsubs = [];
    me.user = user; me.profile = null; profileDraft = null; mySubs = []; adminData = { pending: [], users: [] };
    me.ready = true;
    if (!user) { onRoleMaybeChanged(); return; }
    var fs = FB.fs, db = FB.db;
    var ref = fs.doc(db, "users", user.uid);
    userUnsubs.push(fs.onSnapshot(ref, function (s) {
      if (!s.exists()) {
        var name = (pendingSignupName || user.displayName || (user.email || "").split("@")[0] || "Racer").slice(0, 40);
        fs.setDoc(ref, { displayName: name, email: user.email || "", role: "member", color: COLORS[Math.floor(Math.random() * COLORS.length)], favoriteCharacter: "", favoriteVehicle: "", createdAt: Date.now(), updatedAt: Date.now() })
          .catch(function (e) { ui.error = fsErr(e); render(); });
        return;
      }
      pendingSignupName = "";
      me.profile = s.data();
      if (!profileDraft) profileDraft = null;
      onRoleMaybeChanged();
    }, function () {}));
    userUnsubs.push(fs.onSnapshot(fs.query(fs.collection(db, "submissions"), fs.where("submittedBy", "==", user.uid)), function (q) {
      mySubs = q.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); }).sort(function (a, b) { return b.submittedAt - a.submittedAt; });
      render();
    }, function () {}));
    render();
  });
}
var adminUnsubs = [], adminOn = false;
function onRoleMaybeChanged() {
  var want = isAdmin();
  if (want && !adminOn) {
    adminOn = true;
    var fs = FB.fs, db = FB.db;
    adminUnsubs.push(fs.onSnapshot(fs.query(fs.collection(db, "submissions"), fs.where("status", "==", "pending")), function (q) {
      adminData.pending = q.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); }); render();
    }, function () {}));
    adminUnsubs.push(fs.onSnapshot(fs.collection(db, "users"), function (q) {
      adminData.users = q.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); }); render();
    }, function () {}));
  } else if (!want && adminOn) {
    adminOn = false; adminUnsubs.forEach(function (u) { u(); }); adminUnsubs = []; adminData = { pending: [], users: [] };
  }
  render();
}

// ---------- saving ----------
function validateDraft(d) {
  var max = Number(d.max);
  if (!d.date) return "Pick the date the cup was raced.";
  if (!(max > 0 && Math.round(max) === max)) return "Max points per player must be a whole number above 0.";
  var active = d.rows.filter(function (r) { return r.assign !== "ignore"; });
  if (!active.length) return "Add at least one league player's result.";
  if (d.rows.length > 24) return "A cup can have at most 24 rows.";
  var seen = {};
  for (var i = 0; i < active.length; i++) {
    var r = active[i], p = r.pts === "" ? NaN : Number(r.pts);
    var label = r.raw || r.newName || "a row";
    if (!(p >= 0 && p <= max && Math.round(p) === p)) return "Points for " + label + " must be a whole number from 0 to " + max + ".";
    var key;
    if (r.assign === "new") { var nm = String(r.newName || "").trim(); if (!nm) return "Give the new player from " + label + " a name."; var ex = matchPlayer(state.players, nm); key = ex ? ex.id : "new:" + nm.toLowerCase(); }
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
  var fs = FB.fs, db = FB.db, batch = fs.writeBatch(db), done;
  if (d.mode === "submit") {
    var sid = uid();
    batch.set(fs.doc(db, "submissions", sid), {
      cup: d.cup, date: d.date, max: Number(d.max), notes: String(d.notes || "").trim(), hasPhoto: !!d.photoB64,
      rows: d.rows.map(function (r) { return { raw: String(r.raw || "").trim(), pts: r.assign === "ignore" ? (r.pts === "" ? null : Number(r.pts)) : Number(r.pts), assign: r.assign, newName: r.assign === "new" ? String(r.newName || "").trim() : "" }; }),
      status: "pending", submittedBy: me.user.uid, submitterName: myName(), submittedAt: Date.now()
    });
    if (d.photoB64) batch.set(fs.doc(db, "submissionPhotos", sid), { data: d.photoB64, submittedBy: me.user.uid });
    done = { view: "account", flash: "Submitted. An admin will review it." };
  } else {
    var cupId = d.id || uid();
    var players = state.players.map(function (p) { return Object.assign({}, p, { aliases: (p.aliases || []).slice() }); });
    var touched = {};
    var results = [];
    d.rows.filter(function (r) { return r.assign !== "ignore"; }).forEach(function (r) {
      var pid = r.assign;
      if (pid === "new" || !players.some(function (p) { return p.id === pid; })) {
        var nm = String(r.newName || r.raw).trim();
        var ex = matchPlayer(players, nm);
        if (ex) pid = ex.id; else { var np = { id: uid(), name: nm, color: nextColor(players), aliases: [] }; players.push(np); pid = np.id; touched[pid] = 1; }
      }
      var p = players.find(function (x) { return x.id === pid; });
      var raw = String(r.raw || "").trim();
      if (p && raw && raw.toLowerCase() !== p.name.toLowerCase() && !p.aliases.some(function (a) { return a.toLowerCase() === raw.toLowerCase(); })) { p.aliases.push(raw); touched[pid] = 1; }
      results.push({ p: pid, pts: Number(r.pts), raw: raw });
    });
    players.forEach(function (p) { if (touched[p.id]) batch.set(fs.doc(db, "players", p.id), { name: p.name, color: p.color, aliases: p.aliases }); });
    var old = state.cups.find(function (c) { return c.id === cupId; });
    batch.set(fs.doc(db, "cups", cupId), {
      cup: d.cup, date: d.date, max: Number(d.max), results: results, notes: String(d.notes || "").trim(),
      hasPhoto: !!d.photoB64 || !!(old && old.hasPhoto), addedAt: old ? old.addedAt : Date.now(), addedBy: me.user.uid
    });
    if (d.photoB64 && d.photoChanged) { batch.set(fs.doc(db, "photos", cupId), { data: d.photoB64 }); photoCache[cupId] = d.photoUrl; }
    if (d.mode === "review") {
      batch.update(fs.doc(db, "submissions", d.id), { status: "approved", reviewedBy: me.user.uid, reviewedAt: Date.now(), cupId: cupId });
      batch.delete(fs.doc(db, "submissionPhotos", d.id));
    }
    done = d.mode === "review" ? { view: "admin", flash: "Approved. Standings updated." } : { view: "cups", flash: d.mode === "edit" ? "Cup updated" : "Cup saved. Standings updated." };
  }
  batch.commit().then(function () {
    draft = null; flash(done.flash);
    if (location.hash !== "#" + done.view) location.hash = done.view; else render();
  }).catch(function (e) { d.error = fsErr(e); }).then(function () { d.saving = false; if (draft === d) render(); });
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
  var fs = FB.fs, db = FB.db, batch = fs.writeBatch(db);
  batch.set(fs.doc(db, "league", "main"), n);
  var keep = {}; s.players.forEach(function (p) { keep[p.id] = String(p.name).trim(); });
  state.players.forEach(function (p) {
    if (!(p.id in keep)) batch.delete(fs.doc(db, "players", p.id));
    else if (keep[p.id] !== p.name) batch.update(fs.doc(db, "players", p.id), { name: keep[p.id] });
  });
  ui.busy = true; ui.error = ""; render();
  batch.commit().then(function () { settingsDraft = null; flash("Settings saved"); }).catch(function (e) { ui.error = fsErr(e); }).then(function () { ui.busy = false; render(); });
}
function saveProfile() {
  var p = profileDraft; if (!p || ui.busy) return;
  var name = String(p.displayName || "").trim();
  if (!name) { ui.error = "Enter a display name."; render(); return; }
  ui.busy = true; ui.error = ""; render();
  FB.fs.updateDoc(FB.fs.doc(FB.db, "users", me.user.uid), { displayName: name, color: p.color, favoriteCharacter: p.favoriteCharacter || "", favoriteVehicle: String(p.favoriteVehicle || "").trim(), updatedAt: Date.now() })
    .then(function () { profileDraft = null; flash("Profile saved"); }).catch(function (e) { ui.error = fsErr(e); }).then(function () { ui.busy = false; render(); });
}
var flashT = null;
function flash(msg) { ui.flash = msg; clearTimeout(flashT); flashT = setTimeout(function () { ui.flash = ""; render(); }, 4500); render(); }

// ---------- auth actions ----------
function doAuth() {
  var f = ui.form, up = ui.authMode === "signup";
  ui.error = ""; ui.msg = "";
  if (up && !f.name.trim()) { ui.error = "Enter a display name."; render(); return; }
  ui.busy = true; render();
  var p = up
    ? (pendingSignupName = f.name.trim(), FB.a.createUserWithEmailAndPassword(FB.auth, f.email.trim(), f.password).then(function (cred) { return FB.a.updateProfile(cred.user, { displayName: f.name.trim() }); }))
    : FB.a.signInWithEmailAndPassword(FB.auth, f.email.trim(), f.password);
  p.then(function () { ui.form = { email: "", password: "", name: "" }; flash(up ? "Account created. Welcome!" : "Signed in"); })
    .catch(function (e) { pendingSignupName = ""; ui.error = authErr(e); })
    .then(function () { ui.busy = false; render(); });
}
function doGoogle() {
  ui.error = ""; ui.msg = ""; ui.busy = true; render();
  FB.a.signInWithPopup(FB.auth, new FB.a.GoogleAuthProvider()).then(function () { flash("Signed in"); })
    .catch(function (e) { ui.error = authErr(e); }).then(function () { ui.busy = false; render(); });
}

// ---------- events ----------
function setView() {
  var h = (location.hash || "").replace("#", "");
  ui.view = VIEWS.indexOf(h) >= 0 ? h : "standings";
  ui.confirmDel = null; ui.error = ""; ui.msg = ""; ui.confirmDeleteAccount = false; ui.rejectId = null;
  if (ui.view === "add" && !draft && state && signedIn()) draft = newDraft();
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", setView);
document.addEventListener("submit", function (e) { if (e.target.id === "auth-form") { e.preventDefault(); doAuth(); } });
document.addEventListener("click", function (e) {
  var t = e.target.closest("[data-act]"); if (!t) return;
  var act = t.getAttribute("data-act"), id = t.getAttribute("data-key"), i = Number(t.getAttribute("data-i"));
  var fs = FB && FB.fs, db = FB && FB.db;
  if (act === "sel") { ui.sel = ui.sel === id ? null : id; render(); }
  else if (act === "unsel") { ui.sel = null; render(); }
  else if (act === "new-cup") { if (!draft || draft.mode === "edit" || draft.mode === "review") { draft = newDraft(); if (ui.view === "add") render(); } }
  else if (act === "cancel-draft") { if (readCtl) readCtl.abort(); draft = null; }
  else if (act === "edit-cup") { var c = state.cups.find(function (x) { return x.id === id; }); if (c) { draft = editDraft(c); if (c.hasPhoto && !draft.photoUrl) loadPhoto(c.id); if (ui.view === "add") render(); else location.hash = "add"; } }
  else if (act === "review") { var s = adminData.pending.find(function (x) { return x.id === id; }); if (s) { draft = reviewDraft(s); location.hash = "add"; } }
  else if (act === "reject") { ui.rejectId = id; ui.rejectNote = ""; render(); }
  else if (act === "reject-no") { ui.rejectId = null; render(); }
  else if (act === "reject-yes") {
    var b = fs.writeBatch(db);
    b.update(fs.doc(db, "submissions", id), { status: "rejected", reviewedBy: me.user.uid, reviewedAt: Date.now(), reviewNote: String(ui.rejectNote || "").trim().slice(0, 200) });
    b.delete(fs.doc(db, "submissionPhotos", id));
    b.commit().then(function () { ui.rejectId = null; flash("Submission rejected"); }).catch(function (er) { ui.error = fsErr(er); render(); });
  }
  else if (act === "withdraw") {
    var w = fs.writeBatch(db); w.delete(fs.doc(db, "submissions", id)); w.delete(fs.doc(db, "submissionPhotos", id));
    w.commit().then(function () { flash("Submission withdrawn"); }).catch(function (er) { ui.error = fsErr(er); render(); });
  }
  else if (act === "del-ask") { ui.confirmDel = id; render(); }
  else if (act === "del-no") { ui.confirmDel = null; render(); }
  else if (act === "del-yes") {
    ui.busy = true; ui.error = ""; render();
    var dl = fs.writeBatch(db); dl.delete(fs.doc(db, "cups", id)); dl.delete(fs.doc(db, "photos", id));
    dl.commit().then(function () { flash("Cup deleted"); }).catch(function (er) { ui.error = fsErr(er); }).then(function () { ui.busy = false; ui.confirmDel = null; render(); });
  }
  else if (act === "read") { readPhoto(); }
  else if (act === "stop-read") { if (readCtl) readCtl.abort(); readCtl = null; if (draft) draft.reading = false; render(); }
  else if (act === "add-row") { var free = state.players.find(function (p) { return !draft.rows.some(function (r) { return r.assign === p.id; }); }); draft.rows.push({ raw: free ? free.name : "", pts: "", assign: free ? free.id : "new", newName: "" }); render(); }
  else if (act === "rm-row") { draft.rows.splice(i, 1); render(); }
  else if (act === "save-cup") { saveDraft(); }
  else if (act === "rm-player") { settingsDraft.players.splice(i, 1); render(); }
  else if (act === "save-settings") { saveSettings(); }
  else if (act === "save-profile") { saveProfile(); }
  else if (act === "pick-color") { if (profileDraft) { profileDraft.color = id; render(); } }
  else if (act === "auth-mode") { ui.authMode = id; ui.error = ""; ui.msg = ""; render(); }
  else if (act === "google") { doGoogle(); }
  else if (act === "forgot") {
    var em = ui.form.email.trim();
    if (!em) { ui.error = "Enter your email above, then press Forgot password."; render(); return; }
    FB.a.sendPasswordResetEmail(FB.auth, em).then(function () { ui.error = ""; ui.msg = "If there's an account for " + em + ", a reset link is on its way."; render(); })
      .catch(function (er) { ui.error = authErr(er); render(); });
  }
  else if (act === "reset-pw") {
    FB.a.sendPasswordResetEmail(FB.auth, me.user.email).then(function () { ui.msg = "Password reset link sent to " + me.user.email + "."; render(); }).catch(function (er) { ui.error = authErr(er); render(); });
  }
  else if (act === "signout") { FB.a.signOut(FB.auth).then(function () { flash("Signed out"); location.hash = "standings"; }); }
  else if (act === "claim") {
    ui.busy = true; render();
    fs.setDoc(fs.doc(db, "config", "owner"), { uid: me.user.uid, claimedAt: Date.now() }).then(function () { flash("You're the league owner"); })
      .catch(function (er) { ui.error = er && er.code === "permission-denied" ? "Someone has already claimed ownership." : fsErr(er); }).then(function () { ui.busy = false; render(); });
  }
  else if (act === "save-ai") { lsSet(KEY_AI, document.getElementById("k-ai").value.trim()); ui.msg = lsGet(KEY_AI) ? "Anthropic key saved on this device." : "Anthropic key removed from this device."; render(); }
  else if (act === "delete-account") { ui.confirmDeleteAccount = true; render(); }
  else if (act === "delete-account-no") { ui.confirmDeleteAccount = false; render(); }
  else if (act === "delete-account-yes") {
    var u = me.user;
    fs.deleteDoc(fs.doc(db, "users", u.uid)).then(function () { return FB.a.deleteUser(u); })
      .then(function () { flash("Your account was deleted"); location.hash = "standings"; })
      .catch(function (er) { ui.confirmDeleteAccount = false; ui.error = er && er.code && er.code.indexOf("auth/") === 0 ? authErr(er) : fsErr(er); render(); });
  }
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
  else if (t.dataset.a) ui.form[t.dataset.a] = t.value;
  else if (t.dataset.p && profileDraft) profileDraft[t.dataset.p] = t.value;
  else if (t.dataset.rej) ui.rejectNote = t.value;
});
document.addEventListener("change", function (e) {
  var t = e.target;
  if (t.id === "photo-in") { onPhoto(t.files && t.files[0]); t.value = ""; }
  else if (t.dataset.r === "assign" && draft) { var row = draft.rows[Number(t.dataset.i)]; row.assign = t.value; if (t.value === "new" && !row.newName) row.newName = row.raw; render(); var n = document.getElementById("r-new-" + t.dataset.i); if (n) n.focus(); }
  else if (t.dataset.role) {
    var target = t.dataset.role, role = t.value;
    FB.fs.updateDoc(FB.fs.doc(FB.db, "users", target), { role: role, updatedAt: Date.now() }).then(function () { flash("Role updated"); })
      .catch(function (er) { ui.error = fsErr(er); render(); });
  }
});
document.addEventListener("dragover", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); onPhoto(e.dataTransfer.files[0]); } });

// ---------- boot ----------
var h0 = (location.hash || "").replace("#", ""); ui.view = VIEWS.indexOf(h0) >= 0 ? h0 : "standings";
render();
if (FIREBASE_CONFIG) {
  loadFirebase().then(function () { startPublicListeners(); startAuth(); })
    .catch(function () { ui.loadError = "Couldn't load the league. Check your connection and refresh."; render(); });
} else {
  // Accounts not configured yet: show the static data file read-only.
  fetch(CONFIG.legacyDataPath + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (j) { state = normalize(j); }).catch(function () { ui.loadError = "Couldn't load the league data. Refresh the page to try again."; }).then(render);
}
})();
