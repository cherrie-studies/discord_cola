import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  target: "es2022",
  platform: "node",
  noExternal: [/@marswave/],
  external: ["discord.js"],
});
