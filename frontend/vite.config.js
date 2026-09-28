import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.READALONG_API || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": API,
      "/ws": { target: API.replace("http", "ws"), ws: true },
    },
  },
});
