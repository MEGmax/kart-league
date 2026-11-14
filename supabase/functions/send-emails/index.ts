// Background sender for cup night emails. pg_cron calls this every minute while the outbox has
// something due (see the "background jobs" block in supabase/schema.sql). It claims a batch, sends each
// email (or logs it when EMAIL_MODE isn't "send"), and reports each result back to the database.
//
// Deploy: npx supabase functions deploy send-emails --no-verify-jwt --project-ref ikbcapdpatjwozjdgcqk
// Secrets: see .env.example. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { emailConfig, processBatch, resendDeliver } from "../_shared/cupNightEmail.js";

const BATCH = 20;

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return new Response("CRON_SECRET isn't set", { status: 500 });
  if (req.headers.get("Authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const cfg = emailConfig((k: string) => Deno.env.get(k));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: rows, error } = await db.rpc("claim_emails", { p_limit: BATCH });
  if (error) return new Response(`claim_emails failed: ${error.message}`, { status: 500 });

  const results = await processBatch(rows || [], {
    cfg,
    deliver: resendDeliver(cfg),
    complete: async (id: number, ok: boolean, err: string | null, logged: boolean) => {
      const { error: e } = await db.rpc("complete_email", { p_id: id, p_ok: ok, p_error: err, p_logged: logged });
      if (e) throw e;
    },
  });

  return Response.json({ mode: cfg.mode, claimed: results.length, failed: results.filter((r) => !r.ok).length });
});
