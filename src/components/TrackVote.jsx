// The track vote for the next cup night, on the Join tab. Everyone who's in suggests and votes on tracks
// (up to MAX_TRACK_VOTES each); the leaders are grouped 4 at a time into the cups they'd make. Below the
// ballot, your own best tracks from your results, one tap to vote for each.
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { compute } from "../lib/standings";
import { formatEventWhen, isGoing, isOpen } from "../lib/events";
import { TRACKS } from "../lib/constants";
import { MAX_TRACK_VOTES, bestTracks, trackCup, trackKind } from "../lib/tracks";
import { useTrackVotes } from "../lib/trackVotes";
import { colors } from "../theme";
import TrackImage from "./TrackImage";
import { SectionTitle, plural } from "./PageBits";

function TrackName({ track, width = 64 }) {
  const cup = trackCup(track);
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
      <TrackImage track={track} width={width} radius={1} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }} noWrap>{track}</Typography>
        <Typography sx={{ color: colors.muted, fontSize: "0.875rem", lineHeight: 1.3 }} noWrap>
          {cup ? `${trackKind(track)} · ${cup}` : "Custom track"}
        </Typography>
      </Box>
    </Stack>
  );
}

function VoteButton({ mine, disabled, busy, onClick }) {
  return mine ? (
    <Button size="small" variant="contained" color="success" startIcon={<CheckIcon />} disabled={busy} onClick={onClick} sx={{ minWidth: 92 }}>
      Voted
    </Button>
  ) : (
    <Button size="small" variant="outlined" color="inherit" startIcon={<AddIcon />} disabled={disabled || busy} onClick={onClick} sx={{ minWidth: 92 }}>
      Vote
    </Button>
  );
}

export default function TrackVote({ event }) {
  const { user, ready, isAdmin } = useAuth();
  const { state, reload } = useLeagueData();
  const flash = useFlash();
  const { rows, error: loadErr, missing, refresh } = useTrackVotes(event && event.id);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");

  const me = state && user ? state.players.find((p) => p.userId === user.id) : null;
  const strengths = useMemo(() => {
    if (!me || !state || !state.cups.length) return [];
    const s = compute(state, { season: "all" }).byId.get(me.id);
    return s ? bestTracks(s.log) : [];
  }, [me, state]);

  if (!event || !ready) return null;
  const when = formatEventWhen(event.startsAt);
  const header = (
    <SectionTitle
      title="Track vote"
      count={`for ${when.date}, ${when.time}`}
    />
  );

  if (!user) {
    return (
      <Box>
        {header}
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <Typography sx={{ color: colors.muted, maxWidth: "52ch" }}>
            Everyone who's in for the night suggests and votes on the tracks to race. Sign in and say you're in to vote.
          </Typography>
          <Button variant="contained" component={RouterLink} to="/account">Sign in</Button>
        </Box>
      </Box>
    );
  }
  if (missing) {
    return isAdmin ? (
      <Box>{header}<Alert severity="info">Track voting needs the latest database update: run <code>supabase/schema.sql</code> in the Supabase SQL Editor.</Alert></Box>
    ) : null;
  }

  const going = isGoing(event, user.id);
  const open = isOpen(event);
  const ballot = rows || [];
  const mineCount = ballot.filter((r) => r.mine).length;
  const left = MAX_TRACK_VOTES - mineCount;
  const voters = new Set(ballot.flatMap((r) => r.voters.map((v) => v.name))).size;
  const canVote = going && open;
  const byTrack = new Map(ballot.map((r) => [r.track, r]));

  async function run(key, call, msg) {
    setBusy(key); setError("");
    try {
      await q(call);
      if (msg) flash(msg);
      refresh();
      reload();
      return true;
    } catch (e) {
      setError(dbErr(e));
      return false;
    } finally {
      setBusy("");
    }
  }
  const toggle = (track) => {
    const r = byTrack.get(track);
    return r && r.mine
      ? run(track, sb.rpc("unvote_track", { p_event: event.id, p_track: track }))
      : run(track, sb.rpc("vote_track", { p_event: event.id, p_track: track }));
  };
  function suggest() {
    const t = (pick || "").trim();
    if (!t) return;
    run("suggest", sb.rpc("vote_track", { p_event: event.id, p_track: t }), byTrack.has(t) ? `Voted for ${t}` : `Suggested ${t}`)
      .then((ok) => { if (ok) setPick(""); });
  }

  const top = strengths.slice(0, 5);

  return (
    <Box>
      {header}
      <Box>
        {/* Status line: who's voted, your votes left, or how to start voting. */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "flex-start", sm: "baseline" }} justifyContent="space-between"
          sx={{ pb: 1.5 }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Typography>
              {ballot.length
                ? <><b>{plural(ballot.length, "track")}</b> suggested by {plural(voters, "racer")}. The top 4 make the first cup.</>
                : "No tracks suggested yet. Start the ballot below."}
            </Typography>
          </Stack>
          {canVote ? (
            <Typography sx={{ color: colors.muted, whiteSpace: "nowrap" }}><b>{left}</b> of {MAX_TRACK_VOTES} votes left</Typography>
          ) : open ? (
            <Typography sx={{ color: colors.muted }}>Say you're in to vote.</Typography>
          ) : (
            <Typography sx={{ color: colors.muted }}>Voting has closed.</Typography>
          )}
        </Stack>

        {!going && open && (
          <Alert severity="info" sx={{ mb: 2 }} action={
            <Button color="inherit" size="small" disabled={busy === "join"} onClick={() => run("join", sb.rpc("join_event", { p_id: event.id }), "You're in! Now vote on tracks.")}>
              I'm in
            </Button>
          }>
            Only racers who are in for the night can vote.
          </Alert>
        )}
        {(error || loadErr) && <Alert severity="error" sx={{ mb: 2 }}>{error || loadErr}</Alert>}

        {/* The ballot, most votes first, in groups of 4: the cups the vote would make right now. */}
        {rows === null ? (
          <Typography sx={{ color: colors.muted, py: 2 }}>Loading the vote…</Typography>
        ) : ballot.length > 0 && (
          <Box>
            {ballot.map((r, i) => {
              return (
                <Box key={r.track}>
                  {i % 4 === 0 && (
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: colors.muted, pt: i ? 3 : 0.5, pb: 0.75, borderBottom: `2px solid ${colors.rule}` }}>
                      {i === 0 ? "Cup 1 · if the vote ended now" : `Cup ${i / 4 + 1}`}
                    </Typography>
                  )}
                  <Box sx={{
                    display: "grid", alignItems: "center", columnGap: 1.5, rowGap: 0.5, py: 1.25, borderBottom: `1px solid ${colors.line}`,
                    gridTemplateColumns: { xs: "24px minmax(0,1fr) auto", sm: "24px minmax(0,1.3fr) minmax(0,1fr) auto" },
                  }}>
                    <Typography sx={{ fontWeight: 800, fontStyle: "italic", fontSize: "1.125rem", textAlign: "center" }}>{i + 1}</Typography>
                    <TrackName track={r.track} />
                    <Box sx={{ gridColumn: { xs: "2 / 3", sm: "auto" }, gridRow: { xs: 2, sm: "auto" }, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{plural(r.votes, "vote")}</Typography>
                      <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }} noWrap title={r.voters.map((v) => v.name).join(", ")}>
                        {r.voters.map((v) => v.name).join(", ")}
                      </Typography>
                    </Box>
                    {canVote ? <VoteButton mine={r.mine} disabled={left <= 0} busy={busy === r.track} onClick={() => toggle(r.track)} /> : <span />}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Suggest any track (or a custom one). */}
        {canVote && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ pt: 2.5 }}>
            <Autocomplete
              freeSolo size="small" sx={{ flex: 1 }}
              options={TRACKS}
              groupBy={(t) => trackKind(t) || "Custom"}
              inputValue={pick}
              onInputChange={(_, v) => setPick(v || "")}
              onChange={(_, v) => setPick(v || "")}
              getOptionDisabled={(t) => !!(byTrack.get(t) && byTrack.get(t).mine)}
              renderOption={(props, t) => {
                const { key, ...rest } = props;
                const r = byTrack.get(t);
                return (
                  <Box component="li" key={key} {...rest} sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <span>{t}</span>
                    {r && <Typography variant="caption" sx={{ color: colors.muted }}>{r.mine ? "your vote" : plural(r.votes, "vote")}</Typography>}
                  </Box>
                );
              }}
              renderInput={(params) => <TextField {...params} label="Suggest a track" placeholder="e.g. Coconut Mall" inputProps={{ ...params.inputProps, maxLength: 60 }} />}
            />
            <Button variant="contained" onClick={suggest} disabled={!pick.trim() || left <= 0 || busy === "suggest"}>
              {busy === "suggest" ? "Adding…" : "Suggest"}
            </Button>
          </Stack>
        )}
      </Box>

      {/* Your strengths: the tracks you score best on, from every cup with known tracks. */}
      {going && (
        <Box sx={{ mt: 4 }}>
          <Typography component="h3" sx={{ fontWeight: 700, fontSize: "1.125rem" }}>Your best tracks</Typography>
          {top.length ? (
            <>
              <Typography sx={{ color: colors.muted, mb: 1 }}>From your results so far: average points per race (out of 15) on each track.</Typography>
              <Box sx={{ display: "grid", columnGap: 4, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
                {top.map((t) => {
                  const r = byTrack.get(t.track);
                  return (
                    <Box key={t.track} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.25, borderBottom: `1px solid ${colors.line}` }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <TrackName track={t.track} width={72} />
                        <Typography sx={{ color: colors.muted, fontSize: "0.875rem", mt: 0.5 }}>
                          <Box component="span" sx={{ color: colors.ink, fontWeight: 700 }}>{t.avgPts.toFixed(1)} pts</Box>
                          {t.avgPos != null ? ` · ${t.avgPos.toFixed(1)} avg place` : ""} · {plural(t.races, "race")}
                          {t.wins ? ` · ${plural(t.wins, "win")}` : ""}
                          {r && !r.mine ? ` · ${plural(r.votes, "vote")}` : ""}
                        </Typography>
                      </Box>
                      {canVote && <VoteButton mine={r && r.mine} disabled={left <= 0} busy={busy === t.track} onClick={() => toggle(t.track)} />}
                    </Box>
                  );
                })}
              </Box>
            </>
          ) : (
            <Typography sx={{ color: colors.muted, mt: 0.5 }}>
              {me
                ? "No track history yet. Once you've raced cups with known tracks, your best ones show up here to vote for."
                : "Your results aren't linked to your account yet, so there's no track history to suggest from."}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
