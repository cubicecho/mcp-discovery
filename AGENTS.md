# AGENTS.md

`@cubicecho/mcp-discovery`: advertise and discover MCP servers. It builds, validates and serves
MCP Server Cards and AI Catalogs, and fetches them from a client. Node >= 22, `zod` as a peer
dependency.

**Read [`SPECS.md`](SPECS.md) first.** It has the relevant standards, the locked decisions,
the open questions and the work list.

The generic rules (TypeScript, Biome, doc comments, commits and releases) are in the
`cubicecho_typescript` skill, and the code rules are in the `coding-standards` skill. This file
holds only what is true of this repo.

## Commands

| | |
| --- | --- |
| `npm run check` | `check:biome`, then `check:types` |
| `npm run check:biome` | biome, writing its fixes; CI runs `npx biome ci .`, which writes none |
| `npm run check:types` | `tsc --noEmit` over src and tests |
| `npm test` | vitest, one pass |
| `npm run build` | emits `dist/`, then regenerates `llms.txt` |

`prepack` runs `build`. CI checks `llms.txt` with `git diff --exit-code -- llms.txt` after
building, so commit it whenever an export or its first doc sentence changes.
`tsconfig.json` checks everything and emits nothing; `tsconfig.build.json` is the only config
that emits.

## Layout

`src/` has one folder per concept; `tests/` mirrors it (`src/card/server-card.ts` is tested in
`tests/card/server-card.test.ts`).

| Folder | The concept | Modules |
| --- | --- | --- |
| `core` | what every other folder shares | `consts` `defaults` `errors` `parse` |
| `card` | one server's MCP Server Card | `server-card` |
| `catalog` | a host's AI Catalog of cards | `ai-catalog` |
| `serve` | answering HTTP requests for a document | `document-response` `node-handler` `discovery-middleware` `request-origin` |
| `client` | fetching documents and discovering a host | `fetch-document` `discover` |
| `mdns` | advertising and finding hosts and servers on a LAN | `txt-record` `advertise` `advertiser` `browse` `server-tracker` `watch-servers` `load-bonjour` `report-error` |

There are two entry points, and they are the only files that re-export: `src/index.ts` (`.`)
and `src/mdns.ts` (`./mdns`). Nothing reachable from `src/index.ts` may import `mdns/`,
because bonjour-service is an optional peer dependency. Only `load-bonjour.ts` imports it at
runtime. A module imports another by its full path (`../core/errors.ts`).

`tests/mdns/network.test.ts` uses real multicast. It runs locally and is skipped when
`CI=true`.

## Invariants

- **The schemas mirror the specs.** `card/server-card.ts` follows `schema.ts` in
  modelcontextprotocol/ext-server-card, and `catalog/ai-catalog.ts` follows the Agent-Card
  AI Catalog spec. Change a schema only to track the spec, and update the vendored fixtures in
  `tests/fixtures/server-card/` (and the commit noted in its test) when the spec moves.
- **Every object schema is loose.** Readers keep unknown fields, as both specs require.
- **Nothing here decides what is public.** Serving hands out whatever the host passes in.
- **Every fetch is bounded** by `FETCH_DEFAULTS` (time and size). Don't add a fetch that skips
  `fetchJson`.

## Documentation

The first sentence of a doc comment stands alone, because `scripts/llms-txt.mjs` takes it
verbatim as the index entry for that export.
