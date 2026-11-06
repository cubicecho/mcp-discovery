# @cubicecho/mcp-discovery

Advertise and discover MCP servers.

A server describes itself with an [MCP Server Card][sep] (SEP-2127): its name, version, and
the URLs and protocol versions it can be reached at. A host lists its cards in an
[AI Catalog][catalog] at `/.well-known/ai-catalog.json`. A client fetches the catalog, then
each card, and knows where to connect without being configured by hand.

This package does both halves: it builds, validates and serves cards and catalogs, and it
discovers them from a client. On a LAN it can also advertise and find hosts over mDNS.

[sep]: https://modelcontextprotocol.io/seps/2127-mcp-server-cards
[catalog]: https://github.com/Agent-Card/ai-catalog

```bash
npm install @cubicecho/mcp-discovery zod
```

## Quick start: be found on the LAN, and find others

A server that wants to be found serves its catalog and cards, then announces itself:

```ts
import { airIdentifier, createServerCard, discoveryMiddleware } from '@cubicecho/mcp-discovery';
import { advertise } from '@cubicecho/mcp-discovery/mdns';

app.use(
  discoveryMiddleware(() => [
    {
      path: '/mcp',
      identifier: airIdentifier('skills.local', 'skills'),
      card: ({ endpointUrl }) =>
        createServerCard({
          name: 'io.github.cubicecho.mcp-skills.nas/skills',
          version: '4.0.0',
          description: 'Skills for agents.',
          remotes: [
            {
              type: 'streamable-http',
              url: endpointUrl,
              headers: [{ name: 'Authorization', isRequired: true, isSecret: true }],
            },
          ],
        }),
    },
  ]),
);
app.listen(3000, '0.0.0.0', async () => {
  const advertisement = await advertise({ name: 'MCP Skills on nas', port: 3000 });
  process.on('SIGTERM', () => advertisement.stop());
});
```

Mount the middleware before any auth guard, since the documents are public. Listen on the LAN,
not only on localhost, and advertise after `listen`.

Something that wants to find servers, such as a router, watches:

```ts
import { watchServers } from '@cubicecho/mcp-discovery/mdns';

const watch = await watchServers({
  onUp: ({ key, card, connection }) => {
    // connection.url is the endpoint; connection.requiredHeaders lists what the user must supply.
  },
  onDown: ({ key }) => {},
});
```

Anything on the LAN can advertise, and cards are unauthenticated, so what to link is the
watcher's policy. See "Auto-linking" in [SPECS.md](SPECS.md).

## Serving (Express 5 or plain `node:http`)

```ts
import {
  AI_CATALOG_WELL_KNOWN_PATH,
  aiCatalogHandler,
  airIdentifier,
  createAiCatalog,
  createServerCard,
  serverCardEntry,
  serverCardHandler,
  serverCardUrl,
} from '@cubicecho/mcp-discovery';

const endpoint = 'https://mcp.example.com/mcp';

const card = createServerCard({
  name: 'com.example/weather',
  version: '1.2.0',
  description: 'Weather forecasts.',
  remotes: [{ type: 'streamable-http', url: endpoint }],
});

const catalog = createAiCatalog({
  entries: [serverCardEntry(airIdentifier('example.com', 'weather'), serverCardUrl(endpoint))],
});

app.get('/mcp/server-card', serverCardHandler(() => card));
app.get(AI_CATALOG_WELL_KNOWN_PATH, aiCatalogHandler(() => catalog));
```

Each handler takes a function rather than a document, so it can build the document per request
from live config. Responses carry `Access-Control-Allow-Origin: *`, `Cache-Control: public,
max-age=3600` and an `ETag`, and answer `304` to a matching `If-None-Match`. Route `OPTIONS` to
the same handler for CORS preflights. Without a framework, `documentResponse()` returns the
status, headers and body to write yourself.

Cards and catalogs are public by design. Don't put tokens, private hosts or per-user data in
them. To tell a client that it needs a token, declare the header without its value:
`headers: [{ name: 'Authorization', isRequired: true, isSecret: true }]`.

## Discovering

```ts
import { discover } from '@cubicecho/mcp-discovery';

const { servers, failures } = await discover('https://mcp.example.com');
for (const { card, cardUrl } of servers) {
  console.log(card.name, card.remotes?.[0]?.url, cardUrl);
}
```

`discover` throws if the catalog itself can't be read. A card that can't be read lands in
`failures` with a `DocumentFetchError` (network, status, timeout, size) or an
`InvalidDocumentError` (not JSON, or not a valid card), and the rest still come back. Every
fetch is bounded: pass `{ timeoutMs, maxDocumentBytes }` to change the limits in
`FETCH_DEFAULTS`.

A card is advisory. Check what it claims against the live connection before relying on it.

## On a LAN: mDNS

`@cubicecho/mcp-discovery/mdns` advertises and finds hosts as `_mcp._tcp` services. It needs
the optional peer dependency `bonjour-service` (`npm install bonjour-service`).

```ts
import { advertise, findHosts } from '@cubicecho/mcp-discovery/mdns';
import { discoverCatalog } from '@cubicecho/mcp-discovery';

// On the server: announce, and stop on shutdown so browsers drop it at once.
const advertisement = await advertise({ name: 'MCP Router on nas', port: 3000 });
process.on('SIGTERM', () => advertisement.stop());

// On a client: listen for a few seconds, then read each host's catalog.
for (const host of await findHosts()) {
  const { servers } = await discoverCatalog(host.catalogUrl);
}
```

`watchHosts({ onUp, onDown })` keeps browsing and reports hosts as they come and go.
`watchServers` goes one step further: it reads each host's catalog and reports servers.

mDNS only says where a host is. Its TXT record holds the endpoint path and the catalog path,
and the catalog says what the host serves. mDNS needs multicast, which Docker's default bridge
network drops, so a container that advertises needs `network_mode: host`.

## Design

The decisions and the work list are in [SPECS.md](SPECS.md). In short: zod schemas mirror the
two specs and stay loose, so unknown fields survive. Builders validate what they produce.
Serving works without a framework. Discovery reports failures per entry.
