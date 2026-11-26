// The specific cups raced tonight, in order: game cups, saved templates, or a custom set of 4 tracks.
import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import CloseIcon from "@mui/icons-material/Close";
import { BUILTIN_CUPS, TRACKS, UNKNOWN_CUP } from "../../lib/constants";
import { cupFromTemplate, newCup } from "../../lib/night";
import { colors } from "../../theme";
import CupIcon from "../CupIcon";
import TrackImage from "../TrackImage";

const NITRO = TRACKS.slice(0, 16);
const RETRO = TRACKS.slice(16);

export function TrackSelect({ label, value, onChange, disabled }) {
  return (
    <TextField select size="small" label={label} value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      SelectProps={{ renderValue: (v) => v }}>
      <MenuItem value="">Pick a track</MenuItem>
      <ListSubheader>Nitro</ListSubheader>
      {NITRO.map((t) => <MenuItem key={t} value={t} sx={{ gap: 1.25 }}><TrackImage track={t} width={48} radius={0.75} />{t}</MenuItem>)}
      <ListSubheader>Retro</ListSubheader>
      {RETRO.map((t) => <MenuItem key={t} value={t} sx={{ gap: 1.25 }}><TrackImage track={t} width={48} radius={0.75} />{t}</MenuItem>)}
    </TextField>
  );
}

function CupRow({ cup, index, count, setNight, singleCup, templates }) {
  const [editing, setEditing] = useState(!cup.locked && cup.maps.length > 0 && cup.maps.some((m) => !m));
  const results = Object.keys(cup.cells).length;

  function patch(p) {
    setNight((n) => ({ ...n, cups: n.cups.map((c) => (c.key === cup.key ? { ...c, ...p } : c)) }));
  }
  function move(d) {
    setNight((n) => {
      const cups = n.cups.slice();
      const [c] = cups.splice(index, 1);
      cups.splice(index + d, 0, c);
      return { ...n, cups };
    });
  }
  function remove() {
    setNight((n) => ({ ...n, cups: n.cups.filter((c) => c.key !== cup.key) }));
  }

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <CupIcon cup={cup.name} size={38} />
        <TextField size="small" label={`Cup ${index + 1}`} value={cup.name} inputProps={{ maxLength: 40 }} sx={{ flex: 1, minWidth: 0 }}
          onChange={(e) => patch({ name: e.target.value })} />
        {!cup.locked && (
          <TextField select size="small" label="Use a game cup" value="" sx={{ width: { xs: 120, sm: 190 } }}
            onChange={(e) => { const t = BUILTIN_CUPS.concat(templates).find((x) => x.id === e.target.value); if (t) { patch({ name: t.name, maps: t.maps.slice() }); setEditing(false); } }}>
            <ListSubheader>Game cups</ListSubheader>
            {BUILTIN_CUPS.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            {templates.length > 0 && <ListSubheader>Your templates</ListSubheader>}
            {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
        )}
        {!singleCup && (
          <Stack direction="row">
            <IconButton size="small" aria-label="Move up" disabled={index === 0} onClick={() => move(-1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
            <IconButton size="small" aria-label="Move down" disabled={index === count - 1} onClick={() => move(1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
            <IconButton size="small" aria-label={`Remove ${cup.name || "cup"}`} onClick={remove} title={results ? "Removes its results too" : "Remove"}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}
      </Stack>
      {editing ? (
        <Box sx={{ display: "grid", gap: 1, mt: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
          {[0, 1, 2, 3].map((i) => (
            <TrackSelect key={i} label={`Race ${i + 1}`} value={cup.maps[i]}
              onChange={(v) => { const maps = [0, 1, 2, 3].map((k) => cup.maps[k] || ""); maps[i] = v; patch({ maps }); }} />
          ))}
        </Box>
      ) : (
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap", mt: 1, alignItems: "center" }}>
          {cup.maps.length ? cup.maps.map((m, k) => (
            <Typography key={k} variant="body2" sx={{ color: colors.muted }}><b style={{ color: colors.ink }}>R{k + 1}</b> {m}</Typography>
          )) : <Typography variant="body2" sx={{ color: colors.muted }}>No tracks recorded.</Typography>}
          {cup.locked
            ? <Typography variant="caption" sx={{ color: colors.muted }}>Tracks are locked once a cup exists.</Typography>
            : <Button size="small" onClick={() => { if (!cup.maps.length) patch({ maps: ["", "", "", ""] }); setEditing(true); }}>{cup.maps.length ? "Change tracks" : "Add tracks"}</Button>}
        </Stack>
      )}
    </Box>
  );
}

export default function CupsPicker({ night, setNight, templates, singleCup }) {
  const [pick, setPick] = useState("");

  function add(value) {
    setPick("");
    if (!value) return;
    let cup;
    if (value === "custom") cup = newCup({ name: "", maps: ["", "", "", ""] });
    else if (value === "unknown") cup = newCup({ name: UNKNOWN_CUP, maps: [] });
    else {
      const t = BUILTIN_CUPS.concat(templates).find((x) => x.id === value);
      if (!t) return;
      cup = cupFromTemplate(t);
    }
    setNight((n) => ({ ...n, cups: n.cups.concat(cup) }));
  }

  return (
    <Box component="section" sx={{ pt: 2.5, borderTop: `1px solid ${colors.line}` }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5, gap: 1, flexWrap: "wrap" }}>
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.125rem" }}>1 · {singleCup ? "The cup" : "Cups raced, in order"}</Typography>
        {!singleCup && <Typography variant="body2" sx={{ color: colors.muted }}>{night.cups.length} cup{night.cups.length === 1 ? "" : "s"}</Typography>}
      </Stack>
      {!singleCup && (
        <Typography variant="body2" sx={{ color: colors.muted, mb: 2 }}>
          Add each cup you played. Game cups and your templates come with their 4 tracks, so track stats work too.
          Random tracks nobody remembers? Add an Unknown cup: its points count, it just has no track stats.
        </Typography>
      )}
      <Stack spacing={1.5}>
        {night.cups.map((c, i) => (
          <CupRow key={c.key} cup={c} index={i} count={night.cups.length} setNight={setNight} singleCup={singleCup} templates={templates} />
        ))}
      </Stack>
      {!singleCup && (
        <TextField select size="small" label="+ Add a cup" value={pick} onChange={(e) => add(e.target.value)} sx={{ mt: night.cups.length ? 2 : 0, minWidth: 260 }}>
          <ListSubheader>Game cups</ListSubheader>
          {BUILTIN_CUPS.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              <Stack direction="row" spacing={1} alignItems="center"><CupIcon cup={t.name} size={22} /><span>{t.name}</span></Stack>
            </MenuItem>
          ))}
          {templates.length > 0 && <ListSubheader>Your templates</ListSubheader>}
          {templates.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              <Stack direction="row" spacing={1} alignItems="center"><CupIcon cup={t.name} size={22} /><span>{t.name}</span></Stack>
            </MenuItem>
          ))}
          <ListSubheader>Other</ListSubheader>
          <MenuItem value="custom">Custom cup (pick 4 tracks)</MenuItem>
          <MenuItem value="unknown">
            <Stack direction="row" spacing={1} alignItems="center"><CupIcon cup={UNKNOWN_CUP} size={22} /><span>Unknown cup (tracks not recorded)</span></Stack>
          </MenuItem>
        </TextField>
      )}
    </Box>
  );
}
