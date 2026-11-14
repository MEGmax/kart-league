import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { colors } from "../theme";

export default function ComingSoonPage({ title }) {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ fontFamily: "inherit", mb: 2 }}>{title}</Typography>
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <Typography sx={{ fontWeight: 700 }}>This page is being rebuilt in React.</Typography>
        <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5 }}>Check back soon — standings, account and navigation are live.</Typography>
      </Paper>
    </Container>
  );
}
