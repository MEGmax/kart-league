// The night's racers: who they are in the league and the character each usually used. Picking a player
// who's already in, for a racer who never raced the same cup as them, merges the two (someone who switched).
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import CloseIcon from "@mui/icons-material/Close";
import { CHARACTERS } from "../../lib/constants";
import { newRacer, sharedCharacters, hasResult, cellOf, canMerge, mergeRacers } from "../../lib/night";
import { colors } from "../../theme";
import CharacterFace from "../CharacterFace";

export default function LineupEditor({ night, setNight, players, locked, title = "2 · Racers and their characters", help }) {
  const sorted = players.slice().sort((a, b) => a.name.localeCompare(b.name));
  const used = new Set(night.racers.map((r) => r.assign).filter((a) => a && a !== "new" && a !== "unclaimed"));
  const dupChars = sharedCharacters(night.racers);

  function patch(key, p) {
    setNight((n) => ({ ...n, racers: n.racers.map((r) => (r.key === key ? { ...r, ...p } : r)) }));
  }
  const holder = (pid) => night.racers.find((o) => o.assign === pid);
  function assign(key, value) {
    const other = value && value !== "new" && value !== "unclaimed" ? night.racers.find((o) => o.key !== key && o.assign === value) : null;
    if (other) setNight((n) => mergeRacers(n, other.key, key));
    else patch(key, { assign: value });
  }
  function remove(key) {
    setNight((n) => ({
      ...n,
      racers: n.racers.filter((r) => r.key !== key),
      cups: n.cups.map((c) => { const cells = { ...c.cells }; delete cells[key]; return { ...c, cells }; }),
    }));
  }
  function add() {
    setNight((n) => ({ ...n, racers: n.racers.concat(newRacer()) }));
  }
  function addEveryone() {
    setNight((n) => {
      const have = new Set(n.racers.map((r) => r.assign));
      const blank = n.racers.filter((r) => !r.assign);
      const extra = sorted.filter((p) => !have.has(p.id)).map((p) => newRacer({ assign: p.id }));
      const keepBlank = n.racers.filter((r) => r.assign);
      return { ...n, racers: keepBlank.concat(extra.length ? extra : blank) };
    });
  }

  return (
    <Box component="section" sx={{ pt: 2.5, borderTop: `1px solid ${colors.line}` }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5, gap: 1, flexWrap: "wrap" }}>
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.125rem" }}>{title}</Typography>
        <Typography variant="body2" sx={{ color: colors.muted }}>{night.racers.length} racer{night.racers.length === 1 ? "" : "s"}</Typography>
      </Stack>
      <Typography variant="body2" sx={{ color: colors.muted, mb: 2 }}>
        {help || <>Pick each racer's usual character; it's used to match each results photo to the right person. If someone switched for a cup,
        change it for that cup under Results, or pick the same player for both characters and they're merged into one racer.</>}
      </Typography>

      <Stack spacing={1.5}>
        {night.racers.map((r, i) => {
          const results = night.cups.filter((c) => hasResult(cellOf(c, r.key), night.entry)).length;
          return (
            <Box
              key={r.key}
              sx={{
                display: "grid", gap: 1.5, alignItems: "center",
                gridTemplateColumns: { xs: "44px minmax(0,1fr) 36px", sm: "44px minmax(0,1.2fr) minmax(0,1fr) 36px" },
              }}
            >
              <CharacterFace name={r.character} size={44} />
              <Box sx={{ display: "grid", gap: 1, minWidth: 0 }}>
                <TextField
                  select size="small" label={`Racer ${i + 1}`} value={r.assign} disabled={locked}
                  onChange={(e) => assign(r.key, e.target.value)}
                >
                  <MenuItem value="" disabled>Pick a player</MenuItem>
                  {sorted.length > 0 && <ListSubheader>League players</ListSubheader>}
                  {sorted.map((p) => {
                    const taken = used.has(p.id) && r.assign !== p.id;
                    const other = taken ? holder(p.id) : null;
                    const merge = other && canMerge(night, other.key, r.key);
                    return (
                      <MenuItem key={p.id} value={p.id} disabled={taken && !merge}>
                        {p.name}{merge ? ` · same person as their ${other.character || "other racer"}: merge` : taken ? " · already in" : ""}
                      </MenuItem>
                    );
                  })}
                  <ListSubheader>Other</ListSubheader>
                  <MenuItem value="new">+ New player…</MenuItem>
                  <MenuItem value="unclaimed">Unclaimed (a guest, or not sure who)</MenuItem>
                </TextField>
                {r.assign === "new" && (
                  <TextField size="small" label="New player's name" value={r.newName} inputProps={{ maxLength: 40 }}
                    onChange={(e) => patch(r.key, { newName: e.target.value })} />
                )}
                {/* On phones the character picker sits under the player picker. */}
                <Box sx={{ display: { xs: "block", sm: "none" } }}>
                  <CharacterSelect value={r.character} onChange={(v) => patch(r.key, { character: v })} />
                </Box>
              </Box>
              <Box sx={{ display: { xs: "none", sm: "block" } }}>
                <CharacterSelect value={r.character} onChange={(v) => patch(r.key, { character: v })} />
              </Box>
              <IconButton
                aria-label={`Remove racer ${i + 1}`} onClick={() => remove(r.key)} disabled={night.racers.length === 1 || locked}
                title={results ? `Removes their ${results} result${results === 1 ? "" : "s"} too` : "Remove"}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        })}
      </Stack>

      {dupChars.length > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          More than one racer is {dupChars.join(" and ")}. Photos can't tell them apart, so type their points by hand.
        </Alert>
      )}

      {!locked && (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
          <Button size="small" variant="outlined" onClick={add}>+ Add racer</Button>
          {players.length > 0 && <Button size="small" onClick={addEveryone}>Add every league player</Button>}
        </Stack>
      )}
    </Box>
  );
}

function CharacterSelect({ value, onChange }) {
  return (
    <TextField select fullWidth size="small" label="Character all night" value={value || ""} onChange={(e) => onChange(e.target.value)}
      SelectProps={{ renderValue: (v) => (v ? <Stack direction="row" spacing={1} alignItems="center"><CharacterFace name={v} size={20} /><span>{v}</span></Stack> : "—") }}
    >
      <MenuItem value="">—</MenuItem>
      {CHARACTERS.map((c) => (
        <MenuItem key={c} value={c}>
          <Stack direction="row" spacing={1} alignItems="center"><CharacterFace name={c} size={24} /><span>{c}</span></Stack>
        </MenuItem>
      ))}
    </TextField>
  );
}
