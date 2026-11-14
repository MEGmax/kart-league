import { createTheme } from "@mui/material/styles";

// Palette lifted from the previous styles.css so the React rebuild keeps the
// same night-race arcade look: one dark theme on purpose, no light mode.
export const colors = {
  bg: "#0B0E1F",
  bg2: "#10142A",
  panel: "#151A33",
  panel2: "#1C2242",
  line: "#2A3260",
  ink: "#F4F6FF",
  muted: "#9AA3C7",
  accent: "#FFD23F",
  accentInk: "#1A1300",
  hot: "#FF3B48",
  cool: "#2EC4FF",
  gold: "#FFD23F",
  silver: "#C9D2E8",
  bronze: "#E58F4E",
  good: "#3DDC84",
  bad: "#FF5A64",
};

export const fontDisplay = '"Rubik Mono One","Arial Black",Impact,sans-serif';
export const fontBody = '"Space Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif';
export const fontData = '"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace';

// Player/track accent colors, used around the board and podium.
export const PLAYER_COLORS = [
  "#E5484D", "#0090FF", "#30A46C", "#F76B15", "#8E4EC6", "#E93D82",
  "#12A594", "#D9A400", "#6E56CF", "#A18072", "#3E63DD", "#7C8A2E",
];

const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: colors.bg, paper: colors.panel },
    text: { primary: colors.ink, secondary: colors.muted },
    primary: { main: colors.accent, contrastText: colors.accentInk },
    secondary: { main: colors.cool },
    error: { main: colors.bad },
    success: { main: colors.good },
    divider: colors.line,
  },
  typography: {
    fontFamily: fontBody,
    h1: { fontFamily: fontDisplay, fontWeight: 400, textTransform: "uppercase" },
    h2: { fontFamily: fontDisplay, fontWeight: 400, textTransform: "uppercase" },
    h3: { fontFamily: fontDisplay, fontWeight: 400, textTransform: "uppercase" },
    button: { fontFamily: fontBody, fontWeight: 700, textTransform: "none" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", border: `1px solid ${colors.line}` },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: "rgba(11,14,31,.94)", backdropFilter: "blur(8px)" },
      },
    },
  },
});

export default theme;
