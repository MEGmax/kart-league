import { useState } from "react";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import GoogleIcon from "@mui/icons-material/Google";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { CHARACTERS, fmtDate } from "../lib/constants";
import { getApiKey, setApiKey, MODEL } from "../lib/readPhoto";
import { groupBatches, useMyData } from "../lib/accountData";
import { PLAYER_COLORS, colors } from "../theme";

function roleLabel(r) {
  return r === "owner" ? "Owner" : r === "admin" ? "Admin" : "Member";
}

function AuthForm() {
  const { signIn, signUp, signInGoogle } = useAuth();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const up = mode === "signup";

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(""); setMsg("");
    if (up && !form.name.trim()) { setError("Enter a display name."); return; }
    setBusy(true);
    try {
      const data = up ? await signUp(form.email, form.password, form.name) : await signIn(form.email, form.password);
      setForm({ email: "", password: "", name: "" });
      if (up && !data.session) { setMode("signin"); setMsg("Check your inbox: open the confirmation link we sent, then sign in."); }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(""); setMsg(""); setBusy(true);
    try { await signInGoogle(); } catch (err) { setError(err.message); setBusy(false); }
  }

  async function forgot() {
    if (!form.email.trim()) { setError("Enter your email first."); return; }
    setBusy(true); setError(""); setMsg("");
    try {
      await q(sb.auth.resetPasswordForEmail(form.email.trim(), { redirectTo: location.origin + location.pathname }));
      setMsg("Check your inbox for a password reset link.");
    } catch (err) {
      setError(dbErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ fontFamily: "inherit", mb: 2 }}>{up ? "Create an account" : "Sign in"}</Typography>
      <Paper sx={{ p: 3 }}>
        {up && (
          <Typography variant="body2" sx={{ color: colors.muted, mb: 2 }}>
            If an admin already added you as a player, sign up with the email they used and your results link up automatically once you confirm it.
          </Typography>
        )}
        <Button fullWidth variant="outlined" startIcon={<GoogleIcon />} disabled={busy} onClick={google} sx={{ mb: 2 }}>
          Continue with Google
        </Button>
        <Divider sx={{ mb: 2 }}>or with email</Divider>
        <Box component="form" onSubmit={submit} sx={{ display: "grid", gap: 2 }}>
          {up && <TextField label="Display name" value={form.name} onChange={set("name")} inputProps={{ maxLength: 40 }} required />}
          <TextField label="Email" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
          <TextField
            label="Password" type="password" value={form.password} onChange={set("password")}
            autoComplete={up ? "new-password" : "current-password"} inputProps={{ minLength: 6 }}
            helperText={up ? "At least 6 characters." : ""} required
          />
          {error && <Alert severity="error">{error}</Alert>}
          {msg && <Alert severity="info">{msg}</Alert>}
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "One moment…" : up ? "Create account" : "Sign in"}
          </Button>
        </Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
          {up ? (
            <Button size="small" onClick={() => setMode("signin")}>Already have an account? Sign in</Button>
          ) : (
            <>
              <Button size="small" onClick={() => setMode("signup")}>New here? Create an account</Button>
              <Button size="small" onClick={forgot} disabled={busy}>Forgot password?</Button>
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}

function ProfileEditor({ profile, onSaved }) {
  const [draft, setDraft] = useState({
    displayName: profile.displayName || "", color: profile.color || PLAYER_COLORS[0],
    favoriteCharacter: profile.favoriteCharacter || "", favoriteVehicle: profile.favoriteVehicle || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user, refreshProfile } = useAuth();

  async function save() {
    const name = draft.displayName.trim();
    if (!name) { setError("Enter a display name."); return; }
    setBusy(true); setError("");
    try {
      await q(sb.from("profiles").update({
        display_name: name, color: draft.color, favorite_character: draft.favoriteCharacter || "",
        favorite_vehicle: draft.favoriteVehicle.trim(), updated_at: new Date().toISOString(),
      }).eq("id", user.id));
      await refreshProfile();
      onSaved();
    } catch (err) {
      setError(dbErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="overline" sx={{ color: colors.muted }}>Profile</Typography>
      <Stack spacing={2} sx={{ mt: 1 }}>
        <TextField label="Display name" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} inputProps={{ maxLength: 40 }} />
        <TextField select label="Favorite character" value={draft.favoriteCharacter} onChange={(e) => setDraft({ ...draft, favoriteCharacter: e.target.value })}>
          <MenuItem value="">—</MenuItem>
          {CHARACTERS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <TextField label="Favorite kart or bike" placeholder="e.g. Flame Runner" value={draft.favoriteVehicle} onChange={(e) => setDraft({ ...draft, favoriteVehicle: e.target.value })} inputProps={{ maxLength: 40 }} />
        <Box>
          <Typography variant="caption" sx={{ color: colors.muted, display: "block", mb: 1 }}>Color</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {PLAYER_COLORS.map((c) => (
              <Box
                key={c}
                onClick={() => setDraft({ ...draft, color: c })}
                sx={{
                  width: 30, height: 30, borderRadius: "50%", bgcolor: c, cursor: "pointer",
                  border: draft.color === c ? `3px solid ${colors.ink}` : "3px solid transparent",
                }}
              />
            ))}
          </Stack>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        <Box><Button variant="contained" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save profile"}</Button></Box>
      </Stack>
    </Paper>
  );
}

// "Email me about cup nights": off by default; saves as soon as it's flipped.
function EmailPreferences({ profile }) {
  const { user, refreshProfile } = useAuth();
  const [on, setOn] = useState(profile.emailCupNights);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle(next) {
    setOn(next); setBusy(true); setError("");
    try {
      await q(sb.from("profiles").update({ email_cup_nights: next, updated_at: new Date().toISOString() }).eq("id", user.id));
      await refreshProfile();
    } catch (err) {
      setOn(!next);
      setError(dbErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="overline" sx={{ color: colors.muted }}>Emails</Typography>
      <FormControlLabel
        sx={{ display: "flex", mt: 0.5 }}
        control={<Switch checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />}
        label="Email me about cup nights"
      />
      <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5 }}>
        An invite with a calendar file when a cup night is scheduled, updates if it changes or is cancelled, and a reminder on the day if you're in. Sent to <b>{user.email}</b>. Every email has an unsubscribe link.
      </Typography>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}

// The Anthropic key lives only in this browser and is sent only to Anthropic, to read results photos.
function ClaudeKey() {
  const [has, setHas] = useState(!!getApiKey());
  const [val, setVal] = useState("");
  const [editing, setEditing] = useState(false);
  function save() {
    const k = val.trim();
    if (!k) return;
    setApiKey(k); setHas(true); setVal(""); setEditing(false);
  }
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="overline" sx={{ color: colors.muted }}>Read results photos with Claude</Typography>
      <Typography variant="body2" sx={{ mt: 1 }}>
        With an Anthropic API key, Claude reads each results-screen photo you add when recording cups and fills in everyone's points, matching rows to racers by their character. The key stays in this browser and is sent only to Anthropic ({MODEL}). Each photo costs a few cents on your key.
      </Typography>
      {has && !editing ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
          <Chip size="small" color="success" variant="outlined" label="Key saved on this device" />
          <Button size="small" onClick={() => setEditing(true)}>Replace</Button>
          <Button size="small" color="error" onClick={() => { setApiKey(""); setHas(false); }}>Remove</Button>
        </Stack>
      ) : (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5 }}>
          <TextField size="small" type="password" label="Anthropic API key" placeholder="sk-ant-…" value={val} onChange={(e) => setVal(e.target.value)} sx={{ flex: 1 }} autoComplete="off" />
          <Button variant="contained" size="small" onClick={save} disabled={!val.trim()}>Save key</Button>
          {editing && <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>}
        </Stack>
      )}
    </Paper>
  );
}

const STATUS_CHIP = { pending: ["Waiting for review", "warning"], approved: ["Approved", "success"], rejected: ["Not accepted", "error"] };

function MyActivity() {
  const { subs, claims } = useMyData();
  const { state, reload } = useLeagueData();
  const flash = useFlash();
  const [error, setError] = useState("");
  if (!subs.length && !claims.length) return null;
  const batches = groupBatches(subs).reverse();

  async function withdraw(table, ids, msg) {
    setError("");
    try {
      await q(sb.from(table).delete().in("id", ids));
      flash(msg);
      reload();
    } catch (e) {
      setError(dbErr(e));
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="overline" sx={{ color: colors.muted }}>Your submissions and requests</Typography>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {batches.map((b) => {
          const pending = b.filter((x) => x.status === "pending");
          const st = b.every((x) => x.status === b[0].status) ? b[0].status : "pending";
          const [label, color] = STATUS_CHIP[st] || STATUS_CHIP.pending;
          return (
            <Box key={b[0].batch}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{b.map((x) => x.cup).join(", ")}</Typography>
                <Typography variant="body2" sx={{ color: colors.muted }}>raced {fmtDate(b[0].date)}</Typography>
                <Chip size="small" variant="outlined" color={color} label={label} />
                {pending.length > 0 && <Button size="small" onClick={() => withdraw("submissions", pending.map((x) => x.id), "Submission withdrawn")}>Withdraw</Button>}
              </Stack>
              {b.filter((x) => x.reviewNote).map((x) => <Typography key={x.id} variant="caption" sx={{ color: colors.muted, display: "block" }}>{x.cup}: “{x.reviewNote}”</Typography>)}
            </Box>
          );
        })}
        {claims.map((c) => {
          const cup = state && state.cups.find((x) => x.id === c.cupId);
          const [label, color] = STATUS_CHIP[c.status] || STATUS_CHIP.pending;
          return (
            <Box key={c.id}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>Points request · {cup ? cup.cup : "a deleted cup"}</Typography>
                <Chip size="small" variant="outlined" color={color} label={label} />
                {c.status === "pending" && <Button size="small" onClick={() => withdraw("claims", [c.id], "Request withdrawn")}>Withdraw</Button>}
              </Stack>
              {c.reviewNote && <Typography variant="caption" sx={{ color: colors.muted }}>“{c.reviewNote}”</Typography>}
            </Box>
          );
        })}
      </Stack>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}

function DangerZone() {
  const { isOwner, hasOwner, refreshProfile, signOut } = useAuth();
  const flash = useFlash();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function claim() {
    setBusy(true); setError("");
    try {
      await q(sb.rpc("claim_ownership"));
      await refreshProfile();
      flash("You're the league owner now");
    } catch (e) {
      setError(dbErr(e));
    } finally {
      setBusy(false);
    }
  }
  async function del() {
    setBusy(true); setError("");
    try {
      await q(sb.rpc("delete_my_account"));
      await signOut();
      flash("Your account was deleted");
    } catch (e) {
      setError(dbErr(e));
      setBusy(false);
    }
  }

  return (
    <Box sx={{ mt: 2 }}>
      {!hasOwner && !isOwner && (
        <Alert severity="info" sx={{ mb: 1.5 }} action={<Button color="inherit" size="small" disabled={busy} onClick={claim}>Claim it</Button>}>
          This league has no owner yet. The first person to claim it becomes the owner (and an admin).
        </Alert>
      )}
      {isOwner ? (
        <Typography variant="caption" sx={{ color: colors.muted }}>You own this league, so your account can't be deleted.</Typography>
      ) : (
        <Button size="small" color="error" onClick={() => setConfirming(true)}>Delete my account</Button>
      )}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      <Dialog open={confirming} onClose={busy ? undefined : () => setConfirming(false)}>
        <DialogTitle sx={{ fontFamily: "inherit", fontWeight: 800 }}>Delete your account?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Your sign-in, profile, pending submissions and requests are deleted. Your race results stay in the standings under your player name, unlinked from any account. This can't be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} disabled={busy}>Keep it</Button>
          <Button color="error" variant="contained" onClick={del} disabled={busy}>{busy ? "Deleting…" : "Delete account"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function SignedInView() {
  const { user, profile, isAdmin, signOut, updatePassword } = useAuth();
  const [changingPw, setChangingPw] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState("");

  if (!profile) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2, color: colors.muted }}>Setting up your profile…</Typography>
      </Container>
    );
  }

  const isPw = (user.identities || []).some((d) => d.provider === "email") || (user.app_metadata && user.app_metadata.provider === "email");

  async function savePassword() {
    if (pw.length < 6) { setError("Use at least 6 characters."); return; }
    setBusy(true); setError("");
    try {
      await updatePassword(pw);
      setPw(""); setChangingPw(false); setSavedFlash("Password updated");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontFamily: "inherit" }}>Your account</Typography>
        <Chip label={roleLabel(profile.role)} size="small" color="primary" />
      </Stack>
      {savedFlash && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSavedFlash("")}>{savedFlash}</Alert>}
      <Stack spacing={2}>
        <ProfileEditor profile={profile} onSaved={() => setSavedFlash("Profile saved")} />
        <EmailPreferences key={String(profile.emailCupNights)} profile={profile} />
        <MyActivity />
        <ClaudeKey />
        <Button component={RouterLink} to="/add" variant="outlined">{isAdmin ? "Record a cup night" : "Submit a cup night's results"}</Button>
        <Paper sx={{ p: 3 }}>
          <Typography variant="overline" sx={{ color: colors.muted }}>Sign-in and security</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Signed in as <b>{user.email}</b> {isPw ? "with a password" : "with Google"}.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            {isPw && <Button size="small" onClick={() => setChangingPw((v) => !v)}>Change password</Button>}
            <Button size="small" onClick={signOut}>Sign out</Button>
          </Stack>
          {isPw && changingPw && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <TextField size="small" type="password" label="New password" value={pw} onChange={(e) => setPw(e.target.value)} inputProps={{ minLength: 6 }} />
              <Button variant="contained" size="small" disabled={busy} onClick={savePassword}>Save</Button>
            </Stack>
          )}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <DangerZone />
        </Paper>
      </Stack>
    </Container>
  );
}

export default function AccountPage() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2, color: colors.muted }}>Checking your sign-in…</Typography>
      </Container>
    );
  }
  return user ? <SignedInView /> : <AuthForm />;
}
