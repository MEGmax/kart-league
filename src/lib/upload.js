// Upload a night's results photos at once (the Upload page, #/upload): each photo read by Gemini, grouped
// into cups (groupBacklog: an end-of-cup standings photo is one cup; race screens work too) and racers
// matched to players by the name on screen or their usual character. VS-mode end-of-cup screens don't show
// the course, so every cup starts as Unknown Cup and the admin picks its cup or tracks on the check screen.
// Pure functions, tested in tests/upload-lib.test.js.
//
// read = { file, takenAt, screen, rows, b64 }   (normalizeRead's output plus the file id, time and photo)
import { UNKNOWN_CUP } from "./constants";
import { BACKLOG_VERSION, BacklogError, groupBacklog, nightFromBacklog } from "./backlog";
import { cellPoints, matchPlayer, suggestWeek } from "./night";

// The week cups on this date were already saved under, else the suggested week.
function weekFor(state, date) {
  const same = (state.cups || []).find((c) => c.date === date);
  return same ? Number(same.week) || 1 : suggestWeek(state);
}

// Reads (sorted in the order the photos were taken) → { night, cups: [{ files, photo }], issues, skipped }.
// Throws BacklogError when no photo was a results screen.
export function nightFromPhotos(reads, state, { mode = "add", date } = {}) {
  const group = groupBacklog(reads);
  if (!group.cups.length) throw new BacklogError("None of those photos showed a results screen.");
  const b64 = {};
  reads.forEach((r) => { b64[r.file] = r.b64; });
  const file = {
    version: BACKLOG_VERSION, date, week: date ? weekFor(state, date) : undefined,
    cups: group.cups.map((c) => ({
      name: UNKNOWN_CUP,
      photo: b64[c.photo] ? { data: b64[c.photo] } : null,
      // A name on screen that is a league player's name (or alias) says who that was.
      racers: c.racers.map((r) => ({ ...r, who: r.name && matchPlayer(state.players, r.name) ? r.name : undefined })),
    })),
  };
  const night = nightFromBacklog(file, state, mode);
  night.max = (state.league && state.league.defaultMax) || 60;
  // End-of-cup photos only give totals: enter them as totals.
  const anyRaces = night.cups.some((c) => Object.values(c.cells).some((cell) => cell.pos.some(Boolean)));
  if (!anyRaces) night.entry = "totals";
  return { night, cups: group.cups.map((c) => ({ files: c.files, photo: c.photo })), issues: group.issues, skipped: group.skipped };
}

// Cups in this night that look already saved: same date and the same points (whatever the cup is called).
export function alreadySaved(night, state) {
  const pts = (list) => list.map(Number).sort((a, b) => b - a).join(",");
  return night.cups
    .map((c, i) => ({ i, mine: pts(Object.values(c.cells).map((cell) => cellPoints(cell, night.entry)).filter((p) => p !== null)) }))
    .filter(({ mine }) => (state.cups || []).some((x) => x.date === night.date && pts(x.results.map((r) => r.pts)) === mine))
    .map(({ i }) => i);
}
