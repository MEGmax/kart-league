import { describe, expect, it } from "vitest";
import { bestTracks, trackCup, trackKind, mapTally } from "../src/lib/tracks.js";

const cup = (maps) => ({ maps });

describe("tracks", () => {
  it("knows each track's game cup and kind", () => {
    expect(trackCup("Coconut Mall")).toBe("Flower Cup");
    expect(trackCup("N64 Bowser's Castle")).toBe("Lightning Cup");
    expect(trackCup("My Custom Track")).toBe(null);
    expect(trackKind("Rainbow Road")).toBe("Nitro");
    expect(trackKind("GCN Peach Beach")).toBe("Retro");
  });

  it("ranks a racer's tracks by average points, counting each race", () => {
    const log = [
      { cup: cup(["A", "B", "C", "D"]), pts: 37, max: 60, races: [
        { race: 1, points: 15, position: 1 }, { race: 2, points: 4, position: 8 },
        { race: 3, points: 10, position: 3 }, { race: 4, points: 8, position: 4 },
      ] },
      { cup: cup(["B", "A", "", ""]), pts: 22, max: 60, races: [
        { race: 1, points: 10, position: 3 }, { race: 2, points: 12, position: 2 },
      ] },
    ];
    const t = bestTracks(log);
    expect(t.map((x) => x.track)).toEqual(["A", "C", "D", "B"]);
    expect(t[0]).toMatchObject({ track: "A", races: 2, avgPts: 13.5, avgPos: 1.5, wins: 1 });
    expect(t[3]).toMatchObject({ track: "B", races: 2, avgPts: 7, avgPos: 5.5 });
    // Usual is 59 points over 6 races.
    expect(t[0].vsUsual).toBeCloseTo(13.5 - 59 / 6);
  });

  it("counts a totals-only cup with known tracks as 4 races at its average, with no place", () => {
    const t = bestTracks([{ cup: cup(["A", "B", "C", "D"]), pts: 30, max: 60, races: [] }]);
    expect(t).toHaveLength(4);
    expect(t[0]).toMatchObject({ races: 1, avgPts: 7.5, avgPos: null });
  });

  it("ignores cups with unknown tracks", () => {
    expect(bestTracks([{ cup: cup([]), pts: 50, max: 60, races: [] }])).toEqual([]);
    expect(bestTracks([])).toEqual([]);
  });

  it("maps the vote tally", () => {
    expect(mapTally([{ track: "A", votes: "2", voters: [{ name: "Ben" }], mine: true }]))
      .toEqual([{ track: "A", votes: 2, voters: [{ name: "Ben" }], mine: true }]);
  });
});
