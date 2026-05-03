import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health":   "http://localhost:5180",
      "/settings": "http://localhost:5180",
      "/models":   "http://localhost:5180",
      "/prompts":  "http://localhost:5180",
      "/books":    "http://localhost:5180",
      "/system":   "http://localhost:5180",
      "/events":   { target: "http://localhost:5180", changeOrigin: true, ws: false },
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
} as any);
