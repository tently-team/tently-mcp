/**
 * @tently/mcp — the Tently CLI: a stdio MCP server plus a coding-agent skill installer.
 *
 * The bin entry is `cli.ts`; this module is the programmatic surface.
 */

export {
  type McpConfig,
  DEFAULT_API_URL,
  MCP_SERVER_ID,
  PACKAGE_SPECIFIER,
  VERSION,
  loadConfig,
  normalizeApiUrl,
} from './config.js';

export {
  type SearchClientOptions,
  type SearchDecisionsInput,
  type SearchDecisionsResult,
  SEARCH_DECISIONS_PATH,
  searchDecisions,
} from './search-client.js';

export {
  type ImpactZoneInput,
  type ImpactZoneRunner,
  type LocalImpactOptions,
  LocalImpactZone,
} from './impact.js';

export {
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
  QUERY_IMPACT_ZONE_TOOL,
  SEARCH_DECISIONS_TOOL,
  formatDecisions,
  formatImpact,
  handleQueryImpactZone,
  handleSearchDecisions,
  queryImpactZoneInputSchema,
  searchDecisionsInputSchema,
  toolDefinitions,
} from './tools.js';

export { createServer, createToolContext, startStdioServer } from './server.js';

export {
  type AgentId,
  type AgentTarget,
  type InitOptions,
  type InstallResult,
  type McpServerEntry,
  agentTargets,
  buildServerEntry,
  detectAgents,
  installForAgent,
  mergeMcpConfig,
  runInit,
} from './init.js';

export { SKILL_CONTENT, SKILL_NAME } from './skill/skill.js';

export type * from './types.js';
