import { describe, expect, it } from 'vitest';
import { createServerCard } from '../../src/card/server-card.ts';
import { airIdentifier } from '../../src/catalog/ai-catalog.ts';
import { advertise } from '../../src/mdns/advertise.ts';
import { findHosts, type McpHost, watchHosts } from '../../src/mdns/browse.ts';
import type { LanServer } from '../../src/mdns/server-tracker.ts';
import { watchServers } from '../../src/mdns/watch-servers.ts';
import { discoveryMiddleware } from '../../src/serve/discovery-middleware.ts';
import { startServer } from '../helpers.ts';

// Real multicast on this machine's network. Hosted CI runners don't reliably route it, so it runs locally only.
const isCi = process.env.CI === 'true';

/** A promise and the function that settles it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe.skipIf(isCi)('advertise and browse over real mDNS', () => {
  const name = `mcp-discovery-test-${process.pid}`;

  it('finds an advertised host in a timed browse', async () => {
    const advertisement = await advertise({ name, port: 45_123, path: '/mcp/w/test' });
    try {
      const found = (await findHosts({ browseMs: 1500 })).find((host) => host.name === name);
      expect(found).toMatchObject({ port: 45_123, txt: { path: '/mcp/w/test' } });
      expect(found?.endpointUrl).toMatch(/:45123\/mcp\/w\/test$/);
    } finally {
      await advertisement.stop();
    }
  }, 15_000);

  it('reports a watched host coming up and saying goodbye', async () => {
    const up = deferred<McpHost>();
    const down = deferred<McpHost>();
    const watch = await watchHosts({
      onUp: (host) => host.name === name && up.resolve(host),
      onDown: (host) => host.name === name && down.resolve(host),
    });
    try {
      const advertisement = await advertise({ name, port: 45_124 });
      await expect(up.promise).resolves.toMatchObject({ port: 45_124 });
      await advertisement.stop();
      await expect(down.promise).resolves.toMatchObject({ name });
    } finally {
      await watch.stop();
    }
  }, 15_000);

  it('finds a server end to end: advertised over mDNS, described by its catalog and card', async () => {
    // The advertising side, as a small server like the skills server would set it up.
    const middleware = discoveryMiddleware(() => [
      {
        path: '/mcp',
        identifier: airIdentifier('skills.local', 'skills'),
        card: ({ endpointUrl }) =>
          createServerCard({
            name: 'io.github.cubicecho.test/skills',
            version: '1.0.0',
            description: 'Skills.',
            remotes: [{ type: 'streamable-http', url: endpointUrl }],
          }),
      },
    ]);
    const http = await startServer((request, response) => {
      middleware(request, response, () => {
        response.writeHead(404);
        response.end();
      });
    }, '0.0.0.0');
    const port = Number(new URL(http.origin).port);
    const advertisement = await advertise({ name: `${name}-skills`, port });

    // The discovering side, as the router would run it.
    const up = deferred<LanServer>();
    const watch = await watchServers({
      onUp: (server) => server.host.name === `${name}-skills` && up.resolve(server),
    });
    try {
      const server = await up.promise;
      expect(server.card.name).toBe('io.github.cubicecho.test/skills');
      expect(server.connection?.url).toMatch(new RegExp(`:${port}/mcp$`));
      expect(server.connection?.requiredHeaders).toEqual([]);
    } finally {
      await watch.stop();
      await advertisement.stop();
      await http.close();
    }
  }, 15_000);
});
