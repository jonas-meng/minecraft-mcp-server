import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  registerPositionTools, 
  registerInventoryTools, 
  registerBlockTools, 
  registerEntityTools, 
  registerChatTools, 
  registerFlightTools, 
  registerGameStateTools 
} from './implementations.js';

export function createMcpServer(bot: any) {
  const server = new McpServer({
    name: "minecraft-bot",
    version: "1.0.0",
  });

  // Register all tool categories
  registerPositionTools(server, bot);
  registerInventoryTools(server, bot);
  registerBlockTools(server, bot);
  registerEntityTools(server, bot);
  registerChatTools(server, bot);
  registerFlightTools(server, bot);
  registerGameStateTools(server, bot);

  return server;
}