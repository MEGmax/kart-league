import { describe, expect, it } from "vitest";
import { compute, normalize } from "../src/lib/standings.js";
import { headToHead } from "../src/lib/rivals.js";
import { leaderboard, playerSheet, recordsVs, winStreak } from "../src/lib/playerStats.js";
import season1 from "./fixtures/season1.json";

const m = compute(normalize(season1));
const h = headToHead(m);
const id = (n) => season1.players.find((p) => p.name === n).id;

describe("a racer's stat sheet in Season 1", () => {
  it("counts gsote's cups, wins, podiums and last places", () => {
    const s = playerSheet(m, h, id("gsote"));
    expect(s).toMatchObject({ cups: 12, held: 12, wins: 9, podiums: 12, lasts: 0, raceWins: 13, races: 32, winStreak: 7 });
    expect(s.bestCup).toMatchObject({ pts: 60, max: 60, num: 12 });
    expect(s.character).toEqual({ name: "Luigi", cups: 8 });
  });

  it("gives licia's best and worst records against another racer", () => {
    const s = playerSheet(m, h, id("licia"));
    expect(s.lasts).toBe(4);
    expect(s.bestVs).toMatchObject({ id: id("unphyt"), w: 2, l: 1, t: 0 });
    expect(s.worstVs).toMatchObject({ id: id("Matty G"), w: 2, l: 9 });
  });

  it("is null for someone who hasn't raced", () => {
    expect(playerSheet(m, h, "nobody")).toBeNull();
  });
});

describe("recordsVs and winStreak", () => {
  it("leaves out opponents met fewer than `min` times", () => {
    const { best, worst } = recordsVs(h, id("gsote"), { min: 99 });
    expect(best).toBeNull();
    expect(worst).toBeNull();
  });

  it("counts the longest run of cup wins", () => {
    expect(winStreak([{ rank: 1 }, { rank: 1 }, { rank: 2 }, { rank: 1 }, { rank: 1 }, { rank: 1 }])).toBe(3);
    expect(winStreak([])).toBe(0);
  });
});

describe("leaderboard", () => {
  it("ranks highest first, shares places on ties and leaves out missing values", () => {
    const b = leaderboard([{ id: "a", n: 3 }, { id: "b", n: 5 }, { id: "c", n: 3 }, { id: "d", n: null }, { id: "e", n: 1 }], (e) => e.n);
    expect(b.map((e) => [e.id, e.place])).toEqual([["b", 1], ["a", 2], ["c", 2], ["e", 4]]);
  });
});
