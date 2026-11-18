// Recording a cup night: the specific cups that were raced, each racer's character (usually one all night,
// but a cell can say they switched for that cup), and every racer's result in every cup. Pure functions;
// the Add page holds the state.
//
// night = {
//   mode: "add" | "submit" | "review" | "edit",
//   date, week, max, notes,
//   entry: "totals" | "races",            // cup totals, or each race's finishing position
//   racers: [{ key, assign, newName, character }],   // assign: a player id, "new" or "unclaimed"
//   cups: [{ key, cupId, name, maps[4]|[], locked, hasPhoto, addedAt, submission,
//            photo: base64|null, photoChanged, cells: { [racerKey]: { pts, pos[4], rid, character } } }],
// A cell's character is "" when the racer used their usual one (racer.character) in that cup.
// }
// A cell left empty means that racer sat the cup out. In race-by-race mode a cell with no positions
// can still carry a total (e.g. read from the photo) and is saved without per-race rows.
import { RACE_POINTS, BUILTIN_CUPS, nextColor, ord } from "./constants";

export const MAX_RESULTS = 24;

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The current week, or the next one once this week has its full count of cups.
export function suggestWeek(state) {
  if (!state || !state.cups.length) return 1;
  const L = state.league, byWeek = {};
  let cur = 1;
  state.cups.forEach((c) => { byWeek[c.week] = (byWeek[c.week] || 0) + 1; if (c.week > cur) cur = c.week; });
  return (byWeek[cur] || 0) >= L.cupsPerWeek && cur < L.seasonWeeks ? cur + 1 : cur;
}

export function allTemplates(state) {
  return BUILTIN_CUPS.concat((state && state.templates) || []);
}

export function templateByName(state, name) {
  const n = String(name || "").trim().toLowerCase();
  return allTemplates(state).find((t) => t.name.toLowerCase() === n) || null;
}

export function matchPlayer(players, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  return players.find((p) => p.name.toLowerCase() === n || (p.aliases || []).some((a) => a.toLowerCase() === n)) || null;
}

export function emptyCell() {
  return { pts: "", pos: ["", "", "", ""], rid: null, character: "" };
}

// The character a racer used in one cup: the cell's, if they switched for it, else their usual one.
export function cellCharacter(cell, racer) {
  return (cell && cell.character) || (racer && racer.character) || "";
}

// Two racers can be one person (someone who changed character between cups) when both have results and
// they never raced the same cup.
export function canMerge(night, a, b) {
  const has = (k, c) => cellPoints(cellOf(c, k), night.entry) !== null;
  return !!a && !!b && a !== b && night.cups.some((c) => has(a, c)) && night.cups.some((c) => has(b, c))
    && !night.cups.some((c) => has(a, c) && has(b, c));
}

// Folds racer `dropKey` into `keepKey`: one racer whose usual character is the one used in more cups, and
// every cup keeps the character actually used in it. Returns the night unchanged if they can't merge.
export function mergeRacers(night, keepKey, dropKey) {
  const keep = night.racers.find((r) => r.key === keepKey);
  const drop = night.racers.find((r) => r.key === dropKey);
  if (!keep || !drop || !canMerge(night, keepKey, dropKey)) return night;
  const used = (key) => night.cups.filter((c) => cellPoints(cellOf(c, key), night.entry) !== null).length;
  const usual = drop.character && used(dropKey) > used(keepKey) ? drop.character : keep.character || drop.character;
  const cups = night.cups.map((c) => {
    const cells = { ...c.cells };
    const kc = cells[keepKey], dc = cells[dropKey];
    let cell = null;
    if (dc && cellPoints(dc, night.entry) !== null) cell = { ...dc, character: cellCharacter(dc, drop) };
    else if (kc) cell = { ...kc, character: cellCharacter(kc, keep) };
    delete cells[dropKey];
    if (cell) cells[keepKey] = { ...cell, character: cell.character === usual ? "" : cell.character };
    return { ...c, cells };
  });
  return {
    ...night,
    cups,
    racers: night.racers.filter((r) => r.key !== dropKey).map((r) => (r.key === keepKey ? { ...r, character: usual } : r)),
  };
}

export function newRacer(patch = {}) {
  return { key: uid(), assign: "", newName: "", character: "", ...patch };
}

export function newCup(patch = {}) {
  return {
    key: uid(), cupId: null, name: "", maps: [], locked: false, hasPhoto: false, addedAt: null, submission: null,
    photo: null, photoChanged: false, cells: {}, ...patch,
  };
}

export function cupFromTemplate(t) {
  return newCup({ name: t.name, maps: t.maps.slice() });
}

export function newNight(state, mode) {
  return {
    mode, date: today(), week: suggestWeek(state), max: (state && state.league.defaultMax) || 60, notes: "",
    entry: "totals", racers: [newRacer()], cups: [],
  };
}

export function cellOf(cup, racerKey) {
  return cup.cells[racerKey] || emptyCell();
}

function filledPositions(cell) {
  return cell.pos.filter((p) => p !== "" && p != null).length;
}

// Points for one racer in one cup, or null when they have no result there.
export function cellPoints(cell, entry) {
  if (!cell) return null;
  if (entry === "races" && filledPositions(cell) > 0) {
    return cell.pos.reduce((a, p) => a + (p ? RACE_POINTS[Number(p) - 1] : 0), 0);
  }
  if (cell.pts === "" || cell.pts == null) return null;
  const n = Number(cell.pts);
  return Number.isFinite(n) ? n : NaN;
}

export function hasResult(cell, entry) {
  return cellPoints(cell, entry) !== null;
}

export function racerName(r, players) {
  if (r.assign === "new") return String(r.newName || "").trim() || "New player";
  if (r.assign === "unclaimed") return r.character ? `Unclaimed ${r.character}` : "Unclaimed";
  const p = players.find((x) => x.id === r.assign);
  return p ? p.name : "Pick a player";
}

// Racers sharing a character can't be told apart on a results photo.
export function sharedCharacters(racers) {
  const seen = {}, dup = new Set();
  racers.forEach((r) => {
    if (!r.character) return;
    if (seen[r.character]) dup.add(r.character);
    seen[r.character] = true;
  });
  return [...dup];
}

// Two racers who entered the same place in the same race. Returns [{cupKey, race, position, names}].
export function positionClashes(night, players) {
  const out = [];
  if (night.entry !== "races") return out;
  night.cups.forEach((cup) => {
    for (let race = 0; race < 4; race++) {
      const by = {};
      night.racers.forEach((r) => {
        const p = cellOf(cup, r.key).pos[race];
        if (p) (by[p] = by[p] || []).push(racerName(r, players));
      });
      Object.keys(by).forEach((p) => {
        if (by[p].length > 1) out.push({ cupKey: cup.key, race: race + 1, position: Number(p), names: by[p] });
      });
    }
  });
  return out;
}

// Each racer's league identity: an existing player id, or "new:<name>" (reusing a player whose name matches).
function identity(r, players) {
  if (r.assign === "new") {
    const nm = String(r.newName || "").trim();
    const ex = matchPlayer(players, nm);
    return ex ? ex.id : "new:" + nm.toLowerCase();
  }
  return r.assign;
}

// The first thing stopping this night from being saved, or "".
export function validateNight(night, players) {
  const max = Number(night.max);
  if (!night.date) return "Pick the date the cups were raced.";
  if (!(Number(night.week) >= 1 && Number(night.week) <= 52)) return "Pick a week from 1 to 52.";
  if (!(max > 0 && Math.round(max) === max)) return "Max points per cup must be a whole number above 0.";
  if (!night.cups.length) return "Add the cups you raced.";
  if (!night.racers.length) return "Add the racers.";

  const seen = {};
  for (let i = 0; i < night.racers.length; i++) {
    const r = night.racers[i];
    if (!r.assign) return `Pick who racer ${i + 1} is (a player, a new player, or unclaimed).`;
    if (r.assign === "new") {
      const nm = String(r.newName || "").trim();
      if (!nm) return `Give racer ${i + 1} a name.`;
      if (nm.length > 40) return `${nm.slice(0, 20)}… is too long for a name (40 characters at most).`;
    }
    if (r.assign !== "unclaimed" && r.assign !== "new" && !players.some((p) => p.id === r.assign)) {
      return `Racer ${i + 1}'s player no longer exists. Pick them again.`;
    }
    if (r.assign === "unclaimed") continue;
    const id = identity(r, players);
    if (seen[id]) return `${racerName(r, players)} is in the lineup twice.`;
    seen[id] = true;
  }

  for (const cup of night.cups) {
    const name = String(cup.name || "").trim();
    if (!name) return "Every cup needs a name.";
    if (name.length > 40) return `${name.slice(0, 20)}… is too long for a cup name (40 characters at most).`;
    const filled = cup.maps.filter((m) => m && String(m).trim()).length;
    if (filled !== 0 && filled !== 4) return `Pick all 4 tracks for ${name}, or none.`;
    let n = 0;
    for (const r of night.racers) {
      const cell = cellOf(cup, r.key);
      if (night.entry === "races") {
        const f = filledPositions(cell);
        if (f > 0 && f < 4) {
          const missing = [1, 2, 3, 4].filter((k) => !cell.pos[k - 1]);
          return `${racerName(r, players)} is missing race ${missing.join(", ")} in ${name}. Fill all 4, or clear them if they sat it out.`;
        }
      }
      const pts = cellPoints(cell, night.entry);
      if (pts === null) continue;
      if (!(pts >= 0 && pts <= max && Math.round(pts) === pts)) {
        return `${racerName(r, players)}'s points in ${name} must be a whole number from 0 to ${max}.`;
      }
      n++;
    }
    if (!n) return `Nobody has a result in ${name}. Enter points, or remove the cup.`;
    if (n > MAX_RESULTS) return `${name} has more than ${MAX_RESULTS} results.`;
  }

  const clash = positionClashes(night, players)[0];
  if (clash) {
    const cup = night.cups.find((c) => c.key === clash.cupKey);
    return `${cup.name}, race ${clash.race}: ${clash.names.join(" and ")} both finished ${clash.position}${ord(clash.position)}.`;
  }
  return "";
}

// What the admin save sends: new players, then every cup with its results and race-by-race rows.
export function buildSave(night, state, now = Date.now()) {
  const players = state.players.slice();
  const created = [];
  const pidOf = {};
  night.racers.forEach((r) => {
    if (r.assign === "unclaimed") { pidOf[r.key] = null; return; }
    if (r.assign !== "new") { pidOf[r.key] = r.assign; return; }
    const nm = String(r.newName || "").trim();
    let p = matchPlayer(players, nm);
    if (!p) {
      p = { id: "p" + uid(), name: nm, color: nextColor(players), aliases: [] };
      players.push(p);
      created.push({ id: p.id, name: p.name, color: p.color });
    }
    pidOf[r.key] = p.id;
  });

  const cups = night.cups.map((cup, i) => {
    const results = [], races = [];
    night.racers.forEach((r) => {
      const cell = cellOf(cup, r.key);
      const pts = cellPoints(cell, night.entry);
      if (pts === null) return;
      const pid = pidOf[r.key];
      const character = cellCharacter(cell, r);
      results.push({ rid: cell.rid || (pid ? "p_" + pid : "u" + uid()), p: pid, pts, character, raw: "" });
      if (night.entry === "races" && pid && filledPositions(cell) === 4) {
        cell.pos.forEach((pos, k) => races.push({ player_id: pid, race: k + 1, position: Number(pos), character }));
      }
    });
    results.sort((a, b) => b.pts - a.pts);
    const out = {
      id: cup.cupId || "c" + uid(), cup: String(cup.name).trim(), date: night.date, week: Number(night.week),
      max: Number(night.max), notes: String(night.notes || "").trim(), maps: cup.maps.filter(Boolean).length === 4 ? cup.maps.slice() : [],
      has_photo: !!cup.photo || !!cup.hasPhoto, added_at: cup.addedAt || now + i, results, races,
    };
    if (cup.submission) out.submission = cup.submission;
    return out;
  });
  return { cups, players: created };
}

// What a member's submission sends: one submission per cup, tied together by a batch id.
export function buildSubmissions(night, players, batch = uid()) {
  return night.cups.map((cup) => ({
    sub: {
      id: "s" + uid(), batch, cup: String(cup.name).trim(), date: night.date, week: Number(night.week), max: Number(night.max),
      notes: String(night.notes || "").trim(), maps: cup.maps.filter(Boolean).length === 4 ? cup.maps.slice() : [],
      rows: night.racers
        .map((r) => ({ r, cell: cellOf(cup, r.key) }))
        .filter(({ cell }) => hasResult(cell, night.entry))
        .map(({ r, cell }) => ({
          rid: uid(), raw: racerName(r, players), character: cellCharacter(cell, r), pts: cellPoints(cell, night.entry),
          assign: r.assign, newName: r.assign === "new" ? String(r.newName || "").trim() : "",
          races: night.entry === "races" && filledPositions(cell) === 4 ? cell.pos.map(Number) : null,
        })),
    },
    photo: cup.photo || null,
  }));
}

// Pending submissions (one per cup, usually one batch) loaded back into a night for an admin to review.
export function nightFromSubmissions(subs, state) {
  const night = newNight(state, "review");
  const first = subs[0];
  Object.assign(night, { date: first.date, week: first.week || 1, max: first.max || night.max, notes: first.notes || "" });
  night.racers = [];
  const byIdent = {};
  let anyRaces = false;
  subs.forEach((s) => (s.rows || []).forEach((row) => { if (Array.isArray(row.races)) anyRaces = true; }));
  night.entry = anyRaces ? "races" : "totals";

  night.cups = subs.map((s) => {
    const cup = newCup({ name: s.cup, maps: (s.maps || []).slice(), submission: s.id });
    (s.rows || []).forEach((row, i) => {
      if (row.assign === "ignore") return;
      let assign = row.assign, newName = "";
      if (assign !== "unclaimed" && assign !== "new" && !state.players.some((p) => p.id === assign)) {
        assign = "new"; newName = row.newName || row.raw || "";
      } else if (assign === "new") {
        newName = row.newName || row.raw || "";
        const ex = matchPlayer(state.players, newName);
        if (ex) { assign = ex.id; newName = ""; }
      }
      // The same unclaimed character across cups of one night is the same person.
      const key = assign === "unclaimed" ? (row.character ? `u:${row.character}` : `u:${s.id}:${i}`)
        : assign === "new" ? "n:" + newName.toLowerCase() : assign;
      let racer = byIdent[key];
      if (!racer) {
        racer = newRacer({ assign, newName, character: row.character || "" });
        byIdent[key] = racer;
        night.racers.push(racer);
      }
      const cell = emptyCell();
      if (row.character && racer.character && row.character !== racer.character) cell.character = row.character;
      if (Array.isArray(row.races) && row.races.length === 4) cell.pos = row.races.map(String);
      else cell.pts = row.pts == null ? "" : String(row.pts);
      cup.cells[racer.key] = cell;
    });
    return cup;
  });
  if (!night.racers.length) night.racers = [newRacer()];
  return night;
}

// A finished cup loaded for editing. Its tracks stay locked.
export function nightFromCup(cup, state) {
  const night = newNight(state, "edit");
  Object.assign(night, { date: cup.date, week: cup.week, max: cup.max, notes: cup.notes || "" });
  const races = (state.races || []).filter((r) => r.cupId === cup.id);
  night.entry = races.length ? "races" : "totals";
  const c = newCup({
    cupId: cup.id, name: cup.cup, maps: (cup.maps || []).slice(), locked: (cup.maps || []).length > 0,
    hasPhoto: cup.hasPhoto, addedAt: cup.addedAt,
  });
  night.racers = cup.results.map((r) => {
    const racer = newRacer({ assign: r.p || "unclaimed", character: r.character || "" });
    const cell = { ...emptyCell(), rid: r.rid, pts: String(r.pts) };
    const mine = r.p ? races.filter((x) => x.playerId === r.p) : [];
    if (mine.length === 4) {
      cell.pos = [1, 2, 3, 4].map((n) => String((mine.find((x) => x.race === n) || {}).position || ""));
    }
    c.cells[racer.key] = cell;
    return racer;
  });
  if (!night.racers.length) night.racers = [newRacer()];
  night.cups = [c];
  return night;
}

// A scheduled cup night: its cups (with tracks when the name matches a game cup or template) and the people who were in.
export function nightFromEvent(ev, state, mode) {
  const night = newNight(state, mode);
  const d = new Date(ev.startsAt);
  night.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  night.cups = ev.cups.map((name) => {
    const t = templateByName(state, name);
    return t ? cupFromTemplate(t) : newCup({ name });
  });
  const racers = ev.going.map((g) => {
    const p = state.players.find((x) => x.userId === g.userId);
    return p ? newRacer({ assign: p.id }) : newRacer({ assign: "new", newName: g.name || "" });
  });
  if (racers.length) night.racers = racers;
  return night;
}

// Match a photo's highlighted (human) rows to the lineup, by character first (everyone kept one all night),
// then by the name on screen. Returns { matches: {racerKey: row}, extra: [rows nobody matched] }.
export function matchPhotoRows(racers, rows, players) {
  const humans = (rows || []).map((r, idx) => ({ ...r, idx })).filter((r) => r.human);
  const matches = {}, used = new Set();
  racers.forEach((r) => {
    if (!r.character) return;
    const sameChar = racers.filter((o) => o.character === r.character);
    const rowsChar = humans.filter((h) => h.character === r.character && !used.has(h.idx));
    if (sameChar.length === 1 && rowsChar.length === 1) { matches[r.key] = rowsChar[0]; used.add(rowsChar[0].idx); }
  });
  racers.forEach((r) => {
    if (matches[r.key] || r.assign === "unclaimed") return;
    const name = racerName(r, players).toLowerCase();
    const p = r.assign !== "new" ? players.find((x) => x.id === r.assign) : null;
    const names = [name].concat(p ? (p.aliases || []).map((a) => a.toLowerCase()) : []);
    const hit = humans.filter((h) => !used.has(h.idx) && h.name && names.includes(h.name.trim().toLowerCase()));
    if (hit.length === 1) { matches[r.key] = hit[0]; used.add(hit[0].idx); }
  });
  return { matches, extra: humans.filter((h) => !used.has(h.idx)) };
}

// Strip what can't go in browser storage (photos) from a draft.
export function draftForStorage(night) {
  return { ...night, cups: night.cups.map((c) => ({ ...c, photo: null, photoChanged: false })) };
}
