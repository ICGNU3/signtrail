import { defineConfig } from "vite";
import vinext from "vinext/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { sitesArtifacts } from "./build/sites-vite-plugin.js";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      configPath: "./wrangler.jsonc"
    }),
    sitesArtifacts()
  ]
});
