/**
 * test_discord_pipeline.js
 * 
 * Standalone pipeline test — verifies every stage of the Discord→Cola bridge
 * WITHOUT needing Cola to be running.
 * 
 * Stages tested:
 *   1. Config loading from ~/.cola/channels/discord/config.json
 *   2. Discord client connect + presence (green dot)
 *   3. Channel discovery
 *   4. Message receive (prints inbound)
 *   5. Typing indicator
 *   6. Reply send (with threading)
 *   7. Clean shutdown
 * 
 * Usage: node test_discord_pipeline.js
 * Then send a message in #cola-on-discord and watch this terminal.
 * Type "quit" in this terminal to stop.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { Client, GatewayIntentBits, Events, TextChannel } = require("discord.js");

// ── Stage 1: Config loading ─────────────────────────────────────────────
console.log("=== STAGE 1: Config loading ===");

const configPaths = [
  "C:\\Users\\Cherrie\\.cola\\plugins\\discord\\config.json",
  "C:\\Users\\Cherrie\\.cola\\channels\\discord\\config.json",
];

let config = null;
for (const p of configPaths) {
  try {
    if (fs.existsSync(p)) {
      config = JSON.parse(fs.readFileSync(p, "utf-8"));
      console.log(`  ✅ Loaded from: ${p}`);
      break;
    }
  } catch (e) {
    console.log(`  ⚠️  Failed to read ${p}: ${e.message}`);
  }
}

if (!config) {
  console.error("  ❌ No config found. Check config.json locations.");
  process.exit(1);
}

if (!config.token) {
  console.error("  ❌ Config loaded but 'token' field is empty.");
  process.exit(1);
}

console.log(`  token: ${config.token.slice(0, 12)}...`);
console.log(`  channels: ${JSON.stringify(config.allowedChannelIds)}`);

// ── Stage 2: Discord connect ─────────────────────────────────────────────
console.log("\n=== STAGE 2: Discord connect ===");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Track test results
const results = {
  connected: false,
  presenceSet: false,
  channelsFound: [],
  messagesReceived: 0,
  repliesSent: 0,
  typingTested: false,
  errors: [],
};

client.once(Events.ClientReady, () => {
  results.connected = true;
  console.log(`  ✅ Connected as ${client.user.tag} (${client.user.id})`);

  // Stage 3: Presence
  console.log("\n=== STAGE 3: Presence ===");
  client.user.setPresence({
    status: "online",
    activities: [{ name: "pipeline test", type: 3 }], // Watching
  });
  results.presenceSet = true;
  console.log("  ✅ Presence set (green dot should appear)");

  // Stage 4: Channel discovery
  console.log("\n=== STAGE 4: Channel discovery ===");
  client.guilds.cache.forEach((guild) => {
    console.log(`  Guild: ${guild.name} (${guild.id})`);
    guild.channels.cache
      .filter((c) => c.type === 0) // TextChannel
      .forEach((ch) => {
        const inList = config.allowedChannelIds.includes(ch.id);
        results.channelsFound.push({
          name: ch.name,
          id: ch.id,
          allowed: inList,
        });
        console.log(`    ${inList ? "✅" : "  "} #${ch.name} (${ch.id})`);
      });
  });

  console.log(
    "\n  Send a message in #cola-on-discord to test Stages 5-6."
  );
  console.log('  Type "quit" and press Enter to exit.\n');
});

// ── Stage 5-6: Message receive + reply ───────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Check allowed channels
  if (
    config.allowedChannelIds.length > 0 &&
    !config.allowedChannelIds.includes(message.channel.id)
  ) {
    return;
  }

  results.messagesReceived++;
  const channel = message.channel;

  console.log(`\n=== STAGE 5: Message received (#${results.messagesReceived}) ===`);
  console.log(`  From: ${message.author.displayName} (${message.author.id})`);
  console.log(`  Channel: #${(channel).name}`);
  console.log(`  Content: "${message.content}"`);
  if (message.attachments.size > 0) {
    message.attachments.forEach((a) =>
      console.log(`  Attachment: ${a.name} (${a.size} bytes) ${a.url}`)
    );
  }

  // Stage 6: Typing + Reply
  console.log("\n=== STAGE 6: Typing + Reply ===");

  try {
    // Typing indicator
    await channel.sendTyping();
    results.typingTested = true;
    console.log("  ✅ Typing indicator sent");

    // Small delay to show typing...
    await new Promise((r) => setTimeout(r, 1000));

    // Send reply
    const reply = `[Test] Received: "${message.content.slice(0, 100)}" — pipeline working!`;

    let sendOpts = { content: reply };
    try {
      sendOpts.reply = { messageReference: message };
    } catch {
      // Fallback: send without reply threading
    }

    const sent = await channel.send(sendOpts);
    results.repliesSent++;
    console.log(`  ✅ Reply sent (id: ${sent.id})`);
    console.log(`  → "${reply}"`);
  } catch (err) {
    results.errors.push(`Reply failed: ${err.message}`);
    console.error(`  ❌ Reply failed: ${err.message}`);
  }
});

client.on(Events.Error, (err) => {
  results.errors.push(`Client error: ${err.message}`);
  console.error(`  ❌ Discord error: ${err.message}`);
});

// ── Login ─────────────────────────────────────────────────────────────────
client.login(config.token).catch((err) => {
  console.error(`  ❌ Login failed: ${err.message}`);
  process.exit(1);
});

// ── Interactive quit ──────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (line) => {
  if (line.trim().toLowerCase() === "quit") {
    console.log("\n=== RESULTS ===");
    console.log(`  Connected:       ${results.connected ? "✅" : "❌"}`);
    console.log(`  Presence set:    ${results.presenceSet ? "✅" : "❌"}`);
    console.log(`  Channels found:  ${results.channelsFound.length}`);
    console.log(`  Messages rx:     ${results.messagesReceived}`);
    console.log(`  Typing tested:   ${results.typingTested ? "✅" : "❌"}`);
    console.log(`  Replies sent:    ${results.repliesSent}`);
    console.log(`  Errors:          ${results.errors.length}`);
    results.errors.forEach((e) => console.log(`    - ${e}`));

    client.destroy();
    process.exit(0);
  }
});

// Timeout safety
setTimeout(() => {
  console.log("\n  (Waiting for messages. Type 'quit' to exit.)");
}, 2000);
