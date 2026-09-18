import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  envPrefix: ["VITE_", "SUPABASE_"],
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: { charts: ["recharts"] },
      },
    },
  },
  server: { host: "0.0.0.0", port: 4173, allowedHosts: ["terminal.local"] },
});
