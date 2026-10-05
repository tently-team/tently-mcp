/**
 * Tool definitions and handlers for the Tently MCP server.
 *
 * Two concerns live here, kept separate from the SDK wiring in `server.ts` so
 * they can be unit-tested without a transport:
 *   1. The tool *contracts* — name, description, and a plain JSON Schema
 *      `inputSchema` (see the zod note below).
 *   2. The *handlers* — pure functions of (rawArgs, context) → tool result.
 *
 * zod note: we advertise each tool with a hand-written JSON Schema `inputSchema`
 * (registered via the SDK's low-level `Server` in `server.ts`) rather than the
 * zod-typed `McpServer.tool()` sugar. That keeps these definitions SDK- and
 * zod-version-agnostic; zod is used only for *runtime validation* inside the
 * handler (`.safeParse`). No zod schema ever crosses the SDK boundary.
 */

import type { Decision } from './types.js';
import { z } from 'zod';
import type { ImpactZoneRunner } from './impact.js';
import type { SearchDecisionsInput, SearchDecisionsResult } from './search-client.js';

export const SEARCH_DECISIONS_TOOL = 'search_decisions';
export const QUERY_IMPACT_ZONE_TOOL = 'query_impact_zone';

// ---------------------------------------------------------------------------
// Input validation (runtime only — never handed to the SDK)
// ---------------------------------------------------------------------------

export const searchDecisionsInputSchema = z.object({
  query: z.string().min(1, 'query must be a non-empty string'),
  paths: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(50).optional(),
});

export const queryImpactZoneInputSchema = z.object({
  symbol: z.string().min(1, 'symbol must be a non-empty string'),
  file: z.string().optional(),
  direction: z.enum(['upstream', 'downstream']).optional(),
  maxDepth: z.number().int().positive().max(10).optional(),
});

// ---------------------------------------------------------------------------
// Wire contracts (plain JSON Schema for MCP `tools/list`)
// ---------------------------------------------------------------------------

/** Minimal JSON Schema shape the SDK accepts for `Tool.inputSchema`. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: SEARCH_DECISIONS_TOOL,
    description:
      'Search the Tently decision store — the same ratified decisions the PR review gate ' +
      'enforces (architecture boundaries, code-shape conventions, process rules). Each hit ' +
      'is marked BLOCKING (violating it breaks something) or ADVISORY (violating it just ' +
      'makes the code worse). Call this BEFORE ' +
      'writing or changing code in an area to surface constraints and exemplars that apply, ' +
      'so you build with the grain instead of triggering a review finding later. Pass the ' +
      'paths you are about to touch to scope retrieval.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What you are about to do, in natural language (e.g. "add a repository method that queries decisions").',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repo-relative paths or globs you are editing, to scope the search.',
        },
        limit: {
          type: 'number',
          description: 'Max decisions to return (1-50, default server-side).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: QUERY_IMPACT_ZONE_TOOL,
    description:
      'Compute the blast radius (callers/dependents) of a symbol using the local code graph, ' +
      'run on your working tree — source never leaves the machine. Call this BEFORE changing ' +
      'the signature or behavior of any shared or exported symbol, to see who breaks. ' +
      'CRITICAL: results are EVIDENCE, NOT PROOF. Recall is imperfect — an empty or small ' +
      'impact list is NOT proof the change is safe; callers bound via interfaces, dynamic ' +
      'dispatch, or re-exports are routinely missed. Corroborate a low result (grep + read) ' +
      'before concluding there is no blast radius. Heed the `boundaries` and `epistemic` fields.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The symbol name to analyze (function, method, class, type).',
        },
        file: {
          type: 'string',
          description:
            'Repo-relative file containing the symbol, to disambiguate a colliding name.',
        },
        direction: {
          type: 'string',
          enum: ['upstream', 'downstream'],
          description: 'upstream = callers/dependents (default); downstream = dependencies.',
        },
        maxDepth: {
          type: 'number',
          description: 'Max relationship depth to traverse (1-10).',
        },
      },
      required: ['symbol'],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** Result shape the server maps straight onto an MCP `CallToolResult`. */
export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** Dependencies a handler needs — injected so tests can fake them. */
export interface ToolContext {
  searchDecisions(input: SearchDecisionsInput): Promise<SearchDecisionsResult>;
  impactZone: ImpactZoneRunner;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

function formatZodError(err: z.ZodError): string {
  return err.errors.map((e) => `${e.path.join('.') || '(root)'}: ${e.message}`).join('; ');
}

export async function handleSearchDecisions(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const parsed = searchDecisionsInputSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return textResult(
      `Invalid input for ${SEARCH_DECISIONS_TOOL}: ${formatZodError(parsed.error)}`,
      true,
    );
  }

  const result = await ctx.searchDecisions(parsed.data);
  if (!result.ok) {
    return textResult(
      `Could not search decisions: ${result.message}\n\nProceed with caution — absence of retrieved decisions is not confirmation that none apply.`,
      true,
    );
  }

  if (result.decisions.length === 0) {
    return textResult(
      'No matching decisions found. This is not proof that none apply — the store may lack ' +
        'coverage for this area. Use your judgment and follow the repo conventions.',
    );
  }

  return textResult(formatDecisions(result.decisions, result.total));
}

export async function handleQueryImpactZone(
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const parsed = queryImpactZoneInputSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return textResult(
      `Invalid input for ${QUERY_IMPACT_ZONE_TOOL}: ${formatZodError(parsed.error)}`,
      true,
    );
  }

  try {
    const impact = await ctx.impactZone.run(parsed.data);
    return textResult(formatImpact(impact));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return textResult(
      `Impact analysis failed for "${parsed.data.symbol}": ${message}\n\nA failed lookup is NOT evidence of safety. Corroborate manually (grep for the symbol) before changing it.`,
      true,
    );
  }
}

// ---------------------------------------------------------------------------
// Formatting (pure)
// ---------------------------------------------------------------------------

export function formatDecisions(decisions: Decision[], total: number): string {
  const header =
    total > decisions.length
      ? `${decisions.length} of ${total} matching decisions:`
      : `${decisions.length} matching decision${decisions.length === 1 ? '' : 's'}:`;

  const blocks = decisions.map((d, i) => {
    const lines = [`${i + 1}. ${d.title} [${d.tier}/${d.status}, ${d.enforcement}]`];
    if (d.rationale) lines.push(`   why: ${truncate(d.rationale, 240)}`);
    const paths = d.scope?.includePaths ?? [];
    if (paths.length) lines.push(`   scope: ${paths.join(', ')}`);
    for (const ex of d.exemplars ?? []) {
      lines.push(
        `   example: ${ex.path}${ex.symbol ? `#${ex.symbol}` : ''}${ex.note ? ` — ${ex.note}` : ''}`,
      );
    }
    if (d.id) lines.push(`   id: ${d.id}`);
    return lines.join('\n');
  });

  return `${header}\n\n${blocks.join('\n\n')}`;
}

export function formatImpact(impact: {
  target: { name: string; kind: string; filePath: string; uid: string };
  direction: string;
  impacted: {
    symbol: { name: string; kind: string; filePath: string };
    depth: number;
    relationType?: string;
    confidence?: number;
  }[];
  risk: string;
  epistemic: string;
  boundaries: string[];
}): string {
  const { target, impacted } = impact;
  const lines = [
    `Impact zone for ${target.kind} ${target.name} (${target.filePath || 'unknown file'})`,
    `direction: ${impact.direction} · risk: ${impact.risk} · completeness: ${impact.epistemic}`,
    '',
  ];

  if (impacted.length === 0) {
    lines.push('No impacted symbols reported.');
  } else {
    lines.push(`${impacted.length} impacted symbol${impacted.length === 1 ? '' : 's'}:`);
    const sorted = [...impacted].sort((a, b) => a.depth - b.depth);
    for (const it of sorted) {
      const rel = it.relationType ? ` via ${it.relationType}` : '';
      const conf = typeof it.confidence === 'number' ? ` (conf ${it.confidence.toFixed(2)})` : '';
      lines.push(`  [d${it.depth}] ${it.symbol.name} — ${it.symbol.filePath}${rel}${conf}`);
    }
  }

  if (impact.boundaries.length) {
    lines.push('', 'Known incompleteness (why this may miss callers):');
    for (const b of impact.boundaries) lines.push(`  - ${b}`);
  }

  lines.push(
    '',
    'REMINDER: this is evidence, not proof. Empty or small results do NOT guarantee the ' +
      'change is safe — corroborate with grep/read before altering a shared symbol.',
  );

  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
