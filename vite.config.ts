import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { pathAliases } from "./aliases.ts";

export default defineConfig({
  define: {
    "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(
      process.env.WORKERS_CI_COMMIT_SHA ?? process.env.VITE_COMMIT_SHA ?? "",
    ),
  },
  plugins: [cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: pathAliases,
  },
});
