#!/usr/bin/env node
/**
 * The `tently` binary. Two subcommands:
 *   - `tently mcp`  — start the stdio MCP server (what a coding agent launches).
 *   - `tently init` — register the server + install the skill into an agent's config.
 *
 * Kept thin: all real logic lives in `server.ts` / `init.ts` so it's testable
 * without spawning a process.
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { VERSION, loadConfig } from './config.js';
import { type AgentId, runInit } from './init.js';

function parseAgents(value: string | undefined): AgentId[] | undefined {
  if (!value || value === 'auto') return undefined;
  if (value === 'both') return ['claude', 'cursor'];
  if (value === 'claude' || value === 'cursor') return [value];
  throw new Error(`--agent must be one of: claude, cursor, both, auto (got "${value}")`);
}

/**
 * `init` options with the environment as fallback, so the one-line setup
 * `TENTLY_API_KEY=… npx @tently/mcp init` works the same as passing `--api-key`.
 */
export function resolveInitOptions(
  opts: { apiKey?: string; apiUrl?: string },
  env: NodeJS.ProcessEnv = process.env,
): { apiKey?: string; apiUrl?: string } {
  return {
    apiKey: opts.apiKey ?? (env.TENTLY_API_KEY || undefined),
    apiUrl: opts.apiUrl ?? (env.TENTLY_API_URL || undefined),
  };
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('tently')
    .description('Tently — institutional memory for your codebase, in your coding agent.')
    .version(VERSION);

  program
    .command('mcp')
    .description('Start the Tently MCP server on stdio.')
    .action(async () => {
      // Loaded lazily so `tently init` doesn't pull in the MCP SDK (and its
      // zod runtime requirement) just to edit config files. stdout is the MCP
      // transport here — never print to it.
      const { startStdioServer } = await import('./server.js');
      await startStdioServer(loadConfig());
    });

  program
    .command('init')
    .description("Register the Tently MCP server and skill in your coding agent's config.")
    .option('--api-key <key>', 'Org-scoped Tently API key (stored in the agent config env).')
    .option('--api-url <url>', 'Tently API base URL (defaults to the hosted service).')
    .option(
      '--agent <agent>',
      'Target agent: claude | cursor | both | auto (default: auto-detect).',
    )
    .option('--dir <dir>', 'Project directory to install into (default: current directory).')
    .action(async (opts: { apiKey?: string; apiUrl?: string; agent?: string; dir?: string }) => {
      const baseDir = opts.dir ?? process.cwd();
      const agents = parseAgents(opts.agent);
      const { apiKey, apiUrl } = resolveInitOptions(opts);
      const results = await runInit(baseDir, { apiKey, apiUrl, agents });

      for (const r of results) {
        process.stdout.write(`\n${r.label}:\n`);
        for (const change of r.changes) process.stdout.write(`  - ${change}\n`);
      }

      if (!apiKey) {
        process.stdout.write(
          '\nNote: no API key given. search_decisions will be inactive until you set ' +
            'TENTLY_API_KEY (re-run with --api-key <key>, or add it to the config env).\n',
        );
      }
      process.stdout.write('\nDone. Restart your coding agent to pick up the new MCP server.\n');
    });

  return program;
}

async function main(): Promise<void> {
  await buildProgram().parseAsync(process.argv);
}

/**
 * True when this module is the process entry point. npm installs the bin as a symlink
 * (`node_modules/.bin/tently`), so compare real paths, not the raw argv string.
 */
export function isEntryPoint(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

// Run only when invoked as the bin, not when imported.
if (isEntryPoint(import.meta.url, process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(`tently: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
