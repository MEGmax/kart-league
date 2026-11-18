import { describe, expect, it } from "vitest";
import { compute, normalize, seasonPlan } from "../src/lib/standings.js";
import { RACE_POINTS } from "../src/lib/constants.js";

// Week 1: two cups entered from totals (unclaimed rows included). Week 2: five race-by-race cups, so the
// week ran over its 4. Gee (Luigi) wins every week-2 cup, two of them tied, with 8 race wins in all.
function league() {
  const players = [{ id: "pg", name: "Gee" }, { id: "pm", name: "Matty" }, { id: "pl", name: "Licia" }];
  const cups = [], races = [];
  const totals = (id, week, res) => cups.push({ id, cup: "Unknown Cup", date: "2026-11-08", week, max: 60, addedAt: cups.length, status: "complete", results: res });
  totals("w1a", 1, [{ rid: "a", p: "pl", pts: 49, character: "Baby Peach" }, { rid: "b", p: null, pts: 51, character: "Koopa Troopa" }, { rid: "c", p: "pm", pts: 25, character: "Yoshi" }]);
  totals("w1b", 1, [{ rid: "a", p: "pl", pts: 30, character: "Baby Peach" }, { rid: "b", p: null, pts: 55, character: "Koopa Troopa" }, { rid: "c", p: "pm", pts: 19, character: "Diddy Kong" }]);
  const nights = [
    { g: [10, 3, 1, 1], m: [5, 2, 6, 2], l: [3, 1, 9, 8] },
    { g: [9, 1, 2, 5], m: [3, 5, 1, 12], l: [7, 7, 3, 9] },
    { g: [2, 1, 2, 2], m: [11, 3, 1, 1], l: [9, 4, 4, 5] },
    { g: [7, 1, 1, 11], m: [4, 2, 3, 6], l: [8, 4, 8, 10] },
    { g: [2, 1, 1, 4], m: [1, 2, 4, 1], l: [3, 8, 3, 2] },
  ];
  const chars = { g: ["pg", "Luigi"], m: ["pm", "Yoshi"], l: ["pl", "Baby Peach"] };
  nights.forEach((n, i) => {
    const id = `w2${i}`;
    const results = Object.keys(n).map((k) => ({ rid: k, p: chars[k][0], pts: n[k].reduce((a, p) => a + RACE_POINTS[p - 1], 0), character: chars[k][1] }));
    cups.push({ id, cup: "Mushroom Cup", date: "2026-11-15", week: 2, max: 60, addedAt: 10 + i, status: "complete", maps: [], results });
    Object.keys(n).forEach((k) => n[k].forEach((pos, r) => races.push({ cupId: id, race: r + 1, playerId: chars[k][0], position: pos, points: RACE_POINTS[pos - 1], character: chars[k][1] })));
  });
  return normalize({ league: { seasonWeeks: 5, cupsPerWeek: 4, minParticipation: 50 }, players, cups, races });
}

describe("character stats", () => {
  const m = compute(league());
  const ch = Object.fromEntries(m.chars.map((c) => [c.name, c]));

  it("count races, treating a cup entered from totals as 4 races with its character", () => {
    expect(ch.Luigi.picks).toBe(20);
    expect(ch["Baby Peach"].picks).toBe(2 * 4 + 5 * 4);
    expect(ch["Koopa Troopa"].picks).toBe(8);
    expect(ch["Diddy Kong"].picks).toBe(4);
  });

  it("keep cup wins and race wins apart, and agree with the player's own numbers", () => {
    const gee = m.byId.get("pg");
    expect(gee.wins).toBe(5); // cup wins, ties for 1st included
    expect(gee.raceWins).toBe(8);
    expect(ch.Luigi).toMatchObject({ cupWins: 5, raceWins: 8, racesKnown: 20 });
    expect(ch["Koopa Troopa"]).toMatchObject({ cupWins: 2, raceWins: 0, racesKnown: 0 });
  });
});

describe("the season's shape", () => {
  it("counts a week that ran over, so the total matches the progress bar", () => {
    const m = compute(league());
    expect(m.plan.weeks.map((w) => w.slots)).toEqual([4, 5, 4, 4, 4]);
    expect(m.plan).toMatchObject({ played: 7, total: 21, left: 14, current: 3, justFinished: 2, seasonDone: false });
  });

  it("moves to the next week once a week has all its cups, and stops at the end", () => {
    expect(seasonPlan({ seasonWeeks: 5, cupsPerWeek: 4 }, { 1: 4, 2: 5 })).toMatchObject({ current: 3, justFinished: 2, total: 21, left: 12 });
    expect(seasonPlan({ seasonWeeks: 5, cupsPerWeek: 4 }, { 1: 4, 2: 2 })).toMatchObject({ current: 2, justFinished: null });
    expect(seasonPlan({ seasonWeeks: 5, cupsPerWeek: 4 }, {})).toMatchObject({ current: 1, played: 0, total: 20 });
    expect(seasonPlan({ seasonWeeks: 2, cupsPerWeek: 1 }, { 1: 1, 2: 1 })).toMatchObject({ current: 2, seasonDone: true, left: 0 });
  });
});

describe("unclaimed results", () => {
  it("list newest cup first, and within a cup in finishing order", () => {
    const m = compute(league());
    expect(m.unclaimed.map((u) => [u.cup.id, u.r.rank])).toEqual([["w1b", 1], ["w1a", 1]]);
  });
});

describe("claiming week 1's unclaimed results", () => {
  it("adds them to the claimer's cups, points and percentage; the qualifying mark depends only on cups held", () => {
    const before = compute(league());
    const st = league();
    st.cups.filter((c) => c.week === 1).forEach((c) => { c.results.find((r) => r.rid === "b").p = "pg"; });
    const after = compute(st);
    const [b, a] = [before.byId.get("pg"), after.byId.get("pg")];
    expect(a.cp).toBe(b.cp + 2);
    expect(a.pts).toBe(b.pts + 51 + 55);
    expect(a.max).toBe(b.max + 120);
    expect(a.pct).toBeCloseTo(a.pts / a.max, 10);
    expect(a.wins).toBe(b.wins + 2);
    expect(after.need).toBe(before.need);
    expect(after.unclaimed).toHaveLength(0);
    // Everyone else's numbers are untouched.
    expect(after.byId.get("pm").pct).toBe(before.byId.get("pm").pct);
  });
});
