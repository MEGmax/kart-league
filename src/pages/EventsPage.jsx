import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { nextEvent, pastNights, splitEvents } from "../lib/events";
import { compute } from "../lib/standings";
import { colors, fontDisplay } from "../theme";
import { PageTitle, SectionTitle, plural } from "../components/PageBits";
import CupIcon from "../components/CupIcon";
import EventCard, { PeopleLine, ScheduleRow, byMonth } from "../components/EventCard";
import EventDialog from "../components/EventDialog";

const dayOf = (date) => new Date(`${date}T12:00:00`);

// A night that happened: the cups actually raced (with winners), who raced, and who'd said they were in.
// Nights nobody scheduled on the site still show, from their cups.
function PastNight({ night, m, players, isAdmin, highlight }) {
  const ev = night.event;
  const cups = night.cups.map((c) => ({ c, info: m.cupInfo.get(c.id) })).filter((x) => x.info).sort((a, b) => a.info.num - b.info.num);
  const raced = new Map();
  let unclaimed = 0;
  cups.forEach(({ info }) => info.res.forEach((r) => { if (r.p) raced.set(r.p, (raced.get(r.p) || 0) + 1); else unclaimed++; }));
  const name = (id) => players.find((p) => p.id === id) || { name: "?", color: colors.muted };
  const week = cups.length ? cups[0].c.week : null;
  const planned = ev && ev.cups.length && ev.cups.join("|") !== cups.map((x) => x.c.cup).join("|") ? ev.cups : null;

  const actions = (cups.length > 0 || (isAdmin && ev)) && (
    <>
      {cups.length > 0 && <Button size="small" variant="outlined" component={RouterLink} to="/history">Results</Button>}
      {isAdmin && ev && !cups.length && <Button size="small" variant="contained" component={RouterLink} to={`/add?event=${ev.id}`}>Record results</Button>}
    </>
  );

  return (
    <ScheduleRow id={ev ? `event-${ev.id}` : undefined} date={dayOf(night.date)} tone="past" highlight={highlight} actions={actions}>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
        <Typography sx={{ fontWeight: 800 }}>{week ? `Week ${week}` : "Cup night"}</Typography>
        <Typography variant="body2" sx={{ color: colors.muted }}>
          {cups.length ? plural(cups.length, "cup") : "No results recorded yet"}{ev ? "" : " · not on the schedule"}
        </Typography>
      </Stack>

      {cups.length > 0 && (
        <Stack spacing={0.5} sx={{ mb: 0.75 }}>
          {cups.map(({ c, info }) => {
            const winners = info.res.filter((r) => r.rank === 1).map((r) => (r.p ? name(r.p).name : `Unclaimed ${r.character}`.trim()));
            return (
              <Stack key={c.id} direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                <CupIcon cup={c.cup} size={20} />
                <Typography variant="body2" sx={{ minWidth: 0 }} noWrap>
                  <b>{c.cup}</b>
                  <Box component="span" sx={{ color: colors.muted }}> · won by </Box>
                  <Box component="span" sx={{ color: colors.accent, fontWeight: 700 }}>{winners.join(" & ")}</Box>
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      )}
      {planned && <Typography variant="caption" sx={{ color: colors.muted, display: "block", mb: 0.75 }}>Planned: {planned.join(", ")}</Typography>}

      {raced.size > 0 && (
        <PeopleLine
          label="Raced"
          people={[...raced.entries()].map(([id, n]) => ({ key: id, name: `${name(id).name}${n > 1 ? ` ×${n}` : ""}`, color: name(id).color }))}
        />
      )}
      {unclaimed > 0 && (
        <Typography variant="caption" component={RouterLink} to="/unclaimed" sx={{ color: colors.cool, display: "inline-block", mt: 0.5 }}>
          {plural(unclaimed, "unclaimed result")}: yours?
        </Typography>
      )}
      {!cups.length && ev && ev.going.length > 0 && <PeopleLine label="Said they were in" people={ev.going.map((g, i) => ({ key: g.userId || i, name: g.name, color: g.color }))} />}
    </ScheduleRow>
  );
}

function MonthGroups({ groups, render }) {
  return (
    <Paper sx={{ overflow: "hidden" }}>
      {groups.map((g, gi) => (
        <Box key={g.key} component="section" aria-label={g.label}>
          <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 0.75, bgcolor: colors.bg2, borderTop: gi ? `1px solid ${colors.line}` : "none", borderBottom: `1px solid ${colors.line}` }}>
            <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: colors.muted }}>{g.label}</Typography>
          </Box>
          <Stack divider={<Divider />}>{g.items.map(render)}</Stack>
        </Box>
      ))}
    </Paper>
  );
}

export default function EventsPage() {
  const { id } = useParams();
  const { events, state, loadError } = useLeagueData();
  const m = useMemo(() => (state ? compute(state, { season: "all" }) : null), [state]);
  const { isAdmin } = useAuth();
  const [creating, setCreating] = useState(false);

  // Links from emails land on #/schedule/<id>: scroll that night into view.
  useEffect(() => {
    if (!id || !events) return;
    const el = document.getElementById(`event-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [id, events]);

  if (!events) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: "center" }}>
        {loadError ? <Alert severity="error">{loadError}</Alert> : <CircularProgress />}
      </Container>
    );
  }

  const { upcoming, past } = splitEvents(events);
  const next = nextEvent(events);
  const nights = m ? pastNights(past, m.cups, state.league.timezone) : [];
  const linked = id ? events.find((e) => e.id === id) : null;

  return (
    <Container maxWidth="md">
      <PageTitle
        title="Schedule"
        sub="Times are shown in your time zone."
        action={isAdmin && <Button variant="contained" onClick={() => setCreating(true)}>+ Schedule a night</Button>}
      />

      {id && !linked && <Alert severity="info" sx={{ mb: 2 }}>That cup night isn't on the schedule anymore. Here's what's coming up.</Alert>}

      <SectionTitle title="Upcoming" count={upcoming.length ? plural(upcoming.length, "night") : null} sx={{ mt: 1 }} />
      {upcoming.length ? (
        <MonthGroups
          groups={byMonth(upcoming, (e) => new Date(e.startsAt))}
          render={(e) => <EventCard key={e.id} event={e} isNext={!!next && e.id === next.id} highlight={e.id === id} />}
        />
      ) : (
        <Paper sx={{ p: 3, border: `1px dashed ${colors.line}` }}>
          <Typography sx={{ fontWeight: 800 }}>Nothing on the schedule yet</Typography>
          <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5 }}>
            {isAdmin ? "Schedule the next night and everyone who opted in gets an email invite." : "The next night will show up here. Turn on cup night emails in your account to get an invite."}
          </Typography>
        </Paper>
      )}

      {nights.length > 0 && (
        <>
          <SectionTitle title="Results" count={plural(nights.length, "night")} />
          <MonthGroups
            groups={byMonth(nights, (n) => dayOf(n.date))}
            render={(n) => <PastNight key={n.date} night={n} m={m} players={state.players} isAdmin={isAdmin} highlight={!!n.event && n.event.id === id} />}
          />
        </>
      )}

      {creating && <EventDialog open event={null} onClose={() => setCreating(false)} />}
    </Container>
  );
}
