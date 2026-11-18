// Reading a results-screen photo with Gemini, straight from the browser with the visitor's own
// Gemini API key (kept in this browser only, set on the Account page; sent only to Google).
// Optional: everything works by typing the numbers instead.
import { GEMINI_MODEL, ReadError, readResultsImage } from "./gemini";

export { ReadError };
export const MODEL = GEMINI_MODEL;
const KEY_STORAGE = "kl.geminiKey";

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

// Resolves with { screen, cup, rows: [{name, character, points, human, ...}] }. Rejects with a
// ReadError whose message is ready to show, or with an AbortError when `signal` fires.
export async function readResultsPhoto(b64, { players = [], lineup = [], signal } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new ReadError("Add your Gemini API key on the Account page to read photos.");
  const out = await readResultsImage({ apiKey, b64, players, lineup, signal, keyHint: "Check it on your Account page." });
  if (out.screen === "other" || !out.rows.length) {
    throw new ReadError("No results table found in that photo. Retake it straight on with the whole list in frame.");
  }
  return out;
}
