import { useEffect, useMemo, useRef, useState } from "react";
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
import Paper from "@mui/material/Paper";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import SportsScoreOutlinedIcon from "@mui/icons-material/SportsScoreOutlined";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { compute, liveCups } from "../lib/standings";
import { LOGO_SRC } from "../lib/constants";
import { usePageTitle } from "../lib/pageMeta";
import { colors, brandStripe, fontDisplay } from "../theme";

const TABS = [
  { value: "/standings", label: "Home", icon: <HomeOutlinedIcon /> },
  { value: "/schedule", label: "Schedule", icon: <EventOutlinedIcon /> },
  { value: "/join", label: "Join", icon: <SportsScoreOutlinedIcon /> },
  { value: "/history", label: "History", icon: <EmojiEventsOutlinedIcon /> },
  { value: "/unclaimed", label: "Unclaimed", icon: <HelpOutlineIcon /> },
  { value: "/playoffs", label: "Playoffs", icon: <AccountTreeOutlinedIcon /> },
  { value: "/rules", label: "Rules", icon: <MenuBookOutlinedIcon /> },
];
const PRIMARY = 4; // on phones the first four sit in the bottom bar; the rest go under More

const BAR_H = 60;

// The tab a route belongs to: /standings/gsote is Home, /schedule/<id> is Schedule.
function sectionOf(pathname) {
  const first = "/" + (pathname.split("/")[1] || "");
  return first;
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, isAdmin, myName, ready } = useAuth();
  const { state } = useLeagueData();
  const [moreAt, setMoreAt] = useState(null);

  const live = state ? liveCups(state).length : 0;
  const unclaimed = useMemo(() => (state && state.cups.length ? compute(state).unclaimed.length : 0), [state]);
  const section = sectionOf(location.pathname);
  const tabs = isAdmin ? TABS.concat({ value: "/admin", label: "Admin", icon: <AdminPanelSettingsOutlinedIcon /> }) : TABS;
  // Pages that aren't tabs (Account, Add, Build…) select no tab at all.
  const current = tabs.some((t) => t.value === section) ? section : false;
  const league = state ? state.league : { name: "Kart Night League", season: "" };
  usePageTitle(location.pathname, league.name);

  // A new page starts at the top. Opening or closing a racer's drawer (/standings ⇄ /standings/x) doesn't.
  const lastSection = useRef(section);
  useEffect(() => {
    if (lastSection.current !== section) window.scrollTo(0, 0);
    lastSection.current = section;
  }, [location.pathname, section]);

  const tabLabel = (t) => {
    if (t.value === "/unclaimed" && unclaimed) {
      return <Badge color="warning" badgeContent={unclaimed} max={99} sx={{ mr: 1.5, "& .MuiBadge-badge": { right: -12 } }}><span>{t.label}</span></Badge>;
    }
    if (t.value === "/join" && live) return <Badge color="error" variant="dot"><span>{t.label}</span></Badge>;
    return t.label;
  };
  const tabAria = (t) => (t.value === "/unclaimed" && unclaimed ? `Unclaimed, ${unclaimed} results waiting`
    : t.value === "/join" && live ? "Join, a cup is being raced" : t.label);

  const more = tabs.slice(PRIMARY);
  const moreActive = more.some((t) => t.value === section) || section === "/account";

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: `1px solid ${colors.line}` }}>
        <Box aria-hidden sx={{ height: 3, background: brandStripe }} />
        <Container maxWidth="lg" disableGutters>
          <Toolbar sx={{ minHeight: { xs: 56, sm: BAR_H }, gap: 1, pl: { xs: 1.5, sm: 2 } }}>
            <Box
              component={RouterLink}
              to="/standings"
              aria-label={`${league.name}: home`}
              sx={{ display: "flex", flexShrink: 0, mr: { xs: 0, sm: 1 }, transition: "transform .15s", "&:hover": { transform: "translateY(-1px) rotate(-3deg)" } }}
            >
              <Box component="img" src={LOGO_SRC} alt="NKL" sx={{ height: 40, width: "auto", display: "block" }} />
            </Box>
            {/* Phones: the page name here, the tabs in the bottom bar. */}
            <Typography sx={{ display: { xs: "block", md: "none" }, flex: 1, minWidth: 0, fontFamily: fontDisplay, fontSize: "0.8rem", letterSpacing: "0.04em", textTransform: "uppercase" }} noWrap>
              {(tabs.find((t) => t.value === section) || {}).label || ""}
            </Typography>
            <Tabs
              value={current}
              onChange={(_, v) => navigate(v)}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Sections"
              sx={{
                display: { xs: "none", md: "flex" },
                flex: 1, minHeight: BAR_H, alignSelf: "stretch",
                "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0", bgcolor: colors.hot },
              }}
            >
              {tabs.map((t) => (
                <Tab
                  key={t.value}
                  value={t.value}
                  label={tabLabel(t)}
                  aria-label={tabAria(t)}
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
                aria-label={`Your account (${myName})`}
                sx={{ fontWeight: 700, maxWidth: { xs: 130, sm: "none" } }}
              />
            ) : ready ? (
              <Button size="small" variant="outlined" onClick={() => navigate("/account")} sx={{ whiteSpace: "nowrap" }}>Sign in</Button>
            ) : null}
          </Toolbar>
        </Container>
      </AppBar>

      <Box component="main" sx={{ flex: 1, py: 3, pb: { xs: 11, md: 3 } }}>
        <Outlet />
      </Box>

      <Box component="footer" sx={{ borderTop: `1px solid ${colors.line}`, bgcolor: colors.bg2, py: 3.5, mb: { xs: "64px", md: 0 } }}>
        <Container maxWidth="lg" sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box component="img" src={LOGO_SRC} alt="" sx={{ height: 48, width: "auto", display: "block" }} />
            <div>
              <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.85rem", letterSpacing: "0.03em", textTransform: "uppercase" }}>{league.name}</Typography>
              {league.season && <Typography variant="body2" sx={{ color: colors.muted }}>{league.season}</Typography>}
            </div>
          </Stack>
          <Typography
            component={RouterLink}
            to="/account"
            variant="body2"
            sx={{ color: colors.cool, textDecoration: "none", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}
          >
            {user ? "Your account" : "Sign in or create an account"}
          </Typography>
        </Container>
      </Box>

      {/* Phones: a bottom tab bar instead of a row of tabs that doesn't fit. */}
      <Paper
        component="nav" aria-label="Sections" elevation={0}
        sx={{ display: { xs: "block", md: "none" }, position: "fixed", left: 0, right: 0, bottom: 0, zIndex: (t) => t.zIndex.appBar, borderTop: `1px solid ${colors.line}`, borderRadius: 0, pb: "env(safe-area-inset-bottom)" }}
      >
        <BottomNavigation
          showLabels
          value={moreActive ? "more" : current || ""}
          onChange={(e, v) => { if (v === "more") setMoreAt(e.currentTarget); else navigate(v); }}
          sx={{
            bgcolor: "rgba(7,10,31,.96)", height: 64,
            "& .MuiBottomNavigationAction-root": { color: colors.muted, minWidth: 0, px: 0.25 },
            "& .MuiBottomNavigationAction-root.Mui-selected": { color: colors.ink },
            // Same label size selected or not, so a label never wraps.
            "& .MuiBottomNavigationAction-label, & .MuiBottomNavigationAction-label.Mui-selected": { fontSize: "0.7rem", whiteSpace: "nowrap", fontWeight: 600 },
          }}
        >
          {tabs.slice(0, PRIMARY).map((t) => (
            <BottomNavigationAction key={t.value} value={t.value} label={t.label} aria-label={tabAria(t)}
              icon={t.value === "/join" && live ? <Badge color="error" variant="dot">{t.icon}</Badge> : t.icon} />
          ))}
          <BottomNavigationAction value="more" label="More" aria-label={unclaimed ? `More: unclaimed (${unclaimed}), playoffs, rules` : "More: unclaimed, playoffs, rules"} aria-haspopup="menu"
            icon={<Badge color="warning" variant="dot" invisible={!unclaimed}><MoreHorizIcon /></Badge>} />
        </BottomNavigation>
      </Paper>
      <Menu anchorEl={moreAt} open={!!moreAt} onClose={() => setMoreAt(null)} anchorOrigin={{ vertical: "top", horizontal: "right" }} transformOrigin={{ vertical: "bottom", horizontal: "right" }}>
        {more.map((t) => (
          <MenuItem key={t.value} selected={section === t.value} onClick={() => { setMoreAt(null); navigate(t.value); }}>
            <ListItemIcon>{t.icon}</ListItemIcon>
            {t.label}{t.value === "/unclaimed" && unclaimed ? ` (${unclaimed})` : ""}
          </MenuItem>
        ))}
        {user && (
          <MenuItem onClick={() => { setMoreAt(null); navigate("/add"); }}>
            <ListItemIcon><AddCircleOutlineIcon /></ListItemIcon>{isAdmin ? "Add results" : "Submit results"}
          </MenuItem>
        )}
        <MenuItem selected={section === "/account"} onClick={() => { setMoreAt(null); navigate("/account"); }}>
          <ListItemIcon><PersonOutlineIcon /></ListItemIcon>{user ? "Your account" : "Sign in"}
        </MenuItem>
      </Menu>
    </Box>
  );
}
