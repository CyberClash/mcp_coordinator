import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn, ChildProcess } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load manifest
interface ServerConfig {
  description: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface Manifest {
  servers: Record<string, ServerConfig>;
}

const manifestPath = join(__dirname, "manifest.json");
let manifest: Manifest;

try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
} catch (error) {
  console.error("Failed to load manifest.json:", error);
  process.exit(1);
}

// Active MCP client connections
const activeClients: Map<string, { client: Client; process: ChildProcess }> = new Map();

// Initialize the coordinator server
const server = new McpServer({
  name: "mcp-coordinator",
  version: "1.0.0",
});

// Tool 1: List available MCP servers
server.tool(
  "list_mcps",
  "List all available MCP servers and their descriptions",
  {},
  async () => {
    const serverList = Object.entries(manifest.servers).map(([name, config]) => ({
      name,
      description: config.description,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(serverList, null, 2),
        },
      ],
    };
  }
);

// Tool 2: Get tools available in a specific MCP server
server.tool(
  "get_mcp_tools",
  "Get the list of tools available in a specific MCP server",
  {
    server_name: z.string().describe("Name of the MCP server (from list_mcps)"),
  },
  async ({ server_name }) => {
    const config = manifest.servers[server_name];
    if (!config) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Server "${server_name}" not found. Use list_mcps to see available servers.`,
          },
        ],
      };
    }

    try {
      // Connect to the MCP server
      const { client } = await connectToServer(server_name, config);

      // Get tools
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tools, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error connecting to ${server_name}: ${error}`,
          },
        ],
      };
    }
  }
);

// Tool 3: Call a tool on an MCP server
server.tool(
  "call_mcp_tool",
  "Call a specific tool on an MCP server",
  {
    server_name: z.string().describe("Name of the MCP server"),
    tool_name: z.string().describe("Name of the tool to call"),
    tool_args: z.record(z.string(), z.unknown()).optional().describe("Arguments to pass to the tool (as JSON object)"),
  },
  async ({ server_name, tool_name, tool_args }) => {
    const config = manifest.servers[server_name];
    if (!config) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Server "${server_name}" not found.`,
          },
        ],
      };
    }

    try {
      // Connect to the MCP server (reuses existing connection if available)
      const { client } = await connectToServer(server_name, config);

      // Call the tool
      const result = await client.callTool(
        {
          name: tool_name,
          arguments: tool_args || {},
        },
        CallToolResultSchema
      );

      // Format the result
      let resultText: string;
      if (Array.isArray(result.content)) {
        resultText = result.content
          .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
          .join("\n");
      } else {
        resultText = JSON.stringify(result.content);
      }

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error calling ${tool_name} on ${server_name}: ${error}`,
          },
        ],
      };
    }
  }
);

// Helper function to connect to an MCP server
async function connectToServer(
  serverName: string,
  config: ServerConfig
): Promise<{ client: Client; process: ChildProcess }> {
  // Check if already connected
  const existing = activeClients.get(serverName);
  if (existing) {
    return existing;
  }

  // Prepare environment variables
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const [key, value] of Object.entries(config.env)) {
    // Replace ${VAR} with actual environment variable
    const resolvedValue = value.replace(/\$\{(\w+)\}/g, (_, varName) => {
      return process.env[varName] || "";
    });
    env[key] = resolvedValue;
  }

  // Spawn the MCP server process
  const childProcess = spawn(config.command, config.args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });

  // Create MCP client
  const client = new Client({
    name: "mcp-coordinator-client",
    version: "1.0.0",
  });

  // Create transport
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env,
  });

  // Connect
  await client.connect(transport);

  // Store the connection
  activeClients.set(serverName, { client, process: childProcess });

  // Handle process exit
  childProcess.on("exit", () => {
    activeClients.delete(serverName);
  });

  return { client, process: childProcess };
}

// Cleanup function
async function cleanup() {
  for (const [name, { client, process }] of activeClients) {
    try {
      await client.close();
      process.kill();
    } catch (error) {
      console.error(`Error cleaning up ${name}:`, error);
    }
  }
  activeClients.clear();
}

// Handle process signals
process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Coordinator running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
