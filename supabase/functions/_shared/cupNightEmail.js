// Cup night emails: what each one says, and the send loop. Plain JS with no imports beyond ./ics.js,
// so the send-emails Edge Function (Deno), the tests and `npm run email:preview` (Node) share it.
import { buildIcs, cupsLabel } from "./ics.js";

export const DEFAULT_SITE_URL = "https://megmax.github.io/kart-league/";
export const DEFAULT_FROM = "Kart Night League <cup-nights@example.com>";

// Reads the function's environment (Deno.env / process.env) into one config object.
// Emails are only really sent with EMAIL_MODE=send and an API key; anything else logs them.
export function emailConfig(env) {
  const get = (k) => (typeof env === "function" ? env(k) : env[k]) || "";
  const apiKey = get("RESEND_API_KEY");
  return {
    mode: get("EMAIL_MODE") === "send" && apiKey ? "send" : "log",
    apiKey,
    from: get("EMAIL_FROM") || DEFAULT_FROM,
    siteUrl: withSlash(get("SITE_URL") || DEFAULT_SITE_URL),
    functionsUrl: get("SUPABASE_URL") ? get("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1" : "",
    leagueName: get("LEAGUE_NAME") || "Kart Night League",
  };
}

function withSlash(u) {
  return u.endsWith("/") ? u : u + "/";
}

// "Kart Night League <a@b.c>" -> { name, email }
export function parseAddress(s) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(s || "");
  return m ? { name: m[1].replace(/^"|"$/g, ""), email: m[2] } : { name: "", email: String(s || "").trim() };
}

export function eventLink(cfg, eventId) {
  return `${cfg.siteUrl}#/events/${eventId}`;
}

export function unsubscribeLink(cfg, token) {
  return `${cfg.siteUrl}#/unsubscribe/${token}`;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function formatWhen(iso, timeZone) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
  return { date, time, full: `${date} at ${time}` };
}

const COPY = {
  invite: { lead: "A new cup night is on the calendar.", button: "I'm in", subject: (w) => `Cup night: ${w.full}` },
  update: { lead: "A cup night changed. Here are the new details.", button: "See the cup night", subject: (w) => `Updated: cup night ${w.full}` },
  cancel: { lead: "This cup night is cancelled.", button: "See upcoming cup nights", subject: (w) => `Cancelled: cup night ${w.date}` },
  reminder: { lead: "You're in for cup night today.", button: "See who's in", subject: (w) => `Today: cup night at ${w.time}` },
};

// row: one claim_emails() result { id, kind, seq, email, display_name, unsubscribe_token, event_id, starts_at, cups, notes, timezone }
export function renderEmail(row, cfg, now = new Date()) {
  const copy = COPY[row.kind];
  if (!copy) throw new Error(`Unknown email kind: ${row.kind}`);
  const when = formatWhen(row.starts_at, row.timezone || "America/Toronto");
  const link = row.kind === "cancel" ? `${cfg.siteUrl}#/events` : eventLink(cfg, row.event_id);
  const unsub = unsubscribeLink(cfg, row.unsubscribe_token);
  const cups = cupsLabel(row.cups);
  const notes = (row.notes || "").trim();
  const subject = copy.subject(when);

  const text = [
    `Hi ${row.display_name || "racer"},`,
    "",
    copy.lead,
    "",
    `When: ${when.full}`,
    `Cups: ${cups}`,
    notes ? `Notes: ${notes}` : null,
    "",
    `${copy.button}: ${link}`,
    "",
    "--",
    `You get these because "Email me about cup nights" is on in your ${cfg.leagueName} account.`,
    `Unsubscribe: ${unsub}`,
  ].filter((l) => l !== null).join("\n");

  const struck = row.kind === "cancel" ? "text-decoration:line-through;" : "";
  const html = `<!doctype html>
<html><body style="margin:0;background:#0B0E1F;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#F4F6FF">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0E1F;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#151A33;border:1px solid #2A3260;border-radius:14px;padding:24px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9AA3C7">${esc(cfg.leagueName)}</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#FFD23F">${esc(row.kind === "cancel" ? "Cup night cancelled" : row.kind === "reminder" ? "Cup night today" : "Cup night")}</h1>
<p style="margin:0 0 16px">Hi ${esc(row.display_name || "racer")}, ${esc(copy.lead.charAt(0).toLowerCase() + copy.lead.slice(1))}</p>
<p style="margin:0 0 6px;${struck}"><b>When:</b> ${esc(when.full)}</p>
<p style="margin:0 0 6px;${struck}"><b>Cups:</b> ${esc(cups)}</p>
${notes ? `<p style="margin:0 0 6px;white-space:pre-line"><b>Notes:</b> ${esc(notes)}</p>` : ""}
<p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#FFD23F;color:#1A1300;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">${esc(copy.button)}</a></p>
<p style="margin:0;font-size:12px;color:#9AA3C7">You get these because "Email me about cup nights" is on in your account. <a href="${esc(unsub)}" style="color:#2EC4FF">Unsubscribe</a></p>
</td></tr></table></td></tr></table>
</body></html>`;

  const headers = {};
  if (cfg.functionsUrl) {
    // One-click unsubscribe from the mail app's own button (RFC 8058).
    headers["List-Unsubscribe"] = `<${cfg.functionsUrl}/unsubscribe?token=${row.unsubscribe_token}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const attachments = [];
  if (row.kind !== "reminder") {
    const method = row.kind === "cancel" ? "CANCEL" : "REQUEST";
    const ics = buildIcs(
      { id: row.event_id, starts_at: row.starts_at, cups: row.cups, notes, sequence: row.seq },
      { method, url: eventLink(cfg, row.event_id), organizer: parseAddress(cfg.from), attendee: { name: row.display_name, email: row.email }, now },
    );
    attachments.push({ filename: "cup-night.ics", content: ics, contentType: `text/calendar; method=${method}; charset=UTF-8` });
  }

  return { to: row.email, from: cfg.from, subject, text, html, headers, attachments };
}

export function idempotencyKey(row) {
  return `cup-night-email-${row.id}`;
}

// Sends (or, in log mode, logs) each claimed row and reports back with complete(id, ok, error, logged).
// One bad email never stops the rest. deliver(message, idempotencyKey) is the provider call.
export async function processBatch(rows, { cfg, deliver, complete, log = console.log }) {
  const results = [];
  for (const row of rows) {
    try {
      const msg = renderEmail(row, cfg);
      if (cfg.mode === "send") {
        await deliver(msg, idempotencyKey(row));
        await complete(row.id, true, null, false);
      } else {
        log(`[email:log] #${row.id} ${row.kind} to ${msg.to}: ${msg.subject}${msg.attachments.length ? " (+ .ics)" : ""}`);
        await complete(row.id, true, null, true);
      }
      results.push({ id: row.id, ok: true });
    } catch (e) {
      const error = String((e && e.message) || e);
      results.push({ id: row.id, ok: false, error });
      try { await complete(row.id, false, error, false); } catch { /* the row is retried after 10 minutes */ }
    }
  }
  return results;
}

function toBase64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Resend's send API. The idempotency key makes a retried request return the first result instead of sending again.
export function resendDeliver(cfg, fetchImpl = fetch) {
  return async function deliver(msg, key) {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers,
        attachments: msg.attachments.map((a) => ({ filename: a.filename, content: toBase64(a.content), content_type: a.contentType })),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  };
}
