# MCP Coordinator

An MCP server that acts as a proxy for multiple MCP servers, exposing only 3 tools to Claude instead of loading all tool definitions from each server. This dramatically reduces context window consumption while maintaining full access to all MCP capabilities.

## The Problem

Each MCP server you add to Claude loads all its tool definitions into your context window. GitHub MCP alone can consume 50+ tool definitions worth of tokens on every single message.

## The Solution

The MCP Coordinator exposes only 3 tools. When Claude needs to use an MCP, the Coordinator dynamically loads it, calls the tool, and returns just the result.

## Features

- Reduce context window usage from ~15,000+ tokens to ~500 tokens
- Dynamically load MCP servers on-demand
- Reuse connections for better performance
- Easy manifest-based configuration for adding/removing servers
- Support for environment variable substitution in server configs

## Tools

### list_mcps

List all available MCP servers and their descriptions.

**Inputs:** None

**Returns:** Array of server names and descriptions from the manifest.

### get_mcp_tools

Get the list of tools available in a specific MCP server.

**Inputs:**
- `server_name` (string, required): Name of the MCP server from `list_mcps`

**Returns:** Array of tools with names, descriptions, and input schemas.

### call_mcp_tool

Call a specific tool on an MCP server.

**Inputs:**
- `server_name` (string, required): Name of the MCP server
- `tool_name` (string, required): Name of the tool to call
- `tool_args` (object, optional): Arguments to pass to the tool

**Returns:** The result from the MCP tool call.

## Usage

The MCP Coordinator is designed for:

- Reducing context window consumption when using multiple MCP servers
- Projects that need access to many MCPs but not all at once
- Workflows where you want to query available tools before using them
- Keeping your Claude conversations lean and focused

## Configuration

The coordinator itself requires **no API keys or tokens**. You only need to provide tokens for specific MCP servers in the manifest that require them (like GitHub MCP).

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coordinator": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp_coordinator\\build\\index.js"]
    }
  }
}
```

### Usage with Claude Code

#### Project-Level Configuration

Create a `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "coordinator": {
      "command": "cmd",
      "args": ["/c", "node", "C:\\path\\to\\mcp_coordinator\\build\\index.js"]
    }
  }
}
```

#### Global Configuration (All Projects)

Create `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "coordinator": {
      "command": "cmd",
      "args": ["/c", "node", "C:\\path\\to\\mcp_coordinator\\build\\index.js"]
    }
  }
}
```

### Passing Tokens for Specific MCPs

If you use MCP servers that require authentication (like GitHub), pass the tokens as environment variables:

```json
{
  "mcpServers": {
    "coordinator": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp_coordinator\\build\\index.js"],
      "env": {
        "GITHUB_TOKEN": "your_github_token_here"
      }
    }
  }
}
```

The coordinator passes these to child MCPs via the `${VAR_NAME}` syntax in the manifest.

## Adding MCP Servers

Edit `src/manifest.json` (and rebuild) or directly edit `build/manifest.json`.

### MCPs That Need No Authentication

Many MCPs work without any tokens:

```json
{
  "servers": {
    "sequential-thinking": {
      "description": "Step-by-step thinking and problem decomposition",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "env": {}
    },
    "filesystem": {
      "description": "Read, write, and manage local files",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/"],
      "env": {}
    }
  }
}
```

### MCPs That Require Authentication

Some MCPs need API tokens to access external services:

```json
{
  "servers": {
    "github": {
      "description": "GitHub operations: repos, issues, PRs, branches, commits",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

Environment variables use `${VAR_NAME}` syntax and are resolved from the coordinator's environment at runtime. Only pass the tokens you actually need for the MCPs you're using.

## Building

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Copy manifest to build folder
cp src/manifest.json build/manifest.json
```

## Context Window Savings

| Approach | Tools in Context | Approximate Tokens |
|----------|------------------|-------------------|
| Direct GitHub MCP | 50+ tools | ~15,000 tokens |
| Direct + Filesystem + Fetch | 80+ tools | ~25,000 tokens |
| **MCP Coordinator** | 3 tools | ~500 tokens |

## Included Servers

The default manifest includes:

- **github** - GitHub operations (repos, issues, PRs, branches, commits)
- **filesystem** - Read, write, and manage local files
- **fetch** - Fetch URLs and retrieve web content

## Acknowledgments

- Reddit user [u/mrgoonvn](https://reddit.com/user/mrgoonvn) for the inspiration regarding MCP context bloat that led to this project
- [Anthropic](https://anthropic.com) for the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- The MCP community for the official server implementations (GitHub, Filesystem, Fetch, Sequential Thinking)
- Built with [Claude Code](https://claude.ai/code)

## License

This MCP server is licensed under the GPL-3.0 License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the GPL-3.0 License. For more details, please see the LICENSE file in the project repository.
