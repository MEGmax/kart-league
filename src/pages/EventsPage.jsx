import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { pastNights, splitEvents } from "../lib/events";
import { compute } from "../lib/standings";
import { colors } from "../theme";
import { PageTitle, plural } from "../components/PageBits";
import CupIcon from "../components/CupIcon";
import EventCard from "../components/EventCard";
import EventDialog from "../components/EventDialog";

const dayName = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

// A night that happened: the cups actually raced (with winners), who actually raced, and who'd said
// they were in. Nights nobody scheduled on the site still show, from their cups.
function PastNight({ night, m, players, isAdmin }) {
  const ev = night.event;
  const cups = night.cups.map((c) => ({ c, info: m.cupInfo.get(c.id) })).filter((x) => x.info).sort((a, b) => a.info.num - b.info.num);
  const raced = new Map();
  let unclaimed = 0;
  cups.forEach(({ info }) => info.res.forEach((r) => { if (r.p) raced.set(r.p, (raced.get(r.p) || 0) + 1); else unclaimed++; }));
  const name = (id) => players.find((p) => p.id === id) || { name: "?", color: colors.muted };
  const week = cups.length ? cups[0].c.week : null;
  const planned = ev && ev.cups.length && ev.cups.join("|") !== cups.map((x) => x.c.cup).join("|") ? ev.cups : null;

  return (
    <Paper id={ev ? `event-${ev.id}` : undefined} sx={{ p: 2.5 }}>
      <Typography variant="overline" sx={{ color: colors.muted, lineHeight: 1.6 }}>
        {week ? `Week ${week} · ` : ""}{ev ? "Cup night" : "Cup night (not scheduled on the site)"}
      </Typography>
      <Typography sx={{ fontWeight: 800, fontSize: "1.15rem" }}>{dayName(night.date)}</Typography>

      {cups.length ? (
        <>
          <Typography variant="body2" sx={{ fontWeight: 700, mt: 1.5, mb: 0.75 }}>{plural(cups.length, "cup")} raced</Typography>
          <Stack spacing={0.75}>
            {cups.map(({ c, info }) => {
              const winners = info.res.filter((r) => r.rank === 1).map((r) => (r.p ? name(r.p).name : `Unclaimed ${r.character}`.trim()));
              return (
                <Stack key={c.id} direction="row" spacing={1} alignItems="center">
                  <CupIcon cup={c.cup} size={24} />
                  <Typography variant="body2" sx={{ minWidth: 0 }} noWrap>
                    <b>#{info.num} {c.cup}</b>
                    <Box component="span" sx={{ color: colors.muted }}> · won by {winners.join(" & ")}</Box>
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
          {planned && <Typography variant="caption" sx={{ color: colors.muted, display: "block", mt: 0.5 }}>Planned: {planned.join(", ")}</Typography>}

          <Typography variant="body2" sx={{ fontWeight: 700, mt: 2, mb: 0.75 }}>Raced</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            {[...raced.entries()].map(([id, n]) => (
              <Chip key={id} size="small" label={`${name(id).name} · ${plural(n, "cup")}`}
                avatar={<Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: name(id).color, ml: 0.75 }} />} />
            ))}
            {unclaimed > 0 && <Chip size="small" variant="outlined" component={RouterLink} to="/unclaimed" clickable label={`${plural(unclaimed, "unclaimed result")}: yours?`} />}
          </Stack>
        </>
      ) : (
        <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>No results recorded for this night yet.</Typography>
      )}

      {ev && ev.going.length > 0 && (
        <Typography variant="caption" sx={{ color: colors.muted, display: "block", mt: 1.5 }}>
          Said they were in: {ev.going.map((g) => g.name).join(", ")}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        {cups.length > 0 && <Button size="small" component={RouterLink} to="/cups">See the results</Button>}
        {isAdmin && ev && !cups.length && <Button size="small" variant="contained" component={RouterLink} to={`/add?event=${ev.id}`}>Record results</Button>}
      </Stack>
    </Paper>
  );
}

export default function EventsPage() {
  const { id } = useParams();
  const { events, state, loadError } = useLeagueData();
  const m = useMemo(() => (state ? compute(state) : null), [state]);
  const { isAdmin } = useAuth();
  const [creating, setCreating] = useState(false);

  // Links from emails land on #/events/<id>: scroll that night into view.
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
  const nights = m ? pastNights(past, m.cups, state.league.timezone) : [];
  const linked = id ? events.find((e) => e.id === id) : null;
  const linkedIsPast = linked && past.includes(linked);

  return (
    <Container maxWidth="md">
      <PageTitle
        title="Cup nights"
        sub="Times are shown in your time zone."
        action={isAdmin && <Button variant="contained" onClick={() => setCreating(true)}>+ Schedule a cup night</Button>}
      />

      {id && !linked && <Alert severity="info" sx={{ mb: 2 }}>That cup night isn't on the calendar anymore. Here's what's coming up.</Alert>}
      {linkedIsPast && <Alert severity="info" sx={{ mb: 3 }}>That cup night has already happened: it's under Past cup nights below.</Alert>}

      {upcoming.length ? (
        <Stack spacing={2}>
          {upcoming.map((e) => <EventCard key={e.id} event={e} highlight={e.id === id} />)}
        </Stack>
      ) : (
        <Paper sx={{ p: 3, border: `1px dashed ${colors.line}` }}>
          <Typography sx={{ fontWeight: 800 }}>No cup nights scheduled</Typography>
          <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5 }}>
            {isAdmin ? "Schedule one and it shows up here and on the homepage." : "The next one will show up here. Turn on cup night emails in your account to get an invite."}
          </Typography>
        </Paper>
      )}

      {nights.length > 0 && (
        <Accordion defaultExpanded sx={{ mt: 4, bgcolor: "transparent", boxShadow: "none", border: `1px solid ${colors.line}`, "&:before": { display: "none" } }} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 700 }}>Past cup nights ({nights.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {nights.map((n) => <PastNight key={n.date} night={n} m={m} players={state.players} isAdmin={isAdmin} />)}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {creating && <EventDialog open event={null} onClose={() => setCreating(false)} />}
    </Container>
  );
}
