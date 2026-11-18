// Reads a photo of a Mario Kart Wii results screen with Google's Gemini API. Plain fetch to
// generateContent, so the same code runs in the browser (src/lib/readPhoto.js, the visitor's own key)
// and in scripts/read-backlog.mjs (GEMINI_API_KEY from .env). The caller always supplies the key.
import { CHARACTERS } from "./constants";

export const GEMINI_MODEL = "gemini-4-hydrogen";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Human rows are highlighted in their controller's color; CPU rows are not ("none").
export const HIGHLIGHTS = ["none", "blue", "red", "green", "yellow", "orange", "pink", "purple", "other"];
export const SCREENS = ["race", "standings", "other"];

const nullable = (type, description) => ({ type: [type, "null"], description });

const SCHEMA = {
  type: "object",
  properties: {
    screen: { type: "string", enum: SCREENS },
    cup: nullable("string", "Cup name if one is written on screen"),
    rows: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          pos: { type: "integer", minimum: 1, maximum: 12, description: "Place label at the start of the row (1st = 1)" },
          character: { type: "string", enum: CHARACTERS.concat(["Unknown"]) },
          name: { type: "string", description: "Name text on the row, as shown" },
          gained: nullable("integer", "The +N points earned in this race, if the row shows one"),
          total: nullable("integer", "The N pts total on the row"),
          human: { type: "boolean" },
          highlight: { type: "string", enum: HIGHLIGHTS },
        },
        required: ["pos", "character", "name", "gained", "total", "human", "highlight"],
      },
    },
    rotate: { type: "integer", enum: [0, 90, 180, 270], description: "Degrees to turn the photo clockwise so the screen's text reads upright" },
  },
  required: ["screen", "cup", "rows", "rotate"],
};

function prompt(players, lineup) {
  const known = players.map((p) => [p.name].concat(p.aliases || []).join(" / ")).join("; ");
  return [
    "This is a phone photo of a TV. Decide which Mario Kart Wii screen it shows:",
    '- "race": the results after one race: a single column of 12 rows over the track, each with a place, a character icon, a name and the running total as "N pts". Right after the race the rows are in finishing order and show the points just earned as "+N" (15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0 for 1st to 12th); a moment later the "+N" goes and the rows re-sort by total. Both are "race".',
    '- "standings": the end-of-cup standings, headed "You got Nth place!", with 12 rows in two columns (1st to 6th on the left, 7th to 12th on the right) and the total "N pts".',
    '- "other": anything else (character or kart select, menus, a loading screen, not a game screen). Return no rows.',
    "Human players' rows are filled with a bright solid color (blue, red, green, yellow, orange, pink/magenta or purple) and show a controller or steering-wheel icon: set human true and highlight to that color. CPU rows are not color-filled: human false, highlight none.",
    "For every row give: pos (its place label), character (from the icon and name; Mii for a Mii; Unknown if you can't tell), name (as written, empty if none), gained (the +N, or null if the row has none), total (the N pts, or null if unreadable), human, highlight.",
    "Read every row in screen order. Report exactly what the photo shows; never work numbers out from other numbers.",
    lineup && lineup.length ? `Tonight's human players were using: ${lineup.join(", ")}. Use this to tell highlighted rows apart.` : "",
    known ? `League players (for names on screen): ${known}.` : "",
    "Set cup to the cup name only if it is written on screen, otherwise null.",
    "Set rotate to how many degrees the photo must be turned clockwise for the screen's text to read upright (0, 90, 180 or 270); the photo may have been taken with the phone sideways.",
  ].filter(Boolean).join("\n");
}

export class ReadError extends Error {
  constructor(message, { status = 0, retryAfter = 0 } = {}) {
    super(message);
    this.status = status; // the HTTP status, when the API answered with an error
    this.retryAfter = retryAfter; // seconds Google asked us to wait (rate limits), or 0
  }
}

function int(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

// Turns the model's JSON into rows the rest of the site uses ({name, character, points, human} plus
// pos/gained/highlight for the backlog). Exported for tests.
export function normalizeRead(out) {
  const screen = SCREENS.includes(out && out.screen) ? out.screen : "other";
  const rows = Array.isArray(out && out.rows) ? out.rows : [];
  return {
    screen,
    cup: (out && typeof out.cup === "string" && out.cup.trim()) || null,
    rotate: [0, 90, 180, 270].includes(out && out.rotate) ? out.rotate : 0,
    rows: screen === "other" ? [] : rows.map((r) => {
      const highlight = HIGHLIGHTS.includes(r.highlight) ? r.highlight : "other";
      return {
        pos: int(r.pos),
        name: String(r.name || "").trim(),
        character: CHARACTERS.includes(r.character) ? r.character : "",
        points: int(r.total),
        gained: int(r.gained),
        human: !!r.human,
        highlight: r.human ? (highlight === "none" ? "other" : highlight) : "none",
      };
    }),
  };
}

function apiError(status, body, model, keyHint) {
  const err = (body && body.error) || {};
  const msg = err.message || "";
  const code = err.status || "";
  const retry = (err.details || []).map((d) => d && d.retryDelay).find(Boolean); // e.g. "23s"
  const meta = { status, retryAfter: retry ? Math.ceil(parseFloat(retry)) || 0 : 0 };
  if (/api key not valid|api_key_invalid/i.test(msg) || status === 401) return new ReadError(`Google rejected the Gemini API key. ${keyHint}`, meta);
  if (status === 403) return new ReadError(`This Gemini API key isn't allowed to use ${model} (${msg || code || "permission denied"}). ${keyHint}`, meta);
  if (status === 404) return new ReadError(`Gemini model ${model} isn't available to this key.`, meta);
  if (status === 429) return new ReadError("Gemini says too many requests, or the key's quota is used up. Wait a minute and try again.", meta);
  if (status === 400) return new ReadError(`Gemini couldn't process that photo (${msg || code || "bad request"}). Try another photo, or type the points.`, meta);
  if (status >= 500) return new ReadError(`Gemini had a problem on its side (error ${status}). Try again in a moment.`, meta);
  return new ReadError(`Reading the photo failed (error ${status}). Try again, or type the points.`, meta);
}

// Resolves with { screen, cup, rows }. Rejects with a ReadError whose message is ready to show, or with
// an AbortError when `signal` fires.
export async function readResultsImage({
  apiKey, b64, mimeType = "image/jpeg", players = [], lineup = [], signal, model = GEMINI_MODEL,
  keyHint = "Check the key and try again.", fetchImpl = globalThis.fetch,
}) {
  if (!apiKey) throw new ReadError(`No Gemini API key. ${keyHint}`);
  const body = {
    contents: [{
      role: "user",
      parts: [{ text: prompt(players, lineup) }, { inlineData: { mimeType, data: b64 } }],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
      mediaResolution: "MEDIA_RESOLUTION_HIGH", // small text on a TV across the room
    },
  };
  let res;
  try {
    res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    throw new ReadError("Couldn't reach Gemini. Check your connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw apiError(res.status, data, model, keyHint);

  if (data && data.promptFeedback && data.promptFeedback.blockReason) {
    throw new ReadError("Gemini declined to read that photo. Type the points instead.");
  }
  const cand = data && data.candidates && data.candidates[0];
  const reason = cand && cand.finishReason;
  if (reason && reason !== "STOP" && reason !== "MAX_TOKENS") {
    throw new ReadError("Gemini declined to read that photo. Type the points instead.");
  }
  const text = ((cand && cand.content && cand.content.parts) || [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  let out;
  try { out = JSON.parse(text); } catch { out = null; }
  if (!out) throw new ReadError("No results table found in that photo. Retake it straight on with the whole list in frame.");
  return normalizeRead(out);
}
