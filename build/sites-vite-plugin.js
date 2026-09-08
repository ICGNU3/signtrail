import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export function sitesArtifacts() {
  return {
    name: "signtrail-sites-artifacts",
    apply: "build",
    async closeBundle() {
      const dist = resolve("dist");
      await mkdir(resolve(dist, ".openai"), { recursive: true });
      await cp(resolve(".openai", "hosting.json"), resolve(dist, ".openai", "hosting.json"));
      await cp(resolve("drizzle"), resolve(dist, "drizzle"), { recursive: true });
    }
  };
}
