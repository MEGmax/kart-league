import { describe, expect, it, vi } from "vitest";
import { BACKLOG_VERSION, BacklogError, groupBacklog, mainCharacters, nightFromBacklog, placeFromGained } from "../src/lib/backlog.js";
import { normalizeRead, readResultsImage, ReadError } from "../src/lib/gemini.js";
import { cellPoints, validateNight } from "../src/lib/night.js";
import { normalize } from "../src/lib/standings.js";
import { RACE_POINTS } from "../src/lib/constants.js";
import { readExif } from "../scripts/lib/exif.js";

const CPUS = ["Mario", "Luigi", "Peach", "Toad", "Wario", "Waluigi", "King Boo", "Dry Bones", "Bowser", "Donkey Kong", "Diddy Kong", "Baby Mario"];

// A cup's photos as Gemini would read them: 4 race screens (+N in finishing order, running totals) and
// the end-of-cup screen. `humans` = [{ highlight, character, places: [4] }]; CPUs fill the other places.
// `resorted: { 2: "standings" }` shows race 2 the way the game does a moment later: re-sorted by total,
// no +N (and here mislabeled as Gemini sometimes does).
function cupReads(tag, humans, { from = 0, standings = true, resorted = {} } = {}) {
  const totals = {};
  const reads = [];
  for (let race = 0; race < 4; race++) {
    const byPlace = {};
    humans.forEach((h) => { byPlace[h.places[race]] = { ...h, human: true }; });
    const cpus = CPUS.filter((c) => !humans.some((h) => h.character === c));
    let rows = [];
    for (let pos = 1, k = 0; pos <= 12; pos++) {
      const who = byPlace[pos] || { character: cpus[k++], highlight: "none", human: false };
      const gained = RACE_POINTS[pos - 1];
      const key = `${who.character}|${who.highlight}`;
      totals[key] = (totals[key] || 0) + gained;
      rows.push({ pos, character: who.character, name: who.character, gained, points: totals[key], human: who.human, highlight: who.highlight });
    }
    let screen = "race";
    if (resorted[race + 1]) {
      rows = rows.slice().sort((a, b) => b.points - a.points).map((r, i) => ({ ...r, pos: i + 1, gained: null }));
      screen = resorted[race + 1];
    }
    reads.push({ file: `${tag}-r${race + 1}.jpg`, takenAt: `2026-11-15T20:${String(from + race * 4).padStart(2, "0")}:00`, screen, rows });
  }
  if (standings) {
    const rows = reads[3].rows.slice().sort((a, b) => b.points - a.points).map((r, i) => ({ ...r, pos: i + 1, gained: null }));
    reads.push({ file: `${tag}-final.jpg`, takenAt: `2026-11-15T20:${String(from + 15).padStart(2, "0")}:00`, screen: "standings", rows });
  }
  return reads;
}
const drop = (reads, ...files) => reads.filter((r) => !files.includes(r.file));
const tweak = (read, character, patch) => ({ ...read, rows: read.rows.map((r) => (r.character === character ? { ...r, ...patch } : r)) });

const A = [
  { highlight: "orange", character: "Yoshi", places: [2, 1, 3, 1] },
  { highlight: "blue", character: "Luigi", places: [1, 4, 1, 5] },
  { highlight: "green", character: "Baby Peach", places: [6, 2, 9, 2] },
];

describe("grouping a night's photos into cups", () => {
  it("turns race screens into each human's race places and totals", () => {
    const g = groupBacklog(cupReads("a", A));
    expect(g.cups).toHaveLength(1);
    const [cup] = g.cups;
    expect(cup).toMatchObject({ name: "Cup 1", complete: true, photo: "a-final.jpg", races: ["a-r1.jpg", "a-r2.jpg", "a-r3.jpg", "a-r4.jpg"], standings: ["a-final.jpg"] });
    expect(cup.racers.find((r) => r.character === "Yoshi")).toMatchObject({ id: "char:Yoshi", highlight: "orange", places: [2, 1, 3, 1], total: 52 });
    expect(cup.racers.find((r) => r.character === "Luigi")).toMatchObject({ places: [1, 4, 1, 5], total: 45 });
    expect(g.issues).toEqual([]);
    expect(g.skipped).toEqual([]);
  });

  it("works from running totals when a screen was photographed after it re-sorted (no +N), whatever Gemini called it", () => {
    const g = groupBacklog(cupReads("a", A, { resorted: { 1: "race", 2: "standings", 3: "standings" } }));
    expect(g.cups).toHaveLength(1);
    expect(g.cups[0]).toMatchObject({ complete: true, photo: "a-final.jpg", standings: ["a-final.jpg"] });
    expect(g.cups[0].racers.map((r) => r.places)).toEqual([[1, 4, 1, 5], [2, 1, 3, 1], [6, 2, 9, 2]]);
    expect(g.issues).toEqual([]);
  });

  it("works out a race with no photo from the next screen's +N", () => {
    const g = groupBacklog(drop(cupReads("a", A), "a-r2.jpg"));
    expect(g.cups[0].complete).toBe(true);
    expect(g.cups[0].racers.find((r) => r.character === "Yoshi").places).toEqual([2, 1, 3, 1]);
    expect(g.issues).toEqual(["Cup 1: race 2 worked out from a-r3 (no photo of it)."]);
    const first = groupBacklog(drop(cupReads("a", A), "a-r1.jpg"));
    expect(first.cups[0].complete).toBe(true);
  });

  it("falls back to the totals shown when races can't be worked out", () => {
    const g = groupBacklog(drop(cupReads("a", A), "a-r2.jpg", "a-r3.jpg"));
    expect(g.cups[0].complete).toBe(false);
    expect(g.cups[0].racers.find((r) => r.character === "Yoshi")).toMatchObject({ places: [2, null, null, null], total: 52 });
    expect(g.issues.join("\n")).toMatch(/can't tell which race a-r4 is/);
  });

  it("starts a new cup when totals reset, and skips non-results and repeat photos", () => {
    const reads = cupReads("a", A)
      .concat([{ file: "kart-select.jpg", takenAt: "2026-11-15T20:16:00", screen: "other", rows: [] }])
      .concat(cupReads("b", A, { from: 20, standings: false }));
    reads.splice(2, 0, { ...reads[1], file: "a-r2-again.jpg", screen: "standings", rows: reads[1].rows.map((r) => ({ ...r, gained: null })) });
    const g = groupBacklog(reads);
    expect(g.cups.map((c) => [c.name, c.complete, c.photo])).toEqual([["Cup 1", true, "a-final.jpg"], ["Cup 2", true, "b-r4.jpg"]]);
    expect(g.cups[0].files).toContain("a-r2-again.jpg");
    expect(g.skipped).toEqual([{ file: "kart-select.jpg", reason: "not a results screen" }]);
    expect(g.issues).toEqual([]);
  });

  it("isn't thrown by a highlight color read two ways, or a CPU row misread as human", () => {
    const reads = cupReads("a", A);
    reads[2] = tweak(reads[2], "Yoshi", { highlight: "yellow" });
    reads[4] = tweak(reads[4], "Waluigi", { human: true, highlight: "blue" });
    const g = groupBacklog(reads);
    expect(g.cups[0].complete).toBe(true);
    expect(g.cups[0].racers.map((r) => r.character)).toEqual(["Luigi", "Yoshi", "Baby Peach"]);
    expect(g.issues).toEqual(["Cup 1: ignored Waluigi, highlighted in only 1 of 5 photos."]);
  });

  it("flags a misread total but keeps the cup", () => {
    const reads = cupReads("a", A);
    reads[4] = tweak(reads[4], "Luigi", { points: 41 });
    const g = groupBacklog(reads);
    expect(g.cups[0].complete).toBe(true);
    expect(g.issues).toEqual(["a-final: Luigi shows 41, but it was 45 on the photo before. Check the photo."]);
    expect(g.cups[0].racers.find((r) => r.character === "Luigi").total).toBe(45);
  });

  it("tells two humans with the same character apart by color", () => {
    const twins = [{ highlight: "blue", character: "Mii", places: [1, 2, 3, 4] }, { highlight: "red", character: "Mii", places: [2, 1, 4, 3] }];
    const g = groupBacklog(cupReads("a", twins));
    expect(g.cups[0].racers.map((r) => [r.id, r.places])).toEqual([["char:Mii|blue", [1, 2, 3, 4]], ["char:Mii|red", [2, 1, 4, 3]]]);
  });

  it("maps +N back to a finishing place", () => {
    expect(RACE_POINTS.map(placeFromGained)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(placeFromGained(9)).toBeNull();
  });
});

describe("importing a backlog file on the Add page", () => {
  const state = normalize({
    league: { seasonWeeks: 5, cupsPerWeek: 4 },
    players: [{ id: "pm", name: "Matty", color: "#E5484D" }, { id: "pl", name: "Licia", color: "#0090FF" }, { id: "pk", name: "Kieran", color: "#30A46C" }],
    cups: [{
      id: "c1", cup: "Random Cup", date: "2026-11-08", week: 1, max: 60, status: "complete",
      results: [{ rid: "1", p: "pm", pts: 40, character: "Yoshi" }, { rid: "2", p: "pl", pts: 50, character: "Baby Peach" }, { rid: "3", p: "pk", pts: 30, character: "Mario" }],
    }],
    races: [], templates: [],
  });
  const file = () => {
    const g = groupBacklog(cupReads("a", A).concat(drop(cupReads("b", A, { from: 20, standings: false }), "b-r2.jpg", "b-r3.jpg")));
    return { version: BACKLOG_VERSION, source: "data/cups_W2_results", date: "2026-11-15", week: 2, cups: g.cups.map((c, i) => ({ ...c, photo: i === 0 ? { file: c.photo, data: "QUJD" } : null })) };
  };

  it("guesses players from their usual character, leaves the rest unclaimed, and fills places or totals", () => {
    const n = nightFromBacklog(file(), state, "add");
    expect(n).toMatchObject({ mode: "add", date: "2026-11-15", week: 2, entry: "races" });
    expect(n.racers.map((r) => [r.character, r.assign])).toEqual([["Luigi", "unclaimed"], ["Yoshi", "pm"], ["Baby Peach", "pl"]]);
    const yoshi = n.racers[1];
    expect(n.cups[0]).toMatchObject({ name: "Cup 1", photo: "QUJD", photoChanged: true });
    expect(n.cups[0].cells[yoshi.key].pos).toEqual(["2", "1", "3", "1"]);
    expect(n.cups[1].photo).toBeNull();
    expect(n.cups[1].cells[yoshi.key]).toMatchObject({ pts: "52", pos: ["", "", "", ""] });
    expect(cellPoints(n.cups[1].cells[yoshi.key], "races")).toBe(52);
    expect(validateNight(n, state.players)).toBe("");
  });

  it("uses the names given with --who: an existing player, or a new one", () => {
    const f = file();
    f.cups.forEach((c) => c.racers.forEach((r) => {
      if (r.character === "Luigi") r.who = "kieran";
      if (r.character === "Baby Peach") r.who = "Gerrard";
    }));
    const n = nightFromBacklog(f, state, "add");
    expect(n.racers.map((r) => [r.character, r.assign, r.newName])).toEqual([["Luigi", "pk", ""], ["Yoshi", "pm", ""], ["Baby Peach", "new", "Gerrard"]]);
    expect(validateNight(n, state.players)).toBe("");
  });

  it("never guesses the same player for two racers, or a player whose main is shared", () => {
    const tied = normalize({
      league: state.league, players: state.players.concat([{ id: "pz", name: "Zed" }]), races: [], templates: [],
      cups: state.cups.concat([{ id: "c2", cup: "X", week: 1, max: 60, status: "complete", results: [{ rid: "1", p: "pz", pts: 1, character: "Yoshi" }] }]),
    });
    expect(mainCharacters(tied).Yoshi).toBeUndefined();
    expect(mainCharacters(state)).toEqual({ Yoshi: "pm", "Baby Peach": "pl", Mario: "pk" });
  });

  it("rejects files that aren't backlog files", () => {
    expect(() => nightFromBacklog({ cups: [] }, state, "add")).toThrow(BacklogError);
    expect(() => nightFromBacklog({ version: BACKLOG_VERSION, cups: [] }, state, "add")).toThrow(/no cups/);
  });
});

describe("reading a photo with Gemini", () => {
  const reply = (obj, extra = {}) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking…", thought: true }, { text: JSON.stringify(obj) }] } }], ...extra });
  const fakeFetch = (status, body) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

  it("sends the photo with a JSON schema and returns rows the site understands", async () => {
    const fetchImpl = fakeFetch(200, reply({
      screen: "race", cup: null,
      rows: [{ pos: 1, character: "Yoshi", name: "Yoshi", gained: 15, total: 37, human: true, highlight: "orange" },
        { pos: 2, character: "Waluigi", name: "Waluigi", gained: 12, total: 20, human: false, highlight: "blue" }],
    }));
    const out = await readResultsImage({ apiKey: "k", b64: "QUJD", fetchImpl, model: "m-1" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/m-1:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "QUJD" } });
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", mediaResolution: "MEDIA_RESOLUTION_HIGH" });
    expect(body.generationConfig.responseJsonSchema.required).toEqual(["screen", "cup", "rows"]);
    expect(out).toEqual({
      screen: "race", cup: null,
      rows: [{ pos: 1, name: "Yoshi", character: "Yoshi", points: 37, gained: 15, human: true, highlight: "orange" },
        { pos: 2, name: "Waluigi", character: "Waluigi", points: 20, gained: 12, human: false, highlight: "none" }],
    });
  });

  it("turns API failures into messages people can act on", async () => {
    const run = (status, body) => readResultsImage({ apiKey: "k", b64: "x", fetchImpl: fakeFetch(status, body), keyHint: "Check .env." });
    await expect(run(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } })).rejects.toThrow("Google rejected the Gemini API key. Check .env.");
    await expect(run(429, { error: { status: "RESOURCE_EXHAUSTED" } })).rejects.toThrow(/quota/);
    await expect(run(200, { candidates: [{ finishReason: "SAFETY" }] })).rejects.toThrow(/declined/);
    await expect(run(200, reply({}, { promptFeedback: { blockReason: "OTHER" } }))).rejects.toThrow(ReadError);
    await expect(readResultsImage({ apiKey: "", b64: "x" })).rejects.toThrow(/No Gemini API key/);
  });

  it("drops rows from screens that aren't results and unknown characters", () => {
    expect(normalizeRead({ screen: "other", rows: [{ pos: 1 }] })).toEqual({ screen: "other", cup: null, rows: [] });
    expect(normalizeRead({ screen: "standings", cup: " Star Cup ", rows: [{ pos: "3", character: "Shy Guy", total: "21", human: true, highlight: "none" }] }).rows[0])
      .toMatchObject({ pos: 3, character: "", points: 21, gained: null, human: true, highlight: "other" });
  });
});

describe("EXIF", () => {
  // A minimal JPEG: SOI, then an APP1 Exif block with Make and an Exif IFD holding DateTimeOriginal.
  function jpegWithExif(make, when) {
    const t = Buffer.alloc(200);
    t.write("MM", 0, "latin1"); t.writeUInt16BE(42, 2); t.writeUInt32BE(8, 4);
    t.writeUInt16BE(2, 8); // IFD0: 2 entries
    t.writeUInt16BE(0x010f, 10); t.writeUInt16BE(2, 12); t.writeUInt32BE(make.length + 1, 14); t.writeUInt32BE(100, 18);
    t.writeUInt16BE(0x8769, 22); t.writeUInt16BE(4, 24); t.writeUInt32BE(1, 26); t.writeUInt32BE(40, 30);
    t.writeUInt16BE(1, 40); // Exif IFD: 1 entry
    t.writeUInt16BE(0x9003, 42); t.writeUInt16BE(2, 44); t.writeUInt32BE(20, 46); t.writeUInt32BE(120, 50);
    t.write(make + "\0", 100, "latin1"); t.write(when + "\0", 120, "latin1");
    const app1 = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), t]);
    const len = Buffer.alloc(2); len.writeUInt16BE(app1.length + 2);
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1, Buffer.from([0xff, 0xda, 0, 2])]);
  }

  it("reads the camera and when the photo was taken, and nothing from other files", () => {
    expect(readExif(jpegWithExif("Apple", "2026:11:15 20:26:24"))).toEqual({ make: "Apple", takenAt: "2026-11-15T20:26:24" });
    expect(readExif(Buffer.from("\x89PNG\r\n", "latin1"))).toEqual({});
  });
});
