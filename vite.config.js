import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://MEGmax.github.io/kart-league/ until a custom domain is set up.
// Pages are split by route with React.lazy (see App.jsx). Don't hand-split libraries with manualChunks:
// putting MUI, React and their shared helpers in separate chunks made a circular chunk import that
// crashed the production build ("Cannot access 'J' before initialization").
export default defineConfig({
  base: "/kart-league/",
  plugins: [react()],
});
