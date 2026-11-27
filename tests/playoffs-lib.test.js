import { describe, expect, it } from "vitest";
import { bracketOrder, playoffFormat, playoffPicture } from "../src/lib/playoffs.js";
import { DEFAULT_LEAGUE } from "../src/lib/constants.js";

const ranked = (n) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, player: { id: `p${i + 1}`, name: `P${i + 1}` } }));
const ids = (rows) => rows.map((s) => s.player.id);
const match = (mt) => mt.map((x) => (x.s ? x.s.player.id : x.note));

describe("bracketOrder", () => {
  it("pairs the top seed with the bottom one", () => {
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("wild card (default: 4 spots, 3 racers in the play-in)", () => {
  const L = { ...DEFAULT_LEAGUE };

  it("is on by default", () => {
    expect(playoffFormat(L)).toMatchObject({ spots: 4, playInRacers: 3 });
  });

  it("puts the top 3 straight in and 4th–6th in the play-in", () => {
    const p = playoffPicture(ranked(8), L);
    expect(ids(p.direct)).toEqual(["p1", "p2", "p3"]);
    expect(ids(p.playIn)).toEqual(["p4", "p5", "p6"]);
    expect(ids(p.bubble)).toEqual(["p7", "p8"]);
  });

  it("seeds the wild card 4th: 1 v wild card and 2 v 3, then the final", () => {
    const p = playoffPicture(ranked(8), L);
    expect(p.size).toBe(4);
    expect(p.byes).toBe(0);
    expect(p.rounds[0].map(match)).toEqual([["p1", "Wild card"], ["p2", "p3"]]);
    expect(p.rounds[0][0][1].seed).toBe(4);
    expect(p.rounds[1].map(match)).toEqual([["TBD", "TBD"]]);
  });

  it("plays in with whoever is left when fewer than 3 are", () => {
    const p = playoffPicture(ranked(5), L);
    expect(ids(p.playIn)).toEqual(["p4", "p5"]);
    expect(p.bubble).toEqual([]);
  });

  it("skips the play-in when only one player is left for the last spot", () => {
    const p = playoffPicture(ranked(4), L);
    expect(ids(p.direct)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(p.playIn).toEqual([]);
    expect(p.rounds[0].map(match)).toEqual([["p1", "p4"], ["p2", "p3"]]);
  });

  it("gives byes as usual when too few qualify", () => {
    const p = playoffPicture(ranked(3), L);
    expect(p.playIn).toEqual([]);
    expect(p.byes).toBe(1);
    expect(p.rounds[0].map(match)).toEqual([["p2", "p3"]]);
    expect(p.rounds[1].map(match)).toEqual([["p1", "TBD"]]);
  });

  it("makes no bracket with fewer than 2 qualified", () => {
    expect(playoffPicture(ranked(1), L).rounds).toEqual([]);
  });
});

describe("other formats", () => {
  it("is a plain top-N bracket with the play-in off", () => {
    const p = playoffPicture(ranked(8), { ...DEFAULT_LEAGUE, playInRacers: 0 });
    expect(ids(p.direct)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(p.playIn).toEqual([]);
    expect(ids(p.bubble)).toEqual(["p5", "p6", "p7"]);
  });

  it("treats a 1-racer play-in as off", () => {
    expect(playoffFormat({ ...DEFAULT_LEAGUE, playInRacers: 1 }).playInRacers).toBe(0);
  });

  it("works for an 8-spot bracket with a 2-racer play-in (7 straight in, 8 v 9)", () => {
    const p = playoffPicture(ranked(10), { ...DEFAULT_LEAGUE, playoffSpots: 8, playInRacers: 2 });
    expect(p.direct).toHaveLength(7);
    expect(ids(p.playIn)).toEqual(["p8", "p9"]);
    expect(p.rounds[0].map(match)[0]).toEqual(["p1", "Wild card"]);
  });
});
