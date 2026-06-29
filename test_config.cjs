/**
 * test_plugin_config.js
 * 
 * Verifies all config files and paths used by the Discord plugin.
 * Run: node test_plugin_config.js
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

console.log("=== Discord Plugin Config Verification ===\n");

let allPassed = true;
function check(label, ok, detail) {
  const mark = ok ? "✅" : "❌";
  console.log(`  ${mark} ${label}${detail ? ": " + detail : ""}`);
  if (!ok) allPassed = false;
}

// ── 1. Plugin directory structure ─────────────────────────────────────────
console.log("1. Plugin installation");
const pluginDir = path.join(os.homedir(), ".cola", "plugins", "discord");
check("Plugin dir exists", fs.existsSync(pluginDir), pluginDir);

const pkgPath = path.join(pluginDir, "package.json");
const pkgExists = fs.existsSync(pkgPath);
check("package.json exists", pkgExists, pkgPath);

let pkg = null;
if (pkgExists) {
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    check("package.json valid JSON", true);
    check("  type: module", pkg.type === "module", pkg.type);
    check("  cola.plugin.id", pkg.cola?.plugin?.id === "discord", pkg.cola?.plugin?.id);
    check("  cola.plugin.entry", !!pkg.cola?.plugin?.entry, pkg.cola?.plugin?.entry);
    check("  cola.channel.name", !!pkg.cola?.channel?.name, pkg.cola?.channel?.name);
  } catch (e) {
    check("package.json parse", false, e.message);
  }
}

const distPath = path.join(pluginDir, "dist", "index.js");
check("dist/index.js exists", fs.existsSync(distPath), distPath);
if (fs.existsSync(distPath)) {
  const stats = fs.statSync(distPath);
  check("  > 1 KB (bundled)", stats.size > 1024, `${(stats.size / 1024).toFixed(1)} KB`);
}

const nodeModulesPath = path.join(pluginDir, "node_modules", "discord.js");
check("node_modules/discord.js exists", fs.existsSync(nodeModulesPath), nodeModulesPath);
const sdkPath = path.join(pluginDir, "node_modules", "@marswave", "cola-plugin-sdk");
check("node_modules/@marswave/cola-plugin-sdk exists", fs.existsSync(sdkPath), sdkPath);

// ── 2. Config files ───────────────────────────────────────────────────────
console.log("\n2. Config files");
const configLocations = [
  path.join(pluginDir, "config.json"),
  path.join(os.homedir(), ".cola", "channels", "discord", "config.json"),
];

let foundConfig = false;
for (const loc of configLocations) {
  if (fs.existsSync(loc)) {
    foundConfig = true;
    try {
      const cfg = JSON.parse(fs.readFileSync(loc, "utf-8"));
      check(`Config at ${loc.replace(os.homedir(), "~")}`, true);
      check("  token present", !!cfg.token && cfg.token.length > 10, cfg.token?.slice(0, 12) + "...");
      check("  allowedChannelIds", Array.isArray(cfg.allowedChannelIds), JSON.stringify(cfg.allowedChannelIds));
    } catch (e) {
      check(`Config parse at ${loc}`, false, e.message);
    }
    break;
  }
}
if (!foundConfig) {
  check("Config file found (any location)", false);
}

// ── 3. Plugin bundle integrity ────────────────────────────────────────────
console.log("\n3. Bundle integrity");
if (fs.existsSync(distPath)) {
  try {
    const content = fs.readFileSync(distPath, "utf-8");
    check("Contains defineChannel", content.includes("defineChannel"));
    check("Contains discord.js", content.includes("discord.js") || content.includes("discord_api"));
    check("No raw @marswave import", !content.includes('from "@marswave/cola-plugin-sdk"'));
    check("No ERR_MODULE_NOT_FOUND triggers", !content.includes("ERR_MODULE_NOT_FOUND"));
  } catch (e) {
    check("Bundle read", false, e.message);
  }
}

// ── 4. Node.js environment ────────────────────────────────────────────────
console.log("\n4. Runtime environment");
check("Node.js version", true, process.version);
check("Platform", true, `${process.platform} ${process.arch}`);

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${allPassed ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}`);
process.exit(allPassed ? 0 : 1);
