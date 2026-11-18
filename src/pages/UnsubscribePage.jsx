import { useEffect, useRef, useState } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The unsubscribe link in every cup night email. One click: opening it turns the emails off.
export default function UnsubscribePage() {
  const { token } = useParams();
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState("working");
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode runs effects twice in development
    ran.current = true;
    if (!UUID.test(token || "")) { setStatus("invalid"); return; }
    q(sb.rpc("unsubscribe_email", { p_token: token }))
      .then((ok) => { setStatus(ok ? "done" : "invalid"); if (ok) refreshProfile(); })
      .catch((e) => { setError(dbErr(e)); setStatus("error"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper sx={{ p: 3 }}>
        {status === "working" && (
          <Stack direction="row" spacing={2} alignItems="center"><CircularProgress size={22} /><Typography>Unsubscribing…</Typography></Stack>
        )}
        {status === "done" && (
          <>
            <Typography variant="h6" sx={{ fontFamily: "inherit", fontWeight: 800 }}>You're unsubscribed</Typography>
            <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
              You won't get any more cup night emails. You can turn them back on any time in your account.
            </Typography>
          </>
        )}
        {status === "invalid" && (
          <>
            <Typography variant="h6" sx={{ fontFamily: "inherit", fontWeight: 800 }}>This link doesn't work</Typography>
            <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
              It may have been copied incompletely. Sign in and turn off cup night emails in your account instead.
            </Typography>
          </>
        )}
        {status === "error" && (
          <>
            <Typography variant="h6" sx={{ fontFamily: "inherit", fontWeight: 800 }}>Couldn't unsubscribe</Typography>
            <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>{error} You can also turn cup night emails off in your account.</Typography>
          </>
        )}
        {status !== "working" && (
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button component={RouterLink} to="/account" variant="outlined">Your account</Button>
            <Button component={RouterLink} to="/schedule">Schedule</Button>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
