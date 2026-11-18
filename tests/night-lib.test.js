import { describe, expect, it } from "vitest";
import {
  buildSave, buildSubmissions, canMerge, cellPoints, emptyCell, matchPhotoRows, mergeRacers, newCup, newNight, newRacer,
  nightFromCup, nightFromEvent, nightFromSubmissions, validateNight,
} from "../src/lib/night.js";
import { normalize } from "../src/lib/standings.js";
import { BUILTIN_CUPS } from "../src/lib/constants.js";

const state = normalize({
  league: { seasonWeeks: 5, cupsPerWeek: 4 },
  players: [
    { id: "pa", name: "Ada", color: "#E5484D", aliases: ["ADA!"], user_id: "u-ada" },
    { id: "pb", name: "Ben", color: "#0090FF" },
  ],
  cups: [], races: [], templates: [{ id: "t1", name: "Cursed Cup", maps: ["Rainbow Road", "DK Summit", "Koopa Cape", "Mario Circuit"] }],
});

function nightWith(entry = "totals") {
  const n = newNight(state, "add");
  n.entry = entry;
  const ada = newRacer({ assign: "pa", character: "Mario" });
  const ben = newRacer({ assign: "pb", character: "Yoshi" });
  const cy = newRacer({ assign: "new", newName: "Cy", character: "Bowser" });
  n.racers = [ada, ben, cy];
  n.cups = [newCup({ name: "Mushroom Cup", maps: BUILTIN_CUPS[0].maps.slice() }), newCup({ name: "Flower Cup", maps: BUILTIN_CUPS[1].maps.slice() })];
  return { n, ada, ben, cy };
}
const cell = (p) => ({ ...emptyCell(), ...p });

describe("cell points", () => {
  it("adds race finishes, or falls back to a total", () => {
    expect(cellPoints(cell({ pos: ["1", "2", "3", "12"] }), "races")).toBe(15 + 12 + 10 + 0);
    expect(cellPoints(cell({ pts: "34" }), "races")).toBe(34);
    expect(cellPoints(cell({ pts: "" }), "totals")).toBe(null);
    expect(cellPoints(cell({ pts: "0" }), "totals")).toBe(0);
  });
});

describe("validateNight", () => {
  it("needs cups, a result per cup, and sane points", () => {
    const { n, ada, ben } = nightWith();
    expect(validateNight({ ...n, cups: [] }, state.players)).toMatch(/Add the cups/);
    expect(validateNight(n, state.players)).toMatch(/Nobody has a result in Mushroom Cup/);
    n.cups[0].cells[ada.key] = cell({ pts: "61" });
    expect(validateNight(n, state.players)).toMatch(/Ada's points in Mushroom Cup must be a whole number from 0 to 60/);
    n.cups[0].cells[ada.key] = cell({ pts: "54" });
    n.cups[1].cells[ben.key] = cell({ pts: "40" });
    expect(validateNight(n, state.players)).toBe("");
  });

  it("catches the same player twice, including a new name that matches an existing player", () => {
    const { n } = nightWith();
    n.racers.push(newRacer({ assign: "new", newName: "ada!" }));
    expect(validateNight(n, state.players)).toMatch(/Ada!? is in the lineup twice|in the lineup twice/);
  });

  it("in race-by-race mode, flags half-entered cups and shared places", () => {
    const { n, ada, ben } = nightWith("races");
    n.cups[0].cells[ada.key] = cell({ pos: ["1", "2", "", ""] });
    expect(validateNight(n, state.players)).toMatch(/Ada is missing race 3, 4 in Mushroom Cup/);
    n.cups[0].cells[ada.key] = cell({ pos: ["1", "2", "1", "1"] });
    n.cups[0].cells[ben.key] = cell({ pos: ["2", "2", "3", "2"] });
    n.cups[1].cells[ben.key] = cell({ pts: "40" });
    expect(validateNight(n, state.players)).toMatch(/Mushroom Cup, race 2: Ada and Ben both finished 2nd/);
  });
});

describe("buildSave", () => {
  it("creates new players once, sorts results, and only sends race rows for full race entries", () => {
    const { n, ada, ben, cy } = nightWith("races");
    n.cups[0].cells[ada.key] = cell({ pos: ["1", "2", "1", "1"] });
    n.cups[0].cells[ben.key] = cell({ pts: "44" });
    n.cups[0].cells[cy.key] = cell({ pos: ["3", "3", "2", "3"] });
    n.cups[1].cells[cy.key] = cell({ pts: "40" });
    const { cups, players } = buildSave(n, state, 1000);
    expect(players).toHaveLength(1);
    expect(players[0].name).toBe("Cy");
    const cyId = players[0].id;
    expect(cups[0].results.map((r) => [r.p, r.pts, r.character])).toEqual([["pa", 57, "Mario"], ["pb", 44, "Yoshi"], [cyId, 42, "Bowser"]]);
    expect(cups[0].races.filter((r) => r.player_id === "pa").map((r) => r.position)).toEqual([1, 2, 1, 1]);
    expect(cups[0].races.some((r) => r.player_id === "pb")).toBe(false);
    expect(cups[1].results).toEqual([{ rid: "p_" + cyId, p: cyId, pts: 40, character: "Bowser", raw: "" }]);
    expect(cups[0].maps).toEqual(BUILTIN_CUPS[0].maps);
    expect([cups[0].added_at, cups[1].added_at]).toEqual([1000, 1001]);
  });
});

describe("photo matching", () => {
  it("matches highlighted rows by character, then by name, and leaves the rest over", () => {
    const { n, ada, ben, cy } = nightWith();
    n.racers.push(newRacer({ assign: "unclaimed", character: "" }));
    const rows = [
      { name: "", character: "Mario", points: 54, human: true },
      { name: "", character: "Mario", points: 20, human: false }, // a CPU Mario doesn't count
      { name: "ADA!", character: "Peach", points: 1, human: true }, // already matched Ada by character
      { name: "Ben", character: "Luigi", points: 44, human: true }, // Ben's character misread; his name saves it
      { name: "", character: "Toad", points: 30, human: true },
    ];
    const { matches, extra } = matchPhotoRows(n.racers, rows, state.players);
    expect(matches[ada.key].points).toBe(54);
    expect(matches[ben.key].points).toBe(44);
    expect(matches[cy.key]).toBeUndefined();
    expect(extra.map((r) => r.character)).toEqual(["Peach", "Toad"]);
  });

  it("won't guess when two racers share a character", () => {
    const { n } = nightWith();
    n.racers[1].character = "Mario";
    const { matches } = matchPhotoRows(n.racers, [{ name: "", character: "Mario", points: 54, human: true }], state.players);
    expect(Object.keys(matches)).toHaveLength(0);
  });
});

describe("round trips", () => {
  it("submissions come back as the same night for review", () => {
    const { n, ada, ben, cy } = nightWith("races");
    n.cups[0].cells[ada.key] = cell({ pos: ["1", "2", "1", "1"] });
    n.cups[0].cells[cy.key] = cell({ pts: "30" });
    n.cups[1].cells[ben.key] = cell({ pos: ["2", "1", "3", "2"] });
    const subs = buildSubmissions(n, state.players, "b1").map(({ sub }, i) => ({ ...sub, submittedAt: i, hasPhoto: false }));
    expect(subs.every((s) => s.batch === "b1")).toBe(true);
    const back = nightFromSubmissions(subs, state);
    expect(back.entry).toBe("races");
    expect(back.cups.map((c) => c.submission)).toEqual(subs.map((s) => s.id));
    expect(back.racers.map((r) => [r.assign, r.newName, r.character])).toEqual([["pa", "", "Mario"], ["new", "Cy", "Bowser"], ["pb", "", "Yoshi"]]);
    const saved = buildSave(back, state);
    expect(saved.cups[0].results.map((r) => r.pts)).toEqual([57, 30]);
    expect(saved.cups[0].submission).toBe(subs[0].id);
  });

  it("a finished cup loads for editing with its race finishes and keeps its ids", () => {
    const st = normalize({
      ...state, league: state.league,
      cups: [{ id: "c1", cup: "Mushroom Cup", date: "2026-11-14", week: 2, max: 60, maps: BUILTIN_CUPS[0].maps, addedAt: 5, status: "complete",
        results: [{ rid: "p_pa", p: "pa", pts: 57, character: "Mario" }, { rid: "u1", p: null, pts: 30, character: "Toad" }] }],
      races: [1, 2, 3, 4].map((race) => ({ cupId: "c1", race, playerId: "pa", position: race === 2 ? 2 : 1, points: race === 2 ? 12 : 15, character: "Mario" })),
    });
    const n = nightFromCup(st.cups[0], st);
    expect(n.entry).toBe("races");
    expect(n.cups[0].locked).toBe(true);
    const { cups } = buildSave(n, st);
    expect(cups[0].id).toBe("c1");
    expect(cups[0].added_at).toBe(5);
    expect(cups[0].results).toEqual([
      { rid: "p_pa", p: "pa", pts: 57, character: "Mario", raw: "" },
      { rid: "u1", p: null, pts: 30, character: "Toad", raw: "" },
    ]);
    expect(cups[0].races).toHaveLength(4);
  });

  it("a cup night brings its cups (with tracks) and the people who were in", () => {
    const ev = { startsAt: "2026-11-14T23:00:00Z", cups: ["Mushroom Cup", "Cursed Cup", "Mystery Cup"], going: [{ userId: "u-ada", name: "Ada" }, { userId: "u-x", name: "Xan" }] };
    const n = nightFromEvent(ev, state, "add");
    expect(n.cups.map((c) => [c.name, c.maps.length])).toEqual([["Mushroom Cup", 4], ["Cursed Cup", 4], ["Mystery Cup", 0]]);
    expect(n.racers.map((r) => [r.assign, r.newName])).toEqual([["pa", ""], ["new", "Xan"]]);
  });
});

describe("someone who switched character between cups", () => {
  // Ada was Mario in cups 1 and 3, Donkey Kong in cup 2; she came in as two racers.
  function switched() {
    const n = newNight(state, "add");
    const mario = newRacer({ assign: "pa", character: "Mario" });
    const dk = newRacer({ assign: "unclaimed", character: "Donkey Kong" });
    const ben = newRacer({ assign: "pb", character: "Yoshi" });
    n.racers = [mario, dk, ben];
    n.cups = ["Mushroom Cup", "Flower Cup", "Unknown Cup"].map((name) => newCup({ name }));
    n.cups[0].cells = { [mario.key]: cell({ pts: "40" }), [ben.key]: cell({ pts: "30" }) };
    n.cups[1].cells = { [dk.key]: cell({ pts: "35" }), [ben.key]: cell({ pts: "33" }) };
    n.cups[2].cells = { [mario.key]: cell({ pts: "50" }), [ben.key]: cell({ pts: "20" }) };
    return { n, mario, dk, ben };
  }

  it("merges two racers who never raced the same cup, keeping each cup's character", () => {
    const { n, mario, dk, ben } = switched();
    expect(canMerge(n, mario.key, dk.key)).toBe(true);
    expect(canMerge(n, mario.key, ben.key)).toBe(false);
    const blank = newRacer({ assign: "unclaimed" });
    expect(canMerge({ ...n, racers: n.racers.concat(blank) }, mario.key, blank.key)).toBe(false);
    const m = mergeRacers(n, mario.key, dk.key);
    expect(m.racers.map((r) => [r.assign, r.character])).toEqual([["pa", "Mario"], ["pb", "Yoshi"]]);
    expect(m.cups.map((c) => [c.cells[mario.key].pts, c.cells[mario.key].character])).toEqual([["40", ""], ["35", "Donkey Kong"], ["50", ""]]);
    expect(validateNight(m, state.players)).toBe("");
    expect(mergeRacers(n, mario.key, ben.key)).toBe(n);
  });

  it("saves and submits the character used in each cup, and reviews come back the same way", () => {
    const { n, mario, dk } = switched();
    const m = mergeRacers(n, mario.key, dk.key);
    const { cups } = buildSave(m, state, 1000);
    expect(cups.map((c) => c.results.find((r) => r.p === "pa").character)).toEqual(["Mario", "Donkey Kong", "Mario"]);
    const subs = buildSubmissions(m, state.players, "b1");
    expect(subs.map((x) => x.sub.rows.find((r) => r.assign === "pa").character)).toEqual(["Mario", "Donkey Kong", "Mario"]);
    const back = nightFromSubmissions(subs.map((x) => ({ ...x.sub, hasPhoto: false })), state);
    const ada = back.racers.find((r) => r.assign === "pa");
    expect(ada.character).toBe("Mario");
    expect(back.cups.map((c) => c.cells[ada.key].character)).toEqual(["", "Donkey Kong", ""]);
  });

  it("matches a photo using the character for that cup", () => {
    const { n, mario, dk } = switched();
    const m = mergeRacers(n, mario.key, dk.key);
    const inCup2 = m.racers.map((r) => ({ ...r, character: (m.cups[1].cells[r.key] || {}).character || r.character }));
    const { matches } = matchPhotoRows(inCup2, [{ character: "Donkey Kong", points: 35, human: true, name: "" }], state.players);
    expect(Object.keys(matches)).toEqual([mario.key]);
  });
});
