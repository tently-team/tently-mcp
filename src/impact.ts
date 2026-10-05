/**
 * `query_impact_zone` backing: runs CodeGraph (`@colbymchenry/codegraph`, MIT) locally
 * on the developer's working tree. Source never leaves the machine — the index is
 * written to the checkout's own `.codegraph/` directory.
 *
 * Indexing is expensive relative to a query, so it happens once, lazily, on the first
 * call and is reused for the life of the process. Everything sits behind the
 * `ImpactZoneRunner` interface so the tool handler can be tested with a fake.
 */

import { createRequire } from 'node:module';
import type { GraphSymbol, ImpactResult, ImpactRisk, ImpactedSymbol } from './types.js';

export interface ImpactZoneInput {
  /** Symbol whose blast radius we want. */
  symbol: string;
  /** Optional file to disambiguate a colliding name. */
  file?: string;
  /** `upstream` = callers (default); `downstream` = dependencies. */
  direction?: 'upstream' | 'downstream';
  /** Max relationship depth to traverse. */
  maxDepth?: number;
}

export interface ImpactZoneRunner {
  run(input: ImpactZoneInput): Promise<ImpactResult>;
}

// ---------------------------------------------------------------------------
// The slice of the CodeGraph SDK this module uses, declared structurally. The
// package is CommonJS and loaded lazily with `require`, so a session that never
// asks for an impact zone never pays to load its native bundle.
// ---------------------------------------------------------------------------

interface SdkNode {
  id: string;
  kind: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

interface SdkRef {
  node: SdkNode;
  edge: { kind: string; metadata?: Record<string, unknown> };
}

export interface SdkGraph {
  indexAll(): Promise<unknown>;
  getNode(id: string): SdkNode | null;
  getNodesByName(name: string): SdkNode[];
  getCallers(nodeId: string, maxDepth?: number): SdkRef[];
  getCallees(nodeId: string, maxDepth?: number): SdkRef[];
}

export interface SdkStatic {
  init(projectRoot: string, options?: { index?: boolean }): Promise<SdkGraph>;
  recreate(projectRoot: string): Promise<SdkGraph>;
  isInitialized(projectRoot: string): boolean;
}

function loadSdk(): SdkStatic {
  const require = createRequire(import.meta.url);
  const mod = require('@colbymchenry/codegraph') as { CodeGraph?: SdkStatic; default?: SdkStatic };
  const sdk = mod.CodeGraph ?? mod.default;
  if (!sdk) throw new Error('@colbymchenry/codegraph did not export a CodeGraph class');
  return sdk;
}

/** Cap on symbols returned from one query. */
const MAX_IMPACTED = 200;

export interface LocalImpactOptions {
  cwd: string;
  /** Override the SDK loader (tests inject a fake; no native bundle needed). */
  loadSdk?: () => SdkStatic;
}

/** Default runner: indexes the working tree on first use, then walks the call graph. */
export class LocalImpactZone implements ImpactZoneRunner {
  private readonly cwd: string;
  private readonly loader: () => SdkStatic;
  private graph: Promise<SdkGraph> | null = null;

  constructor(opts: LocalImpactOptions) {
    this.cwd = opts.cwd;
    this.loader = opts.loadSdk ?? loadSdk;
  }

  async run(input: ImpactZoneInput): Promise<ImpactResult> {
    const graph = await this.ensureIndexed();
    const target = resolveNode(graph, input.symbol, input.file);
    const direction = input.direction ?? 'upstream';
    const maxDepth = Math.max(1, input.maxDepth ?? 1);

    const impacted: ImpactedSymbol[] = [];
    const seen = new Set<string>([target.id]);
    let frontier = [target.id];

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        const refs = direction === 'upstream' ? graph.getCallers(id, 1) : graph.getCallees(id, 1);
        for (const ref of refs) {
          if (!isSymbolNode(ref.node) || seen.has(ref.node.id)) continue;
          seen.add(ref.node.id);
          next.push(ref.node.id);
          const confidence = ref.edge.metadata?.confidence;
          impacted.push({
            symbol: toGraphSymbol(ref.node),
            depth,
            relationType: ref.edge.kind.toUpperCase(),
            ...(typeof confidence === 'number' ? { confidence } : {}),
          });
          if (impacted.length >= MAX_IMPACTED) break;
        }
        if (impacted.length >= MAX_IMPACTED) break;
      }
      if (impacted.length >= MAX_IMPACTED) break;
      frontier = next;
    }

    return {
      target: toGraphSymbol(target),
      direction,
      impacted,
      risk: riskFor(impacted.length),
      epistemic: 'APPROXIMATE',
      boundaries: [
        'Edges come from tree-sitter extraction plus name/import resolution, not a type checker; dynamic dispatch and reflective calls are not traced.',
        ...(impacted.length >= MAX_IMPACTED
          ? [`Result truncated at ${MAX_IMPACTED} impacted symbols.`]
          : []),
      ],
    };
  }

  /** `init` a cold checkout, `recreate` a warm one so a stale index is never reused. */
  private ensureIndexed(): Promise<SdkGraph> {
    this.graph ??= (async () => {
      const sdk = this.loader();
      const graph = sdk.isInitialized(this.cwd)
        ? await sdk.recreate(this.cwd)
        : await sdk.init(this.cwd, { index: false });
      await graph.indexAll();
      return graph;
    })();
    return this.graph;
  }
}

function resolveNode(graph: SdkGraph, name: string, file?: string): SdkNode {
  let candidates = graph.getNodesByName(name).filter(isSymbolNode);
  if (file) {
    const inFile = candidates.filter((n) => n.filePath === file);
    if (inFile.length > 0) candidates = inFile;
  }
  const node = candidates[0];
  if (!node) throw new Error(`symbol ${name}${file ? ` in ${file}` : ''} not found in the graph`);
  return node;
}

function isSymbolNode(node: SdkNode): boolean {
  return node.kind !== 'file' && node.kind !== 'import' && node.name.length > 0;
}

function toGraphSymbol(node: SdkNode): GraphSymbol {
  return {
    uid: node.id,
    name: node.name,
    kind: node.kind,
    filePath: node.filePath,
    startLine: node.startLine,
    endLine: node.endLine,
  };
}

function riskFor(count: number): ImpactRisk {
  if (count === 0) return 'LOW';
  if (count <= 5) return 'MEDIUM';
  return 'HIGH';
}
