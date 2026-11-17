// Small shared page pieces: loading state, page heading, section heading, player dot.
import Container from "@mui/material/Container";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { initials } from "../lib/constants";
import { colors } from "../theme";

export function Loading({ error, maxWidth = "lg" }) {
  return (
    <Container maxWidth={maxWidth} sx={{ py: 8, textAlign: "center" }}>
      {error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}
    </Container>
  );
}

export function PageTitle({ title, sub, action }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, gap: 1, flexWrap: "wrap" }}>
      <div>
        <Typography variant="h5" sx={{ fontFamily: "inherit" }}>{title}</Typography>
        {sub && <Typography variant="body2" sx={{ color: colors.muted }}>{sub}</Typography>}
      </div>
      {action}
    </Stack>
  );
}

export function SectionTitle({ title, count, sx }) {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 4, mb: 1.5, ...sx }}>
      <Typography variant="h6" sx={{ fontFamily: "inherit", fontWeight: 800 }}>{title}</Typography>
      {count != null && <Typography variant="body2" sx={{ color: colors.muted }}>{count}</Typography>}
    </Stack>
  );
}

export function PlayerDot({ player, name, color, size = 24 }) {
  const nm = player ? player.name : name || "?";
  return (
    <Avatar sx={{ width: size, height: size, fontSize: size * 0.42, fontWeight: 700, bgcolor: (player && player.color) || color || colors.muted, color: "#fff" }}>
      {initials(nm)}
    </Avatar>
  );
}

export function plural(n, word, many) {
  return `${n} ${n === 1 ? word : many || word + "s"}`;
}
