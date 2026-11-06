# SPECS — @cubicecho/mcp-discovery

How an MCP server tells the network it exists, and how a client finds it. One library for
both sides, so every cubicecho server advertises itself the same way and every client reads
it the same way. The first consumer is mcp-router (`../mcp/mcp-router`), which exposes many
endpoints (`/mcp`, `/mcp/<name>`, `/mcp/w/<slug>`) and wants all of them findable.

## What the standards say (as of 2026-11)

| Mechanism | Status | Scope | Used here for |
| --- | --- | --- | --- |
| **MCP Server Card** ([SEP-2127], [extension repo]) | Final, optional extension | One server: identity, remote URLs, protocol versions | The per-endpoint document |
| **AI Catalog** ([ai-catalog spec]) | Published, `specVersion` 1.0 | A host: a list of artifacts by media type | The host-level index of cards |
| `/.well-known/ai-catalog.json` (RFC 8615) | Part of AI Catalog | Domain-level discovery | Where a client looks first |
| `Link: <…>; rel="ai-catalog"` | Part of AI Catalog | Any HTTP response or HTML page | Pointing the web UI at the catalog |
| mDNS / DNS-SD (`_mcp._tcp.local`) | **No MCP spec.** Community convention only | Same LAN | Optional, phase 2 |
| Unicast DNS TXT (`_mcp.<domain>`) | IETF informational draft, not adopted | A domain | Not planned |

[SEP-2127]: https://modelcontextprotocol.io/seps/2127-mcp-server-cards
[extension repo]: https://github.com/modelcontextprotocol/ext-server-card
[ai-catalog spec]: https://github.com/Agent-Card/ai-catalog/blob/main/specification/ai-catalog.md

Facts from the specs that shape the code:

- A card lives at `<streamable-http-url>/server-card`, so a server at `https://host/mcp` has
  its card at `https://host/mcp/server-card`. Any URL is allowed, but this is the reserved one.
- Media types: `application/mcp-server-card+json` for a card and
  `application/ai-catalog+json` for a catalog. A client sends the card type in `Accept`.
- A card's `$schema` is exactly
  `https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json`. `name` is
  reverse-DNS with one slash (`com.example/weather`). `description` and `title` are at most 100
  characters. A `version` that is a range (`^1.2.3`, `1.x`) is rejected.
- A card has **no tools, resources or prompts**, and no capabilities. Those come from the live
  connection. A card is advisory: clients must not base security decisions on it.
- A catalog entry has `identifier`, `type` and exactly one of `url` or `data` (inline card).
  The recommended identifier form is `urn:air:{publisher}:{namespace}:{name}`.
- Catalog consumers accept any 1.x `specVersion`, ignore unknown fields, and reject a higher
  major version with an informative error.
- Serving: `Access-Control-Allow-Origin: *` (cards are public), `Cache-Control: public,
  max-age=3600`, an `ETag`, and `304` for a matching `If-None-Match`.
- Cards and catalogs are public. They must not carry credentials, internal topology or
  per-user data.

## Locked decisions

1. **Two halves, one package.** Producing (build and serve documents) and consuming (fetch and
   discover) share the schemas, so they live together. mDNS is a separate subpath export
   (`@cubicecho/mcp-discovery/mdns`) with its library as an optional peer dependency, so a
   consumer that only serves HTTP documents installs nothing extra.
2. **zod schemas are the contract**, as in mcp-router's `shared/`. Types are inferred, never
   written by hand. `zod` is a peer dependency (`>=4`), so the host's zod instance is the one
   in use and a host can `.extend()` the exported schemas.
3. **Parse leniently.** Every object schema is loose: unknown fields survive, as both specs
   require of consumers. Builders validate what they produce, so an invalid card fails where
   it is built, not when a client reads it.
4. **Serving is framework-free.** The core is a pure function from (document, request method,
   `If-None-Match`) to (status, headers, body). A thin adapter takes Node's
   `IncomingMessage`/`ServerResponse`, which Express 5 handlers also receive. No Express
   dependency.
5. **The library never decides what is public.** It serves what the host hands it. Whether
   installed server names may be listed without a token is the host's call (mcp-router:
   see "Router integration").
6. **Fetching has limits.** A timeout and a body-size cap on every fetch, both tunable in
   `defaults.ts`. Discovery on a LAN talks to hosts nobody vetted.
7. **Discovery reports per-entry failures.** One bad card in a catalog does not fail the rest:
   `discover()` returns the servers it read and, apart, the entries it could not read, each
   with a typed error. A catalog that cannot be read at all throws.
8. **Node ≥ 22, ESM only**, tooling copied from agent-core (Biome, TypeScript 7, Vitest,
   semantic-release with npm trusted publishing, a generated `llms.txt`).

## mDNS convention (confirmed 2026-11-05)

There is no MCP spec for this, so it is ours to define. The convention below keeps the TXT
record small and points at the HTTP documents, which remain the source of truth.

- Service type `_mcp._tcp`, instance name = the host's display name, port = the HTTP port.
- TXT keys:

| Key | Example | Meaning |
| --- | --- | --- |
| `txtvers` | `1` | Version of this TXT layout |
| `path` | `/mcp` | Path of the main streamable-HTTP endpoint |
| `catalog` | `/.well-known/ai-catalog.json` | Path of the host's AI Catalog |
| `tls` | `1` | Present when the endpoint is HTTPS |

- A browser resolves the service, builds `http(s)://<host>:<port><catalog>`, and calls the
  same `discover()` as the HTTP path. mDNS only answers "where"; the catalog answers "what".
- Caveat for every consumer: mDNS needs multicast, which Docker's default bridge network
  drops. A containerised host needs `network_mode: host`, or advertises from outside the
  container.

## Router integration (sketch, decided in mcp-router's SPECS.md)

- `GET /mcp/server-card`, `/mcp/<name>/server-card`, `/mcp/w/<slug>/server-card`: one card per
  endpoint, built from the server/workspace config.
- `GET /.well-known/ai-catalog.json`: one entry per endpoint, pointing at its card.
- These routes skip the bearer-token guard, as `/healthz` does, and **list every server and
  workspace by default** (decided 2026-11-05). A setting can narrow it to the aggregate
  `/mcp` or turn discovery off.
- The card's `remotes[].headers` declares `Authorization` as a required secret input, so a
  client knows to ask for the token. The value itself is never in the card.
- **Naming: project name plus an instance id** (decided 2026-11-05). A new
  `settings.instanceId` defaults to the hostname on first run and is then kept, so renaming
  the machine doesn't change the router's identity.
  - Card name: `io.github.cubicecho.mcp-router.<instance>/<endpoint>`, e.g.
    `io.github.cubicecho.mcp-router.nas/aggregate`, `…nas/context7`, `…nas/w-team`.
  - Catalog id: `urn:air:<instance>.mcp-router:mcp:<endpoint>`.
  - A proxied server does not reuse its upstream registry name, because its URL and auth
    differ. The upstream name goes in `_meta` as
    `{"io.github.cubicecho.mcp-router/upstream": "io.github.upstash/context7"}`.
  - Why: two routers on one LAN would otherwise advertise identical names, and a client
    keying on the name would merge them.
- `Link: </.well-known/ai-catalog.json>; rel="ai-catalog"` on the web UI's HTML responses.
- mDNS behind `settings.mdns` / `MDNS=true`; default to settle (see "Auto-linking").

## Auto-linking (design, 2026-11-05)

The aim: a router finds the MCP servers on its network and adds them as remote servers
without being configured by hand. Smaller servers such as mcp-skills-manager only advertise.

| Role | Router | A server like mcp-skills-manager |
| --- | --- | --- |
| Serves its catalog and cards | `discoveryMiddleware` | `discoveryMiddleware` |
| Advertises over mDNS | `advertise` | `advertise` |
| Watches the network | `watchServers` | — |
| Links what it finds | its own policy, below | — |

What the library gives the router: `watchServers({ onUp, onDown, onError })`. It reports each
server under a network-unique `key` (`<mDNS instance>/<card name>`), with `connection.url`
(the streamable-HTTP endpoint) and `connection.requiredHeaders` (e.g. `["Authorization"]`, a
token only the user can supply). It reports again when the card changes or the host moves to
a new address. It re-reads every catalog every `refreshMs` (5 min), so it also notices
endpoints that were added or removed without any mDNS change.

What the router does with it (phase 3):

- **Skip itself.** It sees its own advertisement; skip its own instance name.
- **Never link another router's cards.** Router cards carry
  `_meta["io.github.cubicecho.mcp-router/role"]` (`aggregate`, `server` or `workspace`), and a
  router skips any card that has it. Without this, two routers would link each other's
  aggregates in a loop and proxy everything twice.
- **A linked server is a normal remote server config** (`config/servers/<name>.json`), plus a
  `discovered: { key, cardName }` field. When the server's URL changes, the router updates the
  config. When it goes down, the router marks it offline and keeps the config, so a reboot
  doesn't drop the user's settings for it.
- **A server that needs a token is not linked automatically.** It shows up as "found, needs a
  token", and the user enters the token once, after which it links.
- **Trust.** mDNS and cards are unauthenticated, so anything on the LAN can advertise any name.
  Auto-linking means trusting the LAN with the tools your agents see, the same trust
  `SECURE_LOCAL_NET` expresses. A name allowlist limits accidents but stops no attacker.

Open (for the router's SPECS.md): auto-link on or off by default; whether the default
allowlist is `io.github.cubicecho.*` (our own servers) or everything; whether mDNS advertising
is on by default.

Rules for any server that advertises:

- **Listen on the LAN, not only on localhost.** mDNS announces the LAN address; a server bound
  to `127.0.0.1` gets advertised but can't be reached.
- **Advertise after `listen`**, and call `stop()` on shutdown. A watcher that finds a host whose
  catalog it can't read yet only tries again on the next refresh.

## mDNS library (decided 2026-11-05)

**`bonjour-service`, for both advertising and browsing.** ciao is better maintained but
cannot browse, and one library beats two. Compared 2026-11-05:

| | `@homebridge/ciao` | `bonjour-service` |
| --- | --- | --- |
| Latest release | 1.4.0, 2026-11-01 | 1.4.4, 2026-07-28 |
| Last commit | 2026-11-01 | 2026-09-02 |
| Open issues | 4 | 31 |
| Notes | TypeScript, Node ≥ 22, passes Apple's Bonjour Conformance Test | Most downloads come in through webpack-dev-server |
| Can advertise | yes | yes |
| Can browse | **no** (on its roadmap, no date) | yes |

Quirks the wrapper handles:

- A name already in use is only logged, with no event. `advertise` waits for the `up` event
  with a timeout and throws `AdvertiseError`.
- Socket errors throw unless an error callback is given, so one is always passed (to
  `onError`, or `process.emitWarning`).
- The default SRV host is the bare `os.hostname()`, which no mDNS client can resolve.
  `advertise` defaults it to `<hostname>.local`.

It runs fine next to Avahi on port 5353 (checked on Linux, 2026-11-05).

## Open questions

- **Align the TXT layout** with the community `_mcp._tcp` convention if one firms up.
- **Nested catalogs** (`type: application/ai-catalog+json` entries): follow them in
  `discover()`, with a depth limit, or leave it to the caller?

## Work list

### Phase 1 — HTTP documents (started)

- [x] Package scaffold: package.json, tsconfig, Biome (+ negation plugin), Vitest, CI and
      release workflows, `llms.txt` generator, AGENTS.md
- [x] `core/`: media types and paths (`consts.ts`), tunables (`defaults.ts`), error classes,
      the shared parse helper
- [x] `card/`: Server Card zod schema, `createServerCard`, `parseServerCard`, `serverCardUrl`
- [x] `catalog/`: AI Catalog schema, `createAiCatalog`, card entries (by URL and inline),
      `airIdentifier`, `serverCardEntries`, `aiCatalogLinkHeader`
- [x] `serve/`: `documentResponse` (CORS, caching, ETag/304, HEAD, OPTIONS, 405) and the Node
      handlers `serverCardHandler` / `aiCatalogHandler`
- [x] `client/`: `fetchServerCard`, `fetchAiCatalog` (timeout, size cap, typed errors) and
      `discover(origin)`
- [x] Conformance: run the extension repo's valid/invalid example cards through
      `serverCardSchema` in a test (vendored fixtures)
- [x] README: usage for a server (Express) and a client
- [ ] First publish of 0.1.0 (manual, then `npm trust` for the release workflow), GitHub repo
      `cubicecho/mcp-discovery`

### Phase 2 — mDNS

- [x] Confirm the TXT convention and the library choice above
- [x] `mdns/txt-record.ts`: build and parse the TXT record. A path from the network that isn't a
      plain absolute path (`//other-host/…`) falls back to the default
- [x] `mdns/advertise.ts`: publish `_mcp._tcp`, resolving on `up`, `AdvertiseError` on timeout;
      `stop()` sends goodbyes
- [x] `mdns/browse.ts`: `findHosts` (timed) and `watchHosts` (up/down events); each host
      resolved to `endpointUrl` and `catalogUrl`, preferring an IPv4 address
- [x] `discoverCatalog(catalogUrl)` split out of `discover(origin)`, for mDNS hosts
- [x] `./mdns` subpath export (`src/mdns.ts`), bonjour-service an optional peer, loaded lazily
- [x] Live test on this machine beside Avahi (`tests/mdns/network.test.ts`, skipped when `CI=true`)
- [x] `discoveryMiddleware`: one middleware that serves the catalog and every endpoint's card,
      with URLs from the request's origin (`requestOrigin`)
- [x] `cardConnection(card)`: the usable streamable-HTTP URL, and the headers left to supply
- [x] `watchServers`: mDNS hosts → catalogs → servers up/changed/down, with a periodic refresh;
      the diffing lives in `createServerTracker`, tested without a network
- [x] End-to-end LAN test: a server advertises and serves its card, and a watcher finds it
- [ ] `llms.txt` covers `./mdns` too (the generator reads only `src/index.ts`)
- [ ] Check what another OS's browser sees (`dns-sd -B _mcp._tcp` on macOS, `avahi-browse`
      on Linux, which isn't installed here)
- [ ] Docker: document `network_mode: host` for advertising from a container

### Phase 3 — mcp-router

- [ ] Carry the router decisions above (public by default, instance-id naming) into
      mcp-router's SPECS.md
- [ ] Settle the open auto-link defaults above
- [ ] Router: `discoveryMiddleware` for the aggregate, every server and every workspace;
      `Link` header; `advertise` behind a setting
- [ ] Router: `watchServers` and the auto-link policy above; linked servers kept in step
- [ ] Router UI: "On your network" list (linked, offline, needs a token, skipped)
- [ ] mcp-skills-manager: `discoveryMiddleware` for its endpoints, and `advertise`
- [ ] Try it on the LAN: skills server and router on two machines, the router links the skills
      server, an agent sees its tools through the router
