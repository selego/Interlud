import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  server: {
    open: true,
    port: 3000,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
  },

  // Si tu as encore des libs qui accèdent à process.env côté client, garde ça.
  // Sinon tu peux supprimer 'define'.
  define: {
    process: { env: {} },
  },

  // Plus besoin du bloc esbuild custom : Vite gère TS/TSX nativement.
  build: {
    minify: false,
    outDir: "build",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  plugins: [react(), tsconfigPaths()],
});
