import { describe, expect, it, vi } from "vitest";
import { emailConfig, processBatch, renderEmail, resendDeliver } from "../supabase/functions/_shared/cupNightEmail.js";

const ROW = {
  id: 7, kind: "invite", seq: 0, email: "ben@test.dev", display_name: "Ben <script>",
  unsubscribe_token: "11111111-2222-3333-4444-555555555555", event_id: "abc", starts_at: "2030-01-16T01:00:00Z",
  cups: [], notes: "Bring <snacks> & drinks", timezone: "America/Toronto",
};
const CFG = emailConfig({ SITE_URL: "https://kart.example", SUPABASE_URL: "https://proj.supabase.co" });

describe("emailConfig", () => {
  it("logs unless EMAIL_MODE=send and an API key are both set", () => {
    expect(emailConfig({}).mode).toBe("log");
    expect(emailConfig({ RESEND_API_KEY: "re_x" }).mode).toBe("log");
    expect(emailConfig({ EMAIL_MODE: "send" }).mode).toBe("log");
    expect(emailConfig({ EMAIL_MODE: "send", RESEND_API_KEY: "re_x" }).mode).toBe("send");
    expect(CFG.siteUrl).toBe("https://kart.example/");
  });
});

describe("renderEmail", () => {
  it("has the details, a link to the event, an unsubscribe link and an .ics", () => {
    const m = renderEmail(ROW, CFG);
    expect(m.to).toBe("ben@test.dev");
    expect(m.subject).toBe("Cup night: Tuesday, January 15 at 8:00 PM EST");
    expect(m.text).toContain("Cups: Cup TBD");
    expect(m.text).toContain("Notes: Bring <snacks> & drinks");
    expect(m.text).toContain("I'm in: https://kart.example/#/events/abc");
    expect(m.text).toContain("Unsubscribe: https://kart.example/#/unsubscribe/11111111-2222-3333-4444-555555555555");
    expect(m.html).toContain('href="https://kart.example/#/events/abc"');
    expect(m.html).toContain("Bring &lt;snacks&gt; &amp; drinks");
    expect(m.html).not.toContain("<script>");
    expect(m.headers["List-Unsubscribe"]).toBe("<https://proj.supabase.co/functions/v1/unsubscribe?token=11111111-2222-3333-4444-555555555555>");
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0].contentType).toBe("text/calendar; method=REQUEST; charset=UTF-8");
  });

  it("words updates, cancellations and reminders differently", () => {
    expect(renderEmail({ ...ROW, kind: "update", seq: 1, cups: ["Star Cup", "Leaf Cup"] }, CFG).text).toContain("Cups: Star Cup, Leaf Cup");
    const cancel = renderEmail({ ...ROW, kind: "cancel", seq: 2 }, CFG);
    expect(cancel.subject).toBe("Cancelled: cup night Tuesday, January 15");
    expect(cancel.attachments[0].contentType).toContain("method=CANCEL");
    const reminder = renderEmail({ ...ROW, kind: "reminder" }, CFG);
    expect(reminder.subject).toBe("Today: cup night at 8:00 PM EST");
    expect(reminder.attachments).toHaveLength(0);
  });
});

describe("processBatch", () => {
  it("logs instead of sending in log mode", async () => {
    const deliver = vi.fn(), complete = vi.fn(), log = vi.fn();
    await processBatch([ROW], { cfg: { ...CFG, mode: "log" }, deliver, complete, log });
    expect(deliver).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("invite to ben@test.dev"));
    expect(complete).toHaveBeenCalledWith(7, true, null, true);
  });

  it("sends with a per-row idempotency key and keeps going after a failure", async () => {
    const deliver = vi.fn().mockRejectedValueOnce(new Error("Resend 500")).mockResolvedValue(undefined);
    const complete = vi.fn();
    const res = await processBatch([ROW, { ...ROW, id: 8 }], { cfg: { ...CFG, mode: "send" }, deliver, complete });
    expect(deliver.mock.calls.map((c) => c[1])).toEqual(["cup-night-email-7", "cup-night-email-8"]);
    expect(complete.mock.calls).toEqual([[7, false, "Resend 500", false], [8, true, null, false]]);
    expect(res.map((r) => r.ok)).toEqual([false, true]);
  });
});

describe("resendDeliver", () => {
  it("posts to Resend with the idempotency key and a base64 .ics", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await resendDeliver({ apiKey: "re_test" }, fetchImpl)(renderEmail(ROW, CFG), "cup-night-email-7");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toBe("cup-night-email-7");
    const body = JSON.parse(init.body);
    expect(atob(body.attachments[0].content)).toContain("BEGIN:VCALENDAR");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
