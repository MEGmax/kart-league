import { RACE_POINTS, BUILTIN_CUPS, DEFAULT_LEAGUE } from "./constants";

// Example data, shown only while the league has no cups yet. Built race by race
// so every stat has something to show. Mirrors the previous vanilla-JS DEMO builder.
function buildDemo() {
  let seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  const names = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan"];
  const skill = [3.2, 3.6, 3.9, 5.2, 5.6, 6.6];
  const colors = ["#E5484D", "#0090FF", "#30A46C", "#F76B15", "#8E4EC6", "#E93D82"];
  const mains = [
    ["Funky Kong", "Funky Kong", "Daisy"], ["Daisy", "Peach"], ["Rosalina", "Rosalina", "King Boo"],
    ["Luigi"], ["Bowser", "Dry Bowser"], ["Toad", "Baby Daisy"],
  ];
  const players = names.map((n, i) => ({
    id: "d" + i, name: n, color: colors[i], aliases: [], userId: null,
    registeredAt: i < 4 ? `2026-09-0${i + 1}T18:00:00Z` : null,
  }));
  const cups = [], races = [];
  for (let ci = 0; ci < 8; ci++) {
    const cupId = "dc" + ci;
    const d = new Date(2026, 8, 4 + Math.floor(ci / 4) * 7);
    const here = names.map((_, pi) => pi).filter((pi) => !((ci + pi) % 7 === 5));
    const tot = {}, chars = {};
    for (let r = 1; r <= 4; r++) {
      const order = here.map((pi) => ({ pi, v: skill[pi] + rnd() * 5 })).sort((a, b) => a.v - b.v);
      let slot = 1;
      order.forEach((o) => {
        slot += rnd() < 0.3 ? 1 : 0;
        const pos = Math.min(12, slot++);
        const ch = mains[o.pi][(ci + r) % mains[o.pi].length];
        races.push({ cupId, race: r, playerId: "d" + o.pi, position: pos, points: RACE_POINTS[pos - 1], character: ch, enteredAt: ci * 10 + r });
        tot[o.pi] = (tot[o.pi] || 0) + RACE_POINTS[pos - 1];
        chars[o.pi] = ch;
      });
    }
    const results = here.map((pi) => ({ rid: "p_d" + pi, p: "d" + pi, pts: tot[pi], character: chars[pi], raw: "" }));
    if (ci === 5 || ci === 7) results.push({ rid: "rx", p: null, pts: ci === 5 ? 26 : 22, character: "Yoshi", raw: "" });
    cups.push({
      id: cupId, cup: BUILTIN_CUPS[ci].name, maps: BUILTIN_CUPS[ci].maps, status: "complete",
      date: d.toISOString().slice(0, 10), week: Math.floor(ci / 4) + 1, max: 60, notes: "",
      hasPhoto: false, addedAt: ci, results,
    });
  }
  return { league: { ...DEFAULT_LEAGUE }, players, cups, races, templates: [] };
}

export const DEMO = buildDemo();
