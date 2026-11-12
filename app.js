(function () {
"use strict";

// ---------- configuration ----------
var CONFIG = {
  supabaseUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm",
  legacyDataPath: "data/league.json",
  model: "claude-opus-5-5",
  sdkUrl: "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm"
};
var SUPABASE_CONFIG = window.SUPABASE_CONFIG || null;
var KEY_AI = "kl.anthropicKey";

var RACE_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];
var CUP_NAMES = ["Mushroom Cup", "Flower Cup", "Star Cup", "Special Cup", "Shell Cup", "Banana Cup", "Leaf Cup", "Lightning Cup", "Other"];
var COLORS = ["#E5484D", "#0090FF", "#30A46C", "#F76B15", "#8E4EC6", "#E93D82", "#12A594", "#D9A400", "#6E56CF", "#A18072", "#3E63DD", "#7C8A2E"];
var CHARACTERS = ["Mario", "Luigi", "Peach", "Daisy", "Yoshi", "Birdo", "Toad", "Toadette", "Koopa Troopa", "Diddy Kong", "Donkey Kong", "Bowser", "Bowser Jr.", "Wario", "Waluigi", "King Boo", "Rosalina", "Funky Kong", "Dry Bones", "Dry Bowser", "Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy", "Mii"];
var VIEWS = ["standings", "cups", "unclaimed", "playoffs", "rules", "add", "account", "admin"];
var DEFAULT_LEAGUE = { name: "Kart Night League", season: "Season 1", seasonWeeks: 5, cupsPerWeek: 4, playoffSpots: 4, minParticipation: 50, defaultMax: 60 };

// ---------- state ----------
var sb = null;                        // Supabase client once loaded
var state = null;                    // {league, players, cups}
var me = { ready: !SUPABASE_CONFIG, user: null, profile: null, hasOwner: true, ownerKnown: false, recovery: false };
var adminData = { pending: [], users: [], claims: [], invites: [] };
var mySubs = [], myClaims = [];
var photoCache = {};                 // cupId -> data URL | "loading" | "none"
var ui = { view: "standings", sel: null, confirmDel: null, flash: "", busy: false, error: "", loadError: "", msg: "",
  authMode: "signin", form: { email: "", password: "", name: "" }, confirmDeleteAccount: false,
  rejectId: null, rejectNote: "", claimFor: null, claimForm: { character: "", note: "" } };
var draft = null, readCtl = null, settingsDraft = null, profileDraft = null, playersDraft = null;

// ---------- helpers ----------
function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fmtDate(iso) { if (!iso) return ""; var d = new Date(iso + "T12:00:00"); if (isNaN(d)) return esc(iso); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: (d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined) }); }
function fmtDay(ts) { if (!ts) return ""; var d = new Date(ts); if (isNaN(d)) return ""; return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function fmtWhen(ms) { if (!ms) return ""; var d = new Date(ms); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; }
function posHTML(n) { return '<span class="pos' + (n <= 3 ? " p" + n : "") + '">' + n + "<sup>" + ord(n) + "</sup></span>"; }
function pctTxt(x) { return (x * 100).toFixed(1) + "%"; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function nextColor(players) { var used = players.map(function (p) { return p.color; }); for (var i = 0; i < COLORS.length; i++) if (used.indexOf(COLORS[i]) < 0) return COLORS[i]; return COLORS[players.length % COLORS.length]; }
function playerById(id) { return state.players.find(function (x) { return x.id === id; }); }
function playerName(id) { var p = playerById(id); return p ? p.name : "Unknown"; }
function signedIn() { return !!me.user; }
function isOwner() { return !!(me.profile && me.profile.role === "owner"); }
function isAdmin() { return isOwner() || !!(me.profile && me.profile.role === "admin"); }
function roleOf(u) { return u.role || "member"; }
function roleLabel(r) { return r === "owner" ? "Owner" : r === "admin" ? "Admin" : "Member"; }
function myName() { return (me.profile && me.profile.displayName) || (me.user && (me.user.email || "").split("@")[0]) || "Racer"; }
function myPlayer() { return me.user && state ? state.players.find(function (p) { return p.userId === me.user.id; }) : null; }
function seasonCups(L) { return (Number(L.seasonWeeks) || 5) * (Number(L.cupsPerWeek) || 4); }
function joinedBadge(p, long) { return p.registeredAt ? '<span class="badge" title="Registered ' + esc(fmtDay(p.registeredAt)) + '">' + (long ? "Registered " + esc(fmtDay(p.registeredAt)) : "Joined " + esc(fmtDay(p.registeredAt).replace(/, \d{4}$/, ""))) + "</span>" : (long ? '<span class="badge off">Not registered</span>' : ""); }
function charOptions(sel) { return '<option value="">—</option>' + CHARACTERS.map(function (c) { return "<option" + (c === sel ? " selected" : "") + ">" + c + "</option>"; }).join(""); }

function normalize(raw) {
  raw = raw || {};
  var L = Object.assign({}, DEFAULT_LEAGUE, raw.league || {});
  delete L.seasonLength;
  return {
    league: L,
    players: (raw.players || []).map(function (p) {
      return { id: p.id, name: p.name, color: p.color || COLORS[0], aliases: p.aliases || [], userId: p.userId || p.user_id || null, registeredAt: p.registeredAt || p.registered_at || null };
    }),
    cups: (raw.cups || []).map(function (c) {
      return Object.assign({ notes: "", hasPhoto: false }, c, {
        week: Number(c.week) || 1,
        results: (c.results || []).map(function (r, i) { return { rid: r.rid || "r" + i, p: r.p || null, pts: Number(r.pts) || 0, character: r.character || "", raw: r.raw || "" }; })
      });
    })
  };
}

// Example data, shown only while the league has no cups yet.
var DEMO = (function () {
  var names = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan"];
  var mains = [["Funky Kong", "Funky Kong", "Daisy"], ["Daisy", "Peach"], ["Rosalina", "Rosalina", "King Boo"], ["Luigi"], ["Bowser", "Dry Bowser"], ["Toad", "Baby Daisy"]];
  var players = names.map(function (n, i) { return { id: "d" + i, name: n, color: COLORS[i], aliases: [], userId: null, registeredAt: i < 4 ? "2026-09-0" + (i + 1) + "T18:00:00Z" : null }; });
  var pts = [[52, 47, 41, 38, 30, 25], [44, 55, 39, 33, 41, 0], [49, 38, 50, 29, 35, 41], [57, 42, 36, 44, 0, 31], [41, 49, 45, 37, 33, 28], [46, 51, 40, 0, 38, 35], [53, 39, 47, 41, 30, 0], [48, 44, 52, 36, 40, 29]];
  var cups = pts.map(function (row, ci) {
    var d = new Date(2026, 8, 4 + Math.floor(ci / 4) * 7);
    var results = row.map(function (p, pi) { return { rid: "r" + pi, p: "d" + pi, pts: p, character: mains[pi][ci % mains[pi].length], raw: names[pi] }; }).filter(function (r) { return r.pts > 0; });
    if (ci === 5 || ci === 7) results.push({ rid: "rx", p: null, pts: ci === 5 ? 36 : 33, character: "Yoshi", raw: "" });
    return { id: "dc" + ci, cup: CUP_NAMES[ci], date: d.toISOString().slice(0, 10), week: Math.floor(ci / 4) + 1, max: 60, notes: "", hasPhoto: false, addedAt: ci, results: results };
  });
  return { league: Object.assign({}, DEFAULT_LEAGUE), players: players, cups: cups };
})();

// ---------- original art: avatars, character chips, cup trophies, kart ----------
function hashHue(s) { var h = 0; s = String(s || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
function initials(name) { var w = String(name || "?").trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); }
function avatar(name, color, cls) { return '<span class="av' + (cls ? " " + cls : "") + '" style="--c:' + esc(color || "var(--muted)") + '" aria-hidden="true">' + esc(initials(name)) + "</span>"; }
function charChip(name, extra) {
  if (!name) return "";
  return '<span class="cchip"><span class="cdot" style="--h:' + hashHue(name) + '" aria-hidden="true">' + esc(initials(name)) + "</span>" + esc(name) + (extra ? '<span class="cx">' + extra + "</span>" : "") + "</span>";
}
var CUP_STYLE = {
  "Mushroom Cup": ["#FF5A5F", "M5 13a7 6 0 0 1 14 0zM10 13h4v5h-4z"],
  "Flower Cup": ["#FF8A1F", "M12 7a2.6 2.6 0 1 1 0 .01zM8 11a2.6 2.6 0 1 1 0 .01zM16 11a2.6 2.6 0 1 1 0 .01zM9.6 15.4a2.6 2.6 0 1 1 0 .01zM14.4 15.4a2.6 2.6 0 1 1 0 .01z"],
  "Star Cup": ["#FFD23F", "M12 5l2.1 4.4 4.8.6-3.5 3.3.9 4.8L12 15.8 7.7 18.1l.9-4.8L5.1 10l4.8-.6z"],
  "Special Cup": ["#B07CFF", "M6 16l-1-8 4 3 3-5 3 5 4-3-1 8z"],
  "Shell Cup": ["#33D17A", "M12 6a6 6 0 1 1-6 6h3a3 3 0 1 0 3-3z"],
  "Banana Cup": ["#F5E050", "M7 7c0 6 4 10 11 9-1 2-4 3-7 2-4-1-6-6-4-11z"],
  "Leaf Cup": ["#2DD4BF", "M6 18C6 10 11 6 18 6c0 7-4 12-12 12zM7 17l7-7"],
  "Lightning Cup": ["#38BDF8", "M13 4L7 13h4l-1 7 6-9h-4z"],
  "Other": ["#9AA3C7", "M8 5v14M8 5h9l-2 3 2 3H8"]
};
function cupIcon(cup, size) {
  var st = CUP_STYLE[cup] || CUP_STYLE.Other, s = size || 44;
  return '<svg class="cupicon" width="' + s + '" height="' + s + '" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path d="M14 6h20v10a10 10 0 0 1-20 0z" fill="' + st[0] + '"/>' +
    '<path d="M14 9H8a6 6 0 0 0 7 7M34 9h6a6 6 0 0 1-7 7" fill="none" stroke="' + st[0] + '" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M21 25h6v7h-6zM15 32h18l2 7H13z" fill="' + st[0] + '" opacity=".85"/>' +
    '<g transform="translate(14 2) scale(.84)"><path d="' + st[1] + '" fill="#0B0E1F" fill-opacity=".72" stroke="#0B0E1F" stroke-opacity=".72" stroke-width="1" stroke-linejoin="round"/></g></svg>';
}
function kartSVG() {
  return '<svg class="kart" viewBox="0 0 260 130" aria-hidden="true">' +
    '<g class="speed"><rect x="0" y="54" width="62" height="5" rx="2.5"/><rect x="14" y="70" width="44" height="5" rx="2.5"/><rect x="4" y="86" width="56" height="5" rx="2.5"/></g>' +
    '<ellipse cx="160" cy="118" rx="88" ry="8" fill="#000" opacity=".35"/>' +
    '<rect x="86" y="84" width="34" height="30" rx="9" fill="#14182B"/><rect x="186" y="88" width="30" height="26" rx="8" fill="#14182B"/>' +
    '<rect x="93" y="93" width="20" height="12" rx="4" fill="#3A4366"/><rect x="192" y="95" width="18" height="10" rx="4" fill="#3A4366"/>' +
    '<path d="M78 92c0-12 8-20 22-22l36-4 30-14c10-4 22-4 32 2l26 18c6 4 8 10 6 16l-2 6H82c-3 0-4-1-4-2z" fill="#FF3B48"/>' +
    '<path d="M100 74l64-10 20 8-82 12z" fill="#FFD23F"/>' +
    '<path d="M214 84l20-2c4 0 6 3 4 6l-4 6h-22z" fill="#FFD23F"/>' +
    '<path d="M70 68h20l6 18H76z" fill="#2B3152"/><rect x="66" y="64" width="30" height="7" rx="3" fill="#FF3B48"/>' +
    '<circle cx="146" cy="44" r="21" fill="#F4F6FF"/><path d="M146 23a21 21 0 0 1 20 15h-23c-3 0-4-2-3-4z" fill="#FF3B48"/>' +
    '<path d="M152 39h16a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-14z" fill="#2EC4FF"/>' +
    '<path d="M166 62l14 4" stroke="#14182B" stroke-width="5" stroke-linecap="round"/>' +
    '<rect x="96" y="96" width="14" height="4" rx="2" fill="#FFD23F"/></svg>';
}

// ---------- standings math ----------
function compute(st) {
  var L = st.league;
  var cups = st.cups.slice().sort(function (a, b) { return (a.week - b.week) || (a.date || "").localeCompare(b.date || "") || ((a.addedAt || 0) - (b.addedAt || 0)); });
  var byId = new Map(), chars = {}, unclaimed = [], byWeek = {};
  st.players.forEach(function (p) { byId.set(p.id, { player: p, cp: 0, pts: 0, max: 0, wins: 0, pods: 0, finSum: 0, best: null, log: [], trend: [], chars: {} }); });
  var cupInfo = new Map();
  cups.forEach(function (c, i) {
    byWeek[c.week] = (byWeek[c.week] || 0) + 1;
    var max = Number(c.max) || L.defaultMax;
    // Unclaimed rows are league humans too, so they keep their place in the finishing order.
    var res = c.results.filter(function (r) { return !r.p || byId.has(r.p); }).map(function (r) { return { rid: r.rid, p: r.p || null, pts: Number(r.pts) || 0, character: r.character || "", raw: r.raw }; });
    res.sort(function (a, b) { return b.pts - a.pts; });
    res.forEach(function (r, k) { r.rank = (k > 0 && r.pts === res[k - 1].pts) ? res[k - 1].rank : k + 1; });
    cupInfo.set(c.id, { num: i + 1, res: res, max: max, week: c.week });
    res.forEach(function (r) {
      if (r.character) {
        var cs = chars[r.character] || (chars[r.character] = { name: r.character, picks: 0, pts: 0, max: 0, wins: 0 });
        cs.picks++; cs.pts += r.pts; cs.max += max; if (r.rank === 1) cs.wins++;
      }
      if (!r.p) { unclaimed.push({ cup: c, num: i + 1, r: r, max: max, field: res.length }); return; }
      var s = byId.get(r.p);
      s.cp++; s.pts += r.pts; s.max += max;
      if (r.rank === 1) s.wins++;
      if (r.rank <= 3) s.pods++;
      s.finSum += r.rank;
      if (r.character) s.chars[r.character] = (s.chars[r.character] || 0) + 1;
      if (!s.best || r.pts / max > s.best.pts / s.best.max) s.best = { pts: r.pts, max: max, cup: c, num: i + 1 };
      s.log.push({ cup: c, num: i + 1, pts: r.pts, max: max, rank: r.rank, field: res.length, character: r.character });
      s.trend.push(s.pts / s.max);
    });
  });
  var total = cups.length;
  var need = total ? Math.max(1, Math.ceil(L.minParticipation / 100 * total)) : 0;
  var rows = Array.from(byId.values()).map(function (s) {
    s.pct = s.max ? s.pts / s.max : 0; s.avg = s.cp ? s.finSum / s.cp : null; s.qualified = s.cp > 0 && s.cp >= need;
    s.charList = Object.keys(s.chars).map(function (k) { return { name: k, n: s.chars[k] }; }).sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });
    s.main = s.charList[0] || null;
    return s;
  });
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
  var weeks = Object.keys(byWeek).map(Number);
  return {
    cups: cups, cupInfo: cupInfo, total: total, need: need, ranked: ranked, unranked: unranked, byId: byId, byWeek: byWeek,
    curWeek: weeks.length ? Math.max.apply(null, weeks) : 1,
    chars: Object.keys(chars).map(function (k) { return chars[k]; }).sort(function (a, b) { return b.picks - a.picks || b.wins - a.wins || a.name.localeCompare(b.name); }),
    unclaimed: unclaimed.reverse()
  };
}
function suggestWeek() {
  if (!state || !state.cups.length) return 1;
  var m = compute(state), L = state.league;
  return (m.byWeek[m.curWeek] || 0) >= L.cupsPerWeek && m.curWeek < L.seasonWeeks ? m.curWeek + 1 : m.curWeek;
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
  var real = demo ? m : compute(state);
  var L = state.league;
  document.title = L.name;
  var v = ui.view;
  if ((v === "add" && !signedIn()) || (v === "admin" && !isAdmin())) v = "account";
  var body = v === "standings" ? viewStandings(st, m, demo) : v === "cups" ? viewCups(st, m, demo) : v === "unclaimed" ? viewUnclaimed(st, m, demo)
    : v === "playoffs" ? viewPlayoffs(st, m, demo) : v === "rules" ? viewRules(L) : v === "account" ? viewAccount() : v === "admin" ? viewAdmin() : viewAdd();
  app.innerHTML = mast(L, demo ? compute(state) : real) + navHTML(v, demo ? 0 : real.unclaimed.length) + '<main class="wrap">' + body + "</main>" +
    '<footer class="wrap foot"><span>' + esc(L.name) + " · " + esc(L.season) + "</span>" + (SUPABASE_CONFIG ? '<a href="#account">' + (signedIn() ? "Your account" : "Sign in or create an account") + "</a>" : "") + "</footer>" +
    (ui.flash ? '<div class="flash" role="status">' + esc(ui.flash) + "</div>" : "");
}
function mast(L, m) {
  var W = Math.max(1, Number(L.seasonWeeks) || 5), per = Math.max(1, Number(L.cupsPerWeek) || 4), blocks = "";
  var cw = Math.min(m.curWeek, W);
  for (var w = 1; w <= W; w++) {
    var n = m.byWeek[w] || 0, segs = "";
    for (var i = 0; i < Math.max(per, n); i++) segs += '<i class="seg' + (i < n ? " on" : "") + '"></i>';
    blocks += '<div class="wk' + (w === cw && m.total ? " cur" : "") + (n >= per ? " full" : "") + '"><span>Wk ' + w + '</span><div class="track" style="grid-template-columns:repeat(' + Math.max(per, n) + ',minmax(0,1fr))">' + segs + "</div></div>";
  }
  var left = Math.max(0, W * per - m.total);
  var done = m.curWeek >= W && (m.byWeek[W] || 0) >= per;
  return '<header class="hero"><div class="sky" aria-hidden="true"></div><div class="wrap hero-in">' +
    '<div class="hero-copy"><div class="eyebrow">' + esc(L.season) + " · Regular season</div><h1>" + esc(L.name) + "</h1>" +
    '<div class="lap"><span class="lap-k">Week</span><span class="lap-v">' + cw + '<small>/' + W + "</small></span>" +
    '<span class="lap-sub">' + m.total + " cup" + (m.total === 1 ? "" : "s") + " raced · " + (done ? "regular season complete" : left + " to go") + "</span></div></div>" +
    kartSVG() + "</div>" +
    '<div class="wrap"><div class="weeks" style="grid-template-columns:repeat(' + W + ',minmax(0,1fr))" aria-hidden="true">' + blocks + "</div></div>" +
    '<div class="road" aria-hidden="true"></div></header>';
}
function navHTML(v, unclaimedCount) {
  function t(id, label, extra) { return '<a class="tab" href="#' + id + '"' + (v === id ? ' aria-current="page"' : "") + ">" + label + (extra || "") + "</a>"; }
  var right = "";
  if (SUPABASE_CONFIG) {
    var waiting = adminData.pending.length + adminData.claims.length;
    if (isAdmin()) right += t("admin", "Admin", waiting ? '<span class="soon">' + waiting + "</span>" : "");
    if (isAdmin()) right += '<a class="btn btn-primary btn-sm" href="#add" data-act="new-cup">+ Add cup</a>';
    else if (signedIn()) right += '<a class="btn btn-primary btn-sm" href="#add" data-act="new-cup">+ Submit cup</a>';
    right += signedIn()
      ? '<a class="acct' + (v === "account" ? " on" : "") + '" href="#account" title="Your account"><span class="dot" style="background:' + esc((me.profile && me.profile.color) || "var(--muted)") + '"></span>' + esc(myName()) + "</a>"
      : (me.ready ? '<a class="btn btn-sm" href="#account">Sign in</a>' : "");
  }
  return '<nav class="nav"><div class="wrap">' + t("standings", "Standings") + t("cups", "Cups") + t("unclaimed", "Unclaimed", unclaimedCount ? '<span class="soon">' + unclaimedCount + "</span>" : "") +
    t("playoffs", "Playoffs", '<span class="soon">SOON</span>') + t("rules", "Rules") + '<span class="nav-spacer"></span>' + right + "</div></nav>";
}
function demoNote() {
  return '<div class="note"><span><b>Example standings.</b> These made-up results show how the site works. They disappear when the first real cup is added.</span>' + (isAdmin() ? '<a class="btn btn-primary btn-sm" href="#add" data-act="new-cup">Add the first cup</a>' : "") + "</div>";
}
function formPips(s) {
  return '<span class="form">' + s.log.slice(-5).map(function (l) { return '<span class="pip' + (l.rank <= 3 ? " r" + l.rank : "") + '" title="' + esc(l.cup.cup) + ": " + l.rank + ord(l.rank) + " of " + l.field + (l.character ? " as " + esc(l.character) : "") + '">' + l.rank + "</span>"; }).join("") + "</span>";
}
function podiumHTML(m) {
  var top = m.ranked.slice(0, 3);
  if (top.length < 2) return "";
  var order = top.length === 3 ? [top[1], top[0], top[2]] : [top[1], top[0]];
  return '<section class="podium" aria-label="Top of the standings">' + order.map(function (s) {
    var p = s.player;
    return '<button class="step s' + s.rank + '" data-act="sel" data-key="' + esc(p.id) + '">' +
      avatar(p.name, p.color, "lg") + '<span class="pn">' + esc(p.name) + "</span>" + (s.main ? '<span class="pm">' + esc(s.main.name) + "</span>" : "") +
      '<span class="block"><span class="place">' + s.rank + "<sup>" + ord(s.rank) + '</sup></span><span class="ppct">' + pctTxt(s.pct) + "</span></span></button>";
  }).join("") + "</section>";
}
function boardHTML(list, ranked, L) {
  var out = '<div class="board" role="list">';
  list.forEach(function (s, i) {
    out += boardRow(s, ranked ? s.rank : null);
    if (ranked && i === L.playoffSpots - 1 && list.length > L.playoffSpots) out += '<div class="cutline" role="separator">Playoff line</div>';
  });
  return out + "</div>";
}
function viewStandings(st, m, demo) {
  var L = st.league, out = "";
  if (demo) out += demoNote();
  out += podiumHTML(m);
  var mostWins = m.ranked.concat(m.unranked).slice().sort(function (a, b) { return b.wins - a.wins; })[0];
  var topChar = m.chars[0];
  if (m.ranked.length) {
    out += '<div class="strip">' +
      tile("Most cup wins", mostWins && mostWins.wins ? mostWins.player.name : "None yet", mostWins && mostWins.wins ? mostWins.wins + " win" + (mostWins.wins === 1 ? "" : "s") : "") +
      tile("Most picked character", topChar ? topChar.name : "–", topChar ? topChar.picks + " pick" + (topChar.picks === 1 ? "" : "s") + " · " + pctTxt(topChar.pts / topChar.max) + " avg" : "") +
      tile("Qualifying mark", m.need + " cup" + (m.need === 1 ? "" : "s"), L.minParticipation + "% of cups played so far") +
      "</div>";
  }
  out += '<section class="section-h"><h2>Standings</h2><span class="muted small">Ranked by points percentage · top ' + L.playoffSpots + " make the playoffs</span></section>";
  if (!m.ranked.length) out += '<div class="panel empty"><b>No qualified players yet.</b><span class="muted">Players appear here once they have played ' + m.need + " cups.</span></div>";
  else out += boardHTML(m.ranked, true, L);
  if (m.unranked.length) {
    out += '<section class="section-h"><h2>Not yet qualified</h2><span class="muted small">Need ' + m.need + " cups to be ranked</span></section>";
    out += boardHTML(m.unranked, false, L);
  }
  var sel = ui.sel && m.byId.get(ui.sel);
  if (sel && sel.cp) out += detailHTML(sel);
  else if (m.ranked.length) out += '<p class="muted small" style="margin:0">Select a racer to see their season and character picks.</p>';
  if (m.chars.length) out += charChartHTML(m.chars);
  return out;
}
function charChartHTML(chars) {
  var top = chars.slice(0, 10), most = top[0].picks;
  return '<section class="section-h"><h2>Most picked characters</h2><span class="muted small">Every league result with a character, unclaimed ones included</span></section>' +
    '<div class="panel panel-pad chars">' + top.map(function (c) {
      return '<div class="char-row"><span class="cn">' + charChip(c.name) + '</span><span class="hbar"><i style="width:' + (c.picks / most * 100).toFixed(1) + '%;background:hsl(' + hashHue(c.name) + ' 80% 60%)"></i></span><span class="cs num">' + c.picks + ' <span class="muted">pick' + (c.picks === 1 ? "" : "s") + " · " + pctTxt(c.pts / c.max) + " avg · " + c.wins + " win" + (c.wins === 1 ? "" : "s") + "</span></span></div>";
    }).join("") + "</div>";
}
function tile(k, v, s) { return '<div class="tile"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span><span class="s">' + esc(s) + "</span></div>"; }
function boardRow(s, rank) {
  var p = s.player;
  return '<div class="brow' + (ui.sel === p.id ? " sel" : "") + (rank && rank <= 3 ? " top" : "") + '" role="listitem" data-act="sel" data-key="' + esc(p.id) + '" tabindex="0" style="--c:' + esc(p.color) + '">' +
    '<div class="bpos">' + (rank ? posHTML(rank) : '<span class="pos">–</span>') + "</div>" +
    '<div class="bwho">' + avatar(p.name, p.color) + '<div class="who-txt"><span class="name">' + esc(p.name) + (p.registeredAt ? " " + joinedBadge(p) : "") + "</span>" +
      (s.main ? charChip(s.main.name, "×" + s.main.n) : '<span class="muted small">No character yet</span>') + "</div></div>" +
    '<div class="bpct"><span class="pct">' + pctTxt(s.pct) + '</span><div class="bar"><i style="width:' + (s.pct * 100).toFixed(1) + '%"></i></div><span class="muted small num">' + s.pts + "/" + s.max + " pts</span></div>" +
    '<div class="bstats"><span><b class="num">' + s.cp + "</b> cups</span><span><b class=\"num\">" + s.wins + "</b> wins</span><span><b class=\"num\">" + s.pods + "</b> podiums</span>" +
      (rank && rank > 1 ? '<span><b class="num">−' + s.back.toFixed(1) + "</b> back</span>" : "") + formPips(s) + "</div></div>";
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
  var log = s.log.slice().reverse().map(function (l) { return '<tr><td class="l num">' + l.num + '</td><td class="l">' + esc(l.cup.cup) + ' <span class="muted small">wk ' + l.cup.week + '</span></td><td class="l">' + (l.character ? charChip(l.character) : "–") + '</td><td class="num">' + l.pts + '<span class="muted">/' + l.max + '</span></td><td class="num">' + l.rank + ord(l.rank) + '<span class="muted"> of ' + l.field + "</span></td></tr>"; }).join("");
  var charRows = s.charList.length ? s.charList.map(function (c) {
    var picks = s.log.filter(function (l) { return l.character === c.name; });
    var pts = picks.reduce(function (a, l) { return a + l.pts; }, 0), max = picks.reduce(function (a, l) { return a + l.max; }, 0);
    return '<div class="char-row"><span class="cn">' + charChip(c.name) + '</span><span class="hbar"><i style="width:' + (c.n / s.charList[0].n * 100).toFixed(1) + "%;background:" + esc(p.color) + '"></i></span><span class="cs num">' + c.n + '<span class="muted"> · ' + pctTxt(pts / max) + "</span></span></div>";
  }).join("") : '<p class="muted small" style="margin:0">No characters recorded yet.</p>';
  return '<section class="panel panel-pad detail"><div class="detail-head">' + avatar(p.name, p.color, "lg") + "<h3>" + esc(p.name) + "</h3>" + joinedBadge(p, true) + '<span class="nav-spacer"></span><button class="btn btn-sm" data-act="unsel">Close</button></div>' +
    '<div class="stats">' + stat("Pct", pctTxt(s.pct)) + stat("Points", s.pts + "/" + s.max) + stat("Cups", s.cp) + stat("Wins", s.wins) + stat("Podiums", s.pods) + stat("Avg finish", s.avg != null ? s.avg.toFixed(2) : "–") + stat("Main", s.main ? s.main.name : "–") + "</div>" +
    '<div class="cols"><div style="display:grid;gap:14px"><div><div class="eyebrow" style="margin-bottom:6px">Season pct, cup by cup</div>' + sparkSVG(s.trend) + '</div><div><div class="eyebrow" style="margin-bottom:6px">Character picks</div><div class="chars">' + charRows + "</div></div></div>" +
    '<div style="min-width:0"><div class="eyebrow" style="margin-bottom:6px">Cup log</div><div style="overflow-x:auto"><table class="mini"><thead><tr><th class="l">#</th><th class="l">Cup</th><th class="l">Character</th><th>Pts</th><th>Finish</th></tr></thead><tbody>' + log + "</tbody></table></div></div></div></section>";
}
function stat(k, v) { return '<div class="stat"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + "</span></div>"; }

function viewCups(st, m, demo) {
  var out = "";
  if (demo) out += demoNote();
  out += '<section class="section-h"><h2>Cup log</h2><span class="muted small">' + m.total + " cup" + (m.total === 1 ? "" : "s") + " recorded · newest week first</span></section>";
  if (!m.cups.length) return out + '<div class="panel empty"><b>No cups yet.</b></div>';
  var lastWeek = null;
  out += '<div class="cup-list">';
  m.cups.slice().reverse().forEach(function (c) {
    var info = m.cupInfo.get(c.id);
    if (c.week !== lastWeek) { lastWeek = c.week; out += '<h3 class="wk-h">Week ' + c.week + ' <span class="muted small">' + (m.byWeek[c.week] || 0) + " cup" + (m.byWeek[c.week] === 1 ? "" : "s") + "</span></h3>"; }
    var rows = info.res.map(function (r) {
      var p = r.p ? st.players.find(function (x) { return x.id === r.p; }) : null;
      var who = p ? avatar(p.name, p.color, "sm") + esc(p.name) : '<span class="av sm q" aria-hidden="true">?</span><a class="unc" href="#unclaimed">Unclaimed</a>';
      return '<div class="res-row"><span class="r' + (r.rank <= 3 ? " p" + r.rank : "") + '">' + r.rank + '</span><span class="n">' + who + (r.character ? '<span class="ch">' + esc(r.character) + "</span>" : "") + '</span><span class="hbar"><i style="width:' + (r.pts / info.max * 100).toFixed(1) + "%;background:" + esc(p ? p.color : "var(--muted)") + '"></i></span><span class="t">' + r.pts + '<span class="muted">/' + info.max + "</span></span></div>";
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
    out += '<article class="panel cup"><div style="min-width:0"><div class="cup-head">' + cupIcon(c.cup) + '<span class="cup-no">#' + info.num + '</span><span class="cup-name">' + esc(c.cup) + '</span><span class="muted small">' + fmtDate(c.date) + (info.max !== 60 ? " · max " + info.max + " pts" : "") + "</span></div>" +
      (c.notes ? '<p class="small muted" style="margin:6px 0 0">' + esc(c.notes) + "</p>" : "") +
      '<div class="res">' + rows + "</div>" + actions + "</div>" + photo + "</article>";
  });
  return out + "</div>" + (ui.error ? '<div class="error">' + esc(ui.error) + "</div>" : "");
}

function viewUnclaimed(st, m, demo) {
  var out = (demo ? demoNote() : "") + '<section class="section-h"><h2>Unclaimed points</h2><span class="muted small">' + m.unclaimed.length + " result" + (m.unclaimed.length === 1 ? "" : "s") + "</span></section>" +
    '<p class="muted" style="margin:0;max-width:68ch">These came from highlighted (human) rows on a results photo that weren\'t matched to a player. If one was you, press <b>That was me</b>, fix the character if it\'s wrong, and an admin will add the points to your record.</p>';
  if (!m.unclaimed.length) return out + '<div class="panel empty"><b>Nothing unclaimed.</b><span class="muted">Every human result is matched to a player.</span></div>';
  var mine = myPlayer();
  if (ui.error && ui.view === "unclaimed") out += '<div class="error">' + esc(ui.error) + "</div>";
  out += '<div class="tbl-wrap"><table class="mini unc-tbl"><thead><tr><th class="l">Cup</th><th class="l">Character</th><th>Points</th><th>Finish</th><th class="l"></th></tr></thead><tbody>' +
    m.unclaimed.map(function (u) {
      var key = u.cup.id + "|" + u.r.rid, act;
      var pending = myClaims.find(function (c) { return c.cupId === u.cup.id && c.rid === u.r.rid && c.status === "pending"; });
      var inCup = mine && m.cupInfo.get(u.cup.id).res.some(function (r) { return r.p === mine.id; });
      if (demo) act = '<span class="muted small">Example</span>';
      else if (!signedIn()) act = '<a class="btn btn-sm" href="#account">Sign in to claim</a>';
      else if (pending) act = '<span class="chip st-pending">Requested</span> <button class="btn-link small" data-act="withdraw-claim" data-key="' + esc(pending.id) + '">Withdraw</button>';
      else if (inCup) act = '<span class="muted small">You already have a result in this cup</span>';
      else act = '<button class="btn btn-sm btn-primary" data-act="claim-open" data-key="' + esc(key) + '" data-char="' + esc(u.r.character) + '">That was me</button>';
      var row = '<tr><td class="l"><span class="ucup">' + cupIcon(u.cup.cup, 34) + '<span><b>#' + u.num + " " + esc(u.cup.cup) + '</b><br><span class="muted small">Week ' + u.cup.week + " · " + fmtDate(u.cup.date) + '</span></span></span></td><td class="l">' + (u.r.character ? charChip(u.r.character) : '<span class="muted">Unknown</span>') + '</td><td class="num">' + u.r.pts + '<span class="muted">/' + u.max + '</span></td><td class="num">' + u.r.rank + ord(u.r.rank) + '<span class="muted"> of ' + u.field + '</span></td><td class="l">' + act + "</td></tr>";
      if (ui.claimFor === key) {
        row += '<tr class="claim-form"><td colspan="5"><div class="keyrow"><label class="f" for="cl-char">You raced as<select id="cl-char" data-cl="character">' + charOptions(ui.claimForm.character) + '</select></label>' +
          '<label class="f" for="cl-note" style="flex:1 1 220px">Note for the admin (optional)<input id="cl-note" maxlength="200" data-cl="note" value="' + esc(ui.claimForm.note) + '" placeholder="e.g. I was the green Yoshi"></label>' +
          '<button class="btn btn-primary btn-sm" data-act="claim-send" data-key="' + esc(key) + '"' + (ui.busy ? " disabled" : "") + ">Send request</button><button class=\"btn btn-sm\" data-act=\"claim-cancel\">Cancel</button></div>" +
          (mine ? "" : '<p class="small muted" style="margin:6px 0 0">You don\'t have a league player yet. One is created for you when an admin approves this.</p>') + "</td></tr>";
      }
      return row;
    }).join("") + "</tbody></table></div>";
  return out;
}

function viewPlayoffs(st, m, demo) {
  var L = st.league, K = Number(L.playoffSpots) || 4;
  var seeds = m.ranked.slice(0, K);
  var out = '<section class="panel soon-hero"><div class="flag" aria-hidden="true"></div><div class="eyebrow">Playoffs</div><h2>Coming soon</h2><p style="margin:0;max-width:60ch">The playoff bracket opens after the regular season ends with week ' + L.seasonWeeks + ". The top " + K + " qualified players by points percentage get in. Format, race count and seeding perks will be announced before then.</p></section>";
  if (seeds.length >= 2) {
    out += '<section class="section-h"><h2>If the season ended today</h2><span class="muted small">' + (demo ? "From the example standings" : "Projected from current standings") + "</span></section>";
    var pairs = []; for (var i = 0; i < Math.floor(seeds.length / 2); i++) pairs.push([seeds[i], seeds[seeds.length - 1 - i], i + 1, seeds.length - i]);
    out += '<div class="bracket">' + pairs.map(function (pr) {
      return '<div class="match">' + [0, 1].map(function (j) { var s = pr[j]; return '<div><span class="seed">' + pr[2 + j] + "</span>" + avatar(s.player.name, s.player.color, "sm") + '<span class="name">' + esc(s.player.name) + '</span><span class="nav-spacer"></span><span class="num muted small">' + pctTxt(s.pct) + "</span></div>"; }).join("") + "</div>";
    }).join("") + (seeds.length % 2 ? '<div class="match"><div><span class="seed">' + Math.ceil(seeds.length / 2) + '</span><span class="name">' + esc(seeds[Math.floor(seeds.length / 2)].player.name) + '</span><span class="nav-spacer"></span><span class="chip">Bye</span></div></div>' : "") + "</div>";
  }
  return out;
}

function viewRules(L) {
  var pt = RACE_POINTS.map(function (p, i) { return "<span><b>" + p + "</b><small>" + (i + 1) + ord(i + 1) + "</small></span>"; }).join("");
  return '<section class="section-h"><h2>Regular season rules</h2><span class="muted small">' + esc(L.season) + "</span></section>" +
    '<div class="panel panel-pad rules"><ol>' +
    "<li><h4>Season format</h4><p>The regular season runs " + L.seasonWeeks + " weeks with about " + L.cupsPerWeek + " cups a week (" + seasonCups(L) + " cups). Each cup is 4 races.</p></li>" +
    "<li><h4>Race scoring</h4><p>Every race is scored with the game's 12-racer points table, so the most anyone can score in a cup is " + L.defaultMax + ' points.</p><div class="ptable">' + pt + "</div></li>" +
    "<li><h4>Standard settings</h4><p>150cc, CPUs on Hard, items Normal, any character and any kart or bike. If a cup is raced with settings that change the points available (no CPUs, fewer races), the admins record that cup's max points so percentages stay fair.</p></li>" +
    "<li><h4>The photo is the record</h4><p>When a cup ends, someone photographs the final results screen before anyone presses a button. Human players' rows are highlighted; each one is recorded with its character and points. CPU rows don't count. Any member can submit the photo; an admin approves it.</p></li>" +
    "<li><h4>Unclaimed points</h4><p>A highlighted row that isn't matched to a player goes on the Unclaimed page. If it was you, request it there and fix the character if needed. Once an admin approves, the points count for you. Unclaimed rows still hold their place in that cup's finishing order.</p></li>" +
    "<li><h4>Ranking stat: points percentage</h4><p>Your rank is your points earned divided by the points you could have earned in the cups you played. Missing a cup doesn't lower your percentage.</p></li>" +
    "<li><h4>Qualifying</h4><p>To be ranked you must have played at least " + L.minParticipation + "% of the cups held so far, rounded up. Everyone else is listed under Not yet qualified until they catch up.</p></li>" +
    "<li><h4>Cup wins and podiums</h4><p>Finishing order counts human players only. The most points in a cup wins it; 2nd and 3rd complete the podium. Players tied on points share the place.</p></li>" +
    "<li><h4>Tiebreakers</h4><p>Equal percentages are split by, in order: cup wins, head-to-head points across cups both players played, total points, then a single-race runoff on a track an admin picks.</p></li>" +
    "<li><h4>Abandoned cups</h4><p>A cup that isn't finished (power cut, rage quit, controller disconnect that ends it) doesn't count and is raced again from the start.</p></li>" +
    "<li><h4>Playoffs</h4><p>After week " + L.seasonWeeks + " the standings lock and the top " + L.playoffSpots + " qualified players advance to the playoffs.</p></li>" +
    "<li><h4>Disputes</h4><p>The photo settles it. If a photo is unreadable, players in that cup agree on the scores or the cup is replayed. Admins can correct any recorded cup.</p></li>" +
    "</ol></div>";
}

// ---------- account page ----------
function viewAccount() {
  if (!SUPABASE_CONFIG) return '<div class="panel empty"><b>Accounts aren\'t switched on yet.</b></div>';
  if (!me.ready) return '<div class="loading"><span class="spin"></span>Checking your sign-in…</div>';
  if (!signedIn()) return authFormHTML();
  var p = profileDraft || (profileDraft = me.profile ? { displayName: me.profile.displayName || "", color: me.profile.color || COLORS[0], favoriteCharacter: me.profile.favoriteCharacter || "", favoriteVehicle: me.profile.favoriteVehicle || "" } : null);
  var role = (me.profile && me.profile.role) || "member";
  var out = '<section class="section-h"><h2>Your account</h2><span class="chip">' + roleLabel(role) + "</span></section>";
  if (me.recovery) out += '<div class="panel panel-pad keys"><b>Set a new password</b>' + pwFormHTML() + "</div>";
  if (ui.msg) out += '<div class="note">' + esc(ui.msg) + "</div>";
  if (me.ownerKnown && !me.hasOwner) {
    out += '<div class="panel panel-pad keys"><b>This league has no owner yet.</b><p style="margin:0">The owner is the permanent admin: they can promote other admins and can\'t be demoted. Only claim this if you run the league. It can be claimed once.</p><div><button class="btn btn-primary" data-act="claim"' + (ui.busy ? " disabled" : "") + ">Claim league ownership</button></div></div>";
  }
  if (!p) return out + '<div class="loading"><span class="spin"></span>Setting up your profile…</div>';

  var pl = myPlayer();
  out += '<div class="panel panel-pad keys"><div class="eyebrow">Your league player</div>' + (pl
    ? '<div class="who"><span class="dot" style="background:' + esc(pl.color) + '"></span><b>' + esc(pl.name) + "</b>" + joinedBadge(pl, true) + '<a class="btn-link small" href="#standings" data-act="sel-go" data-key="' + esc(pl.id) + '">See your season</a></div>'
    : '<p style="margin:0">Your account isn\'t linked to a league player yet. Find your results on the <a href="#unclaimed">Unclaimed</a> page and request them, or ask an admin to link you.</p>') + "</div>";

  var swatches = COLORS.map(function (c) { return '<button type="button" class="swatch' + (p.color === c ? " on" : "") + '" style="background:' + c + '" data-act="pick-color" data-key="' + c + '" aria-label="Color ' + c + '"' + (p.color === c ? ' aria-pressed="true"' : "") + "></button>"; }).join("");
  out += '<div class="panel panel-pad keys"><div class="eyebrow">Profile</div><div class="form-grid">' +
    '<label class="f" for="p-name">Display name<input id="p-name" maxlength="40" data-p="displayName" value="' + esc(p.displayName) + '"></label>' +
    '<label class="f" for="p-char">Favorite character<select id="p-char" data-p="favoriteCharacter">' + charOptions(p.favoriteCharacter) + "</select></label>" +
    '<label class="f" for="p-veh">Favorite kart or bike<input id="p-veh" maxlength="40" data-p="favoriteVehicle" value="' + esc(p.favoriteVehicle) + '" placeholder="e.g. Flame Runner"></label></div>' +
    '<div><div class="f" style="margin-bottom:6px">Color</div><div class="swatches">' + swatches + "</div></div>" +
    (ui.error && ui.view === "account" ? '<div class="error">' + esc(ui.error) + "</div>" : "") +
    '<div><button class="btn btn-primary" data-act="save-profile"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Saving…" : "Save profile") + "</button></div></div>";

  out += '<section class="section-h"><h2>Your point requests</h2><a class="btn btn-sm" href="#unclaimed">Unclaimed points</a></section>';
  if (!myClaims.length) out += '<p class="muted small" style="margin:0">Requests you make on the Unclaimed page show up here.</p>';
  else out += '<div class="tbl-wrap"><table class="mini"><thead><tr><th class="l">Cup</th><th class="l">Character</th><th class="l">Sent</th><th class="l">Status</th><th></th></tr></thead><tbody>' +
    myClaims.map(function (c) {
      var cup = state.cups.find(function (x) { return x.id === c.cupId; });
      return '<tr><td class="l">' + esc(cup ? cup.cup + " · wk " + cup.week : "Deleted cup") + '</td><td class="l">' + esc(c.character || "–") + '</td><td class="l muted">' + fmtWhen(c.createdAt) + '</td><td class="l"><span class="chip st-' + esc(c.status) + '">' + esc(c.status) + "</span>" + (c.reviewNote ? ' <span class="small muted">' + esc(c.reviewNote) + "</span>" : "") + "</td><td>" +
        (c.status === "pending" ? '<button class="btn btn-sm" data-act="withdraw-claim" data-key="' + esc(c.id) + '">Withdraw</button>' : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>";

  out += '<section class="section-h"><h2>Your submissions</h2><a class="btn btn-sm" href="#add" data-act="new-cup">' + (isAdmin() ? "+ Add cup" : "+ Submit a cup") + "</a></section>";
  if (!mySubs.length) out += '<p class="muted small" style="margin:0">' + (isAdmin() ? "As an admin, cups you add go straight into the standings." : "Cups you submit show up here while an admin reviews them.") + "</p>";
  else out += '<div class="tbl-wrap"><table class="mini"><thead><tr><th class="l">Cup</th><th class="l">Raced</th><th class="l">Sent</th><th class="l">Status</th><th></th></tr></thead><tbody>' +
    mySubs.map(function (s) {
      return '<tr><td class="l">' + esc(s.cup) + " · wk " + s.week + '</td><td class="l">' + fmtDate(s.date) + '</td><td class="l muted">' + fmtWhen(s.submittedAt) + '</td><td class="l"><span class="chip st-' + esc(s.status) + '">' + esc(s.status) + "</span>" + (s.reviewNote ? ' <span class="small muted">' + esc(s.reviewNote) + "</span>" : "") + "</td><td>" +
        (s.status === "pending" ? '<button class="btn btn-sm" data-act="withdraw" data-key="' + esc(s.id) + '">Withdraw</button>' : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>";

  var isPw = (me.user.identities || []).some(function (d) { return d.provider === "email"; }) || (me.user.app_metadata && me.user.app_metadata.provider === "email");
  var ak = lsGet(KEY_AI);
  out += '<section class="section-h"><h2>Sign-in and security</h2></section><div class="panel panel-pad keys">' +
    '<div class="small">Signed in as <b>' + esc(me.user.email || "") + "</b>" + (isPw ? " with a password" : " with Google") + ".</div>" +
    '<div class="keyrow">' + (isPw ? '<button class="btn btn-sm" data-act="change-pw">Change password</button>' : "") + '<button class="btn btn-sm" data-act="signout">Sign out</button></div>' +
    (isPw && ui.changingPw ? pwFormHTML() : "") +
    '<div><label class="f" for="k-ai">Anthropic API key (optional, this device only)</label><div class="keyrow"><input id="k-ai" type="password" autocomplete="off" placeholder="sk-ant-…" value="' + esc(ak) + '"><button class="btn btn-sm" data-act="save-ai">Save</button>' + (ak ? '<span class="ok small">Saved</span>' : "") + "</div>" +
    '<p class="small muted" style="margin:6px 0 0">With a key, Claude reads each highlighted player\'s character and points from a results photo for you. It\'s stored in this browser only and costs a few cents per photo. Create one in the <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a> and set a spend limit.</p></div>' +
    (isOwner() ? "" : ui.confirmDeleteAccount
      ? '<div class="keyrow"><span class="small"><b>Delete your account?</b> Your profile is removed and you\'re signed out. Your league player and its results stay.</span><button class="btn btn-danger btn-sm" data-act="delete-account-yes">Delete account</button><button class="btn btn-sm" data-act="delete-account-no">Keep it</button></div>'
      : '<div><button class="btn-link small" data-act="delete-account">Delete my account</button></div>') +
    "</div>";
  return out;
}
function pwFormHTML() {
  return '<div class="keyrow"><input id="new-pw" type="password" autocomplete="new-password" minlength="6" placeholder="New password (6+ characters)" data-a="newPassword" value="' + esc(ui.form.newPassword || "") + '"><button class="btn btn-primary btn-sm" data-act="set-pw"' + (ui.busy ? " disabled" : "") + ">Save password</button></div>";
}
function authFormHTML() {
  var up = ui.authMode === "signup", f = ui.form;
  return '<section class="section-h"><h2>' + (up ? "Create an account" : "Sign in") + "</h2></section>" +
    '<div class="panel panel-pad keys" style="max-width:440px">' +
    (up ? '<p class="small muted" style="margin:0">If an admin already added you as a player, sign up with the email they used and your results link up automatically once you confirm it.</p>' : "") +
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
function profileName(id) { var u = adminData.users.find(function (x) { return x.id === id; }); return u ? (u.displayName || u.email) : "A member"; }
function viewAdmin() {
  var m = compute(state);
  var out = (ui.error && ui.view === "admin" ? '<div class="error">' + esc(ui.error) + "</div>" : "");
  // point claims
  out += '<section class="section-h"><h2>Point requests</h2><span class="muted small">' + adminData.claims.length + " waiting</span></section>";
  if (!adminData.claims.length) out += '<p class="muted small" style="margin:0">Nothing waiting. Requests for unclaimed points appear here.</p>';
  else out += '<div class="cup-list">' + adminData.claims.slice().sort(function (a, b) { return a.createdAt - b.createdAt; }).map(function (c) {
    var cup = state.cups.find(function (x) { return x.id === c.cupId; }), info = cup && m.cupInfo.get(cup.id);
    var r = info && info.res.find(function (x) { return x.rid === c.rid; });
    var pl = state.players.find(function (p) { return p.userId === c.userId; });
    var others = adminData.claims.filter(function (x) { return x.id !== c.id && x.cupId === c.cupId && x.rid === c.rid; }).length;
    return '<article class="panel panel-pad" style="display:grid;gap:8px"><div class="cup-head"><b>' + esc(profileName(c.userId)) + '</b><span class="muted small">asks for</span><span class="cup-name">' + esc(cup ? cup.cup : "a deleted cup") + "</span>" + (cup ? '<span class="muted small">week ' + cup.week + " · " + fmtDate(cup.date) + "</span>" : "") + "</div>" +
      '<div class="small">' + (r ? "<b>" + r.pts + "/" + info.max + "</b> pts · " + r.rank + ord(r.rank) + " of " + info.res.length + " · photo says <b>" + esc(r.character || "unknown") + "</b>" + (c.character && c.character !== r.character ? ", they say <b>" + esc(c.character) + "</b>" : "") : '<span class="error">These points are no longer unclaimed.</span>') +
      (c.note ? ' · "' + esc(c.note) + '"' : "") + "</div>" +
      '<div class="small muted">' + (pl ? "Points go to their player <b>" + esc(pl.name) + "</b>." : "They don't have a player yet; approving creates one.") + (others ? " " + others + " other request" + (others === 1 ? "" : "s") + " for the same result will be declined." : "") + "</div>" +
      (ui.rejectId === "c:" + c.id
        ? '<div class="keyrow"><input id="rej-note" data-rej="1" maxlength="200" placeholder="Reason (shown to them)" value="' + esc(ui.rejectNote) + '"><button class="btn btn-danger btn-sm" data-act="claim-reject-yes" data-key="' + esc(c.id) + '">Decline</button><button class="btn btn-sm" data-act="reject-no">Cancel</button></div>'
        : '<div class="keyrow"><button class="btn btn-primary btn-sm" data-act="claim-approve" data-key="' + esc(c.id) + '"' + (ui.busy || !r ? " disabled" : "") + '>Approve</button><button class="btn btn-sm" data-act="claim-reject" data-key="' + esc(c.id) + '">Decline</button></div>') +
      "</article>";
  }).join("") + "</div>";

  // submissions
  out += '<section class="section-h"><h2>Submissions to review</h2><span class="muted small">' + adminData.pending.length + " waiting</span></section>";
  if (!adminData.pending.length) out += '<p class="muted small" style="margin:0">Nothing waiting. Cups that members submit appear here.</p>';
  else out += '<div class="cup-list">' + adminData.pending.slice().sort(function (a, b) { return a.submittedAt - b.submittedAt; }).map(function (s) {
    var rows = (s.rows || []).filter(function (r) { return r.assign !== "ignore"; });
    return '<article class="panel panel-pad" style="display:grid;gap:10px"><div class="cup-head"><span class="cup-name">' + esc(s.cup) + '</span><span class="muted small">week ' + s.week + " · raced " + fmtDate(s.date) + " · sent by " + esc(s.submitterName || "a member") + " " + fmtWhen(s.submittedAt) + (s.hasPhoto ? " · photo attached" : "") + "</span></div>" +
      '<div class="small">' + rows.map(function (r) { return "<b>" + esc(r.assign === "new" ? r.newName + " (new)" : r.assign === "unclaimed" ? "Unclaimed" : playerName(r.assign)) + "</b> " + esc(r.pts) + (r.character ? ' <span class="muted">' + esc(r.character) + "</span>" : ""); }).join(" · ") + "</div>" +
      (ui.rejectId === "s:" + s.id
        ? '<div class="keyrow"><input id="rej-note" data-rej="1" maxlength="200" placeholder="Reason (shown to the member)" value="' + esc(ui.rejectNote) + '"><button class="btn btn-danger btn-sm" data-act="reject-yes" data-key="' + esc(s.id) + '">Reject</button><button class="btn btn-sm" data-act="reject-no">Cancel</button></div>'
        : '<div class="keyrow"><button class="btn btn-primary btn-sm" data-act="review" data-key="' + esc(s.id) + '">Review and approve</button><button class="btn btn-sm" data-act="reject" data-key="' + esc(s.id) + '">Reject</button></div>') +
      "</article>";
  }).join("") + "</div>";

  out += playersHTML(m);
  out += settingsHTML();
  out += '<section class="section-h"><h2>Members and roles</h2><span class="muted small">' + adminData.users.length + " account" + (adminData.users.length === 1 ? "" : "s") + "</span></section>";
  out += '<div class="tbl-wrap"><table class="mini"><thead><tr><th class="l">Name</th><th class="l">Email</th><th class="l">Player</th><th class="l">Role</th></tr></thead><tbody>' +
    adminData.users.slice().sort(function (a, b) { return (a.displayName || "").localeCompare(b.displayName || ""); }).map(function (u) {
      var r = roleOf(u), pl = state.players.find(function (p) { return p.userId === u.id; });
      var ctl = r === "owner" ? '<span class="chip">Owner</span>'
        : '<select data-role="' + esc(u.id) + '" aria-label="Role for ' + esc(u.displayName) + '"><option value="member"' + (r === "member" ? " selected" : "") + '>Member</option><option value="admin"' + (r === "admin" ? " selected" : "") + ">Admin</option></select>";
      return '<tr><td class="l"><span class="who"><span class="dot" style="background:' + esc(u.color || "var(--muted)") + '"></span>' + esc(u.displayName || "—") + (me.user && u.id === me.user.id ? ' <span class="muted small">(you)</span>' : "") + '</span></td><td class="l small muted">' + esc(u.email || "") + '</td><td class="l small">' + (pl ? esc(pl.name) : '<span class="muted">—</span>') + '</td><td class="l">' + ctl + "</td></tr>";
    }).join("") + "</tbody></table></div>";
  return out;
}
function playersHTML(m) {
  if (!playersDraft) playersDraft = state.players.map(function (p) {
    var inv = adminData.invites.find(function (i) { return i.playerId === p.id; });
    return { id: p.id, name: p.name, color: p.color, email: inv ? inv.email : "", userId: p.userId || "", registeredAt: p.registeredAt, isNew: false, remove: false };
  });
  var acctOpts = function (sel) { return '<option value="">— Not linked —</option>' + adminData.users.map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === sel ? " selected" : "") + ">" + esc((u.displayName || "") + " · " + (u.email || "")) + "</option>"; }).join(""); };
  var rows = playersDraft.map(function (p, i) {
    var cups = (m.byId.get(p.id) || { cp: 0 }).cp;
    var status = p.userId ? '<span class="badge">' + (p.registeredAt ? "Joined " + esc(fmtDay(p.registeredAt)) : "Linked") + "</span>" : p.email ? '<span class="badge off">Invited</span>' : '<span class="badge off">No account</span>';
    return '<tr class="' + (p.remove ? "ign" : "") + '"><td><span class="dot" style="background:' + esc(p.color) + '"></span></td>' +
      '<td class="l"><input id="pl-n-' + i + '" data-pl="name" data-i="' + i + '" maxlength="40" value="' + esc(p.name) + '" aria-label="Player name"></td>' +
      '<td class="l"><input id="pl-e-' + i + '" type="email" data-pl="email" data-i="' + i + '" value="' + esc(p.email) + '" placeholder="their@email.com" aria-label="Invite email"></td>' +
      '<td class="l"><select id="pl-u-' + i + '" data-pl="userId" data-i="' + i + '" aria-label="Linked account">' + acctOpts(p.userId) + "</select></td>" +
      '<td class="l">' + status + '</td><td class="num">' + cups + "</td>" +
      "<td>" + (cups ? "" : '<button class="btn btn-sm" data-act="pl-remove" data-i="' + i + '">' + (p.remove ? "Undo" : "Remove") + "</button>") + "</td></tr>";
  }).join("");
  return '<section class="section-h"><h2>Players and accounts</h2><span class="muted small">' + state.players.length + " player" + (state.players.length === 1 ? "" : "s") + "</span></section>" +
    '<div class="panel panel-pad" style="display:grid;gap:12px"><p class="small muted" style="margin:0;max-width:72ch">Add people before they sign up. Put their email on the player: when they create an account with that email and confirm it, the account is linked automatically and their registration date shows as a badge. You can also link an existing account by hand.</p>' +
    (playersDraft.length ? '<div style="overflow-x:auto"><table class="mini rows-tbl"><thead><tr><th></th><th class="l">Name</th><th class="l">Invite email</th><th class="l">Account</th><th class="l">Status</th><th>Cups</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : "") +
    '<div class="keyrow"><button class="btn btn-sm" data-act="pl-add">+ Add player</button><button class="btn btn-primary btn-sm" data-act="pl-save"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Saving…" : "Save players") + "</button></div></div>";
}
function settingsHTML() {
  var s = settingsDraft || (settingsDraft = clone(state.league));
  return '<section class="section-h"><h2>League settings</h2><span class="muted small">Admins only</span></section>' +
    '<div class="panel panel-pad" style="display:grid;gap:16px"><div class="form-grid">' +
    field("League name", "set-name", "text", s.name, "name") +
    field("Season", "set-season", "text", s.season, "season") +
    field("Weeks in regular season", "set-weeks", "number", s.seasonWeeks, "seasonWeeks") +
    field("Cups per week", "set-per", "number", s.cupsPerWeek, "cupsPerWeek") +
    field("Playoff spots", "set-spots", "number", s.playoffSpots, "playoffSpots") +
    field("Qualifying % of cups", "set-min", "number", s.minParticipation, "minParticipation") +
    field("Default max points per cup", "set-max", "number", s.defaultMax, "defaultMax") +
    '</div><div><button class="btn btn-primary" data-act="save-settings"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Saving…" : "Save settings") + "</button></div></div>";
}
function field(label, id, type, val, key) { return '<label class="f" for="' + id + '">' + esc(label) + '<input id="' + id + '" type="' + type + '" data-set="league" data-key="' + key + '" value="' + esc(val) + '"' + (type === "number" ? ' min="1" step="1"' : "") + "></label>"; }

// ---------- add / edit / submit / review a cup ----------
// draft.mode: "add" (admin, new cup), "edit" (admin, existing cup), "submit" (member), "review" (admin approving a submission)
// row.assign: "ignore" (CPU), "unclaimed" (human, unknown player), "new", or a player id
function newDraft() { return { mode: isAdmin() ? "add" : "submit", id: null, cup: CUP_NAMES[0], date: today(), week: suggestWeek(), max: state ? state.league.defaultMax : 60, notes: "", rows: [], photoB64: null, photoUrl: null, photoChanged: false, reading: false, saving: false, error: "", info: "" }; }
function editDraft(c) {
  var d = newDraft(); d.mode = "edit"; d.id = c.id; d.cup = c.cup; d.date = c.date; d.week = c.week; d.max = c.max; d.notes = c.notes || "";
  var src = photoCache[c.id]; if (src && src.indexOf("data:") === 0) { d.photoUrl = src; d.photoB64 = src.split(",")[1]; }
  d.rows = c.results.map(function (r) { return { rid: r.rid, raw: r.raw || (r.p ? playerName(r.p) : ""), character: r.character || "", pts: String(r.pts), assign: r.p || "unclaimed", newName: "" }; });
  return d;
}
function reviewDraft(s) {
  var d = newDraft(); d.mode = "review"; d.id = s.id; d.cup = s.cup; d.date = s.date; d.week = s.week; d.max = s.max; d.notes = s.notes || ""; d.submitter = s.submitterName || "a member";
  d.rows = (s.rows || []).map(function (r) {
    var known = ["new", "ignore", "unclaimed"].indexOf(r.assign) < 0 && state.players.some(function (p) { return p.id === r.assign; });
    return { rid: r.rid || uid(), raw: r.raw || "", character: r.character || "", pts: r.pts == null ? "" : String(r.pts), assign: known || r.assign === "ignore" || r.assign === "unclaimed" ? r.assign : "new", newName: r.newName || r.raw || "" };
  });
  if (s.hasPhoto) {
    d.photoLoading = true;
    q(sb.from("submission_photos").select("data").eq("id", s.id).maybeSingle()).then(function (r) {
      if (r && r.data) { d.photoB64 = r.data; d.photoUrl = "data:image/jpeg;base64," + r.data; d.photoChanged = true; }
    }).catch(function () {}).then(function () { d.photoLoading = false; if (draft === d) render(); });
  }
  return d;
}
function viewAdd() {
  var d = draft || (draft = newDraft());
  if (d.mode === "add" || d.mode === "submit") d.mode = isAdmin() ? "add" : "submit"; // follow the current role
  var L = state.league;
  var title = { add: "Add a cup", edit: "Edit cup", submit: "Submit a cup", review: "Review submission" }[d.mode];
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
      if (!hasKey) out += '<p class="small muted" style="margin:0">Add an Anthropic API key on your <a href="#account">account page</a> to read photos automatically. For now, type the highlighted rows below.</p>';
    }
    out += '<input id="photo-in" type="file" accept="image/*" hidden></div></div>';
  } else {
    out += '<label class="drop" for="photo-in" id="drop"><input id="photo-in" type="file" accept="image/*"><b>Add the results-screen photo</b><span class="muted small">' + (hasKey ? "Claude reads each highlighted player's character and points. You check them before saving." : "It's kept with the cup as the record. Type the highlighted rows below.") + '</span><span class="btn btn-primary btn-sm">Choose photo</span></label>';
  }
  if (d.info) out += '<div class="note">' + esc(d.info) + "</div>";
  if (d.error) out += '<div class="error">' + esc(d.error) + "</div>";
  var weekOpts = ""; for (var w = 1; w <= Math.max(L.seasonWeeks, d.week); w++) weekOpts += '<option value="' + w + '"' + (w === Number(d.week) ? " selected" : "") + ">Week " + w + "</option>";
  out += '<div class="form-grid"><label class="f" for="d-cup">Cup<select id="d-cup" data-d="cup">' + CUP_NAMES.map(function (n) { return "<option" + (n === d.cup ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label>" +
    '<label class="f" for="d-week">Week<select id="d-week" data-d="week">' + weekOpts + "</select></label>" +
    '<label class="f" for="d-date">Date<input id="d-date" type="date" data-d="date" value="' + esc(d.date) + '"></label>' +
    '<label class="f" for="d-max">Max points per player<input id="d-max" type="number" min="1" step="1" data-d="max" value="' + esc(d.max) + '"></label></div>';
  var opts = function (sel) {
    return '<option value="ignore"' + (sel === "ignore" ? " selected" : "") + ">CPU (not counted)</option>" +
      '<option value="unclaimed"' + (sel === "unclaimed" ? " selected" : "") + ">Unclaimed (someone can request it)</option>" +
      state.players.map(function (p) { return '<option value="' + esc(p.id) + '"' + (sel === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") +
      '<option value="new"' + (sel === "new" ? " selected" : "") + ">+ New player…</option>";
  };
  out += '<div><div class="eyebrow" style="margin-bottom:6px">Results</div>';
  if (d.rows.length) {
    out += '<div style="overflow-x:auto"><table class="rows-tbl"><thead><tr><th class="l">Name on screen</th><th class="l">Character</th><th>Points</th><th class="l">League player</th><th></th></tr></thead><tbody>' +
      d.rows.map(function (r, i) {
        return '<tr class="' + (r.assign === "ignore" ? "ign" : "") + '"><td class="l"><input id="r-raw-' + i + '" data-r="raw" data-i="' + i + '" value="' + esc(r.raw) + '" aria-label="Name on screen" placeholder="(not shown)"></td>' +
          '<td class="l"><select id="r-ch-' + i + '" data-r="character" data-i="' + i + '" aria-label="Character">' + charOptions(r.character) + "</select></td>" +
          '<td><input class="ptsin" id="r-pts-' + i + '" type="number" min="0" step="1" inputmode="numeric" data-r="pts" data-i="' + i + '" value="' + esc(r.pts) + '" aria-label="Points"></td>' +
          '<td class="l"><div style="display:grid;gap:4px;min-width:190px"><select id="r-as-' + i + '" data-r="assign" data-i="' + i + '" aria-label="League player">' + opts(r.assign) + "</select>" +
          (r.assign === "new" ? '<input id="r-new-' + i + '" data-r="newName" data-i="' + i + '" value="' + esc(r.newName) + '" placeholder="New player name" aria-label="New player name">' : "") + "</div></td>" +
          '<td><button class="btn btn-sm" data-act="rm-row" data-i="' + i + '" aria-label="Remove row">✕</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  } else out += '<p class="muted small" style="margin:0 0 8px">No rows yet. ' + (hasKey ? "Add a photo above, or " : "") + "add a row for each highlighted (human) player.</p>";
  out += '<div style="margin-top:8px"><button class="btn btn-sm" data-act="add-row">+ Add row</button></div></div>';
  out += '<label class="f" for="d-notes">Notes (optional)<textarea id="d-notes" data-d="notes" maxlength="500" placeholder="Anything worth remembering about this cup">' + esc(d.notes) + "</textarea></label>";
  var label = d.saving ? "Saving…" : { add: "Save cup", edit: "Save changes", submit: "Submit for review", review: "Approve and add to standings" }[d.mode];
  out += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" data-act="save-cup"' + (d.saving || d.reading || d.photoLoading ? " disabled" : "") + ">" + label + "</button>" +
    (d.mode === "submit" ? '<span class="muted small">You can withdraw it from your account page while it\'s pending.</span>' : '<span class="muted small">Updates the standings for everyone right away. Unclaimed rows show on the Unclaimed page.</span>') + "</div>";
  return out + "</div>";
}
function matchPlayer(players, name) {
  var n = String(name || "").trim().toLowerCase(); if (!n) return null;
  return players.find(function (p) { return p.name.toLowerCase() === n || (p.aliases || []).some(function (a) { return a.toLowerCase() === n; }); }) || null;
}
function mapRow(r) {
  var name = String(r && r.name || "").trim();
  var pts = (r && r.points != null && !isNaN(Number(r.points))) ? String(Math.round(Number(r.points))) : "";
  var ch = r && CHARACTERS.indexOf(r.character) >= 0 ? r.character : "";
  var human = !!(r && r.human);
  var m = human ? matchPlayer(state.players, name) : null;
  return { rid: uid(), raw: name, character: ch, pts: pts, assign: !human ? "ignore" : m ? m.id : "unclaimed", newName: "" };
}
// Downscales to JPEG and keeps each photo well under the database's size limit.
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
    rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["pos", "name", "character", "points", "human"],
      properties: {
        pos: { type: "integer" },
        name: { type: "string" },
        character: { type: "string", enum: CHARACTERS.concat(["Unknown"]) },
        points: { type: ["integer", "null"] },
        human: { type: "boolean" }
      } } }
  }
};
var sdkPromise = null;
function loadSDK() {
  if (!sdkPromise) sdkPromise = import(CONFIG.sdkUrl).then(function (m) { return m.default; }, function (e) { sdkPromise = null; throw e; });
  return sdkPromise;
}
function readPrompt() {
  var known = state.players.map(function (p) { return [p.name].concat(p.aliases || []).join(" / "); }).join("; ") || "(none yet)";
  return "This is a phone photo of a TV showing the Mario Kart Wii standings screen after 4 races: up to 12 rows from 1st down, each with a character icon, usually a name, and total points for the 4 races (per race 15,12,10,8,7,6,5,4,3,2,1,0, so at most 60).\n" +
    "Rows for human players are highlighted (a brighter or colored row background); CPU rows are not. Set human: true only for highlighted rows.\n" +
    "For every row, identify the character from its icon (Mii if it shows a Mii; Unknown if you can't tell), read the name if one is shown (empty string if not), and the total points (null if unreadable).\n" +
    "League players we already know (use these exact spellings when a highlighted row's name clearly matches one): " + known + ".\n" +
    "Read every row you can, in screen order. Set cup to the cup name if it is visible, otherwise null.";
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
    var humans = d.rows.filter(function (r) { return r.assign !== "ignore"; });
    var unc = humans.filter(function (r) { return r.assign === "unclaimed"; }).length;
    d.info = "Read " + rows.length + " racers; " + humans.length + " highlighted" + (unc ? ", " + unc + " not matched to a player (they'll be unclaimed unless you pick someone)" : "") + ". Check each character and score against the photo before saving.";
  }).catch(function (e) {
    if (ctl === readCtl) d.error = readErr(e, Anthropic);
  }).then(function () {
    if (ctl === readCtl) { readCtl = null; d.reading = false; render(); }
  });
}
function readErr(e, A) {
  if (e && e.code === "refused") return "Claude declined to read that photo. Type the rows below.";
  if (e && e.code === "no_rows") return "No results table found in that photo. Retake it straight on with the whole list in frame, or type the rows below.";
  if (A) {
    if (e instanceof A.APIUserAbortError) return "";
    if (e instanceof A.AuthenticationError) return "Anthropic rejected the API key. Check it on your account page.";
    if (e instanceof A.PermissionDeniedError) return "This API key isn't allowed to use " + CONFIG.model + ". Check the key's workspace in the Anthropic Console.";
    if (e instanceof A.RateLimitError) return "Too many requests, or the key's spend limit was reached. Wait a minute and press Read photo again.";
    if (e instanceof A.BadRequestError) return "Anthropic couldn't process that photo (" + (e.message || "bad request") + "). Try another photo or type the rows below.";
    if (e instanceof A.APIConnectionError) return "Couldn't reach Anthropic. Check your connection and press Read photo again.";
    if (e instanceof A.APIError) return "Reading the photo failed (error " + e.status + "). Press Read photo again, or type the rows below.";
  }
  if (e && e.name === "AbortError") return "";
  if (!A) return "Couldn't load the Claude library. Check your connection and press Read photo again.";
  return "Reading the photo failed. Press Read photo again, or type the rows below.";
}

// ---------- Supabase ----------
function dbErr(e) {
  var c = e && e.code, m = (e && e.message) || "";
  if (c === "P0001") return m;                                    // our own friendly messages from the database functions
  if (c === "42501" || /row-level security|permission denied/i.test(m)) return "You don't have permission to do that. If your role just changed, refresh the page.";
  if (c === "23514") return "Something was too long or invalid. A photo may be too large; try a smaller one.";
  if (c === "23505") return "That already exists.";
  if (c === "PGRST301" || /JWT/i.test(m)) return "Your session expired. Sign in again.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the server. Check your connection and try again.";
  return "Saving failed" + (m ? ": " + m : "") + ".";
}
function authErr(e) {
  var c = (e && e.code) || "", m = (e && e.message) || "";
  var map = {
    invalid_credentials: "That email and password don't match an account.",
    email_not_confirmed: "Confirm your email first: open the link we sent you, then sign in.",
    user_already_exists: "There's already an account with that email. Sign in instead, or use Google if you signed up with it.",
    email_exists: "There's already an account with that email. Sign in instead, or use Google if you signed up with it.",
    weak_password: "Use a longer password: at least 6 characters.",
    email_address_invalid: "Enter a valid email address.",
    validation_failed: "Check the email and password and try again.",
    over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
    over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
    signup_disabled: "New sign-ups are switched off for this league.",
    provider_disabled: "Google sign-in isn't switched on yet. Use email and password for now.",
    same_password: "That's already your password. Pick a different one.",
    reauthentication_needed: "For security, sign out and back in, then try again."
  };
  if (map[c]) return map[c];
  if (/Invalid login credentials/i.test(m)) return map.invalid_credentials;
  if (/provider is not enabled/i.test(m)) return map.provider_disabled;
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the sign-in server. Check your connection.";
  return m || "Sign-in failed.";
}
function q(p) { return p.then(function (r) { if (r.error) throw r.error; return r.data; }); }
function siteUrl() { return location.origin + location.pathname; }
function loadSupabase() {
  return import(CONFIG.supabaseUrl).then(function (m) {
    sb = m.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  });
}
function mapCup(c) { return { id: c.id, cup: c.cup, date: c.date, week: c.week, max: c.max, results: c.results || [], notes: c.notes || "", hasPhoto: !!c.has_photo, addedAt: Number(c.added_at) || 0 }; }
function mapProfile(u) { return { id: u.id, displayName: u.display_name, email: u.email, role: u.role, color: u.color, favoriteCharacter: u.favorite_character, favoriteVehicle: u.favorite_vehicle }; }
function mapSub(s) { return { id: s.id, cup: s.cup, date: s.date, week: s.week || 1, max: s.max, rows: s.rows || [], notes: s.notes || "", hasPhoto: !!s.has_photo, status: s.status, submittedBy: s.submitted_by, submitterName: s.submitter_name, submittedAt: Number(s.submitted_at) || 0, reviewNote: s.review_note || "" }; }
function mapClaim(c) { return { id: c.id, cupId: c.cup_id, rid: c.rid, userId: c.user_id, character: c.character || "", note: c.note || "", status: c.status, createdAt: Number(c.created_at) || 0, reviewNote: c.review_note || "" }; }
function loadPublic() {
  return Promise.all([
    q(sb.from("league").select("settings").eq("id", 1).maybeSingle()),
    q(sb.from("players").select("id,name,color,aliases,user_id,registered_at")),
    q(sb.from("cups").select("id,cup,date,week,max,results,notes,has_photo,added_at")),
    q(sb.rpc("league_has_owner"))
  ]).then(function (r) {
    state = normalize({ league: r[0] ? r[0].settings : {}, players: r[1], cups: r[2].map(mapCup) });
    me.hasOwner = !!r[3]; me.ownerKnown = true;
    if (playersDraft && !playersDraft.dirty) playersDraft = null;
    render();
  });
}
function loadMine() {
  if (!me.user) return Promise.resolve();
  var uidNow = me.user.id;
  return q(sb.from("profiles").select("*").eq("id", uidNow).maybeSingle()).then(function (p) {
    if (!me.user || me.user.id !== uidNow) return;
    me.profile = p ? mapProfile(p) : null;
    var jobs = [
      q(sb.from("submissions").select("*").eq("submitted_by", uidNow)).then(function (rows) { mySubs = rows.map(mapSub).sort(function (a, b) { return b.submittedAt - a.submittedAt; }); }),
      q(sb.from("claims").select("*").eq("user_id", uidNow)).then(function (rows) { myClaims = rows.map(mapClaim).sort(function (a, b) { return b.createdAt - a.createdAt; }); })
    ];
    if (isAdmin()) {
      jobs.push(q(sb.from("submissions").select("*").eq("status", "pending")).then(function (rows) { adminData.pending = rows.map(mapSub); }));
      jobs.push(q(sb.from("profiles").select("*")).then(function (rows) { adminData.users = rows.map(mapProfile); }));
      jobs.push(q(sb.from("claims").select("*").eq("status", "pending")).then(function (rows) { adminData.claims = rows.map(mapClaim); }));
      jobs.push(q(sb.from("player_invites").select("*")).then(function (rows) {
        adminData.invites = rows.map(function (i) { return { playerId: i.player_id, email: i.email }; });
        if (playersDraft && !playersDraft.dirty) playersDraft = null; // rebuild with the fresh invites unless there are unsaved edits
      }));
    } else adminData = { pending: [], users: [], claims: [], invites: [] };
    return Promise.all(jobs);
  }).catch(function () {}).then(render);
}
var reloadT = null;
function reloadSoon() { clearTimeout(reloadT); reloadT = setTimeout(function () { loadPublic().catch(function () {}); loadMine(); }, 250); }
function startRealtime() {
  try {
    sb.channel("league-live").on("postgres_changes", { event: "*", schema: "public" }, reloadSoon).subscribe();
  } catch (e) { /* live updates are a convenience; the page still works without them */ }
}
function loadPhoto(id) {
  if (photoCache[id] || !sb) return;
  photoCache[id] = "loading";
  q(sb.from("photos").select("data").eq("cup_id", id).maybeSingle()).then(function (r) {
    photoCache[id] = r && r.data ? "data:image/jpeg;base64," + r.data : "none";
  }).catch(function () { photoCache[id] = "none"; }).then(render);
}
function startAuth() {
  sb.auth.onAuthStateChange(function (event, session) {
    var user = session ? session.user : null;
    var changed = (me.user && me.user.id) !== (user && user.id);
    me.user = user; me.ready = true;
    if (event === "PASSWORD_RECOVERY") { me.recovery = true; location.hash = "account"; }
    if (changed) { me.profile = null; profileDraft = null; playersDraft = null; mySubs = []; myClaims = []; adminData = { pending: [], users: [], claims: [], invites: [] }; ui.msg = ""; ui.error = ""; ui.changingPw = false; ui.claimFor = null; }
    // Supabase advises not awaiting its own calls inside this callback.
    setTimeout(function () { if (changed || event === "USER_UPDATED") loadMine(); else render(); }, 0);
  });
}

// ---------- saving ----------
function validateDraft(d) {
  var max = Number(d.max);
  if (!d.date) return "Pick the date the cup was raced.";
  if (!(max > 0 && Math.round(max) === max)) return "Max points per player must be a whole number above 0.";
  var active = d.rows.filter(function (r) { return r.assign !== "ignore"; });
  if (!active.length) return "Add at least one human player's result.";
  if (d.rows.length > 24) return "A cup can have at most 24 rows.";
  var seen = {};
  for (var i = 0; i < active.length; i++) {
    var r = active[i], p = r.pts === "" ? NaN : Number(r.pts);
    var label = r.raw || r.newName || r.character || "row " + (d.rows.indexOf(r) + 1);
    if (!(p >= 0 && p <= max && Math.round(p) === p)) return "Points for " + label + " must be a whole number from 0 to " + max + ".";
    if (r.assign === "unclaimed") continue;
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
  var call, done;
  if (d.mode === "submit") {
    call = q(sb.rpc("submit_cup", {
      p_sub: { id: uid(), cup: d.cup, date: d.date, week: Number(d.week), max: Number(d.max), notes: String(d.notes || "").trim(),
        rows: d.rows.map(function (r) { return { rid: r.rid || uid(), raw: String(r.raw || "").trim(), character: r.character || "", pts: r.pts === "" ? null : Number(r.pts), assign: r.assign, newName: r.assign === "new" ? String(r.newName || "").trim() : "" }; }) },
      p_photo: d.photoB64 || null
    }));
    done = { view: "account", flash: "Submitted. An admin will review it." };
  } else {
    var cupId = d.id || uid();
    var players = state.players.map(function (p) { return Object.assign({}, p, { aliases: (p.aliases || []).slice() }); });
    var touched = {}, results = [];
    d.rows.filter(function (r) { return r.assign !== "ignore"; }).forEach(function (r) {
      var raw = String(r.raw || "").trim(), pid = null;
      if (r.assign !== "unclaimed") {
        pid = r.assign;
        if (pid === "new" || !players.some(function (p) { return p.id === pid; })) {
          var nm = String(r.newName || r.raw).trim();
          var ex = matchPlayer(players, nm);
          if (ex) pid = ex.id; else { var np = { id: uid(), name: nm, color: nextColor(players), aliases: [] }; players.push(np); pid = np.id; touched[pid] = 1; }
        }
        var p = players.find(function (x) { return x.id === pid; });
        if (p && raw && raw.toLowerCase() !== p.name.toLowerCase() && !p.aliases.some(function (a) { return a.toLowerCase() === raw.toLowerCase(); })) { p.aliases.push(raw); touched[pid] = 1; }
      }
      results.push({ rid: r.rid || uid(), p: pid, pts: Number(r.pts), character: r.character || "", raw: raw });
    });
    var old = state.cups.find(function (c) { return c.id === cupId; });
    call = q(sb.rpc("save_cup", {
      p_cup: { id: cupId, cup: d.cup, date: d.date, week: Number(d.week), max: Number(d.max), results: results, notes: String(d.notes || "").trim(),
        has_photo: !!d.photoB64 || !!(old && old.hasPhoto), added_at: old ? old.addedAt : Date.now() },
      p_players: players.filter(function (p) { return touched[p.id]; }).map(function (p) { return { id: p.id, name: p.name, color: p.color, aliases: p.aliases }; }),
      p_photo: d.photoB64 && d.photoChanged ? d.photoB64 : null,
      p_submission: d.mode === "review" ? d.id : null
    })).then(function () { if (d.photoB64 && d.photoChanged) photoCache[cupId] = d.photoUrl; });
    done = d.mode === "review" ? { view: "admin", flash: "Approved. Standings updated." } : { view: "cups", flash: d.mode === "edit" ? "Cup updated" : "Cup saved. Standings updated." };
  }
  call.then(function () {
    draft = null; flash(done.flash); reloadSoon();
    if (location.hash !== "#" + done.view) location.hash = done.view; else render();
  }).catch(function (e) { d.error = dbErr(e); }).then(function () { d.saving = false; if (draft === d) render(); });
}
function saveSettings() {
  var s = settingsDraft; if (!s || ui.busy) return;
  var n = { name: String(s.name || "").trim(), season: String(s.season || "").trim(), seasonWeeks: Number(s.seasonWeeks), cupsPerWeek: Number(s.cupsPerWeek), playoffSpots: Number(s.playoffSpots), minParticipation: Number(s.minParticipation), defaultMax: Number(s.defaultMax) };
  var whole = function (v, lo, hi) { return v >= lo && v <= hi && Math.round(v) === v; };
  var err = "";
  if (!n.name) err = "Give the league a name.";
  else if (!n.season) err = "Give the season a name.";
  else if (!whole(n.seasonWeeks, 1, 52)) err = "Weeks must be a whole number from 1 to 52.";
  else if (!whole(n.cupsPerWeek, 1, 20)) err = "Cups per week must be a whole number from 1 to 20.";
  else if (!whole(n.playoffSpots, 2, 32)) err = "Playoff spots must be a whole number from 2 to 32.";
  else if (!(n.minParticipation >= 0 && n.minParticipation <= 100)) err = "Qualifying % must be between 0 and 100.";
  else if (!whole(n.defaultMax, 1, 1000)) err = "Default max points must be a whole number above 0.";
  if (err) { ui.error = err; render(); return; }
  ui.busy = true; ui.error = ""; render();
  q(sb.rpc("save_settings", { p_settings: n }))
    .then(function () { settingsDraft = null; flash("Settings saved"); reloadSoon(); }).catch(function (e) { ui.error = dbErr(e); }).then(function () { ui.busy = false; render(); });
}
function savePlayers() {
  if (!playersDraft || ui.busy) return;
  var emails = {}, accts = {}, err = "";
  playersDraft.forEach(function (p) {
    if (p.remove || err) return;
    var nm = String(p.name || "").trim(), em = String(p.email || "").trim().toLowerCase();
    if (!nm || nm.length > 40) err = "Every player needs a name of up to 40 characters.";
    else if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) err = "“" + em + "” doesn't look like an email address.";
    else if (em && emails[em]) err = "The email " + em + " is on two players.";
    else if (p.userId && accts[p.userId]) err = "The same account is linked to two players.";
    emails[em] = em ? 1 : 0; if (p.userId) accts[p.userId] = 1;
  });
  if (err) { ui.error = err; render(); return; }
  ui.busy = true; ui.error = ""; render();
  q(sb.rpc("save_players", { p_players: playersDraft.map(function (p) { return { id: p.id, name: String(p.name).trim(), color: p.color, email: String(p.email || "").trim().toLowerCase(), user_id: p.userId || "", remove: !!p.remove }; }) }))
    .then(function () { playersDraft = null; flash("Players saved"); reloadSoon(); }).catch(function (e) { ui.error = dbErr(e); }).then(function () { ui.busy = false; render(); });
}
function saveProfile() {
  var p = profileDraft; if (!p || ui.busy) return;
  var name = String(p.displayName || "").trim();
  if (!name) { ui.error = "Enter a display name."; render(); return; }
  ui.busy = true; ui.error = ""; render();
  q(sb.from("profiles").update({ display_name: name, color: p.color, favorite_character: p.favoriteCharacter || "", favorite_vehicle: String(p.favoriteVehicle || "").trim(), updated_at: new Date().toISOString() }).eq("id", me.user.id))
    .then(function () { profileDraft = null; flash("Profile saved"); return loadMine(); }).catch(function (e) { ui.error = dbErr(e); }).then(function () { ui.busy = false; render(); });
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
    ? q(sb.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { display_name: f.name.trim() }, emailRedirectTo: siteUrl() } }))
    : q(sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password }));
  p.then(function (data) {
    ui.form = { email: "", password: "", name: "" };
    if (up && !data.session) { ui.authMode = "signin"; ui.msg = "Check your inbox: open the confirmation link we sent, then sign in."; }
    else flash(up ? "Account created. Welcome!" : "Signed in");
  }).catch(function (e) { ui.error = authErr(e); }).then(function () { ui.busy = false; render(); });
}
function doGoogle() {
  ui.error = ""; ui.msg = ""; ui.busy = true; render();
  q(sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: siteUrl() } }))
    .catch(function (e) { ui.error = authErr(e); ui.busy = false; render(); }); // on success the browser leaves for Google
}
function setPassword() {
  var pw = ui.form.newPassword || "";
  if (pw.length < 6) { ui.error = "Use at least 6 characters."; render(); return; }
  ui.busy = true; ui.error = ""; render();
  q(sb.auth.updateUser({ password: pw })).then(function () { ui.form.newPassword = ""; me.recovery = false; ui.changingPw = false; flash("Password updated"); })
    .catch(function (e) { ui.error = authErr(e); }).then(function () { ui.busy = false; render(); });
}

// ---------- events ----------
function setView() {
  var h = (location.hash || "").replace("#", "");
  ui.view = VIEWS.indexOf(h) >= 0 ? h : "standings";
  ui.confirmDel = null; ui.error = ""; ui.msg = ""; ui.confirmDeleteAccount = false; ui.rejectId = null; ui.claimFor = null;
  if (ui.view === "add" && !draft && state && signedIn()) draft = newDraft();
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", setView);
document.addEventListener("submit", function (e) { if (e.target.id === "auth-form") { e.preventDefault(); doAuth(); } });
document.addEventListener("click", function (e) {
  var t = e.target.closest("[data-act]"); if (!t) return;
  var act = t.getAttribute("data-act"), id = t.getAttribute("data-key"), i = Number(t.getAttribute("data-i"));
  if (act === "sel") { ui.sel = ui.sel === id ? null : id; render(); }
  else if (act === "sel-go") { ui.sel = id; }
  else if (act === "unsel") { ui.sel = null; render(); }
  else if (act === "new-cup") { if (!draft || draft.mode === "edit" || draft.mode === "review") { draft = newDraft(); if (ui.view === "add") render(); } }
  else if (act === "cancel-draft") { if (readCtl) readCtl.abort(); draft = null; }
  else if (act === "edit-cup") { var c = state.cups.find(function (x) { return x.id === id; }); if (c) { draft = editDraft(c); if (c.hasPhoto && !draft.photoUrl) loadPhoto(c.id); if (ui.view === "add") render(); else location.hash = "add"; } }
  else if (act === "review") { var s = adminData.pending.find(function (x) { return x.id === id; }); if (s) { draft = reviewDraft(s); location.hash = "add"; } }
  else if (act === "reject") { ui.rejectId = "s:" + id; ui.rejectNote = ""; render(); }
  else if (act === "claim-reject") { ui.rejectId = "c:" + id; ui.rejectNote = ""; render(); }
  else if (act === "reject-no") { ui.rejectId = null; render(); }
  else if (act === "reject-yes") {
    q(sb.rpc("reject_submission", { p_id: id, p_note: String(ui.rejectNote || "").trim().slice(0, 200) }))
      .then(function () { ui.rejectId = null; flash("Submission rejected"); reloadSoon(); }).catch(function (er) { ui.error = dbErr(er); render(); });
  }
  else if (act === "claim-reject-yes") {
    q(sb.rpc("reject_claim", { p_claim: id, p_note: String(ui.rejectNote || "").trim().slice(0, 200) }))
      .then(function () { ui.rejectId = null; flash("Request declined"); reloadSoon(); }).catch(function (er) { ui.error = dbErr(er); render(); });
  }
  else if (act === "claim-approve") {
    ui.busy = true; ui.error = ""; render();
    q(sb.rpc("approve_claim", { p_claim: id })).then(function () { flash("Points given. Standings updated."); reloadSoon(); })
      .catch(function (er) { ui.error = dbErr(er); }).then(function () { ui.busy = false; render(); });
  }
  else if (act === "claim-open") { ui.claimFor = id; ui.claimForm = { character: t.getAttribute("data-char") || "", note: "" }; ui.error = ""; render(); }
  else if (act === "claim-cancel") { ui.claimFor = null; render(); }
  else if (act === "claim-send") {
    var parts = id.split("|");
    ui.busy = true; ui.error = ""; render();
    q(sb.from("claims").insert({ id: uid(), cup_id: parts[0], rid: parts[1], character: ui.claimForm.character || "", note: String(ui.claimForm.note || "").trim().slice(0, 200), created_at: Date.now() }))
      .then(function () { ui.claimFor = null; flash("Request sent. An admin will review it."); return loadMine(); })
      .catch(function (er) { ui.error = er && er.code === "23505" ? "You already requested these points." : dbErr(er); }).then(function () { ui.busy = false; render(); });
  }
  else if (act === "withdraw-claim") {
    q(sb.from("claims").delete().eq("id", id)).then(function () { flash("Request withdrawn"); return loadMine(); }).catch(function (er) { ui.error = dbErr(er); render(); });
  }
  else if (act === "withdraw") {
    q(sb.from("submissions").delete().eq("id", id)).then(function () { flash("Submission withdrawn"); reloadSoon(); }).catch(function (er) { ui.error = dbErr(er); render(); });
  }
  else if (act === "del-ask") { ui.confirmDel = id; render(); }
  else if (act === "del-no") { ui.confirmDel = null; render(); }
  else if (act === "del-yes") {
    ui.busy = true; ui.error = ""; render();
    q(sb.from("cups").delete().eq("id", id)).then(function () { flash("Cup deleted"); reloadSoon(); }).catch(function (er) { ui.error = dbErr(er); })
      .then(function () { ui.busy = false; ui.confirmDel = null; render(); });
  }
  else if (act === "read") { readPhoto(); }
  else if (act === "stop-read") { if (readCtl) readCtl.abort(); readCtl = null; if (draft) draft.reading = false; render(); }
  else if (act === "add-row") { draft.rows.push({ rid: uid(), raw: "", character: "", pts: "", assign: "unclaimed", newName: "" }); render(); }
  else if (act === "rm-row") { draft.rows.splice(i, 1); render(); }
  else if (act === "save-cup") { saveDraft(); }
  else if (act === "pl-add") { playersDraft.dirty = true; playersDraft.push({ id: "p" + uid(), name: "", color: nextColor(playersDraft), email: "", userId: "", registeredAt: null, isNew: true, remove: false }); render(); var inp = document.getElementById("pl-n-" + (playersDraft.length - 1)); if (inp) inp.focus(); }
  else if (act === "pl-remove") { playersDraft.dirty = true; var pr = playersDraft[i]; if (pr.isNew) playersDraft.splice(i, 1); else pr.remove = !pr.remove; render(); }
  else if (act === "pl-save") { savePlayers(); }
  else if (act === "save-settings") { saveSettings(); }
  else if (act === "save-profile") { saveProfile(); }
  else if (act === "pick-color") { if (profileDraft) { profileDraft.color = id; render(); } }
  else if (act === "auth-mode") { ui.authMode = id; ui.error = ""; ui.msg = ""; render(); }
  else if (act === "google") { doGoogle(); }
  else if (act === "forgot") {
    var em = ui.form.email.trim();
    if (!em) { ui.error = "Enter your email above, then press Forgot password."; render(); return; }
    q(sb.auth.resetPasswordForEmail(em, { redirectTo: siteUrl() })).then(function () { ui.error = ""; ui.msg = "If there's an account for " + em + ", a reset link is on its way."; render(); })
      .catch(function (er) { ui.error = authErr(er); render(); });
  }
  else if (act === "change-pw") { ui.changingPw = !ui.changingPw; ui.form.newPassword = ""; ui.error = ""; render(); }
  else if (act === "set-pw") { setPassword(); }
  else if (act === "signout") { sb.auth.signOut().then(function () { flash("Signed out"); location.hash = "standings"; }); }
  else if (act === "claim") {
    ui.busy = true; render();
    q(sb.rpc("claim_ownership")).then(function () { flash("You're the league owner"); me.hasOwner = true; return loadMine(); })
      .catch(function (er) { ui.error = dbErr(er); }).then(function () { ui.busy = false; render(); });
  }
  else if (act === "save-ai") { lsSet(KEY_AI, document.getElementById("k-ai").value.trim()); ui.msg = lsGet(KEY_AI) ? "Anthropic key saved on this device." : "Anthropic key removed from this device."; render(); }
  else if (act === "delete-account") { ui.confirmDeleteAccount = true; render(); }
  else if (act === "delete-account-no") { ui.confirmDeleteAccount = false; render(); }
  else if (act === "delete-account-yes") {
    q(sb.rpc("delete_my_account")).then(function () { return sb.auth.signOut({ scope: "local" }); })
      .then(function () { flash("Your account was deleted"); location.hash = "standings"; })
      .catch(function (er) { ui.confirmDeleteAccount = false; ui.error = dbErr(er); render(); });
  }
});
document.addEventListener("keydown", function (e) {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("tr.row")) { e.preventDefault(); e.target.click(); }
});
document.addEventListener("input", function (e) {
  var t = e.target;
  if (t.dataset.d && draft) draft[t.dataset.d] = t.value;
  else if (t.dataset.r && draft) { var row = draft.rows[Number(t.dataset.i)]; if (row && t.dataset.r !== "assign") row[t.dataset.r] = t.value; }
  else if (t.dataset.set === "league" && settingsDraft) settingsDraft[t.dataset.key] = t.value;
  else if (t.dataset.pl && playersDraft) { var pr = playersDraft[Number(t.dataset.i)]; if (pr) { pr[t.dataset.pl] = t.value; playersDraft.dirty = true; } }
  else if (t.dataset.a) ui.form[t.dataset.a] = t.value;
  else if (t.dataset.p && profileDraft) profileDraft[t.dataset.p] = t.value;
  else if (t.dataset.cl) ui.claimForm[t.dataset.cl] = t.value;
  else if (t.dataset.rej) ui.rejectNote = t.value;
});
document.addEventListener("change", function (e) {
  var t = e.target;
  if (t.id === "photo-in") { onPhoto(t.files && t.files[0]); t.value = ""; }
  else if (t.dataset.r === "assign" && draft) { var row = draft.rows[Number(t.dataset.i)]; row.assign = t.value; if (t.value === "new" && !row.newName) row.newName = row.raw; render(); var n = document.getElementById("r-new-" + t.dataset.i); if (n) n.focus(); }
  else if (t.dataset.r && draft) { var rw = draft.rows[Number(t.dataset.i)]; if (rw) rw[t.dataset.r] = t.value; }
  else if (t.dataset.pl && playersDraft) { var pr = playersDraft[Number(t.dataset.i)]; if (pr) { pr[t.dataset.pl] = t.value; playersDraft.dirty = true; render(); } }
  else if (t.dataset.role) {
    q(sb.rpc("set_role", { p_user: t.dataset.role, p_role: t.value })).then(function () { flash("Role updated"); return loadMine(); })
      .catch(function (er) { ui.error = dbErr(er); render(); });
  }
});
document.addEventListener("dragover", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", function (e) { var d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); onPhoto(e.dataTransfer.files[0]); } });

// ---------- boot ----------
var h0 = (location.hash || "").replace("#", ""); ui.view = VIEWS.indexOf(h0) >= 0 ? h0 : "standings";
render();
if (SUPABASE_CONFIG) {
  loadSupabase().then(function () { startAuth(); startRealtime(); return loadPublic(); })
    .catch(function () { ui.loadError = "Couldn't load the league. Check your connection and refresh."; render(); });
} else {
  // Accounts not configured yet: show the static data file read-only.
  fetch(CONFIG.legacyDataPath + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (j) { state = normalize(j); }).catch(function () { ui.loadError = "Couldn't load the league data. Refresh the page to try again."; }).then(render);
}
})();
