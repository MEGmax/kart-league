import { describe, expect, it } from "vitest";
import { compute, normalize } from "../src/lib/standings.js";
import { awards, records, rookieIds } from "../src/lib/records.js";
import { leagueTracks } from "../src/lib/tracks.js";
import season1 from "./fixtures/season1.json";

const st = normalize({ ...season1, league: { ...season1.league, rankBy: "rating" } });
const m = compute(st);
const name = (pid) => season1.players.find((p) => p.id === pid).name;

describe("Season 1 records", () => {
  const r = records(m);

  it("has gsote's perfect 60/60 in cup 12 as the best cup", () => {
    expect(name(r.bestCup.p)).toBe("gsote");
    expect(r.bestCup).toMatchObject({ pts: 60, max: 60, num: 12 });
    expect(r.bestCup.cup.date).toBe("2026-11-22");
  });

  it("has Kieran4145's 25-point win in cup 1 as the biggest margin", () => {
    expect(name(r.biggestMargin.p)).toBe("Kieran4145");
    expect(r.biggestMargin).toMatchObject({ by: 25, num: 1 });
  });

  it("has gsote's rating as the highest reached", () => {
    expect(r.highestRating.map((x) => name(x.s.player.id))).toEqual(["gsote"]);
  });
});

describe("awards", () => {
  const list = Object.fromEntries(awards(m, { rookies: rookieIds(st, 1) }).map((a) => [a.key, a]));

  it("are all ten", () => {
    expect(Object.keys(list)).toHaveLength(10);
  });

  it("go to gsote (regular season) and Matty G (weekly MVP, +22 on Nov 22)", () => {
    expect(name(list.regular.winners[0].s.player.id)).toBe("gsote");
    expect(name(list.mvp.winners[0].s.player.id)).toBe("Matty G");
    expect(list.mvp.winners[0].value).toBeCloseTo(21.7, 1);
  });

  it("shares Iron Kart between the two 12-cup racers and leaves the League champion to the playoffs", () => {
    expect(list.iron.winners.map((x) => name(x.s.player.id)).sort()).toEqual(["gsote", "licia"]);
    expect(list.champion.winners).toEqual([]);
  });

  it("give Mr. Consistent (8+ cups) to the steadiest of gsote, licia and Matty G", () => {
    const w = list.consistent.winners;
    expect(w).toHaveLength(1);
    expect(["gsote", "licia", "Matty G"]).toContain(name(w[0].s.player.id));
  });
});

describe("track coverage", () => {
  it("counts 23 of the 32 tracks raced in Season 1", () => {
    const t = leagueTracks(m);
    expect(t.coverage).toMatchObject({ raced: 23, total: 32 });
    expect(t.coverage.unraced).toHaveLength(9);
    const mm = t.tracks.find((x) => x.track === "Moo Moo Meadows");
    expect(mm.times).toBe(3);
    expect(mm.chaos).toBeGreaterThan(0);
  });
});
