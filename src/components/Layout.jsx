import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { liveCups } from "../lib/standings";
import { colors } from "../theme";

const TABS = [
  { value: "/standings", label: "Standings" },
  { value: "/events", label: "Cup nights" },
  { value: "/race", label: "Race night" },
  { value: "/cups", label: "Cups" },
  { value: "/unclaimed", label: "Unclaimed" },
  { value: "/playoffs", label: "Playoffs" },
  { value: "/rules", label: "Rules" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isAdmin, myName, ready } = useAuth();
  const { state } = useLeagueData();

  const live = state ? liveCups(state).length : 0;
  const section = location.pathname.startsWith("/events/") ? "/events" : location.pathname;
  const current = TABS.some((t) => t.value === section) ? section : false;
  const league = state ? state.league : { name: "Kart Night League", season: "" };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: `1px solid ${colors.line}` }}>
        <Container maxWidth="lg" disableGutters>
          <Toolbar sx={{ minHeight: 56, gap: 1 }}>
            <Tabs
              value={current}
              onChange={(_, v) => navigate(v)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{ flex: 1, minHeight: 44, "& .MuiTabs-indicator": { display: "none" } }}
            >
              {TABS.map((t) => (
                <Tab
                  key={t.value}
                  value={t.value}
                  label={
                    t.value === "/race" && live ? (
                      <Badge color="error" variant="dot">{t.label}</Badge>
                    ) : t.label
                  }
                  sx={{
                    minHeight: 36, borderRadius: 999, fontFamily: "inherit", fontWeight: 700,
                    fontSize: "0.85rem", textTransform: "none", color: colors.muted, mx: 0.25,
                    "&.Mui-selected": { color: colors.accentInk, bgcolor: colors.accent },
                  }}
                />
              ))}
            </Tabs>
            {isAdmin && (
              <Button size="small" variant="contained" onClick={() => navigate("/build")} sx={{ display: { xs: "none", sm: "inline-flex" } }}>+ New cup</Button>
            )}
            {user ? (
              <Chip
                onClick={() => navigate("/account")}
                variant={location.pathname === "/account" ? "filled" : "outlined"}
                avatar={<Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (profile && profile.color) || colors.muted, ml: 0.5 }} />}
                label={myName}
                sx={{ fontWeight: 700 }}
              />
            ) : ready ? (
              <Button size="small" variant="outlined" onClick={() => navigate("/account")}>Sign in</Button>
            ) : null}
          </Toolbar>
        </Container>
      </AppBar>
      <Box component="main" sx={{ flex: 1, py: 3 }}>
        <Outlet />
      </Box>
      <Box component="footer" sx={{ borderTop: `1px solid ${colors.line}`, py: 3 }}>
        <Container maxWidth="lg" sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Typography variant="body2" sx={{ color: colors.muted }}>
            {league.name} · {league.season}
          </Typography>
          <Typography
            component="a"
            href="#/account"
            onClick={(e) => { e.preventDefault(); navigate("/account"); }}
            variant="body2"
            sx={{ color: colors.cool, textDecoration: "none", cursor: "pointer" }}
          >
            {user ? "Your account" : "Sign in or create an account"}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
