// One-click unsubscribe for mail apps (RFC 8058): the List-Unsubscribe header on every cup night email
// points here, and Gmail/Apple Mail POST to it. A plain GET (someone pasting the link) is sent on to the
// site's unsubscribe page, which does the same thing with a confirmation. Either way it only turns
// "Email me about cup nights" off.
//
// Deploy: npx supabase functions deploy unsubscribe --no-verify-jwt --project-ref ikbcapdpatjwozjdgcqk
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { DEFAULT_SITE_URL } from "../_shared/cupNightEmail.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") || "";
  const site = Deno.env.get("SITE_URL") || DEFAULT_SITE_URL;

  if (req.method === "GET") {
    return Response.redirect(`${site.replace(/\/?$/, "/")}#/unsubscribe/${encodeURIComponent(token)}`, 302);
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!UUID.test(token)) return new Response("Invalid link", { status: 400 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { error } = await db.rpc("unsubscribe_email", { p_token: token });
  if (error) return new Response("Couldn't unsubscribe", { status: 500 });
  return new Response("Unsubscribed from cup night emails.", { status: 200 });
});
