// Small shared page pieces: loading state, page heading, section heading, player dot, and Fact (one
// bold fact with a plain label, used instead of stat tiles).
import Container from "@mui/material/Container";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { initials } from "../lib/constants";
import { colors, fontDisplay } from "../theme";

export function Loading({ error, maxWidth = "lg" }) {
  return (
    <Container maxWidth={maxWidth} sx={{ py: 8, textAlign: "center" }}>
      {error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}
    </Container>
  );
}

// The page's one display-face heading.
export function PageTitle({ title, sub, action }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mb: 3, gap: 1.5, flexWrap: "wrap" }}>
      <div>
        <Typography component="h1" sx={{ fontFamily: fontDisplay, fontSize: { xs: "1.375rem", md: "1.75rem" }, lineHeight: 1.15 }}>{title}</Typography>
        {sub && <Typography sx={{ color: colors.muted, mt: 0.5 }}>{sub}</Typography>}
      </div>
      {action}
    </Stack>
  );
}

export function SectionTitle({ title, count, sx }) {
  return (
    <Stack direction="row" alignItems="baseline" sx={{ mt: 5, mb: 1.5, columnGap: 1.25, flexWrap: "wrap", ...sx }}>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.3 }}>{title}</Typography>
      {count != null && <Typography sx={{ color: colors.muted }}>{count}</Typography>}
    </Stack>
  );
}

// One fact: a plain label over a bold value, with an optional line under it. Laid out in a FactList.
export function Fact({ label, value, sub }) {
  return (
    <Box component="li" sx={{ py: 1.5, borderTop: `1px solid ${colors.line}`, minWidth: 0 }}>
      <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }}>{label}</Typography>
      <Typography sx={{ fontWeight: 700, fontSize: "1.125rem", lineHeight: 1.3 }}>{value}</Typography>
      {sub && <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>{sub}</Typography>}
    </Box>
  );
}

// Facts in a list with a hairline between each; `columns` lays them side by side from `sm` up.
export function FactList({ children, columns = 1, sx }) {
  return (
    <Box component="ul" sx={{
      listStyle: "none", m: 0, p: 0, display: "grid", columnGap: 4,
      gridTemplateColumns: { xs: "minmax(0,1fr)", sm: `repeat(${Math.min(columns, 2)}, minmax(0,1fr))`, md: `repeat(${columns}, minmax(0,1fr))` },
      borderBottom: `1px solid ${colors.line}`, ...sx,
    }}>
      {children}
    </Box>
  );
}

// Initials in a neutral circle, for someone with no character yet.
export function PlayerDot({ player, name, size = 24 }) {
  const nm = player ? player.name : name || "?";
  return (
    <Avatar sx={{ width: size, height: size, fontSize: size * 0.42, fontWeight: 700, bgcolor: colors.raised, color: colors.ink }}>
      {initials(nm)}
    </Avatar>
  );
}

export function plural(n, word, many) {
  return `${n} ${n === 1 ? word : many || word + "s"}`;
}
