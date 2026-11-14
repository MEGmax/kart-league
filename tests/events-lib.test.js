import { describe, expect, it } from "vitest";
import { cupLabel, mapEvents, nextEvent, splitEvents, isGoing, toLocalInput, fromLocalInput } from "../src/lib/events.js";

const NOW = Date.parse("2030-01-15T12:00:00Z");
const rows = [
  { id: "past", starts_at: "2030-01-10T01:00:00Z", cups: ["Star Cup"], status: "scheduled" },
  { id: "cancelled", starts_at: "2030-01-16T01:00:00Z", cups: [], status: "cancelled" },
  { id: "next", starts_at: "2030-01-17T01:00:00Z", cups: [], status: "scheduled" },
  { id: "later", starts_at: "2030-01-24T01:00:00Z", cups: ["Leaf Cup"], status: "scheduled" },
];
const events = mapEvents(rows, [{ event_id: "next", user_id: "u1", display_name: "Ben", color: "#fff" }]);

describe("events helpers", () => {
  it("labels nights with no cup as Cup TBD", () => {
    expect(cupLabel([])).toBe("Cup TBD");
    expect(cupLabel(["Mushroom Cup", "Flower Cup"])).toBe("Mushroom Cup, Flower Cup");
  });

  it("picks the next scheduled night, skipping cancelled ones", () => {
    expect(nextEvent(events, NOW).id).toBe("next");
    expect(nextEvent([], NOW)).toBeNull();
  });

  it("keeps a night upcoming until 3 hours after it starts", () => {
    expect(nextEvent(events, Date.parse("2030-01-17T03:59:00Z")).id).toBe("next");
    expect(nextEvent(events, Date.parse("2030-01-17T04:00:00Z")).id).toBe("later");
  });

  it("splits upcoming (with cancellations) from past", () => {
    const { upcoming, past } = splitEvents(events, NOW);
    expect(upcoming.map((e) => e.id)).toEqual(["cancelled", "next", "later"]);
    expect(past.map((e) => e.id)).toEqual(["past"]);
  });

  it("knows who's in", () => {
    const next = events.find((e) => e.id === "next");
    expect(isGoing(next, "u1")).toBe(true);
    expect(isGoing(next, "u2")).toBe(false);
    expect(isGoing(next, null)).toBe(false);
  });

  it("round-trips the datetime-local input through UTC", () => {
    const iso = "2030-01-16T01:00:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(fromLocalInput("")).toBeNull();
  });
});
