import {
  defineChannel,
  type GatewayContext,
  type OutboundContext,
  type DeliverPayload,
  type ChannelStatusResult,
} from "@marswave/cola-plugin-sdk";
import {
  Client,
  GatewayIntentBits,
  Events,
  TextChannel,
  Message,
} from "discord.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── Types ─────────────────────────────────────────────────────────────────
interface DiscordConfig {
  token: string;
  allowedChannelIds: string[];
}

interface PluginState {
  client: Client;
  allowedIds: Set<string>;
}

// ── Module-level Discord client (shared between gateway & outbound) ──────
let gatewayClient: Client | null = null;

// ── Config persistence (wechat pattern) ───────────────────────────────────
let pluginDir = "";

function setPluginDir(dir: string) {
  pluginDir = dir;
}

function getConfigPath(): string {
  return path.join(pluginDir, "config.json");
}

function readConfig(): DiscordConfig {
  try {
    if (!fs.existsSync(getConfigPath())) return { token: "", allowedChannelIds: [] };
    return JSON.parse(fs.readFileSync(getConfigPath(), "utf-8")) as DiscordConfig;
  } catch {
    return { token: "", allowedChannelIds: [] };
  }
}

function writeConfig(cfg: DiscordConfig): void {
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), "utf-8");
}

// ── Helpers ───────────────────────────────────────────────────────────────
function parseChannelIds(raw: string | string[]): Set<string> {
  if (!raw) return new Set();
  if (Array.isArray(raw)) return new Set(raw.filter(Boolean));
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function attachUrls(msg: Message): string[] {
  return msg.attachments.map((a) => a.url);
}

// ── Plugin ────────────────────────────────────────────────────────────────
export default defineChannel<PluginState>({
  id: "discord",

  meta: {
    label: "Discord",
    description:
      "Bridge Discord channels to ColaOS. Push-based via Discord WebSocket — no polling, no cron, zero idle cost.",
  },

  capabilities: {
    receive: { text: true },
    send: { text: true },
  },

  // No config.schema — self-managed like wechat plugin

  sessionBinding: "shared-primary",

  gateway: {
    async start(ctx: GatewayContext<PluginState>) {
      setPluginDir(
        ctx.config.pluginDir ||
          path.join(os.homedir(), ".cola", "channels", "discord"),
      );

      const cfg = readConfig();
      if (!cfg.token) {
        ctx.logger.error("Discord token not configured. Create config.json in pluginDir.");
        return;
      }

      const allowedIds = parseChannelIds(cfg.allowedChannelIds as any);

      const client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      });

      client.on(Events.ClientReady, () => {
        ctx.logger.info(
          `Discord connected as ${client.user?.tag} (${client.user?.id})`,
        );
        if (cfg.allowedChannelIds.length > 0) {
          ctx.logger.info(`Listening on channels: ${cfg.allowedChannelIds.join(", ")}`);
        }
      });

      client.on(Events.MessageCreate, async (message: Message) => {
        if (message.author.bot) return;
        if (allowedIds.size > 0 && !allowedIds.has(message.channel.id)) return;

        const guildName = message.guild?.name ?? "DM";
        const channelName =
          (message.channel as TextChannel).name ?? message.channel.id;

        const convKind = message.guild ? ("channel" as const) : ("direct" as const);

        const payload: DeliverPayload = {
          // Use "user" prefix to bind to the user's identity scope
          sessionId: ["user", "discord", message.author.id],
          sender: {
            id: message.author.id,
            name: message.author.displayName,
            handle: message.author.username,
            avatarUrl: message.author.displayAvatarURL(),
          },
          message: message.content || "",
          attachments: attachUrls(message),
          deliveryContext: {
            to: message.channel.id,
            messageId: message.id,
          },
          conversation: {
            kind: convKind,
            id: message.channel.id,
            name: `${channelName} · ${guildName}`,
          },
        };

        // Auto-bind Discord user to Cola identity (like wechat QR login does)
        // This tells Cola this sender is a "primary" user and should trigger responses.
        try {
          await ctx.runtime.identity.bind(message.author.id);
        } catch {
          // Already bound or not needed
        }

        await ctx.deliver(payload);

        const preview = (message.content || "<attachment>").slice(0, 80);
        ctx.logger.info(`← ${message.author.displayName}: ${preview}`);

        // ── Queue for keyboard injection ───────────────────────────
        // Write to pending.jsonl → discord_trigger.mjs reads it →
        // activates Cola window → pastes message → Enter → agent processes
        try {
          const fs = await import("node:fs");
          const path = await import("node:path");
          const os = await import("node:os");
          const triggerFile = path.join(os.homedir(), ".cola", "channels", "discord", "pending.jsonl");
          fs.mkdirSync(path.dirname(triggerFile), { recursive: true });
          fs.appendFileSync(triggerFile, JSON.stringify({
            author: message.author.displayName,
            authorId: message.author.id,
            content: message.content,
            channelId: message.channel.id,
            timestamp: new Date().toISOString(),
          }) + "\n", "utf-8");
          ctx.logger.info(`Queued for trigger injection`);
        } catch (err: any) {
          ctx.logger.error(`Failed to queue trigger: ${err.message}`);
        }
      });

      client.on(Events.Error, (err) => {
        ctx.logger.error(`Discord client error: ${err.message}`);
      });

      await client.login(cfg.token);
      // Set online presence so the green dot shows
      client.user?.setPresence({
        status: "online",
        activities: [{ name: "for your messages", type: 3 }], // Watching
      });
      ctx.state = { client, allowedIds };
      gatewayClient = client;
    },

    async stop(ctx: GatewayContext<PluginState>) {
      ctx.state?.client?.destroy();
      gatewayClient = null;
    },

    getStatus(ctx: GatewayContext<PluginState>): ChannelStatusResult {
      setPluginDir(
        ctx.config.pluginDir ||
          path.join(os.homedir(), ".cola", "channels", "discord"),
      );
      const cfg = readConfig();
      const client = ctx.state?.client;
      return {
        connected: client?.isReady() ?? false,
        configured: Boolean(cfg.token),
        message: client?.isReady()
          ? `Connected as ${client.user?.tag}`
          : cfg.token
            ? "Config found but not connected"
            : "No Discord token configured",
      };
    },

    async reload(ctx: GatewayContext<PluginState>) {
      ctx.logger.info("Discord gateway reload triggered");
    },
  },

  outbound: {
    textChunkLimit: 2000,

    async sendTyping(ctx: OutboundContext & { active: boolean }) {
      if (!gatewayClient?.isReady() || !ctx.active) return;
      const channelId = ctx.deliveryContext.to;
      if (!channelId) return;
      try {
        const channel = (await gatewayClient.channels.fetch(channelId)) as TextChannel;
        if (channel) await channel.sendTyping();
      } catch {
        // Typing indicator is best-effort
      }
    },

    async sendText(ctx: OutboundContext) {
      // Reuse the gateway's existing Discord client — creating a second one
      // with the same token would be rejected by Discord.
      const dClient = gatewayClient;
      if (!dClient || !dClient.isReady()) {
        ctx.logger.error("Outbound: Discord client not connected");
        return;
      }

      const channelId = ctx.deliveryContext.to;
      const replyToId = ctx.deliveryContext.messageId;
      if (!channelId) {
        ctx.logger.error("Outbound missing channelId in deliveryContext.to");
        return;
      }

      try {
        const channel = (await dClient.channels.fetch(channelId)) as TextChannel;
        if (!channel) {
          ctx.logger.error(`Channel ${channelId} not found`);
          return;
        }

        const sendOpts: any = { content: ctx.text.slice(0, 2000) };

        if (replyToId) {
          try {
            const refMsg = await channel.messages.fetch(replyToId);
            sendOpts.reply = { messageReference: refMsg };
          } catch {
            // Reply not found, send without threading
          }
        }

        await channel.send(sendOpts);
        const preview = ctx.text.slice(0, 60);
        ctx.logger.info(`→ #${(channel as TextChannel).name}: ${preview}`);
      } catch (err: any) {
        ctx.logger.error(`Outbound send failed: ${err.message}`);
      }
    },
  },
});
