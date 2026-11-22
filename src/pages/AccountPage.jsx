import { useMemo, useState } from "react";
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
import LinearProgress from "@mui/material/LinearProgress";
import Autocomplete from "@mui/material/Autocomplete";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { CHARACTERS, charSrc, fmtDate, LOGO_SRC, ord, pctTxt, TRACKS } from "../lib/constants";
import { bestTracks, trackCup } from "../lib/tracks";
import { compute, playerSlug } from "../lib/standings";
import { getApiKey, setApiKey, MODEL } from "../lib/readPhoto";
import { groupBatches, useMyData } from "../lib/accountData";
import { PLAYER_COLORS, brandStripe, colors, fontData, fontDisplay } from "../theme";
import { plural } from "../components/PageBits";
import CharacterFace from "../components/CharacterFace";
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
          <Typography variant="h5" sx={{ fontFamily: "inherit" }}>{up ? "Create an account" : "Sign in"}</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>{up ? "Join the league to enter results and sign up for cup nights." : "Welcome back to the league."}</Typography>
        </div>
      </Stack>
      <Paper sx={{ p: 3 }}>
        {up && (
          <Typography variant="body2" sx={{ color: colors.muted, mb: 2 }}>
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
      </Paper>
    </Container>
  );
}

function ProfileEditor({ profile, open, onClose, onSaved }) {
  const [draft, setDraft] = useState({
    displayName: profile.displayName || "", color: profile.color || PLAYER_COLORS[0],
    favoriteCharacter: profile.favoriteCharacter || "", favoriteVehicle: profile.favoriteVehicle || "",
    favoriteTracks: profile.favoriteTracks || [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user, refreshProfile } = useAuth();

  async function save() {
    const name = draft.displayName.trim();
    if (!name) { setError("Enter a display name."); return; }
    setBusy(true); setError("");
    try {
      const row = {
        display_name: name, color: draft.color, favorite_character: draft.favoriteCharacter || "",
        favorite_vehicle: draft.favoriteVehicle.trim(), updated_at: new Date().toISOString(),
      };
      // Only sent when changed, so the rest of the profile still saves before the v8 schema is run.
      if (draft.favoriteTracks.join("|") !== (profile.favoriteTracks || []).join("|")) row.favorite_tracks = draft.favoriteTracks;
      await q(sb.from("profiles").update(row).eq("id", user.id));
      await refreshProfile();
      onSaved();
    } catch (err) {
      setError(/favorite_tracks/.test((err && err.message) || "")
        ? "Favourite tracks need the latest database update (run supabase/schema.sql). The rest saves if you clear them."
        : dbErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontFamily: "inherit", fontWeight: 800 }}>Edit profile</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5, mt: 0.5 }}>
          <CharacterFace name={draft.favoriteCharacter} ring={draft.color} size={56} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800 }} noWrap>{draft.displayName.trim() || "Your name"}</Typography>
            <Typography variant="body2" sx={{ color: colors.muted }} noWrap>{[draft.favoriteCharacter, draft.favoriteVehicle.trim()].filter(Boolean).join(" · ") || "Pick a character"}</Typography>
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
          <TextField label="Favorite kart or bike" placeholder="e.g. Flame Runner" value={draft.favoriteVehicle} onChange={(e) => setDraft({ ...draft, favoriteVehicle: e.target.value })} inputProps={{ maxLength: 40 }} />
          <Autocomplete
            multiple disableCloseOnSelect options={TRACKS} value={draft.favoriteTracks}
            onChange={(_, v) => setDraft({ ...draft, favoriteTracks: v.slice(0, 3) })}
            getOptionDisabled={(t) => draft.favoriteTracks.length >= 3 && draft.favoriteTracks.indexOf(t) < 0}
            groupBy={(t) => (TRACKS.indexOf(t) < 16 ? "Nitro" : "Retro")}
            renderOption={(props, t) => {
              const { key, ...rest } = props;
              return <Box component="li" key={key} {...rest} sx={{ gap: 1.25 }}><TrackImage track={t} width={56} radius={0.75} />{t}</Box>;
            }}
            renderInput={(params) => <TextField {...params} label="Favourite tracks" helperText="Up to 3" />}
          />
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

// A settings card with a small icon heading.
function Panel({ icon, title, children, sx }) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, ...sx }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, color: colors.muted }}>
        {icon}
        <Typography variant="overline" sx={{ lineHeight: 1.4 }}>{title}</Typography>
      </Stack>
      {children}
    </Paper>
  );
}

function Stat({ label, value, sub }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontFamily: fontDisplay, fontSize: { xs: "1.25rem", sm: "1.55rem" }, lineHeight: 1.1, transform: "skewX(-7deg)" }} noWrap>{value}</Typography>
      <Typography variant="caption" sx={{ color: colors.muted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{label}</Typography>
      {sub && <Typography variant="caption" sx={{ color: colors.muted, display: "block" }}>{sub}</Typography>}
    </Box>
  );
}

// The player card: character art, name, colors, and (once linked to a player) the season in numbers.
function ProfileHero({ profile, player, stats, need, slug, onEdit }) {
  const color = profile.color || PLAYER_COLORS[0];
  const character = profile.favoriteCharacter || (stats && stats.main && stats.main.name) || "";
  const art = charSrc(character, true);

  return (
    <Paper sx={{ position: "relative", overflow: "hidden", p: 0, border: `1px solid ${colors.line}` }}>
      <Box aria-hidden sx={{ position: "absolute", inset: 0, background: `linear-gradient(120deg, ${color}66 0%, ${colors.navy} 45%, ${colors.panel} 100%)` }} />
      <Box aria-hidden sx={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(-62deg, rgba(255,255,255,.04) 0 2px, transparent 2px 24px)" }} />
      <Box aria-hidden sx={{ position: "absolute", top: 0, bottom: 0, right: { xs: "-30%", sm: "-8%" }, width: { xs: "55%", sm: "38%" }, transform: "skewX(-14deg)", background: `linear-gradient(180deg, ${color} 0%, ${color}22 100%)`, opacity: 0.55 }} />
      {art && (
        <Box component="img" src={art} alt="" aria-hidden
          sx={{ position: "absolute", right: { xs: -12, sm: 24 }, bottom: 0, height: { xs: 150, sm: 220 }, width: "auto", opacity: { xs: 0.35, sm: 1 }, filter: "drop-shadow(0 12px 24px rgba(0,0,0,.5))" }} />
      )}

      <Box sx={{ position: "relative", p: { xs: 2.5, sm: 3.5 }, pr: { sm: 30 } }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <CharacterFace name={character} ring={color} size={72} />
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Chip label={roleLabel(profile.role)} size="small" color="primary" sx={{ height: 22, fontWeight: 800 }} />
              {player && player.registeredAt && <Typography variant="caption" sx={{ color: "rgba(255,255,255,.75)" }}>Joined {fmtDate(String(player.registeredAt).slice(0, 10))}</Typography>}
            </Stack>
            <Typography component="h1" sx={{ fontFamily: fontDisplay, fontSize: { xs: "1.4rem", sm: "2rem" }, lineHeight: 1.05, textShadow: `0 3px 0 ${colors.red}`, transform: "skewX(-7deg)", transformOrigin: "left bottom", overflowWrap: "anywhere" }}>
              {profile.displayName || "Racer"}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 2 }}>
          {character && <Chip size="small" label={character} sx={{ bgcolor: "rgba(7,10,31,.5)" }} />}
          {profile.favoriteVehicle && <Chip size="small" label={profile.favoriteVehicle} sx={{ bgcolor: "rgba(7,10,31,.5)" }} />}
          {player
            ? <Chip size="small" label={`Racing as ${player.name}`} sx={{ bgcolor: "rgba(7,10,31,.5)" }} avatar={<Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: player.color || color, ml: 0.75 }} />} />
            : <Chip size="small" variant="outlined" label="Not linked to a player yet" sx={{ borderStyle: "dashed" }} />}
        </Stack>

        {stats && stats.cp > 0 ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "repeat(4, minmax(0,1fr))" }, gap: 2, mt: 3, p: 2, borderRadius: 2, bgcolor: "rgba(7,10,31,.55)", border: "1px solid rgba(255,255,255,.08)" }}>
            <Stat label="Rank" value={stats.rank ? `${stats.rank}${ord(stats.rank)}` : "—"} sub={stats.rank ? null : `${plural(Math.max(0, need - stats.cp), "cup")} to qualify`} />
            <Stat label="Points" value={pctTxt(stats.pct)} />
            <Stat label="Cups" value={stats.cp} />
            <Stat label="Cup wins" value={stats.wins} />
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,.8)", mt: 2.5, maxWidth: "46ch" }}>
            {player
              ? "Race your first cup and your season shows up here."
              : "Your results link up once an admin connects you to your player, or claim them on the Unclaimed page."}
          </Typography>
        )}

        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 2.5 }}>
          <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={onEdit}>Edit profile</Button>
          {stats && stats.cp > 0 && slug && <Button variant="outlined" component={RouterLink} to={`/standings/${encodeURIComponent(slug)}`} sx={{ bgcolor: "rgba(7,10,31,.4)" }}>Full season</Button>}
          {!player && <Button variant="outlined" component={RouterLink} to="/unclaimed" sx={{ bgcolor: "rgba(7,10,31,.4)" }}>Unclaimed results</Button>}
        </Stack>
      </Box>
      <Box aria-hidden sx={{ position: "relative", height: 4, background: brandStripe }} />
    </Paper>
  );
}

// Favourite tracks (picked in Edit profile), each with how you do on it, then where you actually score best.
function FavouriteTracks({ favourites, stats, onEdit }) {
  const all = useMemo(() => (stats ? bestTracks(stats.log) : []), [stats]);
  const statOf = (t) => all.find((x) => x.track === t);
  const best = all.filter((x) => favourites.indexOf(x.track) < 0).slice(0, 3);
  const line = (st) => st
    ? `${st.avgPts.toFixed(1)} pts avg${st.avgPos != null ? ` · ${st.avgPos.toFixed(1)} place` : ""} · ${plural(st.races, "race")}`
    : "Not raced yet";
  const grid = { display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "repeat(3, minmax(0,1fr))" } };

  return (
    <Panel icon={<FavoriteBorderIcon fontSize="small" />} title="Favourite tracks">
      <Box sx={grid}>
        {favourites.map((t) => (
          <Box key={t} sx={{ minWidth: 0 }}>
            <TrackImage track={t} label caption={trackCup(t) || "Custom"} />
            <Typography variant="caption" sx={{ color: colors.muted, display: "block", mt: 0.5 }} noWrap>{line(statOf(t))}</Typography>
          </Box>
        ))}
        {Array.from({ length: 3 - favourites.length }, (_, i) => (
          <Box key={`empty-${i}`} component="button" type="button" onClick={onEdit}
            sx={{ aspectRatio: "16 / 9", borderRadius: 1.5, border: `1px dashed ${colors.line}`, bgcolor: "transparent", color: colors.muted, cursor: "pointer", font: "inherit", fontSize: "0.8rem", "&:hover": { borderColor: colors.accent, color: colors.ink } }}>
            + Pick a favourite
          </Box>
        ))}
      </Box>

      {best.length > 0 && (
        <>
          <Typography variant="overline" sx={{ color: colors.muted, display: "block", mt: 2.5, mb: 1, lineHeight: 1.4 }}>Where you score best</Typography>
          <Box sx={grid}>
            {best.map((st) => (
              <Box key={st.track} sx={{ minWidth: 0 }}>
                <TrackImage track={st.track} label caption={st.wins ? plural(st.wins, "race win") : trackCup(st.track) || "Custom"} />
                <Typography variant="caption" sx={{ color: st.vsUsual > 0 ? colors.good : colors.muted, display: "block", mt: 0.5 }} noWrap>{line(st)}</Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Panel>
  );
}

// The last few cups, newest first, as a form guide.
function RecentForm({ stats }) {
  if (!stats || !stats.log.length) return null;
  const recent = stats.log.slice(-5).reverse();
  return (
    <Panel icon={<TimelineOutlinedIcon fontSize="small" />} title="Recent form">
      <Stack divider={<Divider />}>
        {recent.map((l) => {
          const medal = { 1: colors.gold, 2: colors.silver, 3: colors.bronze }[l.rank];
          return (
            <Stack key={l.cup.id} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
              <Box sx={{ width: 40, textAlign: "center", fontFamily: fontDisplay, fontSize: "0.95rem", color: medal || colors.muted, transform: "skewX(-7deg)" }}>
                {l.rank}<Box component="sup" sx={{ fontSize: "0.55em" }}>{ord(l.rank)}</Box>
              </Box>
              <CupIcon cup={l.cup.cup} size={26} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{l.cup.cup}</Typography>
                <Typography variant="caption" sx={{ color: colors.muted }} noWrap>
                  {[fmtDate(l.cup.date), plural(l.field, "racer"), l.character].filter(Boolean).join(" · ")}
                </Typography>
              </Box>
              <Box sx={{ textAlign: "right" }}>
                <Typography variant="body2" sx={{ fontFamily: fontData, fontWeight: 700 }}>{l.pts}<Box component="span" sx={{ color: colors.muted }}>/{l.max}</Box></Typography>
                <LinearProgress variant="determinate" value={(100 * l.pts) / l.max} sx={{ width: 64, height: 4, borderRadius: 2, mt: 0.5, bgcolor: colors.line, "& .MuiLinearProgress-bar": { bgcolor: medal || colors.cool } }} />
              </Box>
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
    <Panel icon={<MailOutlineIcon fontSize="small" />} title="Emails">
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
    <Panel icon={<AutoAwesomeOutlinedIcon fontSize="small" />} title="Read results photos with Gemini">
      <Typography variant="body2">
        With a Gemini API key, Gemini reads the results photos you upload: everyone's points, who's who (by character) and the tracks. Admins only.
        The key stays in this browser and is sent only to Google ({MODEL}). Get one free at{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: colors.cool }}>Google AI Studio</a>; usage beyond the free tier is billed to the key.
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
    <Panel icon={<InboxOutlinedIcon fontSize="small" />} title="Your submissions and requests">
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
  const [editing, setEditing] = useState(false);
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
      <ProfileHero profile={profile} player={player} stats={stats} need={m ? m.need : 0} slug={slug} onEdit={() => setEditing(true)} />
      {editing && <ProfileEditor open profile={profile} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setSavedFlash("Profile saved"); }} />}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,7fr) minmax(0,5fr)" }, gap: 2, mt: 2, alignItems: "start" }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <FavouriteTracks favourites={profile.favoriteTracks || []} stats={stats} onEdit={() => setEditing(true)} />
          <RecentForm stats={stats} />
          <MyActivity />
          <Paper sx={{ p: { xs: 2, sm: 2.5 }, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", justifyContent: "space-between" }}>
            <Box>
              <Typography sx={{ fontWeight: 800 }}>Raced a cup night?</Typography>
              <Typography variant="body2" sx={{ color: colors.muted }}>{isAdmin ? "Record the results and the standings update." : "Submit the results and an admin checks them."}</Typography>
            </Box>
            <Button component={RouterLink} to="/add" variant="contained">{isAdmin ? "Record a cup night" : "Submit results"}</Button>
          </Paper>
        </Stack>

        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <EmailPreferences key={String(profile.emailCupNights)} profile={profile} />
          {isAdmin && <GeminiKey />}
          <Panel icon={<LockOutlinedIcon fontSize="small" />} title="Sign-in and security">
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
