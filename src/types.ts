/**
 * Shapes shared by the tools.
 *
 * `Decision` mirrors the JSON the Tently API returns from `POST /v1/decisions/search`.
 * Only the fields the MCP server renders are declared; the API may send more.
 */

export interface DecisionExemplar {
  path: string;
  symbol?: string;
  note?: string;
}

export interface Decision {
  id?: string;
  title: string;
  tier?: string;
  status?: string;
  /** `BLOCKING` (violating it breaks something) or `ADVISORY`. */
  enforcement?: string;
  rationale?: string;
  scope?: { includePaths?: string[] };
  exemplars?: DecisionExemplar[];
}

/** A symbol located in the local code graph. */
export interface GraphSymbol {
  uid: string;
  name: string;
  kind: string;
  /** Repo-relative path. */
  filePath: string;
  startLine?: number;
  endLine?: number;
}

/** One symbol affected by changing the target. */
export interface ImpactedSymbol {
  symbol: GraphSymbol;
  /** 1 = direct caller/dependency, 2 = one hop further out, … */
  depth: number;
  /** Edge confidence in [0, 1], when the graph reports one. */
  confidence?: number;
  /** Edge kind, e.g. `CALLS` or `IMPORTS`. */
  relationType?: string;
}

export type ImpactRisk = 'LOW' | 'MEDIUM' | 'HIGH';

/** How complete the result is believed to be. Even `EXACT` is not a guarantee. */
export type Epistemic = 'EXACT' | 'APPROXIMATE' | 'UNKNOWN';

/** Blast radius of changing a symbol. */
export interface ImpactResult {
  target: GraphSymbol;
  direction: 'upstream' | 'downstream';
  impacted: ImpactedSymbol[];
  risk: ImpactRisk;
  epistemic: Epistemic;
  /** Reasons the result may be incomplete, surfaced to the agent. */
  boundaries: string[];
}
