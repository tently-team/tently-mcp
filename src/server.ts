/**
 * The stdio MCP server. Tools are advertised with hand-written JSON Schema (see
 * `tools.ts`) through the SDK's low-level `Server` and dispatched by name here.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { type McpConfig, VERSION } from './config.js';
import { LocalImpactZone } from './impact.js';
import { searchDecisions } from './search-client.js';
import {
  QUERY_IMPACT_ZONE_TOOL,
  SEARCH_DECISIONS_TOOL,
  type ToolContext,
  handleQueryImpactZone,
  handleSearchDecisions,
  toolDefinitions,
} from './tools.js';

const SERVER_NAME = 'tently-mcp';
const SERVER_VERSION = VERSION;

/** Build the tool context (network + local code graph) from runtime config. */
export function createToolContext(config: McpConfig): ToolContext {
  return {
    searchDecisions: (input) =>
      searchDecisions(input, { apiUrl: config.apiUrl, apiKey: config.apiKey }),
    impactZone: new LocalImpactZone({ cwd: config.workingDir }),
  };
}

/**
 * Construct the MCP `Server` with both tools registered. `context` is injectable
 * so callers (and tests) can swap the network/code-graph implementations.
 */
export function createServer(config: McpConfig, context?: ToolContext): Server {
  const ctx = context ?? createToolContext(config);

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    switch (name) {
      case SEARCH_DECISIONS_TOOL:
        return (await handleSearchDecisions(args, ctx)) as CallToolResult;
      case QUERY_IMPACT_ZONE_TOOL:
        return (await handleQueryImpactZone(args, ctx)) as CallToolResult;
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}

/** Start the server on stdio and block until the transport closes. */
export async function startStdioServer(config: McpConfig): Promise<void> {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
