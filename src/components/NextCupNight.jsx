import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { nextEvent } from "../lib/events";
import { colors } from "../theme";
import EventCard from "./EventCard";
import EventDialog from "./EventDialog";

// Homepage card: the next cup night, or a friendly note when nothing's scheduled.
export default function NextCupNight() {
  const { events } = useLeagueData();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  if (!events) return null; // still loading
  const next = nextEvent(events);
  if (next) return <EventCard event={next} prominent />;

  return (
    <Paper sx={{ p: { xs: 2.5, sm: 3 }, border: `1px dashed ${colors.line}` }}>
      <Typography variant="overline" sx={{ color: colors.accent }}>Next cup night</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: "1.15rem", mt: 0.5 }}>Nothing on the calendar yet</Typography>
      <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5, mb: 2 }}>
        {isAdmin
          ? "Schedule the next one and everyone who opted in gets an email invite."
          : "Check back soon. Turn on cup night emails in your account to hear about the next one first."}
      </Typography>
      <Stack direction="row" spacing={1}>
        {isAdmin
          ? <Button variant="contained" onClick={() => setCreating(true)}>Schedule a cup night</Button>
          : <Button variant="outlined" onClick={() => navigate("/account")}>Email settings</Button>}
        <Button onClick={() => navigate("/events")}>Past cup nights</Button>
      </Stack>
      {creating && <EventDialog open event={null} onClose={() => setCreating(false)} />}
    </Paper>
  );
}
