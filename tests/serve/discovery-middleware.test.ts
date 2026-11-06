import { afterEach, describe, expect, it } from 'vitest';
import { cardConnection, createServerCard } from '../../src/card/server-card.ts';
import { airIdentifier } from '../../src/catalog/ai-catalog.ts';
import { discover } from '../../src/client/discover.ts';
import { type AdvertisedEndpoint, discoveryMiddleware } from '../../src/serve/discovery-middleware.ts';
import { startServer, type TestServer } from '../helpers.ts';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** An endpoint whose card points at the URL the request reached it by, and asks for a token. */
function endpoint(path: string, name: string): AdvertisedEndpoint {
  return {
    path,
    identifier: airIdentifier('test.local', name),
    card: ({ endpointUrl }) =>
      createServerCard({
        name: `io.github.cubicecho.test/${name}`,
        version: '1.0.0',
        description: `The ${name} endpoint.`,
        remotes: [
          {
            type: 'streamable-http',
            url: endpointUrl,
            headers: [{ name: 'Authorization', isRequired: true, isSecret: true }],
          },
        ],
      }),
  };
}

/** Starts a server with the middleware in front of a handler that answers 418, so a passed-on request is visible. */
async function serve(endpoints: () => AdvertisedEndpoint[] | Promise<AdvertisedEndpoint[]>): Promise<TestServer> {
  const middleware = discoveryMiddleware(endpoints);
  return startServer(
    (request, response) =>
      new Promise<void>((resolve, reject) => {
        middleware(request, response, (error) => {
          if (error) {
            reject(error);
            return;
          }
          response.writeHead(418);
          response.end();
          resolve();
        });
        response.on('finish', () => resolve());
      }),
  );
}

describe('discoveryMiddleware', () => {
  it('makes every endpoint discoverable, with URLs on the origin the client used', async () => {
    server = await serve(() => [endpoint('/mcp', 'aggregate'), endpoint('/mcp/w/team', 'w-team')]);

    const { servers, failures } = await discover(server.origin);

    expect(failures).toEqual([]);
    expect(servers.map(({ card, cardUrl }) => [card.name, cardUrl, cardConnection(card)])).toEqual([
      [
        'io.github.cubicecho.test/aggregate',
        `${server.origin}/mcp/server-card`,
        { url: `${server.origin}/mcp`, requiredHeaders: ['Authorization'] },
      ],
      [
        'io.github.cubicecho.test/w-team',
        `${server.origin}/mcp/w/team/server-card`,
        { url: `${server.origin}/mcp/w/team`, requiredHeaders: ['Authorization'] },
      ],
    ]);
  });

  it('passes on everything else, including the card of an endpoint it does not list', async () => {
    server = await serve(() => [endpoint('/mcp', 'aggregate')]);
    for (const path of ['/', '/mcp', '/mcp/other/server-card']) {
      expect((await fetch(`${server.origin}${path}`)).status).toBe(418);
    }
  });

  it('follows the endpoint list per request', async () => {
    let endpoints = [endpoint('/mcp', 'aggregate')];
    server = await serve(() => endpoints);
    expect((await discover(server.origin)).servers).toHaveLength(1);
    endpoints = [...endpoints, endpoint('/mcp/w/team', 'w-team')];
    expect((await discover(server.origin)).servers).toHaveLength(2);
  });

  it('hands an error from the endpoint list to next', async () => {
    server = await serve(() => {
      throw new Error('config unreadable');
    });
    const response = await fetch(`${server.origin}/.well-known/ai-catalog.json`);
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('config unreadable');
  });
});
