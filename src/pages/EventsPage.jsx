import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
import { splitEvents } from "../lib/events";
import { colors } from "../theme";
import EventCard from "../components/EventCard";
import EventDialog from "../components/EventDialog";

export default function EventsPage() {
  const { id } = useParams();
  const { events, loadError } = useLeagueData();
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
  const linked = id ? events.find((e) => e.id === id) : null;
  const linkedIsPast = linked && past.includes(linked);

  return (
    <Container maxWidth="md">
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, gap: 1, flexWrap: "wrap" }}>
        <div>
          <Typography variant="h5" sx={{ fontFamily: "inherit" }}>Cup nights</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>Times are shown in your time zone.</Typography>
        </div>
        {isAdmin && <Button variant="contained" onClick={() => setCreating(true)}>+ Schedule a cup night</Button>}
      </Stack>

      {id && !linked && <Alert severity="info" sx={{ mb: 2 }}>That cup night isn't on the calendar anymore. Here's what's coming up.</Alert>}
      {linkedIsPast && (
        <Stack sx={{ mb: 3 }} spacing={1}>
          <Alert severity="info">This cup night has already happened.</Alert>
          <EventCard event={linked} highlight />
        </Stack>
      )}

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

      {past.length > 0 && (
        <Accordion sx={{ mt: 4, bgcolor: "transparent", boxShadow: "none", border: `1px solid ${colors.line}`, "&:before": { display: "none" } }} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 700 }}>Past cup nights ({past.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {past.map((e) => <EventCard key={e.id} event={e} />)}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {creating && <EventDialog open event={null} onClose={() => setCreating(false)} />}
    </Container>
  );
}
