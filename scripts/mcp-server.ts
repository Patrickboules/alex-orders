// Local MCP server over stdio (Claude Code / Claude Desktop). Run via scripts/mcp.sh.
// Never write to stdout here: it carries the MCP protocol.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "@/lib/mcp/tools";

createMcpServer()
  .connect(new StdioServerTransport())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
