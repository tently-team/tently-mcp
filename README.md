# Tently MCP

[![npm](https://img.shields.io/npm/v/@tently/mcp)](https://www.npmjs.com/package/@tently/mcp)
[![CI](https://github.com/tently-team/tently-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/tently-team/tently-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/tently-team/tently-mcp)
[![M8ven Score](https://m8ven.ai/badge/mcp/tently-team-tently-mcp-1pwlm6?v=1d89c6db51e6ec540bb78b90dfa8316f)](https://m8ven.ai/mcp/tently-team-tently-mcp-1pwlm6?s=readme)

Tently in your coding agent. An [MCP](https://modelcontextprotocol.io) server for Claude Code and
Cursor that checks your team's decisions (the rules [Tently](https://tently.dev) learned from
your pull requests, reviews and docs) before the agent writes code.

Coding agents write code fast, but they don't know why your team built things the way it did.
Tently remembers, and this server gives your agent that memory while it works, before a pull
request exists.

## Set up

Create an API key on the **Connect** page at [app.tently.dev](https://app.tently.dev), then run
this from your repo root:

```sh
npx @tently/mcp init --agent claude --api-key <your key>
```

Or pass the key through the environment:

```sh
TENTLY_API_KEY=<your key> npx @tently/mcp init
```

`init` adds the `tently` server to `.mcp.json` (Claude Code) or `.cursor/mcp.json` (Cursor), and
installs a small skill that tells the agent when to use it. It backs up any file before editing
it, keeps your other MCP servers, and prints every change. Restart your agent afterwards.

`--agent` takes `claude`, `cursor`, `both` or `auto` (the default, which detects what's in the
repo).

### Manual config

```json
{
  "mcpServers": {
    "tently": {
      "command": "npx",
      "args": ["-y", "@tently/mcp", "mcp"],
      "env": { "TENTLY_API_KEY": "<your key>" }
    }
  }
}
```

## What the agent gets

- **`search_decisions`**: the decisions that apply to the code it's about to change, from your
  Tently workspace. Each one says whether breaking it is blocking or advisory.
- **`query_impact_zone`**: the blast radius of a symbol (who calls it, what it depends on),
  computed locally on your checkout with [CodeGraph](https://github.com/colbymchenry/codegraph).
  Your source code never leaves your machine. The index lives in `.codegraph/`, which `init`
  adds to `.gitignore`.

Impact results are evidence, not proof: callers reached through interfaces, dynamic dispatch or
re-exports can be missed, and the tool says so in its output.

## Configuration

| Variable | Meaning |
| --- | --- |
| `TENTLY_API_KEY` | Workspace API key (required for `search_decisions`) |
| `TENTLY_API_URL` | API origin, default `https://api.tently.dev` |
| `TENTLY_WORKING_DIR` | Directory `query_impact_zone` indexes, default the current directory |

## Privacy

`search_decisions` sends your query text and the file paths you pass to the Tently API. Nothing
else leaves your machine: `query_impact_zone` runs entirely locally. See
[tently.dev](https://tently.dev) for how Tently handles data.

## Development

```sh
npm install
npm test
npm run build
node dist/cli.js mcp   # start the server on stdio
```

Requires Node.js 20 or later.

## Contributing

Issues and pull requests are welcome. For anything beyond a small fix, please open an issue first
so we can agree on the approach.

## License

[MIT](LICENSE)
