// Schedule (#/schedule, #/schedule/:id): upcoming cup nights, then every night already raced with its cups'
// results, newest first. A strip of cups grouped by night (SeasonStrip) sticks under the header and shows
// where you are in the season. The old History page (#/history) redirects here.
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { localDate, nextEvent, pastNights, splitEvents } from "../lib/events";
import { compute, currentSeason, liveCups } from "../lib/standings";
import { DEMO } from "../lib/demo";
import { colors } from "../theme";
import { Loading, PageTitle, SectionTitle, plural } from "../components/PageBits";
import EventCard, { DateBlock, PeopleLine } from "../components/EventCard";
import EventDialog from "../components/EventDialog";
import CupCard from "../components/CupCard";
import SeasonPicker, { useSeason } from "../components/SeasonPicker";
import SeasonStrip from "../components/SeasonStrip";

const dayOf = (date) => new Date(`${date}T12:00:00`);
const short = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const long = (d) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const nightId = (n) => (n.event ? `event-${n.event.id}` : `night-${n.date || "undated"}`);

// A night that happened: a heading with the date and week, then each cup's results, newest first. Nights
// nobody scheduled on the site still show, from their cups; a scheduled night with no results says so.
function Night({ night, m, st, demo, isAdmin, signedIn, latestId, highlight }) {
  const ev = night.event;
  const cups = night.cups.filter((c) => m.cupInfo.get(c.id)).slice().reverse();
  const week = cups.length ? cups[0].week : null;
  const planned = ev && ev.cups.length && ev.cups.join("|") !== night.cups.map((c) => c.cup).join("|") ? ev.cups : null;
  const date = night.date ? dayOf(night.date) : null;

  return (
    <Box component="section" id={nightId(night)} aria-label={date ? long(date) : "No date"} sx={{ mt: 5, scrollMarginTop: 160 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ pb: 1.25, borderBottom: `2px solid ${colors.rule}`, bgcolor: highlight ? colors.raised : "transparent", px: highlight ? 1.5 : 0 }}>
        {date && <DateBlock date={date} tone="past" />}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.375rem", lineHeight: 1.2 }}>
            {week ? `Week ${week}` : date ? "Cup night" : "No date"}
          </Typography>
          <Typography sx={{ color: colors.muted }}>
            {cups.length ? plural(cups.length, "cup") : "No results recorded yet"}{!demo && night.date && !ev ? " · not on the schedule" : ""}
          </Typography>
        </Box>
        {isAdmin && ev && !cups.length && <Button size="small" variant="contained" component={RouterLink} to={`/add?event=${ev.id}`}>Record results</Button>}
      </Stack>

      {planned && <Typography sx={{ color: colors.muted, mt: 1, fontSize: "0.9375rem" }}>Planned: {planned.join(", ")}</Typography>}
      {!cups.length && ev && ev.going.length > 0 && (
        <Box sx={{ mt: 1.5 }}><PeopleLine label="Said they were in" people={ev.going.map((g, i) => ({ key: g.userId || i, name: g.name }))} /></Box>
      )}

      {cups.map((c, i) => (
        <CupCard key={c.id} cup={c} info={m.cupInfo.get(c.id)} st={st} demo={demo} isAdmin={isAdmin} signedIn={signedIn}
          latest={c.id === latestId} first={i === 0} />
      ))}
    </Box>
  );
}

export default function SchedulePage() {
  const { id } = useParams();
  const { events, state, loadError } = useLeagueData();
  const { user, isAdmin } = useAuth();
  const [creating, setCreating] = useState(false);
  const demo = !!state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const { season, seasons, setSeason } = useSeason(st);
  const m = useMemo(() => (st ? compute(st, { season }) : null), [st, season]);
  const isCurrent = !!state && season === currentSeason(st.league);

  // Nights raced this season (newest first), and the upcoming ones when looking at the current season.
  const { upcoming, nights } = useMemo(() => {
    if (!m || !events) return { upcoming: [], nights: [] };
    const split = splitEvents(events);
    const tz = state.league.timezone;
    const firstDate = m.cups.length ? m.cups.map((c) => c.date).filter(Boolean).sort()[0] : null;
    // Scheduled nights with no results belong to this season only if they come after its first cup.
    const pastEv = isCurrent && !demo ? split.past.filter((e) => !firstDate || localDate(e.startsAt, tz) >= firstDate) : [];
    const list = pastNights(pastEv, m.cups, tz);
    const undated = m.cups.filter((c) => !c.date);
    if (undated.length) list.push({ date: null, event: null, cups: undated });
    return { upcoming: isCurrent ? split.upcoming : [], nights: list };
  }, [m, events, state, isCurrent, demo]);

  // Links from emails land on #/schedule/<id>: scroll that night into view.
  useEffect(() => {
    if (!id || !events) return;
    const el = document.getElementById(`event-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [id, events]);

  // The strip, oldest night first: cups raced, then upcoming nights' planned cups, then what's left of the
  // regular season that isn't on the schedule yet.
  const segments = useMemo(() => {
    if (!m) return [];
    const out = nights.slice().reverse().map((n) => {
      const d = n.date ? dayOf(n.date) : null;
      const k = n.cups.length;
      return {
        id: nightId(n), target: nightId(n), label: d ? short(d) : "No date",
        aria: `${d ? long(d) : "No date"}: ${k ? `${plural(k, "cup")} raced` : "no results recorded"}`,
        pips: k ? n.cups.map(() => "raced") : ["tbd"],
      };
    });
    let planned = 0;
    upcoming.filter((e) => e.status !== "cancelled").forEach((e) => {
      const k = e.cups.length || m.plan.perWeek;
      planned += k;
      const d = new Date(e.startsAt);
      out.push({ id: `event-${e.id}`, target: `event-${e.id}`, label: short(d), aria: `${long(d)}: ${plural(k, "cup")} planned`, pips: Array(k).fill("planned") });
    });
    const rest = isCurrent && !demo ? m.plan.total - m.plan.played - planned : 0;
    if (rest > 0) out.push({ id: "tbd", target: null, label: "To come", aria: `${plural(rest, "more cup")} in the regular season, not scheduled yet`, pips: Array(rest).fill("tbd") });
    return out;
  }, [m, nights, upcoming, isCurrent, demo]);

  if (!state || !events) return <Loading error={loadError} />;

  const next = nextEvent(events);
  const linked = id ? events.find((e) => e.id === id) : null;
  const live = liveCups(state);
  const latestId = m.cups.length ? m.cups[m.cups.length - 1].id : null;
  const p = m.plan;
  const summary = isCurrent && !demo
    ? `${p.seasonDone ? "Regular season complete" : `Week ${p.current} of ${p.seasonWeeks}`} · ${p.played} of ${plural(p.total, "cup")} raced`
    : `${seasons.length > 1 ? `Season ${season} · ` : ""}${plural(m.cups.length, "cup")} over ${plural(nights.length, "night")}`;

  return (
    <Container maxWidth="lg">
      <PageTitle
        title="Schedule"
        sub="Upcoming nights and every result. Times are in your time zone."
        action={user && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {isAdmin && <Button variant="contained" onClick={() => setCreating(true)}>+ Schedule a night</Button>}
            <Button component={RouterLink} to="/add" variant={isAdmin ? "outlined" : "contained"} color={isAdmin ? "inherit" : "primary"} sx={isAdmin ? { borderColor: colors.rule } : undefined}>
              {isAdmin ? "+ Record a cup night" : "+ Submit results"}
            </Button>
          </Stack>
        )}
      />

      {id && !linked && <Alert severity="info" sx={{ mb: 2 }}>That cup night isn't on the schedule anymore. Here's what's coming up.</Alert>}
      {demo && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <b>Example cups.</b> These made-up results show how the site works. They disappear when the first real cup is added.
        </Alert>
      )}
      <SeasonPicker season={season} seasons={seasons} setSeason={setSeason} />
      {live.map((c) => (
        <Alert key={c.id} severity="success" sx={{ mb: 2 }} action={<Button component={RouterLink} to="/join" color="inherit" size="small">Join</Button>}>
          <b>{c.cup}</b> is being raced now. Join it and enter your results.
        </Alert>
      ))}

      <SeasonStrip segments={segments} summary={summary} />

      {isCurrent && (
        <Box component="section" aria-label="Upcoming">
          <SectionTitle title="Upcoming" count={upcoming.length ? plural(upcoming.length, "night") : null} sx={{ mt: 0 }} />
          {upcoming.length ? (
            <Stack divider={<Divider />} sx={{ borderTop: `2px solid ${colors.rule}`, borderBottom: `1px solid ${colors.line}` }}>
              {upcoming.map((e) => <EventCard key={e.id} event={e} isNext={!!next && e.id === next.id} highlight={e.id === id} />)}
            </Stack>
          ) : (
            <Box sx={{ pt: 1.5, borderTop: `2px solid ${colors.rule}` }}>
              <Typography sx={{ fontWeight: 700 }}>Nothing on the schedule yet</Typography>
              <Typography sx={{ color: colors.muted, mt: 0.5 }}>
                {isAdmin ? "Schedule the next night and everyone who opted in gets an email invite." : "The next night will show up here. Turn on cup night emails in your account to get an invite."}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {nights.length > 0 ? (
        <Box sx={{ mt: isCurrent ? 2 : 0 }}>
          {nights.map((n) => (
            <Night key={nightId(n)} night={n} m={m} st={st} demo={demo} isAdmin={isAdmin} signedIn={!!user} latestId={latestId}
              highlight={!!n.event && n.event.id === id} />
          ))}
        </Box>
      ) : !isCurrent ? (
        <Typography sx={{ fontWeight: 700 }}>No cups in this season.</Typography>
      ) : null}

      {creating && <EventDialog open event={null} onClose={() => setCreating(false)} />}
    </Container>
  );
}
