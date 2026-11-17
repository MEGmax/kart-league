import { createTheme } from "@mui/material/styles";

// NKL brand: the logo's navy and red split, on a deep navy night background.
// One dark theme on purpose, no light mode. Gold stays the action/highlight color
// (and 1st place); red is brand chrome, so it never reads as a destructive button.
export const colors = {
  bg: "#070A1F",
  bg2: "#0B0F2B",
  panel: "#10153A",
  panel2: "#171D4B",
  line: "#252D66",
  ink: "#F5F6FF",
  muted: "#A0A8CF",
  accent: "#FFD23F",
  accentInk: "#1A1300",
  navy: "#1E2571", // logo navy
  navyHi: "#3341B5", // logo navy, lifted so it shows on the dark background
  red: "#DC251D", // logo red
  hot: "#EF3B32", // logo red, lifted for text and thin lines on navy
  cool: "#2EC4FF",
  gold: "#FFD23F",
  silver: "#C9D2E8",
  bronze: "#E58F4E",
  good: "#3DDC84",
  bad: "#FF5A64",
};

// The logo's split (navy | white | red) as a thin trim: top of the header, bottom of the hero.
export const brandStripe = `linear-gradient(90deg, ${colors.navyHi} 0 49.6%, #fff 49.6% 50.4%, ${colors.red} 50.4% 100%)`;

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
    h4: { fontWeight: 800, letterSpacing: "-0.01em" },
    h5: { fontWeight: 800, letterSpacing: "-0.01em" },
    h6: { fontWeight: 700 },
    overline: { fontWeight: 700, letterSpacing: "0.12em" },
    button: { fontFamily: fontBody, fontWeight: 700, textTransform: "none" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.bg,
          // A faint navy glow top-left and red glow top-right, like the logo's two halves.
          backgroundImage:
            "radial-gradient(900px 520px at -10% -5%, rgba(51,65,181,.22), transparent 70%)," +
            "radial-gradient(900px 520px at 110% -5%, rgba(220,37,29,.10), transparent 70%)",
          backgroundRepeat: "no-repeat",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", border: `1px solid ${colors.line}` },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10 },
        containedPrimary: { "&:hover": { backgroundColor: "#FFDD66" } },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: "rgba(7,10,31,.92)", backdropFilter: "blur(10px)", backgroundImage: "none", border: 0 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: colors.line },
        head: { color: colors.muted, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 999, backgroundColor: colors.panel2 },
        bar: { borderRadius: 999 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: "rgba(7,10,31,.35)" },
        notchedOutline: { borderColor: colors.line },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16 } },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: colors.panel2, border: `1px solid ${colors.line}`, fontSize: "0.8rem" } },
    },
  },
});

export default theme;
