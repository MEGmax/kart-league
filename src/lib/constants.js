import { PLAYER_COLORS } from "../theme";

export const COLORS = PLAYER_COLORS;

// A cup whose tracks nobody recorded (random tracks, or a night entered later from its results screens).
export const UNKNOWN_CUP = "Unknown Cup";

// The NKL logo (public/brand, made from data/nkllogo1.png).
export const LOGO_SRC = `${import.meta.env.BASE_URL}brand/nkl-logo.png`;

export const RACE_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];

export const CUP_NAMES = [
  "Mushroom Cup", "Flower Cup", "Star Cup", "Special Cup",
  "Shell Cup", "Banana Cup", "Leaf Cup", "Lightning Cup", "Other",
];

export const CHARACTERS = [
  "Mario", "Luigi", "Peach", "Daisy", "Yoshi", "Birdo", "Toad", "Toadette",
  "Koopa Troopa", "Diddy Kong", "Donkey Kong", "Bowser", "Bowser Jr.", "Wario",
  "Waluigi", "King Boo", "Rosalina", "Funky Kong", "Dry Bones", "Dry Bowser",
  "Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy", "Mii",
];

// Character art lives in public/assets/characters (added by the league; see README.md).
// Characters without a file fall back to initials.
export const CHAR_ART = [
  "Mario", "Luigi", "Peach", "Yoshi", "Birdo", "Toad", "Koopa Troopa", "Diddy Kong",
  "Donkey Kong", "Bowser", "Bowser Jr.", "Wario", "Waluigi", "King Boo", "Dry Bones",
  "Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy",
];

export function charSrc(name, full) {
  if (CHAR_ART.indexOf(name) < 0) return null;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${import.meta.env.BASE_URL}assets/characters/${slug}${full ? "" : "-face"}.webp`;
}

const NITRO = [
  "Luigi Circuit", "Moo Moo Meadows", "Mushroom Gorge", "Toad's Factory", "Mario Circuit",
  "Coconut Mall", "DK Summit", "Wario's Gold Mine", "Daisy Circuit", "Koopa Cape",
  "Maple Treeway", "Grumble Volcano", "Dry Dry Ruins", "Moonview Highway", "Bowser's Castle", "Rainbow Road",
];
const RETRO = [
  "GCN Peach Beach", "DS Yoshi Falls", "SNES Ghost Valley 2", "N64 Mario Raceway", "N64 Sherbet Land",
  "GBA Shy Guy Beach", "DS Delfino Square", "GCN Waluigi Stadium", "DS Desert Hills", "GBA Bowser Castle 3",
  "N64 DK's Jungle Parkway", "GCN Mario Circuit", "SNES Mario Circuit 3", "DS Peach Gardens", "GCN DK Mountain", "N64 Bowser's Castle",
];
export const TRACKS = NITRO.concat(RETRO);

// A picture of each track (public/assets/tracks, made by tools/tracks.py), or null for a custom track.
export function trackSrc(track) {
  if (TRACKS.indexOf(track) < 0) return null;
  return `${import.meta.env.BASE_URL}assets/tracks/${track.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.webp`;
}

export const BUILTIN_CUPS = ["Mushroom Cup", "Flower Cup", "Star Cup", "Special Cup", "Shell Cup", "Banana Cup", "Leaf Cup", "Lightning Cup"]
  .map((n, i) => ({ id: "g" + i, name: n, maps: TRACKS.slice(i * 4, i * 4 + 4), builtin: true }));

// League settings (league.settings). rankBy "rating" (the default) ranks by skill rating (src/lib/rating.js);
// "pct" ranks by points percentage. seasonRankBy records how each finished season was ranked, so old
// seasons render as they were.
export const DEFAULT_LEAGUE = {
  name: "Kart Night League", season: "Season 1", seasonWeeks: 5, cupsPerWeek: 4,
  playoffSpots: 4, minParticipation: 40, defaultMax: 60,
  currentSeason: 1, rankBy: "rating", ratingStart: 1500, ratingK: 32, ratingKProvisional: 48, provisionalCups: 5,
  marginCap: 30, carryOver: 0.5, playoffCupsPerRound: 2,
};

export const VIEWS = ["standings", "race", "cups", "stats", "rivals", "records", "unclaimed", "playoffs", "rules", "add", "build", "account", "admin"];

// One color per character, the same everywhere (bars, charts), picked so common picks never share one.
export const CHARACTER_COLORS = {
  Mario: "#E5484D", Luigi: "#2F9E44", Peach: "#FF8FC2", Daisy: "#F59F00", Yoshi: "#8BD346", Birdo: "#D6409F",
  Toad: "#3E63DD", Toadette: "#C084FC", "Koopa Troopa": "#12A594", "Diddy Kong": "#C2512E", "Donkey Kong": "#8D5524",
  Bowser: "#F76B15", "Bowser Jr.": "#FFB224", Wario: "#FFE629", Waluigi: "#8E4EC6", "King Boo": "#E4E6F2",
  Rosalina: "#5EB1EF", "Funky Kong": "#00A2C7", "Dry Bones": "#A3A3A3", "Dry Bowser": "#6B6B6B",
  "Baby Mario": "#FF7B7B", "Baby Luigi": "#6CD17A", "Baby Peach": "#F6A6FF", "Baby Daisy": "#FFCD6B", Mii: "#9AA3C7",
};

export function charColor(name) {
  return CHARACTER_COLORS[name] || `hsl(${hashHue(name)} 80% 60%)`;
}

export function hashHue(s) {
  let h = 0;
  s = String(s || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
export function initials(name) {
  const w = String(name || "?").trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}
export function ord(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
export function pctTxt(x) {
  return (x * 100).toFixed(1) + "%";
}
export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}
export function fmtDay(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function nextColor(players) {
  const used = players.map((p) => p.color);
  for (let i = 0; i < COLORS.length; i++) if (used.indexOf(COLORS[i]) < 0) return COLORS[i];
  return COLORS[players.length % COLORS.length];
}
