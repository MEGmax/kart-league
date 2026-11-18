// A backlog of results photos (a night's race screens, taken in order) turned into cups.
// Pure functions: scripts/read-backlog.mjs reads the photos with Gemini and calls groupBacklog();
// the Add page's "Import a backlog file" calls nightFromBacklog() with the file it wrote.
//
// read  = { file, takenAt, screen: "race" | "standings" | "other", rows: [{pos, character, name, gained, points, human, highlight}] }
// group = { cups: [{ name, takenAt, files, photo, races, standings, complete, racers: [{ id, character, highlight, places[4], total }] }],
//           skipped: [{ file, reason }], issues: [string] }
//
// Every results screen is a snapshot of the humans' running cup totals. A race's points are the change
// in total since the previous snapshot (a valid 15/12/10/... value, different for each human), and a
// "+N" on screen confirms it or, when the photo before is missing, lets that race be worked out too.
// Totals going down means a new cup. Screen type doesn't matter: the game shows a race's results with
// "+N", then re-sorted by total without it, and the end-of-cup screen repeats the last race's totals.
import { RACE_POINTS, UNKNOWN_CUP } from "./constants";
import { newCup, newNight, newRacer, emptyCell, matchPlayer, mergeRacers, suggestWeek } from "./night";

export const BACKLOG_VERSION = 1;

export function placeFromGained(gained) {
  const i = RACE_POINTS.indexOf(gained);
  return i < 0 ? null : i + 1;
}

// Humans on one screen, keyed by character; by character and highlight color only when two humans on
// the screen share a character (Gemini isn't consistent about orange vs yellow, so color alone is a poor key).
function snapshot(read) {
  const hs = read.rows.filter((r) => r.human);
  const count = {};
  hs.forEach((h) => { count[h.character] = (count[h.character] || 0) + 1; });
  const humans = new Map();
  hs.forEach((h) => {
    const id = count[h.character] > 1 ? `char:${h.character || "?"}|${h.highlight}` : `char:${h.character || "?"}`;
    humans.set(id, { character: h.character, highlight: h.highlight, gained: h.gained, total: h.points });
  });
  return { file: read.file, takenAt: read.takenAt, screen: read.screen, humans };
}

// One race's points for these humans: each a value from the points table, no two the same.
function oneRace(points) {
  const vals = [...points.values()];
  return vals.length > 0 && vals.every((v) => RACE_POINTS.includes(v)) && new Set(vals).size === vals.length;
}

function mostCommon(list) {
  const n = {};
  let best = "", bestN = 0;
  list.filter(Boolean).forEach((x) => { n[x] = (n[x] || 0) + 1; if (n[x] > bestN) { best = x; bestN = n[x]; } });
  return best;
}

const who = (id) => id.replace(/^char:/, "").replace("|", " ");
// Photo names from a phone are long ids: the first 8 characters are enough to find one.
const short = (f) => (f.length > 24 ? f.slice(0, 8) : f.replace(/\.[^.]+$/, ""));

// Reads must be in the order the photos were taken.
export function groupBacklog(reads) {
  const cups = [], skipped = [], issues = [];
  let cur = null;

  const open = () => {
    cur = { snaps: [], totals: new Map(), race: 0, races: [null, null, null, null], lost: false, ended: false, notes: [] };
    cups.push(cur);
  };
  const record = (k, points) => {
    if (k > 4) { cur.lost = true; cur.notes.push(`more than 4 races' worth of points (${short(points.file)})`); return; }
    cur.races[k - 1] = points.map;
  };

  reads.forEach((read) => {
    if (read.screen === "other" || !read.rows.length) { skipped.push({ file: read.file, reason: "not a results screen" }); return; }
    const snap = snapshot(read);
    if (!snap.humans.size) { skipped.push({ file: read.file, reason: "no highlighted (human) rows" }); return; }
    const withTotal = [...snap.humans].filter(([, h]) => h.total != null);
    if (!withTotal.length) { skipped.push({ file: read.file, reason: "no totals could be read" }); return; }

    // Same cup, or a new one? Totals only go up within a cup, and an end-of-cup screen closes it
    // (once it has had 4 races, or when its races can't be counted, e.g. a night of end-of-cup photos only).
    if (cur) {
      const common = withTotal.filter(([id]) => cur.totals.has(id));
      const down = common.filter(([id, h]) => h.total < cur.totals.get(id)).length;
      const repeat = common.length && common.filter(([id, h]) => h.total === cur.totals.get(id)).length > common.length / 2;
      if (!common.length || down > common.length / 2 || (cur.ended && !repeat)) open();
    } else open();

    const base = (id) => cur.totals.get(id) || 0;
    const ids = withTotal.map(([id]) => id).filter((id) => !cur.snaps.length || cur.totals.has(id));
    const diff = new Map(ids.map((id) => [id, snap.humans.get(id).total - base(id)]));
    const same = ids.filter((id) => diff.get(id) === 0).length;
    cur.snaps.push(snap);

    if (cur.snaps.length > 1 && same > ids.length / 2) {
      // Another photo of the last race (re-sorted, or the end-of-cup screen).
      if (snap.screen === "standings" && (cur.race === 4 || cur.race === null)) cur.ended = true;
      const off = ids.filter((id) => diff.get(id) !== 0);
      if (off.length) issues.push(`${short(read.file)}: ${off.map((id) => `${who(id)} shows ${snap.humans.get(id).total}`).join(", ")}, but ${off.length === 1 ? "it was" : "they were"} ${off.map((id) => base(id)).join(", ")} on the photo before. Check the photo.`);
      return;
    }

    const gained = new Map(ids.filter((id) => snap.humans.get(id).gained != null).map((id) => [id, snap.humans.get(id).gained]));
    const hasGained = gained.size === ids.length && ids.length > 0;
    if (cur.race !== null && oneRace(diff)) {
      // One race since the last photo.
      cur.race += 1;
      record(cur.race, { file: read.file, map: diff });
      if (hasGained) {
        const off = ids.filter((id) => gained.get(id) !== diff.get(id));
        if (off.length) issues.push(`${short(read.file)}: ${off.map((id) => `${who(id)} shows +${gained.get(id)} but went from ${base(id)} to ${snap.humans.get(id).total}`).join("; ")}. Check the photo.`);
      }
    } else if (cur.race !== null && hasGained && oneRace(gained) && oneRace(new Map(ids.map((id) => [id, diff.get(id) - gained.get(id)])))) {
      // A race photo is missing, but this screen's +N shows what the missing race must have been.
      const missing = new Map(ids.map((id) => [id, diff.get(id) - gained.get(id)]));
      cur.race += 1;
      record(cur.race, { file: read.file, map: missing });
      cur.notes.push(`race ${cur.race} worked out from ${short(read.file)} (no photo of it)`);
      cur.race += 1;
      record(cur.race, { file: read.file, map: gained });
    } else {
      if (cur.race !== null) cur.notes.push(`can't tell which race ${short(read.file)} is (photos missing before it, or a misread number)`);
      cur.lost = true;
      cur.race = null;
    }
    ids.forEach((id) => cur.totals.set(id, snap.humans.get(id).total));
    if (snap.screen === "standings" && (cur.race === 4 || cur.race === null)) cur.ended = true;
  });

  const out = cups.map((c, i) => {
    const n = c.snaps.length;
    // Someone highlighted in only a minority of a cup's photos is a misread CPU row.
    const seen = {};
    c.snaps.forEach((s) => s.humans.forEach((_, id) => { seen[id] = (seen[id] || 0) + 1; }));
    const ids = Object.keys(seen).filter((id) => seen[id] * 2 >= n);
    const dropped = Object.keys(seen).filter((id) => !ids.includes(id));
    if (dropped.length) issues.push(`Cup ${i + 1}: ignored ${dropped.map(who).join(", ")}, highlighted in only ${dropped.map((id) => seen[id]).join("/")} of ${n} photos.`);

    const last = c.snaps[n - 1];
    const racers = ids.map((id) => {
      const mine = c.snaps.map((s) => s.humans.get(id)).filter(Boolean);
      const places = c.races.map((m) => (m && m.has(id) ? placeFromGained(m.get(id)) : null));
      // The running total that checked out, not a later photo that disagreed with it.
      const lastSeen = c.snaps.slice().reverse().map((s) => s.humans.get(id)).find((h) => h && h.total != null);
      const total = c.totals.has(id) ? c.totals.get(id) : lastSeen ? lastSeen.total : null;
      return { id, character: mostCommon(mine.map((h) => h.character)), highlight: mostCommon(mine.map((h) => h.highlight)), places, total };
    });
    const complete = !c.lost && c.race === 4 && racers.every((r) => r.places.every(Boolean));
    racers.forEach((r) => {
      if (!complete || r.total == null) return;
      const sum = r.places.reduce((a, p) => a + RACE_POINTS[p - 1], 0);
      if (sum !== r.total) issues.push(`Cup ${i + 1}: ${who(r.id)}'s race places add up to ${sum} but the last photo shows ${r.total} pts.`);
    });
    if (!complete) {
      const have = c.races.filter(Boolean).length;
      c.notes.push(c.lost ? "race-by-race places incomplete, so it uses each racer's total from the last photo" : `only ${have} of 4 races, so it uses each racer's total from the last photo`);
    }
    c.notes.forEach((x) => issues.push(`Cup ${i + 1}: ${x}.`));
    const standings = c.snaps.filter((s) => s.screen === "standings");
    const final = standings.filter((s) => [...s.humans].every(([id, h]) => !last.humans.has(id) || last.humans.get(id).total === h.total)).pop();
    return {
      name: UNKNOWN_CUP,
      takenAt: c.snaps[0].takenAt || null,
      files: c.snaps.map((s) => s.file),
      photo: (final || last).file,
      races: c.snaps.filter((s) => s !== final).map((s) => s.file),
      standings: final ? [final.file] : [],
      complete,
      racers,
    };
  });
  return { cups: out, skipped, issues };
}

// Each player's most-picked character in finished cups, for guessing who a highlighted row is.
export function mainCharacters(state) {
  const counts = {};
  (state.cups || []).forEach((c) => {
    if (c.status && c.status !== "complete") return;
    (c.results || []).forEach((r) => {
      if (!r.p || !r.character) return;
      const k = `${r.p}|${r.character}`;
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  const best = {};
  Object.keys(counts).forEach((k) => {
    const [p, ch] = k.split("|");
    if (!best[p] || counts[k] > best[p].n) best[p] = { ch, n: counts[k] };
  });
  const byChar = {};
  Object.keys(best).forEach((p) => {
    const { ch, n } = best[p];
    const cur = byChar[ch];
    if (!cur || n > cur.n) byChar[ch] = { p, n };
    else if (n === cur.n) byChar[ch] = { p: null, n }; // two players share this main: guess neither
  });
  const out = {};
  Object.keys(byChar).forEach((ch) => { if (byChar[ch].p && state.players.some((x) => x.id === byChar[ch].p)) out[ch] = byChar[ch].p; });
  return out;
}

export class BacklogError extends Error {}

// The file written by scripts/read-backlog.mjs, as a night for the Add page: one racer per character.
// Who they are: the name given with --who (an existing player, else a new one), otherwise a guess from
// whose main that character is, otherwise unclaimed. Characters --who gives to the same person (someone
// who switched between cups) become one racer. Race-by-race places where every race could be worked
// out, the cup total where not.
export function nightFromBacklog(file, state, mode) {
  if (!file || file.version !== BACKLOG_VERSION || !Array.isArray(file.cups)) {
    throw new BacklogError("That isn't a backlog file from npm run backlog (or it's from an older version).");
  }
  if (!file.cups.length) throw new BacklogError("That backlog file has no cups in it.");
  const night = newNight(state, mode);
  if (/^\d{4}-\d{2}-\d{2}$/.test(file.date || "")) night.date = file.date;
  night.week = Number(file.week) >= 1 ? Number(file.week) : suggestWeek(state);
  night.entry = "races";

  const mains = mainCharacters(state);
  const taken = new Set();
  const byId = {};
  night.racers = [];
  file.cups.forEach((c) => c.racers.forEach((r) => {
    if (byId[r.id]) return;
    const allChars = file.cups.map((x) => (x.racers.find((y) => y.id === r.id) || {}).character).filter(Boolean);
    const character = mostCommon(allChars) || r.character || "";
    const who = file.cups.map((x) => (x.racers.find((y) => y.id === r.id) || {}).who).find(Boolean);
    const named = who ? matchPlayer(state.players, who) : null;
    if (named) taken.add(named.id);
    byId[r.id] = newRacer(named ? { assign: named.id, character } : who ? { assign: "new", newName: who, character } : { character });
    night.racers.push(byId[r.id]);
  }));
  night.racers.forEach((racer) => {
    if (racer.assign) return;
    const guess = mains[racer.character];
    racer.assign = guess && !taken.has(guess) ? guess : "unclaimed";
    if (racer.assign !== "unclaimed") taken.add(racer.assign);
  });

  night.cups = file.cups.map((c) => {
    const cup = newCup({ name: c.name || "Cup", photo: (c.photo && c.photo.data) || null, photoChanged: !!(c.photo && c.photo.data) });
    c.racers.forEach((r) => {
      const cell = emptyCell();
      if (Array.isArray(r.places) && r.places.length === 4 && r.places.every((p) => p >= 1 && p <= 12)) cell.pos = r.places.map(String);
      else if (r.total != null) cell.pts = String(r.total);
      else return;
      cup.cells[byId[r.id].key] = cell;
    });
    return cup;
  });
  if (!night.racers.length) return { ...night, racers: [newRacer()] };

  // One racer per person: fold together characters named as the same player.
  let merged = night;
  const first = {};
  night.racers.forEach((r) => {
    const k = r.assign === "new" ? `new:${r.newName.trim().toLowerCase()}` : r.assign !== "unclaimed" ? r.assign : null;
    if (!k) return;
    if (first[k]) merged = mergeRacers(merged, first[k], r.key);
    else first[k] = r.key;
  });
  return merged;
}
