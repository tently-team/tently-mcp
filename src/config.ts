import { createRequire } from 'node:module';

/**
 * Runtime configuration for the MCP server and CLI.
 *
 * Everything is env-driven so the same binary works whether it's launched by
 * Claude Code, Cursor, or a shell. Nothing here does I/O beyond reading
 * `process.env`, so it's trivially testable.
 */

/** Default Tently API origin, used when `TENTLY_API_URL` is unset. */
export const DEFAULT_API_URL = 'https://api.tently.dev';

/** The MCP server id written into a coding agent's config (`mcpServers.<id>`). */
export const MCP_SERVER_ID = 'tently';

/** Published package name — what `npx <pkg> mcp` resolves to. */
export const PACKAGE_SPECIFIER = '@tently/mcp';

/** Package version, read from the package's own package.json. */
export const VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;

/** Resolved settings the tools need at call time. */
export interface McpConfig {
  /** Base origin of the Tently API (no trailing slash). */
  apiUrl: string;
  /** Org-scoped API key; absent means `search_decisions` degrades to an error. */
  apiKey?: string;
  /** Working directory CodeGraph indexes for `query_impact_zone`. */
  workingDir: string;
}

/** Strip a single trailing slash so path joins stay clean. */
export function normalizeApiUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Build the runtime config from the environment, with optional overrides (the
 * CLI passes explicit flags through here). `workingDir` defaults to the process
 * cwd — the dev's checkout, which never leaves the machine.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<McpConfig> = {},
): McpConfig {
  const workingDir = overrides.workingDir ?? env.TENTLY_WORKING_DIR ?? process.cwd();
  return {
    apiUrl: normalizeApiUrl(overrides.apiUrl ?? env.TENTLY_API_URL ?? DEFAULT_API_URL),
    apiKey: overrides.apiKey ?? env.TENTLY_API_KEY,
    workingDir,
  };
}
