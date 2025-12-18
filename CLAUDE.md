# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Coordinator - a server that exposes only 3 tools to Claude Code and dynamically loads other MCP servers on-demand. This reduces context window consumption from ~15,000-25,000 tokens (direct MCP connections) to ~500 tokens.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to build/
npm run start        # Run the coordinator
```

After building, copy the manifest: `copy src\manifest.json build\manifest.json`

## Architecture

The coordinator exposes 3 tools:
- `list_mcps` - Lists available MCP servers from manifest
- `get_mcp_tools` - Connects to an MCP server and returns its available tools
- `call_mcp_tool` - Calls a specific tool on an MCP server with arguments

**Flow:** Claude Code → Coordinator (3 tools) → dynamically spawns target MCP → returns result

## Key Files

- `src/index.ts` - Main coordinator server using @modelcontextprotocol/sdk
- `src/manifest.json` - Defines available MCP servers (command, args, env vars)

## Configuration

Add to Claude Code settings (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "coordinator": {
      "command": "cmd",
      "args": ["/c", "node", "C:\\dev\\mcp-coordinator\\build\\index.js"],
      "env": { "GITHUB_TOKEN": "your_token" }
    }
  }
}
```

Environment variables in manifest use `${VAR_NAME}` syntax, resolved at runtime from coordinator's env.
