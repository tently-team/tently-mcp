/**
 * `tently init` — register the MCP server in a coding agent's config and install
 * the skill. Conservative by design: it detects config locations, backs up any
 * file it touches, merges rather than overwrites, and reports every change.
 *
 * The pure parts (entry construction, config merging, target resolution) are
 * separated from the filesystem so they can be unit-tested against a temp dir.
 */

import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MCP_SERVER_ID, PACKAGE_SPECIFIER } from './config.js';
import { SKILL_CONTENT, SKILL_NAME } from './skill/skill.js';

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export type AgentId = 'claude' | 'cursor';

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface InitOptions {
  apiUrl?: string;
  apiKey?: string;
}

/** The stdio launch command written into a coding agent's `mcpServers` map. */
export function buildServerEntry(opts: InitOptions = {}): McpServerEntry {
  const env: Record<string, string> = {};
  if (opts.apiUrl) env.TENTLY_API_URL = opts.apiUrl;
  if (opts.apiKey) env.TENTLY_API_KEY = opts.apiKey;
  const entry: McpServerEntry = {
    command: 'npx',
    args: ['-y', PACKAGE_SPECIFIER, 'mcp'],
  };
  if (Object.keys(env).length > 0) entry.env = env;
  return entry;
}

export interface AgentTarget {
  id: AgentId;
  label: string;
  /** Absolute path to the agent's MCP config JSON file. */
  mcpConfigPath: string;
  /** Absolute path to install the skill/rule file. */
  skillPath: string;
}

/** Resolve where each supported agent keeps its config, relative to a project dir. */
export function agentTargets(baseDir: string): Record<AgentId, AgentTarget> {
  return {
    claude: {
      id: 'claude',
      label: 'Claude Code',
      mcpConfigPath: join(baseDir, '.mcp.json'),
      skillPath: join(baseDir, '.claude', 'skills', SKILL_NAME, 'SKILL.md'),
    },
    cursor: {
      id: 'cursor',
      label: 'Cursor',
      mcpConfigPath: join(baseDir, '.cursor', 'mcp.json'),
      skillPath: join(baseDir, '.cursor', 'rules', `${SKILL_NAME}.mdc`),
    },
  };
}

/**
 * Merge one server entry into an existing (possibly empty/garbage) config
 * object, preserving every other server and top-level key. Pure — returns a new
 * object and whether an existing entry was replaced.
 */
export function mergeMcpConfig(
  existing: unknown,
  serverId: string,
  entry: McpServerEntry,
): { config: Record<string, unknown>; replaced: boolean } {
  const base: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  const servers =
    base.mcpServers && typeof base.mcpServers === 'object' && !Array.isArray(base.mcpServers)
      ? { ...(base.mcpServers as Record<string, unknown>) }
      : {};

  const replaced = Object.hasOwn(servers, serverId);
  servers[serverId] = entry;
  base.mcpServers = servers;
  return { config: base, replaced };
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Copy an existing file aside before we edit it. Returns the backup path, or null if nothing to back up. */
export async function backupFile(path: string): Promise<string | null> {
  if (!(await pathExists(path))) return null;
  const backup = `${path}.tently-bak-${Date.now()}`;
  await copyFile(path, backup);
  return backup;
}

async function readJson(path: string): Promise<unknown> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export interface InstallResult {
  agent: AgentId;
  label: string;
  changes: string[];
}

/**
 * Install the MCP server entry + skill for one agent, backing up any file we
 * overwrite. Returns a human-readable change log.
 */
export async function installForAgent(
  target: AgentTarget,
  serverId: string,
  entry: McpServerEntry,
  skillContent: string,
): Promise<InstallResult> {
  const changes: string[] = [];

  // --- MCP config ---
  const existing = await readJson(target.mcpConfigPath);
  const { config, replaced } = mergeMcpConfig(existing, serverId, entry);
  const backup = await backupFile(target.mcpConfigPath);
  if (backup) changes.push(`backed up ${target.mcpConfigPath} -> ${backup}`);
  await mkdir(dirname(target.mcpConfigPath), { recursive: true });
  await writeFile(target.mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  changes.push(
    `${replaced ? 'updated' : 'added'} mcpServers.${serverId} in ${target.mcpConfigPath}`,
  );

  // --- skill ---
  const skillBackup = await backupFile(target.skillPath);
  if (skillBackup) changes.push(`backed up ${target.skillPath} -> ${skillBackup}`);
  await mkdir(dirname(target.skillPath), { recursive: true });
  await writeFile(target.skillPath, skillContent, 'utf8');
  changes.push(`installed skill at ${target.skillPath}`);

  return { agent: target.id, label: target.label, changes };
}

/**
 * Detect which agents look present in `baseDir`. Falls back to Claude Code if
 * nothing is detected, so a bare repo still gets a working install.
 */
export async function detectAgents(baseDir: string): Promise<AgentId[]> {
  const found: AgentId[] = [];
  if (
    (await pathExists(join(baseDir, '.claude'))) ||
    (await pathExists(join(baseDir, '.mcp.json')))
  ) {
    found.push('claude');
  }
  if (await pathExists(join(baseDir, '.cursor'))) {
    found.push('cursor');
  }
  return found.length > 0 ? found : ['claude'];
}

/**
 * Keep the local code-graph index (`.codegraph/`, written by `query_impact_zone`)
 * out of git. Appends to `.gitignore` in a git checkout; returns the change made,
 * or null when it's already ignored or `baseDir` isn't a repo.
 */
export async function ignoreCodegraphIndex(baseDir: string): Promise<string | null> {
  const path = join(baseDir, '.gitignore');
  const current = (await pathExists(path)) ? await readFile(path, 'utf8') : null;
  if (current === null && !(await pathExists(join(baseDir, '.git')))) return null;
  if (current !== null && /^\/?\.codegraph\/?$/m.test(current)) return null;
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  const block = `${prefix}${current ? '\n' : ''}# Tently MCP: local code-graph index\n.codegraph/\n`;
  await writeFile(path, `${current ?? ''}${block}`, 'utf8');
  return `added .codegraph/ to ${path}`;
}

/**
 * Top-level orchestration for the CLI. Installs for the requested agents (or the
 * detected ones) and returns per-agent change logs.
 */
export async function runInit(
  baseDir: string,
  opts: InitOptions & { agents?: AgentId[] } = {},
): Promise<InstallResult[]> {
  const targets = agentTargets(baseDir);
  const agents = opts.agents ?? (await detectAgents(baseDir));
  const entry = buildServerEntry(opts);

  const results: InstallResult[] = [];
  for (const id of agents) {
    results.push(await installForAgent(targets[id], MCP_SERVER_ID, entry, SKILL_CONTENT));
  }
  const ignored = await ignoreCodegraphIndex(baseDir);
  if (ignored && results[0]) results[0].changes.push(ignored);
  return results;
}
