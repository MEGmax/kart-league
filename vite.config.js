import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://MEGmax.github.io/kart-league/ until a custom domain is set up.
// Pages are split by route (see App.jsx); the libraries every page needs get their own chunks, so a
// site update doesn't make returning visitors download MUI or Supabase again.
export default defineConfig({
  base: "/kart-league/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@mui/icons-material")) return "mui-icons";
          if (id.includes("@mui") || id.includes("@emotion")) return "mui";
          if (id.includes("react-router") || id.includes("/react-dom/") || id.includes("/react/") || id.includes("scheduler")) return "react";
          return "vendor";
        },
      },
    },
  },
});
