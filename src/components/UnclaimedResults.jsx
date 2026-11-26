// The "Is this you?" notification on your profile: human results from a results photo nobody was matched to
// (useUnclaimed in src/lib/unclaimed.js), by night and cup. "That was me" sends a request an admin approves
// on the Admin page, and offers the same character's other results from that night in the same go, each
// with the character actually used. This replaced the old Unclaimed page (#/unclaimed redirects here).
import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { CHARACTERS, fmtDate, ord } from "../lib/constants";
import { uid } from "../lib/night";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { useUnclaimed } from "../lib/unclaimed";
import { colors } from "../theme";
import CupIcon from "./CupIcon";
import CharacterFace from "./CharacterFace";
import { plural } from "./PageBits";

const keyOf = (u) => `${u.cup.id}|${u.r.rid}`;

function CharacterPick({ value, onChange, label }) {
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 170 }}>
      <MenuItem value="">—</MenuItem>
      {CHARACTERS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
    </TextField>
  );
}

// The request: this result plus, ticked by default, the same character's other results from the night.
function ClaimForm({ u, also, mine, onDone }) {
  const flash = useFlash();
  const { reload } = useLeagueData();
  const all = [u].concat(also);
  const [picked, setPicked] = useState(() => Object.fromEntries(all.map((x) => [keyOf(x), { on: true, character: x.r.character || "" }])));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = all.filter((x) => picked[keyOf(x)].on);
  const set = (x, p) => setPicked((s) => ({ ...s, [keyOf(x)]: { ...s[keyOf(x)], ...p } }));

  async function send() {
    if (!chosen.length) return;
    setBusy(true); setError("");
    try {
      await q(sb.from("claims").insert(chosen.map((x) => ({
        id: "k" + uid(), cup_id: x.cup.id, rid: x.r.rid, character: picked[keyOf(x)].character, note: note.trim(), created_at: Date.now(),
      }))));
      flash(chosen.length === 1 ? "Request sent. An admin will review it." : `${chosen.length} requests sent. An admin will review them.`);
      reload();
      onDone();
    } catch (e) {
      setError(e && e.code === "23505" ? "You already asked for one of these. Refresh to see which." : dbErr(e));
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "grid", gap: 1.5, py: 2, px: { xs: 1.5, sm: 2 }, mb: 1, bgcolor: colors.raised, borderRadius: 2 }}>
      {also.length > 0 && (
        <Typography>
          <b>Also yours?</b> {u.r.character || "This character"} has {plural(also.length, "other result")} from this night. Untick any that weren't you.
        </Typography>
      )}
      <Stack spacing={1}>
        {all.map((x) => {
          const p = picked[keyOf(x)];
          return (
            <Stack key={keyOf(x)} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                {also.length > 0 && (
                  <Checkbox checked={p.on} onChange={(e) => set(x, { on: e.target.checked })}
                    inputProps={{ "aria-label": `Claim #${x.num} ${x.cup.cup}, ${x.r.pts} points` }} sx={{ ml: -1 }} />
                )}
                <CharacterFace name={p.character} size={30} />
                <Typography sx={{ minWidth: 0 }} noWrap>
                  <b>#{x.num} {x.cup.cup}</b> · {x.r.pts}/{x.max} pts · {x.r.rank}{ord(x.r.rank)}
                </Typography>
              </Stack>
              <CharacterPick label="You raced as" value={p.character} onChange={(v) => set(x, { character: v })} />
            </Stack>
          );
        })}
      </Stack>
      <TextField size="small" label="Note for the admin (optional)" placeholder="e.g. I switched to Mario after the first cup" value={note}
        inputProps={{ maxLength: 200 }} onChange={(e) => setNote(e.target.value)} />
      {!mine && <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }}>You don't have a league player yet. One is created for you when an admin approves this.</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button variant="contained" size="small" disabled={busy || !chosen.length} onClick={send}>
          {busy ? "Sending…" : chosen.length > 1 ? `Request all ${chosen.length}` : "Send request"}
        </Button>
        <Button size="small" color="inherit" onClick={onDone} disabled={busy}>Cancel</Button>
      </Stack>
    </Box>
  );
}

export default function UnclaimedResults() {
  const { reload } = useLeagueData();
  const flash = useFlash();
  const { items, waiting, mine, pendingFor, claimable } = useUnclaimed();
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  if (!items.length) return null;

  // Nights (newest first), then each night's cups in the order raced, results in finishing order.
  const nights = [];
  items.forEach((u) => {
    let night = nights.find((n) => n.date === u.cup.date);
    if (!night) { night = { date: u.cup.date, week: u.cup.week, cups: [] }; nights.push(night); }
    let cup = night.cups.find((c) => c.cup.id === u.cup.id);
    if (!cup) { cup = { cup: u.cup, num: u.num, rows: [] }; night.cups.push(cup); }
    cup.rows.push(u);
  });
  nights.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  nights.forEach((n) => n.cups.sort((a, b) => a.num - b.num));

  async function withdraw(c) {
    setError("");
    try {
      await q(sb.from("claims").delete().eq("id", c.id));
      flash("Request withdrawn");
      reload();
    } catch (e) {
      setError(dbErr(e));
    }
  }

  return (
    <Box component="section" id="unclaimed" aria-labelledby="unclaimed-title" sx={{ mt: 4, pt: 2, borderTop: `2px solid ${colors.rule}`, scrollMarginTop: 96 }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Typography id="unclaimed-title" component="h2" sx={{ fontWeight: 700, fontSize: "1.375rem" }}>Is this you?</Typography>
        {waiting > 0 && (
          <Box sx={{ bgcolor: colors.red, color: colors.bg, fontWeight: 800, fontSize: "0.875rem", borderRadius: 99, px: 1, minWidth: 24, textAlign: "center" }}>{waiting}</Box>
        )}
      </Stack>
      <Typography sx={{ color: colors.muted, mt: 0.5, mb: 2, maxWidth: "70ch" }}>
        {plural(items.length, "result")} from results photos nobody has claimed. The character is the clue: if one was you, press <b>That was me</b> and an
        admin adds the points to your record.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: "grid", columnGap: 6, rowGap: 3, gridTemplateColumns: { xs: "minmax(0,1fr)", md: nights.length > 1 ? "repeat(2, minmax(0,1fr))" : "minmax(0,1fr)" } }}>
        {nights.map((n) => (
          <Box key={n.date} component="section" aria-label={`Week ${n.week}, ${fmtDate(n.date)}`} sx={{ minWidth: 0 }}>
            <Typography component="h3" sx={{ fontWeight: 700, pb: 0.75, borderBottom: `1px solid ${colors.rule}` }}>
              Week {n.week} · {fmtDate(n.date)}
            </Typography>
            {n.cups.map((c) => (
              <Box key={c.cup.id}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 1.5, pb: 0.5 }}>
                  <CupIcon cup={c.cup.cup} size={22} />
                  <Typography sx={{ fontWeight: 600, color: colors.muted }}>#{c.num} {c.cup.cup}</Typography>
                </Stack>
                {c.rows.map((u) => {
                  const pending = pendingFor(u);
                  const also = claimable(u)
                    ? items.filter((x) => x !== u && x.cup.date === u.cup.date && x.r.character && x.r.character === u.r.character && claimable(x))
                    : [];
                  return (
                    <Box key={keyOf(u)}>
                      <Box sx={{
                        display: "grid", alignItems: "center", columnGap: 1.5, rowGap: 0.5, minHeight: 56, py: 0.75,
                        gridTemplateColumns: { xs: "auto minmax(0,1fr) auto", sm: "auto minmax(0,1fr) auto auto" }, borderBottom: `1px solid ${colors.line}`,
                      }}>
                        <CharacterFace name={u.r.character} size={36} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700 }} noWrap>{u.r.character || "Unknown character"}</Typography>
                          <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }}>{u.r.rank}{ord(u.r.rank)} of {u.field}</Typography>
                        </Box>
                        <Typography sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                          {u.r.pts}<Box component="span" sx={{ color: colors.muted, fontWeight: 500 }}>/{u.max}</Box>
                        </Typography>
                        <Box sx={{ gridColumn: { xs: "2 / -1", sm: "auto" }, justifySelf: { xs: "start", sm: "end" } }}>
                        {pending ? (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }}>Requested</Typography>
                            <Button size="small" color="inherit" onClick={() => withdraw(pending)}>Withdraw</Button>
                          </Stack>
                        ) : (
                          <Button size="small" variant={open === keyOf(u) ? "contained" : "outlined"} color={open === keyOf(u) ? "primary" : "inherit"}
                            sx={open === keyOf(u) ? undefined : { borderColor: colors.rule }}
                            onClick={() => setOpen(open === keyOf(u) ? null : keyOf(u))} aria-expanded={open === keyOf(u)}>
                            That was me
                          </Button>
                        )}
                        </Box>
                      </Box>
                      {open === keyOf(u) && !pending && <Box sx={{ mt: 1 }}><ClaimForm u={u} also={also} mine={mine} onDone={() => setOpen(null)} /></Box>}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
