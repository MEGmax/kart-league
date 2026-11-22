import { createClient } from "@supabase/supabase-js";

// Supabase project (Supabase dashboard › Project Settings › API, or the Connect button).
// The URL and publishable (anon) key identify the project and are safe to publish;
// access is enforced by the row level security in supabase/schema.sql.
export const SUPABASE_CONFIG = {
  url: "https://ikbcapdpatjwozjdgcqk.supabase.co",
  key: "sb_publishable_vGDKUa_XAhK_gRne-0sGMA_l8LlphoP",
};

export const sb = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export function q(promise) {
  return promise.then((r) => {
    if (r.error) throw r.error;
    return r.data;
  });
}

export function siteUrl() {
  return location.origin + location.pathname;
}

export function dbErr(e) {
  const c = e && e.code, m = (e && e.message) || "";
  if (c === "P0001") return m; // our own friendly messages from the database functions
  if (c === "42501" || /row-level security|permission denied/i.test(m)) return "You don't have permission to do that. If your role just changed, refresh the page.";
  if (c === "23514") return "Something was too long or invalid. A photo may be too large; try a smaller one.";
  if (c === "23505") return "That already exists.";
  if (c === "PGRST301" || /JWT/i.test(m)) return "Your session expired. Sign in again.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the server. Check your connection and try again.";
  return "Saving failed" + (m ? ": " + m : "") + ".";
}

const AUTH_ERRORS = {
  invalid_credentials: "That email and password don't match an account.",
  email_not_confirmed: "Confirm your email first: open the link we sent you, then sign in.",
  user_already_exists: "There's already an account with that email. Sign in instead.",
  email_exists: "There's already an account with that email. Sign in instead.",
  weak_password: "Use a longer password: at least 6 characters.",
  email_address_invalid: "Enter a valid email address.",
  validation_failed: "Check the email and password and try again.",
  over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  signup_disabled: "New sign-ups are switched off for this league.",
  same_password: "That's already your password. Pick a different one.",
  reauthentication_needed: "For security, sign out and back in, then try again.",
};
export function authErr(e) {
  const c = (e && e.code) || "", m = (e && e.message) || "";
  if (AUTH_ERRORS[c]) return AUTH_ERRORS[c];
  if (/Invalid login credentials/i.test(m)) return AUTH_ERRORS.invalid_credentials;
  if (/provider is not enabled/i.test(m)) return AUTH_ERRORS.provider_disabled;
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the sign-in server. Check your connection.";
  return m || "Sign-in failed.";
}
