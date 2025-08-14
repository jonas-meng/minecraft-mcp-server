import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import { Vec3 } from 'vec3';

// ========== Type Definitions ==========

type TextContent = {
  type: "text";
  text: string;
};

type ContentItem = TextContent;

type McpResponse = {
  content: ContentItem[];
  _meta?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
};

// ========== Response Helpers ==========

function createResponse(text: string): McpResponse {
  return {
    content: [{ type: "text", text }]
  };
}

function createErrorResponse(error: Error | string): McpResponse {
  const errorMessage = typeof error === 'string' ? error : error.message;
  console.error(`Error: ${errorMessage}`);
  return {
    content: [{ type: "text", text: `Failed: ${errorMessage}` }],
    isError: true
  };
}

// ========== Building Helper Functions ==========

async function placeBlockAt(bot: any, x: number, y: number, z: number, blockType: string): Promise<boolean> {
  try {
    const placePos = new Vec3(x, y, z);
    const blockAtPos = bot.blockAt(placePos);
    
    if (blockAtPos && blockAtPos.name !== 'air') {
      return false; // Block already exists
    }

    // Try different faces for placing
    const faces = [
      { direction: 'down', vector: new Vec3(0, -1, 0) },
      { direction: 'north', vector: new Vec3(0, 0, -1) },
      { direction: 'south', vector: new Vec3(0, 0, 1) },
      { direction: 'east', vector: new Vec3(1, 0, 0) },
      { direction: 'west', vector: new Vec3(-1, 0, 0) },
      { direction: 'up', vector: new Vec3(0, 1, 0) }
    ];

    for (const face of faces) {
      const referencePos = placePos.plus(face.vector);
      const referenceBlock = bot.blockAt(referencePos);

      if (referenceBlock && referenceBlock.name !== 'air') {
        if (!bot.canSeeBlock(referenceBlock)) {
          const goal = new goals.GoalNear(referencePos.x, referencePos.y, referencePos.z, 2);
          await bot.pathfinder.goto(goal);
        }

        await bot.lookAt(placePos, true);

        try {
          await bot.placeBlock(referenceBlock, face.vector.scaled(-1));
          return true;
        } catch (placeError) {
          continue;
        }
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

// ========== High-Level Building Tools ==========

export function registerBuildingTools(server: McpServer, bot: any) {
  server.tool(
    "build-wall",
    "Build a wall with specified dimensions and material",
    {
      startX: z.number().describe("Starting X coordinate"),
      startY: z.number().describe("Starting Y coordinate (bottom of wall)"),
      startZ: z.number().describe("Starting Z coordinate"),
      direction: z.enum(['north', 'south', 'east', 'west']).describe("Direction the wall extends"),
      length: z.number().describe("Length of the wall (number of blocks)"),
      height: z.number().describe("Height of the wall (number of blocks)"),
      thickness: z.number().optional().default(1).describe("Thickness of the wall (default: 1)"),
      material: z.string().optional().describe("Block material to use (e.g., 'stone', 'oak_planks')")
    },
    async ({ startX, startY, startZ, direction, length, height, thickness = 1, material }): Promise<McpResponse> => {
      try {
        let blocksPlaced = 0;
        let blocksFailed = 0;

        // Determine direction vectors
        let deltaX = 0, deltaZ = 0;
        switch (direction) {
          case 'north': deltaZ = -1; break;
          case 'south': deltaZ = 1; break;
          case 'east': deltaX = 1; break;
          case 'west': deltaX = -1; break;
        }

        // Build the wall
        for (let l = 0; l < length; l++) {
          for (let h = 0; h < height; h++) {
            for (let t = 0; t < thickness; t++) {
              const x = startX + (deltaX * l) + (deltaZ * t);
              const y = startY + h;
              const z = startZ + (deltaZ * l) + (deltaX * t);

              const success = await placeBlockAt(bot, x, y, z, material || 'default');
              if (success) {
                blocksPlaced++;
              } else {
                blocksFailed++;
              }
            }
          }
        }

        const totalBlocks = length * height * thickness;
        
        return createResponse(
          `Wall building completed! Built a ${length}x${height}x${thickness} wall facing ${direction}. ` +
          `Placed ${blocksPlaced}/${totalBlocks} blocks. ${blocksFailed} blocks failed.`
        );
      } catch (error) {
        return createErrorResponse(error as Error);
      }
    }
  );

  server.tool(
    "build-floor",
    "Build a flat floor/platform",
    {
      centerX: z.number().describe("Center X coordinate"),
      centerY: z.number().describe("Y coordinate (height) of the floor"),
      centerZ: z.number().describe("Center Z coordinate"),
      width: z.number().describe("Width (X direction)"),
      length: z.number().describe("Length (Z direction)"),
      blockType: z.string().optional().describe("Block type to use (will use held item if not specified)")
    },
    async ({ centerX, centerY, centerZ, width, length, blockType }): Promise<McpResponse> => {
      try {
        const halfWidth = Math.floor(width / 2);
        const halfLength = Math.floor(length / 2);

        let blocksPlaced = 0;
        let blocksFailed = 0;

        // Build the floor
        for (let x = centerX - halfWidth; x <= centerX + halfWidth; x++) {
          for (let z = centerZ - halfLength; z <= centerZ + halfLength; z++) {
            const success = await placeBlockAt(bot, x, centerY, z, blockType || 'default');
            if (success) {
              blocksPlaced++;
            } else {
              blocksFailed++;
            }
          }
        }

        const totalBlocks = width * length;
        
        return createResponse(
          `Floor building completed! Placed ${blocksPlaced}/${totalBlocks} blocks. ` +
          `${blocksFailed} blocks failed (already occupied or no support).`
        );
      } catch (error) {
        return createErrorResponse(error as Error);
      }
    }
  );

  server.tool(
    "build-box",
    "Build a hollow box/room structure",
    {
      x1: z.number().describe("Starting X coordinate"),
      y1: z.number().describe("Starting Y coordinate (bottom)"),
      z1: z.number().describe("Starting Z coordinate"), 
      x2: z.number().describe("Ending X coordinate"),
      y2: z.number().describe("Ending Y coordinate (top)"),
      z2: z.number().describe("Ending Z coordinate"),
      blockType: z.string().optional().describe("Block type to use (will use held item if not specified)")
    },
    async ({ x1, y1, z1, x2, y2, z2, blockType }): Promise<McpResponse> => {
      try {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const minZ = Math.min(z1, z2);
        const maxZ = Math.max(z1, z2);

        let blocksPlaced = 0;
        let blocksFailed = 0;

        // Build hollow box - only edges/faces
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
              // Only place blocks on the surfaces (hollow inside)
              const isEdge = x === minX || x === maxX || 
                           y === minY || y === maxY || 
                           z === minZ || z === maxZ;
              
              if (isEdge) {
                const success = await placeBlockAt(bot, x, y, z, blockType || 'default');
                if (success) {
                  blocksPlaced++;
                } else {
                  blocksFailed++;
                }
              }
            }
          }
        }

        return createResponse(
          `Box building completed! Placed ${blocksPlaced} blocks. ` +
          `${blocksFailed} blocks failed (already occupied or no support).`
        );
      } catch (error) {
        return createErrorResponse(error as Error);
      }
    }
  );

  server.tool(
    "fill-area",
    "Fill a solid rectangular area with blocks",
    {
      x1: z.number().describe("Starting X coordinate"),
      y1: z.number().describe("Starting Y coordinate"),
      z1: z.number().describe("Starting Z coordinate"),
      x2: z.number().describe("Ending X coordinate"), 
      y2: z.number().describe("Ending Y coordinate"),
      z2: z.number().describe("Ending Z coordinate"),
      blockType: z.string().optional().describe("Block type to use (will use held item if not specified)")
    },
    async ({ x1, y1, z1, x2, y2, z2, blockType }): Promise<McpResponse> => {
      try {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const minZ = Math.min(z1, z2);
        const maxZ = Math.max(z1, z2);

        let blocksPlaced = 0;
        let blocksFailed = 0;

        // Fill entire area solid
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
              const success = await placeBlockAt(bot, x, y, z, blockType || 'default');
              if (success) {
                blocksPlaced++;
              } else {
                blocksFailed++;
              }
            }
          }
        }

        const totalBlocks = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
        
        return createResponse(
          `Area filling completed! Placed ${blocksPlaced}/${totalBlocks} blocks. ` +
          `${blocksFailed} blocks failed (already occupied or no support).`
        );
      } catch (error) {
        return createErrorResponse(error as Error);
      }
    }
  );

  server.tool(
    "clear-area", 
    "Clear/dig all blocks in a rectangular area",
    {
      x1: z.number().describe("Starting X coordinate"),
      y1: z.number().describe("Starting Y coordinate"),
      z1: z.number().describe("Starting Z coordinate"),
      x2: z.number().describe("Ending X coordinate"),
      y2: z.number().describe("Ending Y coordinate"), 
      z2: z.number().describe("Ending Z coordinate")
    },
    async ({ x1, y1, z1, x2, y2, z2 }): Promise<McpResponse> => {
      try {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const minZ = Math.min(z1, z2);
        const maxZ = Math.max(z1, z2);

        let blocksDug = 0;
        let blocksFailed = 0;

        // Dig all blocks in the area
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
              try {
                const blockPos = new Vec3(x, y, z);
                const block = bot.blockAt(blockPos);

                if (block && block.name !== 'air') {
                  if (!bot.canDigBlock(block) || !bot.canSeeBlock(block)) {
                    const goal = new goals.GoalNear(x, y, z, 2);
                    await bot.pathfinder.goto(goal);
                  }

                  await bot.dig(block);
                  blocksDug++;
                }
              } catch (error) {
                blocksFailed++;
              }
            }
          }
        }

        return createResponse(
          `Area clearing completed! Dug ${blocksDug} blocks. ` +
          `${blocksFailed} blocks failed to dig.`
        );
      } catch (error) {
        return createErrorResponse(error as Error);
      }
    }
  );
}