import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://MEGmax.github.io/kart-league/ until a custom domain is set up.
export default defineConfig({
  base: "/kart-league/",
  plugins: [react()],
});
