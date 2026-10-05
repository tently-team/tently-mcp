import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createServer, createToolContext } from './server.js';

describe('server wiring', () => {
  it('constructs the MCP server without throwing (SDK low-level API)', () => {
    const server = createServer(loadConfig({}, { workingDir: process.cwd() }));
    expect(server).toBeDefined();
  });

  it('createToolContext wires both a search fn and an impact runner', () => {
    const ctx = createToolContext(
      loadConfig({ TENTLY_API_KEY: 'k' }, { workingDir: process.cwd() }),
    );
    expect(typeof ctx.searchDecisions).toBe('function');
    expect(typeof ctx.impactZone.run).toBe('function');
  });
});
