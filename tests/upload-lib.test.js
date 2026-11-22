// Uploading a night's end-of-cup photos at once: grouping into cups and who's who.
import { describe, expect, it } from "vitest";
import { alreadySaved, nightFromPhotos } from "../src/lib/upload.js";
import { photoTakenAt } from "../src/lib/photoTime.js";
import { BacklogError } from "../src/lib/backlog.js";
import { cellPoints, validateNight } from "../src/lib/night.js";
import { normalize } from "../src/lib/standings.js";

const CPUS = ["Mario", "Luigi", "Peach", "Toad", "Wario", "Waluigi", "King Boo", "Dry Bones", "Bowser", "Donkey Kong", "Diddy Kong", "Baby Mario"];

// An end-of-cup standings screen as Gemini reads it. humans = [{ character, highlight, total, name? }].
function standings(file, takenAt, humans) {
  const cpus = CPUS.filter((c) => !humans.some((h) => h.character === c));
  const rows = humans.map((h) => ({ character: h.character, name: h.name || "", points: h.total, gained: null, human: true, highlight: h.highlight }))
    .concat(cpus.map((c, i) => ({ character: c, name: c, points: 40 - i * 3, gained: null, human: false, highlight: "none" })))
    .slice(0, 12)
    .sort((a, b) => b.points - a.points)
    .map((r, i) => ({ ...r, pos: i + 1 }));
  return { file, takenAt, screen: "standings", rows, b64: "B64-" + file };
}

const state = normalize({
  league: { seasonWeeks: 5, cupsPerWeek: 4 },
  players: [{ id: "pm", name: "Matty", aliases: ["MEG"] }, { id: "pl", name: "Licia" }, { id: "pk", name: "Kieran" }],
  cups: [{
    id: "c1", cup: "Mushroom Cup", date: "2026-11-15", week: 2, max: 60, status: "complete",
    results: [{ rid: "1", p: "pm", pts: 50, character: "Yoshi" }, { rid: "2", p: "pl", pts: 41, character: "Baby Peach" }],
  }],
  races: [], templates: [],
});

describe("a night from photos", () => {
  const reads = [
    standings("a.jpg", "2026-11-22T20:10:00", [
      { character: "Yoshi", highlight: "orange", total: 52 }, { character: "Baby Peach", highlight: "green", total: 33 }, { character: "Bowser Jr.", highlight: "blue", total: 20, name: "Kieran" },
    ]),
    standings("b.jpg", "2026-11-22T20:30:00", [
      { character: "Yoshi", highlight: "orange", total: 38 }, { character: "Baby Peach", highlight: "green", total: 47 }, { character: "Bowser Jr.", highlight: "blue", total: 25, name: "Kieran" },
    ]),
  ];

  it("makes one cup per end-of-cup photo, with its photo, and matches the racers", () => {
    const { night, cups, issues, skipped } = nightFromPhotos(reads, state, { date: "2026-11-22" });
    expect(night).toMatchObject({ date: "2026-11-22", week: 2, entry: "totals", max: 60 });
    expect(night.cups.map((c) => [c.name, c.maps, c.photo])).toEqual([["Unknown Cup", [], "B64-a.jpg"], ["Unknown Cup", [], "B64-b.jpg"]]);
    expect(cups.map((c) => c.photo)).toEqual(["a.jpg", "b.jpg"]);
    // Yoshi and Baby Peach are Matty's and Licia's usual characters; Kieran's name is on screen.
    expect(night.racers.map((r) => [r.character, r.assign])).toEqual([["Yoshi", "pm"], ["Baby Peach", "pl"], ["Bowser Jr.", "pk"]]);
    const licia = night.racers[1];
    expect(night.cups.map((c) => cellPoints(c.cells[licia.key], night.entry))).toEqual([33, 47]);
    expect(issues).toEqual([]);
    expect(skipped).toEqual([]);
    expect(validateNight(night, state.players)).toBe("");
  });

  it("skips photos that aren't results, and says so when none are", () => {
    const menu = { file: "menu.jpg", takenAt: "2026-11-22T20:00:00", screen: "other", track: null, rows: [], b64: "x" };
    expect(nightFromPhotos([menu].concat(reads), state, { date: "2026-11-22" }).skipped).toEqual([{ file: "menu.jpg", reason: "not a results screen" }]);
    expect(() => nightFromPhotos([menu], state, { date: "2026-11-22" })).toThrow(BacklogError);
  });

  it("notices a cup that's already saved", () => {
    const { night } = nightFromPhotos(reads, state, { date: "2026-11-22" });
    expect(alreadySaved(night, state)).toEqual([]);
    const again = normalize({
      ...state, league: state.league,
      cups: state.cups.concat([{ id: "c2", cup: "Flower Cup", date: "2026-11-22", week: 2, max: 60, status: "complete",
        results: [{ rid: "a", p: "pm", pts: 52 }, { rid: "b", p: "pl", pts: 33 }, { rid: "c", p: "pk", pts: 20 }] }]),
    });
    expect(alreadySaved(night, again)).toEqual([0]);
  });
});

describe("photo times in the browser", () => {
  it("reads the camera time from EXIF, else uses the file's date", async () => {
    const t = Buffer.alloc(200);
    t.write("MM", 0, "latin1"); t.writeUInt16BE(42, 2); t.writeUInt32BE(8, 4);
    t.writeUInt16BE(1, 8);
    t.writeUInt16BE(0x8769, 10); t.writeUInt16BE(4, 12); t.writeUInt32BE(1, 14); t.writeUInt32BE(40, 18);
    t.writeUInt16BE(1, 40);
    t.writeUInt16BE(0x9003, 42); t.writeUInt16BE(2, 44); t.writeUInt32BE(20, 46); t.writeUInt32BE(120, 50);
    t.write("2026:11:22 20:26:24\0", 120, "latin1");
    const app1 = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), t]);
    const len = Buffer.alloc(2); len.writeUInt16BE(app1.length + 2);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1, Buffer.from([0xff, 0xda, 0, 2])]);
    expect(await photoTakenAt(new File([jpeg], "a.jpg", { type: "image/jpeg" }))).toEqual({ takenAt: "2026-11-22T20:26:24", exact: true });
    const plain = await photoTakenAt(new File(["png"], "b.png", { lastModified: new Date(2026, 10, 22, 21, 5, 0).getTime() }));
    expect(plain).toEqual({ takenAt: "2026-11-22T21:05:00", exact: false });
  });
});
