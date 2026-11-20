// Remote MCP endpoint: lets Claude (claude.ai, the Claude app, Claude Code) save menus it read
// from photos. The secret is in the path because claude.ai custom connectors can't send headers.
// Stateless: a fresh server and transport per request, JSON responses (no long-lived streams).

import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/tools";

export const maxDuration = 60;

function secretMatches(given: string): boolean {
  const expected = process.env.MCP_SECRET;
  if (!expected || expected.length < 24) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!secretMatches(secret)) return new Response("Not found", { status: 404 });

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // JSON mode has fully built the response by now.
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
