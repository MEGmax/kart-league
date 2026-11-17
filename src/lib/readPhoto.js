// Reading a results-screen photo with Claude, straight from the browser with the visitor's own
// Anthropic API key (kept in this browser only, set on the Account page). Optional: everything
// works by typing the numbers instead.
import { CHARACTERS } from "./constants";

export const MODEL = "claude-opus-5-5";
const KEY_STORAGE = "kl.anthropicKey";

export function getApiKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // storage blocked (private mode): the key just isn't remembered
  }
}

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cup", "rows"],
  properties: {
    cup: { type: ["string", "null"] },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pos", "name", "character", "points", "human"],
        properties: {
          pos: { type: "integer" },
          name: { type: "string" },
          character: { type: "string", enum: CHARACTERS.concat(["Unknown"]) },
          points: { type: ["integer", "null"] },
          human: { type: "boolean" },
        },
      },
    },
  },
};

function prompt(players, lineup) {
  const known = players.map((p) => [p.name].concat(p.aliases || []).join(" / ")).join("; ") || "(none yet)";
  const chars = lineup && lineup.length ? lineup.join(", ") : "";
  return [
    "This is a phone photo of a TV showing the Mario Kart Wii standings screen after the 4 races of a cup: up to 12 rows from 1st down, each with a character icon, usually a name, and total points for the 4 races (per race 15,12,10,8,7,6,5,4,3,2,1,0, so at most 60).",
    "Rows for human players are highlighted (a brighter or colored row background); CPU rows are not. Set human: true only for highlighted rows.",
    "For every row, identify the character from its icon (Mii if it shows a Mii; Unknown if you can't tell), read the name if one is shown (empty string if not), and the total points (null if unreadable).",
    chars ? `The human players kept the same character all night. Tonight's human characters were: ${chars}. Use these to tell highlighted rows apart, but report what the photo actually shows.` : "",
    `League players we already know (use these exact spellings when a highlighted row's name clearly matches one): ${known}.`,
    "Read every row you can, in screen order. Set cup to the cup name if it is visible, otherwise null.",
  ].filter(Boolean).join("\n");
}

export class ReadError extends Error {}

// Resolves with { cup, rows: [{name, character, points, human}] }. Rejects with a ReadError whose
// message is ready to show, or with an AbortError when `signal` fires.
export async function readResultsPhoto(b64, { players = [], lineup = [], signal } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new ReadError("Add your Anthropic API key on the Account page to read photos.");
  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch {
    throw new ReadError("Couldn't load the Claude library. Check your connection and try again.");
  }
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If the main model declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: RESULT_SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
          { type: "text", text: prompt(players, lineup) },
        ],
      }],
    }, { signal });
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError || (e && e.name === "AbortError")) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ReadError("Anthropic rejected the API key. Check it on your Account page.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new ReadError(`This API key isn't allowed to use ${MODEL}. Check the key's workspace in the Anthropic Console.`);
    if (e instanceof Anthropic.RateLimitError) throw new ReadError("Too many requests, or the key's spend limit was reached. Wait a minute and try again.");
    if (e instanceof Anthropic.BadRequestError) throw new ReadError(`Anthropic couldn't process that photo (${e.message || "bad request"}). Try another photo, or type the points.`);
    if (e instanceof Anthropic.APIConnectionError) throw new ReadError("Couldn't reach Anthropic. Check your connection and try again.");
    if (e instanceof Anthropic.APIError) throw new ReadError(`Reading the photo failed (error ${e.status}). Try again, or type the points.`);
    throw new ReadError("Reading the photo failed. Try again, or type the points.");
  }
  if (response.stop_reason === "refusal") throw new ReadError("Claude declined to read that photo. Type the points instead.");
  if (response.stop_reason === "max_tokens") throw new ReadError("No results table found in that photo. Retake it straight on with the whole list in frame.");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let out;
  try { out = JSON.parse(text); } catch { out = null; }
  if (!out || !Array.isArray(out.rows) || !out.rows.length) {
    throw new ReadError("No results table found in that photo. Retake it straight on with the whole list in frame.");
  }
  return {
    cup: out.cup || null,
    rows: out.rows.map((r) => ({
      name: String(r.name || "").trim(),
      character: CHARACTERS.includes(r.character) ? r.character : "",
      points: r.points == null ? null : Math.round(Number(r.points)),
      human: !!r.human,
    })),
  };
}
