#!/bin/sh
# Starts the alex-orders MCP server over stdio (used by Claude Code / Claude Desktop).
cd "$(dirname "$0")/.." || exit 1
exec node --conditions=react-server --env-file=.env --import tsx scripts/mcp-server.ts
