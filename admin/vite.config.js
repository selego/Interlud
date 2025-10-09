import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    open: true,
    port: 3001,
  },
  preview: {
    host: "0.0.0.0",
    port: 3001,
  },
  define: {
    process: { env: {} },
  },

  build: {
    outDir: "build",
  },
  esbuild: {
    loader: "jsx",
    include: ["src/**/*.jsx", "src/**/*.js"],
    exclude: ["node_modules", "build"],
  },
  plugins: [react()],
});
