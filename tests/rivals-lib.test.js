import { describe, expect, it } from "vitest";
import { compute, normalize } from "../src/lib/standings.js";
import { headToHead, nemesisAndFavourite, rivalry } from "../src/lib/rivals.js";
import season1 from "./fixtures/season1.json";

const m = compute(normalize(season1));
const id = (n) => season1.players.find((p) => p.name === n).id;
const h = headToHead(m);

describe("head to head in Season 1", () => {
  it("has gsote 9-2-1 against licia, +144 points", () => {
    expect(h.get(id("gsote"), id("licia"))).toMatchObject({ w: 9, l: 2, t: 1, diff: 144, n: 12 });
    expect(h.get(id("licia"), id("gsote"))).toMatchObject({ w: 2, l: 9, t: 1, diff: -144 });
  });

  it("names JJ Siwa vs licia the rivalry of the season: 3-3, licia +2", () => {
    const r = rivalry(h);
    expect([r.a, r.b]).toEqual([id("licia"), id("JJ Siwa")]);
    expect(r).toMatchObject({ w: 3, l: 3, t: 0, diff: 2, n: 6 });
  });

  it("makes gsote Matty G's nemesis at 1-8-2", () => {
    const { nemesis, favourite } = nemesisAndFavourite(h, id("Matty G"));
    expect(nemesis).toMatchObject({ id: id("gsote"), w: 1, l: 8, t: 2 });
    expect(favourite.id).toBe(id("licia"));
  });

  it("has no rivalry before anyone has met 6 times", () => {
    expect(rivalry(h, 99)).toBeNull();
  });
});
