import { describe, expect, it } from "vitest";
import { carryOver, expected, matchScore, rateSeason, ratingSettings } from "../src/lib/rating.js";
import { compute, normalize, seasonRatings } from "../src/lib/standings.js";
import season1 from "./fixtures/season1.json";

const byName = (m) => Object.fromEntries([...m.ranked, ...m.unranked].map((s) => [s.player.name, s]));

describe("Season 1 through the rating (the numbers in PLAN.md)", () => {
  const m = compute(normalize(season1));
  const s = byName(m);

  // PLAN.md rounds gsote's 1581.49 to 1581.5 and then to 1582; the site rounds once, to 1581.
  it("gives gsote 1581.5, Matty G 1523 and Kieran4145 1510", () => {
    expect(s.gsote.rating).toBeCloseTo(1581.49, 2);
    expect(Math.round(s["Matty G"].rating)).toBe(1523);
    expect(Math.round(s.Kieran4145.rating)).toBe(1510);
  });

  it("keeps Kieran4145 provisional after 4 cups, and gsote's season high is where he finished", () => {
    expect(s.Kieran4145.provisional).toBe(true);
    expect(s.gsote.provisional).toBe(false);
    expect(s.gsote.ratingHigh).toBe(s.gsote.rating);
  });

  it("scoring wins only puts gsote at 1608 and Matty G at 1527", () => {
    const cups = m.cups;
    const r = rateSeason(cups, season1.players, season1.league, {}, { margin: false });
    const id = (n) => season1.players.find((p) => p.name === n).id;
    expect(Math.round(r.players.get(id("gsote")).rating)).toBe(1608);
    expect(Math.round(r.players.get(id("Matty G")).rating)).toBe(1527);
  });

  it("measures consistency as the spread of cup points", () => {
    expect(s["JJ Siwa"].consistency).toBeCloseTo(6.8, 1);
    expect(s.Kieran4145.consistency).toBeCloseTo(14.0, 1);
  });
});

describe("one head-to-head", () => {
  it("scores a tie as ½ and a 30-point win as a full win", () => {
    expect(matchScore(40, 40)).toBe(0.5);
    expect(matchScore(55, 25)).toBe(1);
    expect(matchScore(60, 20)).toBe(1);
    expect(matchScore(25, 55)).toBe(0);
    expect(matchScore(43, 42)).toBeCloseTo(0.5 + 0.5 * (0.5 + 1 / 60));
    expect(matchScore(43, 42, 30, { margin: false })).toBe(1);
  });

  it("expects an even result between equal ratings", () => {
    expect(expected(1500, 1500)).toBe(0.5);
    expect(expected(1900, 1500)).toBeCloseTo(10 / 11);
  });
});

describe("K and carry-over", () => {
  const cup = (id, a, b) => ({ id, date: "2026-12-01", week: 1, results: [{ p: "a", pts: a }, { p: "b", pts: b }] });

  it("uses the provisional K for exactly a player's first 5 cups", () => {
    // Each cup a 30-point win for a against a fixed opponent: compare the gain in cups 5 and 6.
    const cups = [1, 2, 3, 4, 5, 6].map((i) => cup("c" + i, 50, 20));
    const r = rateSeason(cups, [], {}, {});
    const h = r.players.get("a").history;
    const gain = (i) => h[i].after - h[i].before;
    const e5 = 1 - expected(h[4].before, r.cups.get("c5").before.b);
    const e6 = 1 - expected(h[5].before, r.cups.get("c6").before.b);
    expect(gain(4)).toBeCloseTo(48 * e5);
    expect(gain(5)).toBeCloseTo(32 * e6);
    expect(r.players.get("a").provisional).toBe(false);
  });

  it("starts a returning player halfway between last season's rating and 1500", () => {
    const cfg = ratingSettings({});
    expect(carryOver(1600, cfg)).toBe(1550);
    expect(carryOver(1400, cfg)).toBe(1450);
    const r = rateSeason([], [{ id: "a" }, { id: "n" }], {}, { a: 1582 });
    expect(r.players.get("a").start).toBe(1541);
    expect(r.players.get("n").start).toBe(1500);
  });

  it("carries Season 1 into Season 2 through seasonRatings", () => {
    const st = normalize({ ...season1, league: { ...season1.league, currentSeason: 2, rankBy: "rating" } });
    const r2 = seasonRatings(st, 2);
    const gsote = season1.players.find((p) => p.name === "gsote").id;
    expect(r2.players.get(gsote).start).toBeCloseTo(1540.75, 2);
  });

  it("doesn't let playoff cups (weeks after the season) move ratings", () => {
    const r = rateSeason([cup("p", 60, 0), { ...cup("q", 60, 0), week: 6 }], [], { seasonWeeks: 5 }, {});
    expect(r.players.get("a").cp).toBe(1);
  });
});
