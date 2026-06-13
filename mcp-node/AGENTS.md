# {{PROJECT_NAME}} — how this template builds and runs

> **Agent: read this before adding or moving files.** The `Dockerfile` — not
> convention — decides what ships and what runs. Put code where the Dockerfile
> copies it, or change the Dockerfile to match.

**Stack:** Node 24 MCP server · **Workload:** web · **Port:** 3000 ·
**MCP endpoint:** `/mcp` (Streamable HTTP)

## What actually runs

The container runs exactly this (from the `Dockerfile`):

```
CMD ["node", "src/index.js"]
```

`src/index.js` is **THE entrypoint** — it starts the HTTP server that exposes the
MCP endpoint at `/mcp` and a `/healthz` probe. To change what the server does,
edit `src/index.js` (or import modules into it). **Do not** add a parallel
entrypoint and expect it to start — nothing runs it unless you change `CMD`.

## What ships into the image

| What | Path | Notes |
|------|------|-------|
| dependencies | `node_modules` | resolved from `package.json` at build (not committed) |
| manifest | `package.json` | declares deps + `"type": "module"` |
| your code | `src/` | everything here ships |

**Anything outside `src/` is NOT in the image.** Add a `COPY` line if you need
something else at runtime.

## File map

```
{{PROJECT_NAME}}/
├── Dockerfile          # build + run contract — edit if you move files or change the port
├── package.json        # dependencies go here (@modelcontextprotocol/sdk, zod)
├── src/
│   └── index.js        # ← ENTRYPOINT: builds the MCP server + serves /mcp and /healthz
├── AGENTS.md           # this file
└── .deploymill/
    └── project.json    # deploymill app config (created by the platform); port lives here too
```

## Recipes

- **Add an MCP tool** → add a `mcp.tool(name, description, zodSchema, handler)`
  call inside `buildMcpServer()` in `src/index.js`. That's how an agent calls it.
- **Add a dependency** → add it to `dependencies` in `package.json`; the next
  deploy runs `pnpm install`.
- **Connect a client** → point it at `https://<your-domain>/mcp` (Streamable
  HTTP transport). The template runs **stateless** (one transport per request);
  for sessions, set a real `sessionIdGenerator` and keep a server-side map.
- **Change the port** → keep `EXPOSE` (Dockerfile), `port`
  (`.deploymill/project.json`), and the `process.env.PORT || 3000` fallback in
  `index.js` in sync. Always read `PORT`; never hardcode.
- **Health check** → `GET /healthz` must return `200`; deploymill probes it and
  auto-rolls-back on non-200.

## Gotchas

- Runs as the non-root `node` user; filesystem is effectively read-only and caps
  are dropped — use a mounted volume for persistence.
- Pinned to `@modelcontextprotocol/sdk` v1.x (`McpServer` +
  `StreamableHTTPServerTransport`). The SDK's in-progress v2 renames the packages
  and transport — don't migrate to it until it's published.
