// One cup's results for every racer: cup totals or each race's finishing position, plus its
// results photo, which Claude can read and match to racers by their character for the night.
import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import { RACE_POINTS, ord } from "../../lib/constants";
import { cellOf, cellPoints, emptyCell, matchPhotoRows, newRacer, racerName } from "../../lib/night";
import { prepImage, PHOTO_FORMAT_ERROR } from "../../lib/photos";
import { getApiKey, readResultsPhoto, ReadError } from "../../lib/readPhoto";
import { colors, fontData } from "../../theme";
import CupIcon from "../CupIcon";
import CharacterFace from "../CharacterFace";

const CLASH_BG = "rgba(255,90,100,.18)";

export default function CupResults({ night, cup, index, setNight, players, clashes }) {
  const [read, setRead] = useState({ busy: false, error: "", info: "", byRacer: {}, extra: [] });
  const ctl = useRef(null);
  const latest = useRef(night);
  latest.current = night;
  const races = night.entry === "races";
  const hasKey = !!getApiKey();

  function setCell(racerKey, p) {
    setNight((n) => ({
      ...n,
      cups: n.cups.map((c) => (c.key !== cup.key ? c : { ...c, cells: { ...c.cells, [racerKey]: { ...cellOf(c, racerKey), ...p } } })),
    }));
  }
  function setPos(racerKey, k, v) {
    const pos = cellOf(cup, racerKey).pos.slice();
    pos[k] = v;
    setCell(racerKey, { pos });
  }
  function clearCell(racerKey) {
    setCell(racerKey, { ...emptyCell(), rid: cellOf(cup, racerKey).rid });
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let b64;
    try {
      b64 = await prepImage(file);
    } catch {
      setRead((r) => ({ ...r, error: PHOTO_FORMAT_ERROR }));
      return;
    }
    setNight((n) => ({ ...n, cups: n.cups.map((c) => (c.key === cup.key ? { ...c, photo: b64, photoChanged: true } : c)) }));
    setRead({ busy: false, error: "", info: "", byRacer: {}, extra: [] });
    if (getApiKey()) runRead(b64);
  }

  async function runRead(b64 = cup.photo) {
    if (!b64) return;
    if (ctl.current) ctl.current.abort();
    const c = new AbortController();
    ctl.current = c;
    setRead({ busy: true, error: "", info: "", byRacer: {}, extra: [] });
    try {
      const lineup = night.racers.map((r) => r.character).filter(Boolean);
      const out = await readResultsPhoto(b64, { players, lineup, signal: c.signal });
      if (ctl.current !== c) return;
      applyRead(out.rows);
    } catch (e) {
      if (ctl.current !== c) return;
      const aborted = e && (e.name === "AbortError" || /abort/i.test(e.name || ""));
      setRead({ busy: false, error: aborted ? "" : e instanceof ReadError ? e.message : "Reading the photo failed. Type the points instead.", info: "", byRacer: {}, extra: [] });
    } finally {
      if (ctl.current === c) ctl.current = null;
    }
  }

  // Fill empty cells from the photo; where something is already entered, show the photo's number beside it.
  function applyRead(rows) {
    const n = latest.current;
    const c0 = n.cups.find((c) => c.key === cup.key);
    if (!c0) return;
    const { matches, extra } = matchPhotoRows(n.racers, rows, players);
    const fills = {}, byRacer = {};
    Object.keys(matches).forEach((rk) => {
      const row = matches[rk];
      byRacer[rk] = row.points;
      if (row.points != null && cellPoints(cellOf(c0, rk), n.entry) === null) fills[rk] = String(row.points);
    });
    const filled = Object.keys(fills).length;
    if (filled) {
      setNight((nn) => ({
        ...nn,
        cups: nn.cups.map((c) => {
          if (c.key !== cup.key) return c;
          const cells = { ...c.cells };
          Object.keys(fills).forEach((rk) => { cells[rk] = { ...cellOf(c, rk), pts: fills[rk] }; });
          return { ...c, cells };
        }),
      }));
    }
    const humans = rows.filter((r) => r.human).length;
    const parts = [`Read ${rows.length} rows, ${humans} highlighted.`];
    parts.push(filled ? `Filled ${filled} racer${filled === 1 ? "" : "s"}.` : "Nothing new to fill.");
    if (extra.length) parts.push(`${extra.length} highlighted row${extra.length === 1 ? "" : "s"} didn't match the lineup (below).`);
    parts.push("Check the numbers against the photo before saving.");
    setRead({ busy: false, error: "", info: parts.join(" "), byRacer, extra });
  }

  function addExtraAsRacer(row) {
    const r = newRacer({ assign: "unclaimed", character: row.character || "" });
    setNight((n) => ({
      ...n,
      racers: n.racers.concat(r),
      cups: n.cups.map((c) => (c.key === cup.key ? { ...c, cells: { ...c.cells, [r.key]: { ...emptyCell(), pts: row.points == null ? "" : String(row.points) } } } : c)),
    }));
    setRead((s) => ({ ...s, extra: s.extra.filter((x) => x.idx !== row.idx), byRacer: { ...s.byRacer, [r.key]: row.points } }));
  }

  const clashAt = {};
  clashes.filter((x) => x.cupKey === cup.key).forEach((x) => { clashAt[`${x.race}|${x.position}`] = true; });
  const entered = night.racers.filter((r) => cellPoints(cellOf(cup, r.key), night.entry) !== null).length;
  const showPhotoCol = Object.keys(read.byRacer).length > 0;

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, display: "grid", gap: 2, gridTemplateColumns: "minmax(0,1fr)" }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <CupIcon cup={cup.name} size={44} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: "1.1rem" }} noWrap>{cup.name || `Cup ${index + 1}`}</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>
            {entered} of {night.racers.length} racer{night.racers.length === 1 ? "" : "s"} entered · leave a racer blank if they sat this cup out
          </Typography>
        </Box>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }}>
        {cup.photo && (
          <Box component="a" href={`data:image/jpeg;base64,${cup.photo}`} target="_blank" rel="noopener" sx={{ flexShrink: 0 }}>
            <Box component="img" src={`data:image/jpeg;base64,${cup.photo}`} alt={`Results photo for ${cup.name}`}
              sx={{ width: { xs: "100%", sm: 220 }, borderRadius: 2, border: `1px solid ${colors.line}`, display: "block" }} />
          </Box>
        )}
        <Box sx={{ display: "grid", gap: 1, alignContent: "start" }}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            <Button component="label" size="small" variant={cup.photo ? "outlined" : "contained"} disabled={read.busy}>
              {cup.photo ? "Use a different photo" : cup.hasPhoto ? "Replace the results photo" : "Add the results photo"}
              <input type="file" accept="image/*" hidden onChange={onFile} />
            </Button>
            {cup.photo && hasKey && !read.busy && <Button size="small" onClick={() => runRead()}>Read with Claude{showPhotoCol ? " again" : ""}</Button>}
            {read.busy && (
              <>
                <CircularProgress size={18} />
                <Typography variant="body2">Claude is reading the results screen…</Typography>
                <Button size="small" onClick={() => { if (ctl.current) ctl.current.abort(); }}>Stop</Button>
              </>
            )}
          </Stack>
          {!cup.photo && (
            <Typography variant="body2" sx={{ color: colors.muted }}>
              Optional. The photo of the end-of-cup standings is kept as the record.{" "}
              {hasKey ? "Claude reads it and fills in each racer's points by their character." : "Add an Anthropic API key on your Account page and Claude will fill in the points from it."}
            </Typography>
          )}
          {read.info && <Alert severity="info">{read.info}</Alert>}
          {read.error && <Alert severity="error">{read.error}</Alert>}
          {read.extra.length > 0 && (
            <Stack spacing={1}>
              {read.extra.map((row) => (
                <Stack key={row.idx} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <CharacterFace name={row.character} size={24} />
                  <Typography variant="body2">
                    {row.character || "Unknown character"} · <b>{row.points == null ? "?" : row.points} pts</b>{row.name ? ` · “${row.name}”` : ""}
                  </Typography>
                  <Button size="small" onClick={() => addExtraAsRacer(row)}>Add as unclaimed</Button>
                </Stack>
              ))}
              <Typography variant="caption" sx={{ color: colors.muted }}>
                Or give that character to the right racer above and press Read again. Unclaimed results can be requested on the Unclaimed page.
              </Typography>
            </Stack>
          )}
        </Box>
      </Stack>

      <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: colors.bg2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Racer</TableCell>
              {races
                ? [1, 2, 3, 4].map((n) => (
                  <TableCell key={n} align="center" title={cup.maps[n - 1] || ""} sx={{ minWidth: 92 }}>
                    R{n}
                    {cup.maps[n - 1] && <Typography component="div" variant="caption" sx={{ color: colors.muted, lineHeight: 1.2 }} noWrap>{cup.maps[n - 1]}</Typography>}
                  </TableCell>
                ))
                : <TableCell align="right">Points</TableCell>}
              {races && <TableCell align="right">Total</TableCell>}
              {showPhotoCol && <TableCell align="right">Photo</TableCell>}
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {night.racers.map((r) => {
              const cell = cellOf(cup, r.key);
              const pts = cellPoints(cell, night.entry);
              const photoPts = read.byRacer[r.key];
              const differs = photoPts != null && pts !== null && photoPts !== pts;
              const totalOnly = races && cell.pos.every((p) => !p) && cell.pts !== "";
              const p = players.find((x) => x.id === r.assign);
              return (
                <TableRow key={r.key}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 130 }}>
                      <CharacterFace name={r.character} ring={p && p.color} size={28} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{racerName(r, players)}</Typography>
                        {r.character && <Typography variant="caption" sx={{ color: colors.muted }}>{r.character}</Typography>}
                      </Box>
                    </Stack>
                  </TableCell>
                  {races ? (
                    totalOnly ? (
                      <TableCell colSpan={4} align="center">
                        <Chip size="small" label={`Total only: ${cell.pts} pts`} onDelete={() => clearCell(r.key)} />
                      </TableCell>
                    ) : [0, 1, 2, 3].map((k) => (
                      <TableCell key={k} align="center" sx={cell.pos[k] && clashAt[`${k + 1}|${cell.pos[k]}`] ? { bgcolor: CLASH_BG } : undefined}>
                        <TextField
                          select size="small" value={cell.pos[k] || ""} onChange={(e) => setPos(r.key, k, e.target.value)}
                          SelectProps={{ native: true }} inputProps={{ "aria-label": `${racerName(r, players)} race ${k + 1} finish` }}
                          sx={{ width: 84 }}
                        >
                          <option value="">—</option>
                          {RACE_POINTS.map((rp, i) => <option key={i} value={String(i + 1)}>{i + 1}{ord(i + 1)}</option>)}
                        </TextField>
                      </TableCell>
                    ))
                  ) : (
                    <TableCell align="right">
                      <TextField
                        size="small" type="number" value={cell.pts} placeholder="—"
                        onChange={(e) => setCell(r.key, { pts: e.target.value })}
                        inputProps={{ min: 0, max: night.max, step: 1, inputMode: "numeric", "aria-label": `${racerName(r, players)} points`, style: { textAlign: "right" } }}
                        sx={{ width: 92 }} error={differs}
                      />
                    </TableCell>
                  )}
                  {races && (
                    <TableCell align="right" sx={{ fontFamily: fontData, fontWeight: 700, color: differs ? colors.bad : undefined }}>
                      {pts === null ? "–" : pts}
                    </TableCell>
                  )}
                  {showPhotoCol && (
                    <TableCell align="right" sx={{ fontFamily: fontData, color: differs ? colors.bad : colors.muted }} title={differs ? "The photo shows a different total" : ""}>
                      {photoPts == null ? "–" : photoPts}
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: 40 }}>
                    {pts !== null && !totalOnly && <Button size="small" onClick={() => clearCell(r.key)} sx={{ minWidth: 0 }}>Clear</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {Object.keys(read.byRacer).some((k) => {
        const pts = cellPoints(cellOf(cup, k), night.entry);
        return read.byRacer[k] != null && pts !== null && read.byRacer[k] !== pts;
      }) && (
        <Alert severity="warning">Some entered totals don't match the photo (in red). Fix whichever is wrong before saving.</Alert>
      )}
    </Paper>
  );
}
