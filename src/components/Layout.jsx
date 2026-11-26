import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, Link as RouterLink } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Button from "@mui/material/Button";
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
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import PullToRefresh from "./PullToRefresh";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { liveCups } from "../lib/standings";
import { useUnclaimed } from "../lib/unclaimed";
import ProfileAvatar from "./ProfileAvatar";
import { LOGO_SRC } from "../lib/constants";
import { usePageTitle } from "../lib/pageMeta";
import { colors, brandStripe, fontDisplay } from "../theme";

const TABS = [
  { value: "/standings", label: "Home", icon: <HomeOutlinedIcon /> },
  { value: "/schedule", label: "Schedule", icon: <EventOutlinedIcon /> },
  { value: "/join", label: "Join", icon: <SportsScoreOutlinedIcon /> },
  { value: "/stats", label: "Stats", icon: <InsightsOutlinedIcon /> },
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
  // Results nobody has claimed that might be yours: the badge on your profile picture.
  const { waiting } = useUnclaimed();
  const section = sectionOf(location.pathname);
  const tabs = isAdmin ? TABS.concat({ value: "/admin", label: "Admin", icon: <AdminPanelSettingsOutlinedIcon /> }) : TABS;
  // Pages that aren't tabs (Account, Add, Build…) select no tab at all.
  const current = tabs.some((t) => t.value === section) ? section : false;
  const league = state ? state.league : { name: "Night Kart League", season: "" };
  usePageTitle(location.pathname, league.name);

  // A new page starts at the top. Opening or closing a racer's drawer (/standings ⇄ /standings/x) doesn't.
  const lastSection = useRef(section);
  useEffect(() => {
    if (lastSection.current !== section) window.scrollTo(0, 0);
    lastSection.current = section;
  }, [location.pathname, section]);

  const tabLabel = (t) => {
    if (t.value === "/join" && live) return <Badge color="error" variant="dot"><span>{t.label}</span></Badge>;
    return t.label;
  };
  const tabAria = (t) => (t.value === "/join" && live ? "Join, a cup is being raced" : t.label);

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
              sx={{ display: "flex", flexShrink: 0, mr: { xs: 0.5, sm: 1.5 }, borderRadius: 1, "&:focus-visible": { outline: `2px solid ${colors.gold}`, outlineOffset: 2 } }}
            >
              <Box component="img" src={LOGO_SRC} alt="NKL" sx={{ height: 40, width: "auto", display: "block" }} />
            </Box>
            {/* Phones: the page name here, the tabs in the bottom bar. */}
            <Typography sx={{ display: { xs: "block", md: "none" }, flex: 1, minWidth: 0, fontFamily: fontDisplay, fontSize: "0.875rem" }} noWrap>
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
                "& .MuiTabs-indicator": { height: 2, bgcolor: colors.ink },
              }}
            >
              {tabs.map((t) => (
                <Tab
                  key={t.value}
                  value={t.value}
                  label={tabLabel(t)}
                  aria-label={tabAria(t)}
                  sx={{
                    minHeight: BAR_H, minWidth: 0, px: 1.5, fontWeight: 600,
                    fontSize: "0.9375rem", textTransform: "none", color: colors.muted,
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
              <Button
                color="inherit"
                onClick={() => navigate("/account")}
                aria-label={`Your account (${myName})${waiting ? `, ${waiting} unclaimed result${waiting === 1 ? "" : "s"} might be yours` : ""}`}
                aria-current={location.pathname === "/account" ? "page" : undefined}
                sx={{ minWidth: 0, minHeight: 48, px: { xs: 0.5, sm: 1 }, gap: 1, borderRadius: 99, maxWidth: { xs: 64, sm: 240 } }}
              >
                <ProfileAvatar name={myName} src={profile && profile.avatarUrl} size={36} badge={waiting} />
                <Box component="span" sx={{ display: { xs: "none", sm: "block" }, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{myName}</Box>
              </Button>
            ) : ready ? (
              <Button size="small" variant="outlined" color="inherit" onClick={() => navigate("/account")} sx={{ whiteSpace: "nowrap", minHeight: 40, borderColor: colors.rule }}>Sign in</Button>
            ) : null}
          </Toolbar>
        </Container>
      </AppBar>

      <PullToRefresh top={59} />

      <Box component="main" sx={{ flex: 1, py: 3, pb: { xs: 11, md: 3 } }}>
        <Outlet />
      </Box>

      <Box component="footer" sx={{ borderTop: `1px solid ${colors.line}`, py: 3, mt: 3, mb: { xs: "64px", md: 0 } }}>
        <Container maxWidth="lg" sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box component="img" src={LOGO_SRC} alt="" sx={{ height: 40, width: "auto", display: "block" }} />
            <div>
              <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.875rem" }}>{league.name}</Typography>
              {league.season && <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>{league.season}</Typography>}
            </div>
          </Stack>
          <Typography
            component={RouterLink}
            to="/account"
            sx={{ color: colors.link, fontWeight: 600, py: 1.25 }}
          >
            {user ? "Your account" : "Sign in or create an account"}
          </Typography>
        </Container>
      </Box>

      {/* Phones: a bottom tab bar instead of a row of tabs that doesn't fit. */}
      <Paper
        component="nav" aria-label="Sections" elevation={0}
        sx={{ display: { xs: "block", md: "none" }, position: "fixed", left: 0, right: 0, bottom: 0, zIndex: (t) => t.zIndex.appBar, bgcolor: colors.bg, borderTop: `1px solid ${colors.line}`, borderRadius: 0, pb: "env(safe-area-inset-bottom)" }}
      >
        <BottomNavigation
          showLabels
          value={moreActive ? "more" : current || ""}
          onChange={(e, v) => { if (v === "more") setMoreAt(e.currentTarget); else navigate(v); }}
          sx={{
            bgcolor: colors.bg, height: 64,
            "& .MuiBottomNavigationAction-root": { color: colors.muted, minWidth: 0, px: 0.25, borderTop: "2px solid transparent", mt: "-1px" },
            "& .MuiBottomNavigationAction-root.Mui-selected": { color: colors.ink, borderTopColor: colors.ink },
            // Same label size selected or not, so a label never wraps.
            "& .MuiBottomNavigationAction-label, & .MuiBottomNavigationAction-label.Mui-selected": { fontSize: "0.75rem", whiteSpace: "nowrap", fontWeight: 600 },
          }}
        >
          {tabs.slice(0, PRIMARY).map((t) => (
            <BottomNavigationAction key={t.value} value={t.value} label={t.label} aria-label={tabAria(t)}
              icon={t.value === "/join" && live ? <Badge color="error" variant="dot">{t.icon}</Badge> : t.icon} />
          ))}
          <BottomNavigationAction value="more" label="More" aria-label="More: playoffs, rules and your account" aria-haspopup="menu"
            icon={<MoreHorizIcon />} />
        </BottomNavigation>
      </Paper>
      <Menu anchorEl={moreAt} open={!!moreAt} onClose={() => setMoreAt(null)} anchorOrigin={{ vertical: "top", horizontal: "right" }} transformOrigin={{ vertical: "bottom", horizontal: "right" }}>
        {more.map((t) => (
          <MenuItem key={t.value} selected={section === t.value} onClick={() => { setMoreAt(null); navigate(t.value); }}>
            <ListItemIcon>{t.icon}</ListItemIcon>
            {t.label}
          </MenuItem>
        ))}
        {user && (
          <MenuItem onClick={() => { setMoreAt(null); navigate("/add"); }}>
            <ListItemIcon><AddCircleOutlineIcon /></ListItemIcon>{isAdmin ? "Add results" : "Submit results"}
          </MenuItem>
        )}
        <MenuItem selected={section === "/account"} onClick={() => { setMoreAt(null); navigate("/account"); }}>
          <ListItemIcon><PersonOutlineIcon /></ListItemIcon>{user ? "Your account" : "Sign in"}{waiting ? ` (${waiting} to check)` : ""}
        </MenuItem>
      </Menu>
    </Box>
  );
}
