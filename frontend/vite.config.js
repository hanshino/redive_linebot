import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    allowedHosts: ["host.docker.internal", ".ngrok-free.app"],
    proxy: {
      "/api": {
        target: "http://localhost:9527",
        changeOrigin: true,
      },
      "/webhooks": {
        target: "http://localhost:9527",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:9527",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
