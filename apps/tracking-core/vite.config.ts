import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Sirve assets estáticos (p.ej. owner-demo-data.json) sin usar public/ (que
  // contiene un index.html que no debe pisar el build).
  publicDir: "static",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Dashboard de dueños (SPA principal).
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        // Página de recepción (cierre diario) — entry React independiente y ligero.
        cierre: fileURLToPath(new URL("./cierre.html", import.meta.url)),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
