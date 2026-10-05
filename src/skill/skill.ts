/**
 * The Tently coding-agent skill.
 *
 * The markdown below is the single source of truth for the skill `init` installs
 * into a coding agent (Claude Code skill / Cursor rule). It's embedded as a
 * string rather than a loose `.md` file so it survives `tsc` compilation into
 * `dist/` and ships in the published package without an extra copy step.
 */

/** Directory-name / rule-name Tently installs under in a coding agent's config. */
export const SKILL_NAME = 'tently-decision-guard';

export const SKILL_FRONTMATTER_NAME = 'tently-decision-guard';

/** The skill body, written for the agent that will read it. */
export const SKILL_CONTENT = `---
name: tently-decision-guard
description: >-
  Consult Tently's institutional memory before you write or change code. Use the
  Tently MCP tools to catch architectural drift and regressions WHILE coding,
  before a PR exists. Trigger before implementing in an unfamiliar area and
  before changing any shared or exported symbol.
---

# Tently decision guard

Tently is this codebase's institutional memory. Two Tently MCP tools are
available; use them proactively — they are cheap insurance against a review
finding or a silent regression.

## \`search_decisions\` — before you implement

Call this **before writing or substantially changing code in an area**,
especially one you haven't touched before. It returns ratified decisions
(architecture boundaries, patterns, naming, process rules) that the PR review
gate enforces. Building with them saves a round-trip.

Trigger when you are about to:
- Add a new module, endpoint, table, or job.
- Introduce a dependency between packages/layers.
- Follow (or invent) a naming/structure convention.
- Touch an area flagged in the repo's conventions.

Pass a natural-language \`query\` describing what you're about to do, plus the
\`paths\` you'll edit so retrieval is scoped. Read the returned decisions,
including their exemplars, and follow them. If a decision conflicts with the
task, surface the conflict to the human rather than silently violating it.

## \`query_impact_zone\` — before you change a shared symbol

Call this **before changing the signature, contract, or behavior of any symbol
that other code depends on** — exported functions, public methods, shared types,
interfaces. It runs a local code-graph analysis on the working tree (source
never leaves the machine) and returns the callers/dependents that could break.

Trigger before you:
- Rename or change the parameters/return type of an exported symbol.
- Change the behavior of a widely-used function or method.
- Remove or move a shared symbol.

**Empty results are not proof of safety.** Recall is imperfect: callers bound
through interfaces, dynamic dispatch, or re-exports are routinely missed, and
the tool says so via its \`epistemic\` and \`boundaries\` fields. Treat the output
as evidence, not truth — when it reports few or no impacts on a symbol you
believe is widely used, corroborate with a grep and a read before proceeding.

## Default posture

When in doubt, ask Tently first and corroborate its answers. Not calling these
tools when they apply is how drift and regressions slip in.
`;
