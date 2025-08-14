#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { pathfinder, Movements } = pathfinderPkg;
import minecraftData from 'minecraft-data';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createMcpServer } from './tools/registry.js';


// ========== Command Line Argument Parsing ==========

function parseCommandLineArgs() {
  return yargs(hideBin(process.argv))
    .option('host', {
      type: 'string',
      description: 'Minecraft server host',
      default: 'localhost'
    })
    .option('port', {
      type: 'number',
      description: 'Minecraft server port',
      default: 25565
    })
    .option('username', {
      type: 'string',
      description: 'Bot username',
      default: 'LLMBot'
    })
    .help()
    .alias('help', 'h')
    .parseSync();
}


// ========== Bot Setup ==========

function setupBot(argv: any) {
  // Configure bot options based on command line arguments
  const botOptions = {
    host: argv.host,
    port: argv.port,
    username: argv.username,
    plugins: { pathfinder },
  };

  // Log connection information
  console.error(`Connecting to Minecraft server at ${argv.host}:${argv.port} as ${argv.username}`);

  // Create a bot instance
  const bot = mineflayer.createBot(botOptions);

  // Set up the bot when it spawns
  bot.once('spawn', async () => {
    console.error('Bot has spawned in the world');

    // Set up pathfinder movements
    const mcData = minecraftData(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    bot.chat('Claude-powered bot ready to receive instructions!');
  });

  // Register common event handlers
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.error(`[CHAT] ${username}: ${message}`);
  });

  bot.on('kicked', (reason) => {
    console.error(`Bot was kicked: ${reason}`);
  });

  bot.on('error', (err) => {
    console.error(`Bot error: ${err.message}`);
  });

  return bot;
}

// ========== Main Application ==========

async function main() {
  let bot: mineflayer.Bot | undefined;

  try {
    // Parse command line arguments
    const argv = parseCommandLineArgs();

    // Set up the Minecraft bot
    bot = setupBot(argv);

    // Create and configure MCP server
    const server = createMcpServer(bot);

    // Handle stdin end - this will detect when Claude Desktop is closed
    process.stdin.on('end', () => {
      console.error("Claude has disconnected. Shutting down...");
      if (bot) {
        bot.quit();
      }
      process.exit(0);
    });

    // Connect to the transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Minecraft MCP Server running on stdio");
  } catch (error) {
    console.error("Failed to start server:", error);
    if (bot) bot.quit();
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});