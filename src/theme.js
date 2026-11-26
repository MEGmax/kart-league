import { createTheme } from "@mui/material/styles";

// The design system: see DESIGN.md. One flat navy page, two typefaces, and colour only where it means
// something. One dark theme on purpose, no light mode.
export const colors = {
  bg: "#0D1238", // the one page background
  raised: "#161C4A", // things that float over the page: drawer, dialogs, menus, inputs, podium steps
  hover: "#121848", // a hovered row
  line: "#2A3270", // hairline between rows and list items
  rule: "#4A5390", // the heavier rule under a table header; outlined buttons
  ink: "#F4F5FB",
  muted: "#B3BADD", // secondary text, 14px and up
  gold: "#FFD23F", // the leader / 1st place, and the primary action
  goldInk: "#1A1300",
  red: "#FF5247", // the playoff line; errors
  good: "#3DDC84", // a rating that went up; success
  bad: "#FF6B72", // a rating that went down
  link: "#7FD8FF",
  silver: "#C9D2E8", // the podium only
  bronze: "#E58F4E", // the podium only
  navy: "#1E2571", // logo navy: the hero band
  brandRed: "#DC251D", // logo red: the brand stripe
};

// The logo's split (navy | white | red) as a thin trim: top of the header, bottom of the hero.
export const brandStripe = `linear-gradient(90deg, ${colors.navy} 0 49.6%, #fff 49.6% 50.4%, ${colors.brandRed} 50.4% 100%)`;

// Rubik Mono One for the wordmark and page titles only; Barlow (tabular figures) for everything else.
export const fontDisplay = '"Rubik Mono One","Arial Black",Impact,sans-serif';
const fontBody = '"Barlow",system-ui,-apple-system,"Segoe UI",sans-serif';

// Colours a player can pick for their profile (stored; not drawn around the site).
export const PLAYER_COLORS = [
  "#E5484D", "#0090FF", "#30A46C", "#F76B15", "#8E4EC6", "#E93D82",
  "#12A594", "#D9A400", "#6E56CF", "#A18072", "#3E63DD", "#7C8A2E",
];

const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: colors.bg, paper: colors.raised },
    text: { primary: colors.ink, secondary: colors.muted },
    primary: { main: colors.gold, contrastText: colors.goldInk },
    secondary: { main: colors.link },
    error: { main: colors.red },
    success: { main: colors.good },
    divider: colors.line,
    action: { hover: colors.hover },
  },
  typography: {
    fontFamily: fontBody,
    fontSize: 15,
    h1: { fontFamily: fontDisplay, fontWeight: 400 },
    h2: { fontFamily: fontDisplay, fontWeight: 400 },
    h3: { fontFamily: fontDisplay, fontWeight: 400 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700, fontSize: "1.25rem" },
    body1: { fontSize: "1rem" },
    body2: { fontSize: "0.9375rem" },
    caption: { fontSize: "0.875rem" },
    overline: { fontSize: "0.875rem", fontWeight: 600, letterSpacing: 0, textTransform: "none" },
    button: { fontFamily: fontBody, fontWeight: 700, textTransform: "none", fontSize: "0.9375rem" },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // No browser pull-to-refresh or rubber band at the top: the site's own pull to refresh
        // (components/PullToRefresh.jsx) reloads the data in place instead.
        html: { overscrollBehaviorY: "none" },
        body: { overscrollBehaviorY: "none", backgroundColor: colors.bg, fontVariantNumeric: "tabular-nums" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: { backgroundColor: "transparent", borderColor: colors.line },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, minHeight: 40 },
        sizeSmall: { minHeight: 36 },
        containedPrimary: { "&:hover": { backgroundColor: "#FFDD66" } },
        outlined: { borderColor: colors.rule },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600, borderRadius: 6 } },
    },
    MuiAppBar: {
      styleOverrides: { root: { backgroundColor: colors.bg, backgroundImage: "none" } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: colors.line, fontSize: "0.9375rem" },
        head: { color: colors.muted, fontSize: "0.875rem", fontWeight: 600, borderBottom: `2px solid ${colors.rule}` },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: colors.raised },
        notchedOutline: { borderColor: colors.rule },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 8, fontSize: "0.9375rem" } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 12, border: `1px solid ${colors.line}` } },
    },
    MuiMenu: {
      styleOverrides: { paper: { border: `1px solid ${colors.line}` } },
    },
    MuiDrawer: {
      styleOverrides: { paper: { backgroundColor: colors.bg, borderLeft: `1px solid ${colors.line}` } },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: colors.raised, border: `1px solid ${colors.rule}`, fontSize: "0.875rem", color: colors.ink } },
    },
    MuiToggleButton: {
      styleOverrides: { root: { textTransform: "none", fontWeight: 600, minHeight: 40 } },
    },
  },
});

export default theme;
