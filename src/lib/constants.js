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

export const BUILTIN_CUPS = ["Mushroom Cup", "Flower Cup", "Star Cup", "Special Cup", "Shell Cup", "Banana Cup", "Leaf Cup", "Lightning Cup"]
  .map((n, i) => ({ id: "g" + i, name: n, maps: TRACKS.slice(i * 4, i * 4 + 4), builtin: true }));

export const DEFAULT_LEAGUE = {
  name: "Kart Night League", season: "Season 1", seasonWeeks: 5, cupsPerWeek: 4,
  playoffSpots: 4, minParticipation: 50, defaultMax: 60,
};

export const VIEWS = ["standings", "race", "cups", "unclaimed", "playoffs", "rules", "add", "build", "account", "admin"];

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
