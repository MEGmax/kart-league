import { Outlet, useLocation, useNavigate, Link as RouterLink } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { useMemo } from "react";
import { compute, liveCups } from "../lib/standings";
import { LOGO_SRC } from "../lib/constants";
import { colors, brandStripe, fontDisplay } from "../theme";

const TABS = [
  { value: "/standings", label: "Standings" },
  { value: "/events", label: "Cup nights" },
  { value: "/race", label: "Race night" },
  { value: "/cups", label: "Cups" },
  { value: "/unclaimed", label: "Unclaimed" },
  { value: "/playoffs", label: "Playoffs" },
  { value: "/rules", label: "Rules" },
];

const BAR_H = 60;

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isAdmin, myName, ready } = useAuth();
  const { state } = useLeagueData();

  const live = state ? liveCups(state).length : 0;
  const unclaimed = useMemo(() => (state && state.cups.length ? compute(state).unclaimed.length : 0), [state]);
  const section = location.pathname.startsWith("/events/") ? "/events" : location.pathname;
  const tabs = isAdmin ? TABS.concat({ value: "/admin", label: "Admin" }) : TABS;
  const current = tabs.some((t) => t.value === section) ? section : false;
  const league = state ? state.league : { name: "Kart Night League", season: "" };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: `1px solid ${colors.line}` }}>
        <Box aria-hidden sx={{ height: 3, background: brandStripe }} />
        <Container maxWidth="lg" disableGutters>
          <Toolbar sx={{ minHeight: { xs: BAR_H, sm: BAR_H }, gap: 1, pl: { xs: 1.5, sm: 2 } }}>
            <Box
              component={RouterLink}
              to="/standings"
              aria-label={`${league.name} home`}
              sx={{ display: "flex", flexShrink: 0, mr: { xs: 0, sm: 1 }, transition: "transform .15s", "&:hover": { transform: "translateY(-1px) rotate(-3deg)" } }}
            >
              <Box component="img" src={LOGO_SRC} alt="" sx={{ height: 40, width: "auto", display: "block" }} />
            </Box>
            <Tabs
              value={current}
              onChange={(_, v) => navigate(v)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                flex: 1, minHeight: BAR_H, alignSelf: "stretch",
                "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0", bgcolor: colors.hot },
                "& .MuiTabs-scrollButtons.Mui-disabled": { opacity: 0.3 },
              }}
            >
              {tabs.map((t) => (
                <Tab
                  key={t.value}
                  value={t.value}
                  label={
                    t.value === "/unclaimed" && unclaimed ? (
                      <Badge color="warning" badgeContent={unclaimed} max={99} sx={{ "& .MuiBadge-badge": { right: -10 } }}>{t.label}</Badge>
                    ) : t.value === "/race" && live ? (
                      <Badge color="error" variant="dot">{t.label}</Badge>
                    ) : t.label
                  }
                  sx={{
                    minHeight: BAR_H, minWidth: 0, px: 2, fontFamily: "inherit", fontWeight: 700,
                    fontSize: "0.88rem", textTransform: "none", color: colors.muted,
                    "&:hover": { color: colors.ink },
                    "&.Mui-selected": { color: colors.ink },
                  }}
                />
              ))}
            </Tabs>
            {user && (
              <Button size="small" variant="contained" onClick={() => navigate("/add")} sx={{ display: { xs: "none", sm: "inline-flex" }, whiteSpace: "nowrap" }}>
                {isAdmin ? "+ Add results" : "+ Submit results"}
              </Button>
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
              <Button size="small" variant="outlined" onClick={() => navigate("/account")} sx={{ whiteSpace: "nowrap" }}>Sign in</Button>
            ) : null}
          </Toolbar>
        </Container>
      </AppBar>
      <Box component="main" sx={{ flex: 1, py: 3 }}>
        <Outlet />
      </Box>
      <Box component="footer" sx={{ borderTop: `1px solid ${colors.line}`, bgcolor: colors.bg2, py: 3.5 }}>
        <Container maxWidth="lg" sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box component="img" src={LOGO_SRC} alt="" sx={{ height: 48, width: "auto", display: "block" }} />
            <div>
              <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.85rem", letterSpacing: "0.03em", textTransform: "uppercase" }}>{league.name}</Typography>
              {league.season && <Typography variant="body2" sx={{ color: colors.muted }}>{league.season}</Typography>}
            </div>
          </Stack>
          <Typography
            component="a"
            href="#/account"
            onClick={(e) => { e.preventDefault(); navigate("/account"); }}
            variant="body2"
            sx={{ color: colors.cool, textDecoration: "none", cursor: "pointer", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}
          >
            {user ? "Your account" : "Sign in or create an account"}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
