import { useMemo, useState } from "react";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
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
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { CHARACTERS, charSrc, fmtDate, LOGO_SRC, ord, pctTxt } from "../lib/constants";
import { ProvisionalBadge, RatingChart, RatingDelta, fmtRating, signed } from "../components/RatingBits";
import { bestTracks, trackCup } from "../lib/tracks";
import { compute, playerSlug } from "../lib/standings";
import { getApiKey, setApiKey, MODEL } from "../lib/readPhoto";
import { groupBatches, useMyData } from "../lib/accountData";
import { PLAYER_COLORS, colors, fontDisplay } from "../theme";
import { plural } from "../components/PageBits";
import CharacterFace from "../components/CharacterFace";
import ProfileAvatar from "../components/ProfileAvatar";
import UnclaimedResults from "../components/UnclaimedResults";
import { useUnclaimed } from "../lib/unclaimed";
import { removeAllAvatars } from "../lib/avatars";
import AvatarEditor from "../components/AvatarEditor";
import CupIcon from "../components/CupIcon";
import TrackImage from "../components/TrackImage";

function roleLabel(r) {
  return r === "owner" ? "Owner" : r === "admin" ? "Admin" : "Member";
}

function AuthForm() {
  const { signIn, signUp } = useAuth();
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
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box component="img" src={LOGO_SRC} alt="" sx={{ height: 52, width: "auto" }} />
        <div>
          <Typography component="h1" sx={{ fontFamily: fontDisplay, fontSize: { xs: "1.375rem", md: "1.75rem" }, lineHeight: 1.15 }}>{up ? "Create an account" : "Sign in"}</Typography>
          <Typography sx={{ color: colors.muted }}>{up ? "Join the league to enter results and sign up for cup nights." : "Welcome back to the league."}</Typography>
        </div>
      </Stack>
      <Box>
        {up && (
          <Typography sx={{ color: colors.muted, mb: 2 }}>
            If an admin already added you as a player, sign up with the email they used and your results link up automatically once you confirm it.
          </Typography>
        )}
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
      </Box>
    </Container>
  );
}

function ProfileEditor({ profile, open, onClose, onSaved }) {
  const [draft, setDraft] = useState({
    displayName: profile.displayName || "", color: profile.color || PLAYER_COLORS[0],
    favoriteCharacter: profile.favoriteCharacter || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user, refreshProfile } = useAuth();

  async function save() {
    const name = draft.displayName.trim();
    if (!name) { setError("Enter a display name."); return; }
    setBusy(true); setError("");
    try {
      const row = { display_name: name, color: draft.color, favorite_character: draft.favoriteCharacter || "", updated_at: new Date().toISOString() };
      await q(sb.from("profiles").update(row).eq("id", user.id));
      await refreshProfile();
      onSaved();
    } catch (err) {
      setError(dbErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontFamily: "inherit", fontWeight: 800 }}>Edit profile</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5, mt: 0.5 }}>
          <ProfileAvatar name={draft.displayName.trim() || profile.displayName} src={profile.avatarUrl} size={56} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800 }} noWrap>{draft.displayName.trim() || "Your name"}</Typography>
            <Typography sx={{ color: colors.muted }} noWrap>{draft.favoriteCharacter || "Pick a character"}</Typography>
          </Box>
        </Stack>
        <Stack spacing={2}>
          <TextField label="Display name" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} inputProps={{ maxLength: 40 }} />
          <TextField select label="Favorite character" value={draft.favoriteCharacter} onChange={(e) => setDraft({ ...draft, favoriteCharacter: e.target.value })}>
            <MenuItem value="">—</MenuItem>
            {CHARACTERS.map((c) => (
              <MenuItem key={c} value={c}>
                <Stack direction="row" spacing={1} alignItems="center"><CharacterFace name={c} size={24} /><span>{c}</span></Stack>
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <Typography variant="caption" sx={{ color: colors.muted, display: "block", mb: 1 }}>Color</Typography>
            <Box role="radiogroup" aria-label="Color" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {PLAYER_COLORS.map((c) => (
                <Box
                  key={c} component="button" type="button" role="radio" aria-checked={draft.color === c} aria-label={c}
                  onClick={() => setDraft({ ...draft, color: c })}
                  sx={{
                    width: 32, height: 32, borderRadius: "50%", bgcolor: c, cursor: "pointer", p: 0,
                    border: draft.color === c ? `3px solid ${colors.ink}` : "3px solid transparent",
                    boxShadow: draft.color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
            </Box>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save profile"}</Button>
      </DialogActions>
    </Dialog>
  );
}

// A settings section: a plain heading over a hairline, no box.
function Panel({ title, children, sx }) {
  return (
    <Box component="section" sx={{ pt: 2, borderTop: `1px solid ${colors.line}`, ...sx }}>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.25rem", mb: 1.5 }}>{title}</Typography>
      {children}
    </Box>
  );
}

function Stat({ label, value, sub }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }}>{label}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: { xs: "1.375rem", sm: "1.625rem" }, lineHeight: 1.15 }} noWrap>{value}</Typography>
      {sub && <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }}>{sub}</Typography>}
    </Box>
  );
}

// The player card: character art, name and (once linked to a player) the season in numbers.
function ProfileHero({ profile, player, stats, need, slug, provisionalCups, onEdit, onPicture, waiting }) {
  const character = profile.favoriteCharacter || (stats && stats.main && stats.main.name) || "";
  const art = charSrc(character, true);
  const chip = { borderColor: colors.rule };

  return (
    <Box component="section" aria-label="Your profile" sx={{ position: "relative" }}>
      {art && (
        <Box component="img" src={art} alt="" aria-hidden
          sx={{ display: { xs: "none", sm: "block" }, position: "absolute", right: 0, top: 0, height: 220, width: "auto" }} />
      )}

      <Box sx={{ position: "relative", pr: { sm: 30 } }}>
        <Stack direction="row" spacing={2} alignItems="center">
          {/* Tap your picture to change it. */}
          <Box
            component="button" type="button" onClick={onPicture} aria-label="Change your profile picture"
            sx={{
              position: "relative", flexShrink: 0, p: 0, border: 0, bgcolor: "transparent", color: "inherit", cursor: "pointer", borderRadius: "50%",
              "&:focus-visible": { outline: `2px solid ${colors.gold}`, outlineOffset: 3 },
              "&:hover .cam": { bgcolor: colors.ink, color: colors.bg },
            }}
          >
            <ProfileAvatar name={profile.displayName} src={profile.avatarUrl} size={72} badge={waiting}
              badgeLabel={waiting ? `${plural(waiting, "unclaimed result")} might be yours` : undefined} />
            <Box className="cam" aria-hidden sx={{
              position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center",
              bgcolor: colors.raised, color: colors.ink, border: `2px solid ${colors.bg}`,
            }}>
              <PhotoCameraOutlinedIcon sx={{ fontSize: 16 }} />
            </Box>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontFamily: fontDisplay, fontSize: { xs: "1.375rem", sm: "1.75rem" }, lineHeight: 1.15, overflowWrap: "anywhere" }}>
              {profile.displayName || "Racer"}
            </Typography>
            <Typography sx={{ color: colors.muted, mt: 0.5 }}>
              {[roleLabel(profile.role), character, player && player.registeredAt ? `joined ${fmtDate(String(player.registeredAt).slice(0, 10))}` : null].filter(Boolean).join(" · ")}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 2 }}>
          {player
            ? <Chip size="small" variant="outlined" label={`Racing as ${player.name}`} sx={chip} />
            : <Chip size="small" variant="outlined" label="Not linked to a player yet" sx={{ ...chip, borderStyle: "dashed" }} />}
        </Stack>

        {stats && stats.cp > 0 ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "minmax(0,1.6fr) repeat(4, minmax(0,1fr))" }, columnGap: 3, rowGap: 2, mt: 3, pt: 2, borderTop: `1px solid ${colors.line}`, alignItems: "end" }}>
            {stats.rating != null && (
              <Box sx={{ gridColumn: { xs: "1 / -1", sm: "auto" }, minWidth: 0 }}>
                <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }}>Skill rating</Typography>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography sx={{ fontWeight: 800, fontSize: { xs: "2.25rem", sm: "2.75rem" }, lineHeight: 1 }}>{fmtRating(stats.rating)}</Typography>
                  {stats.lastNight && <RatingDelta delta={stats.lastNight.delta} sx={{ fontSize: "1rem" }} />}
                  {stats.provisional && <ProvisionalBadge cups={provisionalCups} />}
                </Stack>
              </Box>
            )}
            <Stat label="Rank" value={stats.rank ? `${stats.rank}${ord(stats.rank)}` : "—"} sub={stats.rank ? null : `${plural(Math.max(0, need - stats.cp), "cup")} to qualify`} />
            <Stat label="Points" value={pctTxt(stats.pct)} />
            <Stat label="Cups" value={stats.cp} />
            <Stat label="Cup wins" value={stats.wins} />
          </Box>
        ) : (
          <Typography sx={{ color: colors.muted, mt: 2.5, maxWidth: "46ch" }}>
            {player
              ? "Race your first cup and your season shows up here."
              : "Your results link up once an admin connects you to your player, or claim any that were you under “Is this you?” below."}
          </Typography>
        )}

        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 2.5 }}>
          <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={onEdit}>Edit profile</Button>
          {stats && stats.cp > 0 && slug && <Button variant="outlined" color="inherit" component={RouterLink} to={`/standings/${encodeURIComponent(slug)}`}>Full season</Button>}
        </Stack>
      </Box>
    </Box>
  );
}

// Your favourite track: always your best one, worked out from every cup you've raced (all seasons), by
// points a race (tracks raced twice or more first). Then the next two best.
function FavouriteTrack({ stats }) {
  const list = useMemo(() => {
    if (!stats) return [];
    const twice = bestTracks(stats.log, { minRaces: 2 });
    return twice.length ? twice : bestTracks(stats.log);
  }, [stats]);
  const [top, ...rest] = list;
  const line = (st) => `${st.avgPts.toFixed(1)} pts a race${st.avgPos != null ? ` · ${st.avgPos.toFixed(1)} avg place` : ""} · ${plural(st.races, "race")}`;

  return (
    <Panel title="Favourite track">
      {top ? (
        <>
          <Box sx={{ display: "grid", gap: 2, alignItems: "center", gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "minmax(0,3fr) minmax(0,2fr)" } }}>
            <TrackImage track={top.track} label caption={trackCup(top.track) || "Custom"} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: "2rem", lineHeight: 1.1 }}>
                {top.avgPts.toFixed(1)} <Box component="span" sx={{ fontSize: "1rem", fontWeight: 600, color: colors.muted }}>pts a race</Box>
              </Typography>
              <Typography sx={{ color: colors.muted, mt: 0.5 }}>
                {[top.avgPos != null ? `${top.avgPos.toFixed(1)} avg place` : null, plural(top.races, "race"), top.wins ? plural(top.wins, "race win") : null].filter(Boolean).join(" · ")}
              </Typography>
              <Typography sx={{ color: colors.muted, fontSize: "0.875rem", mt: 1 }}>Your best track, from every cup you've raced. It changes as you race.</Typography>
            </Box>
          </Box>
          {rest.length > 0 && (
            <>
              <Typography component="h3" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>Next best</Typography>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                {rest.slice(0, 2).map((st) => (
                  <Box key={st.track} sx={{ minWidth: 0 }}>
                    <TrackImage track={st.track} label caption={trackCup(st.track) || "Custom"} />
                    <Typography sx={{ color: colors.muted, fontSize: "0.875rem", mt: 0.5 }} noWrap>{line(st)}</Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </>
      ) : (
        <Typography sx={{ color: colors.muted }}>
          Your favourite track is your best one, worked out from your results. It shows up here after your first cup with its tracks recorded.
        </Typography>
      )}
    </Panel>
  );
}

// The last few cups, newest first, as a form guide.
// Your rating over the season: the chart, the latest night, season high and how you do against expectations.
function RatingPanel({ stats }) {
  if (!stats || stats.rating == null || !stats.cp) return null;
  return (
    <Panel title="Skill rating">
      <Stack direction="row" spacing={2} alignItems="baseline" useFlexGap flexWrap="wrap" sx={{ mb: 1.25 }}>
        <Typography sx={{ fontWeight: 800, fontSize: "1.6rem", lineHeight: 1 }}>{fmtRating(stats.rating)}</Typography>
        {stats.lastNight && (
          <Typography sx={{ color: colors.muted }}><RatingDelta delta={stats.lastNight.delta} /> on {fmtDate(stats.lastNight.date)}</Typography>
        )}
        <Typography sx={{ color: colors.muted }}>
          high {fmtRating(stats.ratingHigh)} · started {fmtRating(stats.ratingStart)}
          {stats.overUnder != null ? ` · ${signed(stats.overUnder, 1)} pts a matchup vs expected` : ""}
        </Typography>
      </Stack>
      <RatingChart s={stats} />
      {stats.provisional && (
        <Typography sx={{ color: colors.muted, fontSize: "0.875rem", mt: 1 }}>
          Provisional: your rating moves faster until you've raced a few more cups this season.
        </Typography>
      )}
    </Panel>
  );
}

function RecentForm({ stats }) {
  if (!stats || !stats.log.length) return null;
  const recent = stats.log.slice(-5).reverse();
  const change = (cupId) => {
    const h = (stats.ratingHistory || []).find((x) => x.cupId === cupId);
    return h ? h.after - h.before : null;
  };
  return (
    <Panel title="Recent form">
      <Stack divider={<Divider />}>
        {recent.map((l) => {
          return (
            <Stack key={l.cup.id} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
              <Box sx={{ width: 40, textAlign: "center", fontWeight: 800, fontStyle: "italic", fontSize: "1.125rem" }}>
                {l.rank}<Box component="sup" sx={{ fontSize: "0.6em" }}>{ord(l.rank)}</Box>
              </Box>
              <CupIcon cup={l.cup.cup} size={26} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }} noWrap>{l.cup.cup}</Typography>
                <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }} noWrap>
                  {[fmtDate(l.cup.date), plural(l.field, "racer"), l.character].filter(Boolean).join(" · ")}
                </Typography>
              </Box>
              <Box sx={{ textAlign: "right" }}>
                <Typography sx={{ fontWeight: 700 }}>{l.pts}<Box component="span" sx={{ color: colors.muted, fontWeight: 500 }}>/{l.max}</Box></Typography>
              </Box>
              <Box sx={{ width: 44, textAlign: "right" }}><RatingDelta delta={change(l.cup.id)} /></Box>
            </Stack>
          );
        })}
      </Stack>
    </Panel>
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
    <Panel title="Emails">
      <FormControlLabel
        sx={{ display: "flex" }}
        control={<Switch checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />}
        label="Email me about cup nights"
      />
      <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5 }}>
        An invite with a calendar file when a cup night is scheduled, updates if it changes or is cancelled, and a reminder on the day if you're in. Sent to <b>{user.email}</b>. Every email has an unsubscribe link.
      </Typography>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Panel>
  );
}

// The Gemini key lives only in this browser and is sent only to Google, to read results photos. Admins only.
function GeminiKey() {
  const [has, setHas] = useState(!!getApiKey());
  const [val, setVal] = useState("");
  const [editing, setEditing] = useState(false);
  function save() {
    const k = val.trim();
    if (!k) return;
    setApiKey(k); setHas(true); setVal(""); setEditing(false);
  }
  return (
    <Panel title="Read results photos with Gemini">
      <Typography variant="body2">
        With a Gemini API key, Gemini reads the results photos you upload: everyone's points, who's who (by character) and the tracks. Admins only.
        The key stays in this browser and is sent only to Google ({MODEL}). Get one free at{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: colors.link }}>Google AI Studio</a>; usage beyond the free tier is billed to the key.
      </Typography>
      {has && !editing ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
          <Chip size="small" color="success" variant="outlined" label="Key saved on this device" />
          <Button size="small" onClick={() => setEditing(true)}>Replace</Button>
          <Button size="small" color="error" onClick={() => { setApiKey(""); setHas(false); }}>Remove</Button>
        </Stack>
      ) : (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5 }}>
          <TextField size="small" type="password" label="Gemini API key" placeholder="AIza…" value={val} onChange={(e) => setVal(e.target.value)} sx={{ flex: 1 }} autoComplete="off" />
          <Button variant="contained" size="small" onClick={save} disabled={!val.trim()}>Save key</Button>
          {editing && <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>}
        </Stack>
      )}
    </Panel>
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
    <Panel title="Your submissions and requests">
      <Stack spacing={1.5}>
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
    </Panel>
  );
}

function DangerZone() {
  const { user, isOwner, hasOwner, refreshProfile, signOut } = useAuth();
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
      await removeAllAvatars(user.id).catch(() => {}); // Storage files aren't removed by the SQL delete
      await q(sb.rpc("delete_my_account"));
      await signOut();
      flash("Your account was deleted");
    } catch (e) {
      setError(dbErr(e));
      setBusy(false);
    }
  }

  return (
    <Box>
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
  const { state } = useLeagueData();
  const m = useMemo(() => (state && state.cups.length ? compute(state) : null), [state]);
  const mAll = useMemo(() => (state && state.cups.length ? compute(state, { season: "all" }) : null), [state]);
  const { waiting } = useUnclaimed();
  const [editing, setEditing] = useState(false);
  const [picture, setPicture] = useState(false);
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

  const player = state ? state.players.find((p) => (p.userId || p.user_id) === user.id) : null;
  const stats = player && m ? m.byId.get(player.id) : null;
  const slug = player && state ? playerSlug(state.players, player) : null;

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
    <Container maxWidth="lg" sx={{ py: { xs: 1, sm: 2 } }}>
      {savedFlash && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSavedFlash("")}>{savedFlash}</Alert>}
      <ProfileHero profile={profile} player={player} stats={stats} need={m ? m.minCups : 0} slug={slug} provisionalCups={m && m.rated ? m.rated.cfg.provisional : 5} onEdit={() => setEditing(true)} onPicture={() => setPicture(true)} waiting={waiting} />
      <AvatarEditor open={picture} onClose={() => setPicture(false)} />
      <UnclaimedResults />
      {editing && <ProfileEditor open profile={profile} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setSavedFlash("Profile saved"); }} />}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,7fr) minmax(0,5fr)" }, columnGap: 6, rowGap: 5, mt: 5, alignItems: "start" }}>
        <Stack spacing={5} sx={{ minWidth: 0 }}>
          <FavouriteTrack stats={player && mAll ? mAll.byId.get(player.id) : null} />
          <RatingPanel stats={stats} />
          <RecentForm stats={stats} />
          <MyActivity />
          <Box sx={{ pt: 2, borderTop: `1px solid ${colors.line}`, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", justifyContent: "space-between" }}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>Raced a cup night?</Typography>
              <Typography sx={{ color: colors.muted }}>{isAdmin ? "Record the results and the standings update." : "Submit the results and an admin checks them."}</Typography>
            </Box>
            <Button component={RouterLink} to="/add" variant="contained">{isAdmin ? "Record a cup night" : "Submit results"}</Button>
          </Box>
        </Stack>

        <Stack spacing={5} sx={{ minWidth: 0 }}>
          <EmailPreferences key={String(profile.emailCupNights)} profile={profile} />
          {isAdmin && <GeminiKey />}
          <Panel title="Sign-in and security">
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
              Signed in as <b>{user.email}</b>{isPw ? " with a password" : ""}.
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
            <Divider sx={{ my: 2 }} />
            <DangerZone />
          </Panel>
        </Stack>
      </Box>
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
