// Tracks: which game cup each belongs to, a racer's best tracks from their results, and the track vote
// for a cup night. Pure functions, tested in tests/tracks-lib.test.js (the data hook is in trackVotes.js).
import { BUILTIN_CUPS, TRACKS } from "./constants";

// Matches vote_track in supabase/schema.sql.
export const MAX_TRACK_VOTES = 8;

// The game cup a track belongs to ("Coconut Mall" → Flower Cup), or null for a custom track.
export function trackCup(track) {
  const c = BUILTIN_CUPS.find((x) => x.maps.indexOf(track) >= 0);
  return c ? c.name : null;
}

export function trackKind(track) {
  const i = TRACKS.indexOf(track);
  return i < 0 ? null : i < 16 ? "Nitro" : "Retro";
}

// A racer's tracks, best first, from their cups in compute()'s log. Race-by-race cups count each race
// (points out of 15 and the place); a cup entered from its totals counts as its 4 tracks, each at the
// cup's average per race (no place). `vsUsual` is the average minus the racer's own average per race,
// so a track shows up as a strength even for someone who usually scores low.
//   log: [{ cup: { maps }, pts, max, races: [{ race, points, position }] }]
//   returns [{ track, races, avgPts, avgPos|null, wins, vsUsual }]
export function bestTracks(log, { minRaces = 1 } = {}) {
  const by = {};
  let allPts = 0, allRaces = 0;
  const add = (track, pts, pos) => {
    const t = by[track] || (by[track] = { track, races: 0, pts: 0, placed: 0, posSum: 0, wins: 0 });
    t.races++; t.pts += pts;
    if (pos != null) { t.placed++; t.posSum += pos; if (pos === 1) t.wins++; }
    allPts += pts; allRaces++;
  };
  (log || []).forEach((l) => {
    const maps = (l.cup && l.cup.maps) || [];
    if (l.races && l.races.length) {
      l.races.forEach((x) => { const track = maps[x.race - 1]; if (track) add(track, x.points, x.position); });
    } else if (maps.length === 4 && maps.every(Boolean) && l.max) {
      const perRace = (l.pts / l.max) * 15;
      maps.forEach((track) => add(track, perRace, null));
    }
  });
  const usual = allRaces ? allPts / allRaces : 0;
  return Object.values(by)
    .filter((t) => t.races >= minRaces)
    .map((t) => ({
      track: t.track, races: t.races, avgPts: t.pts / t.races,
      avgPos: t.placed ? t.posSum / t.placed : null, wins: t.wins, vsUsual: t.pts / t.races - usual,
    }))
    .sort((a, b) => b.avgPts - a.avgPts || b.races - a.races || a.track.localeCompare(b.track));
}

// The vote rows as the site uses them, most votes first.
export function mapTally(rows) {
  return (rows || []).map((r) => ({
    track: r.track, votes: Number(r.votes) || 0, voters: r.voters || [], mine: !!r.mine,
  }));
}

// The league's track table from compute()'s output: every track raced in a finished cup, with how often,
// when last, and (from race-by-race cups) the average winning points among league players and the chaos
// index: how far finishes there stray from each racer's usual place (average |place − their average place|).
//   returns { tracks: [{ track, times, last, races, avgWin|null, chaos|null }], coverage: { raced, total, unraced } }
export function leagueTracks(m) {
  const rows = m.ranked.concat(m.unranked);
  const usual = new Map(rows.filter((s) => s.avgRace != null).map((s) => [s.player.id, s.avgRace]));
  const by = {};
  const t = (track) => by[track] || (by[track] = { track, times: 0, last: "", races: {}, dev: 0, devN: 0 });
  m.cups.forEach((c) => {
    (c.maps || []).forEach((track) => {
      if (!track) return;
      const x = t(track);
      x.times++;
      if ((c.date || "") > x.last) x.last = c.date || "";
    });
  });
  rows.forEach((s) => s.log.forEach((l) => (l.races || []).forEach((r) => {
    const track = (l.cup.maps || [])[r.race - 1];
    if (!track) return;
    const x = t(track);
    const k = l.cup.id + "|" + r.race;
    x.races[k] = Math.max(x.races[k] == null ? -1 : x.races[k], r.points);
    if (usual.has(s.player.id)) { x.dev += Math.abs(r.position - usual.get(s.player.id)); x.devN++; }
  })));
  const tracks = Object.values(by).map((x) => {
    const wins = Object.values(x.races);
    return {
      track: x.track, times: x.times, last: x.last, races: wins.length,
      avgWin: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null,
      chaos: x.devN ? x.dev / x.devN : null,
    };
  }).sort((a, b) => b.times - a.times || b.last.localeCompare(a.last) || a.track.localeCompare(b.track));
  const raced = new Set(tracks.map((x) => x.track));
  return { tracks, coverage: { raced: TRACKS.filter((x) => raced.has(x)).length, total: TRACKS.length, unraced: TRACKS.filter((x) => !raced.has(x)) } };
}
