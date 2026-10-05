import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  agentTargets,
  buildServerEntry,
  detectAgents,
  ignoreCodegraphIndex,
  mergeMcpConfig,
  runInit,
} from './init.js';

describe('buildServerEntry', () => {
  it('omits env when no keys are given', () => {
    expect(buildServerEntry()).toEqual({ command: 'npx', args: ['-y', '@tently/mcp', 'mcp'] });
  });

  it('includes only the provided env keys', () => {
    expect(buildServerEntry({ apiKey: 'k', apiUrl: 'https://x' })).toEqual({
      command: 'npx',
      args: ['-y', '@tently/mcp', 'mcp'],
      env: { TENTLY_API_URL: 'https://x', TENTLY_API_KEY: 'k' },
    });
  });
});

describe('mergeMcpConfig', () => {
  const entry = buildServerEntry({ apiKey: 'k' });

  it('creates mcpServers on an empty/garbage config', () => {
    const { config, replaced } = mergeMcpConfig(undefined, 'tently', entry);
    expect(replaced).toBe(false);
    expect((config.mcpServers as Record<string, unknown>).tently).toEqual(entry);
  });

  it('preserves other servers and top-level keys', () => {
    const existing = { schema: 1, mcpServers: { other: { command: 'x' } } };
    const { config, replaced } = mergeMcpConfig(existing, 'tently', entry);
    expect(replaced).toBe(false);
    expect(config.schema).toBe(1);
    const servers = config.mcpServers as Record<string, unknown>;
    expect(servers.other).toEqual({ command: 'x' });
    expect(servers.tently).toEqual(entry);
  });

  it('reports replaced when the entry already exists', () => {
    const existing = { mcpServers: { tently: { command: 'old' } } };
    const { replaced } = mergeMcpConfig(existing, 'tently', entry);
    expect(replaced).toBe(true);
  });
});

describe('runInit (filesystem)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tently-mcp-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the MCP config and skill for Claude Code', async () => {
    const results = await runInit(dir, { agents: ['claude'], apiKey: 'k_test' });
    expect(results).toHaveLength(1);
    expect(results[0].agent).toBe('claude');

    const targets = agentTargets(dir);
    const config = JSON.parse(await readFile(targets.claude.mcpConfigPath, 'utf8'));
    expect(config.mcpServers.tently.env.TENTLY_API_KEY).toBe('k_test');

    const skill = await readFile(targets.claude.skillPath, 'utf8');
    expect(skill).toMatch(/search_decisions/);
    expect(skill).toMatch(/query_impact_zone/);
    expect(skill).toMatch(/not proof of safety/i);
  });

  it('backs up an existing config instead of clobbering it', async () => {
    const targets = agentTargets(dir);
    await writeFile(
      targets.claude.mcpConfigPath,
      JSON.stringify({ mcpServers: { keepme: { command: 'y' } } }),
      'utf8',
    );

    await runInit(dir, { agents: ['claude'] });

    const config = JSON.parse(await readFile(targets.claude.mcpConfigPath, 'utf8'));
    expect(config.mcpServers.keepme).toEqual({ command: 'y' });
    expect(config.mcpServers.tently).toBeDefined();

    const backups = (await readdir(dir)).filter((f) => f.includes('.tently-bak-'));
    expect(backups.length).toBe(1);
  });

  it('installs for both agents when requested', async () => {
    const results = await runInit(dir, { agents: ['claude', 'cursor'] });
    expect(results.map((r) => r.agent).sort()).toEqual(['claude', 'cursor']);
    const targets = agentTargets(dir);
    await expect(readFile(targets.cursor.mcpConfigPath, 'utf8')).resolves.toMatch(/tently/);
    await expect(readFile(targets.cursor.skillPath, 'utf8')).resolves.toMatch(/Tently/);
  });
});

describe('detectAgents', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tently-detect-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('defaults to claude in a bare dir', async () => {
    expect(await detectAgents(dir)).toEqual(['claude']);
  });

  it('detects cursor from a .cursor dir', async () => {
    await runInit(dir, { agents: ['cursor'] }); // creates .cursor/*
    const found = await detectAgents(dir);
    expect(found).toContain('cursor');
  });
});

describe('ignoreCodegraphIndex', () => {
  it('appends .codegraph/ to an existing .gitignore once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tently-ignore-'));
    await writeFile(join(dir, '.gitignore'), 'node_modules');
    expect(await ignoreCodegraphIndex(dir)).toMatch(/added \.codegraph\//);
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe(
      'node_modules\n\n# Tently MCP: local code-graph index\n.codegraph/\n',
    );
    expect(await ignoreCodegraphIndex(dir)).toBeNull();
  });

  it('creates .gitignore in a git checkout, and skips a non-repo folder', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'tently-ignore-'));
    await mkdir(join(repo, '.git'));
    expect(await ignoreCodegraphIndex(repo)).not.toBeNull();
    expect(await readFile(join(repo, '.gitignore'), 'utf8')).toContain('.codegraph/');
    const plain = await mkdtemp(join(tmpdir(), 'tently-ignore-'));
    expect(await ignoreCodegraphIndex(plain)).toBeNull();
  });
});
