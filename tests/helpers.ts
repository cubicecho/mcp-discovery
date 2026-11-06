import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServerCard, type ServerCard } from '../src/card/server-card.ts';

/** A small valid card for tests to start from. */
export function sampleCard(name = 'io.github.cubicecho/weather'): ServerCard {
  return createServerCard({
    name,
    version: '1.2.0',
    description: 'Weather forecasts.',
    remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
  });
}

/** A Node HTTP server on a free loopback port; `close` stops it. */
export interface TestServer {
  origin: string;
  close: () => Promise<void>;
}

/** Starts a server whose handler errors become 500s; pass `0.0.0.0` as `host` to reach it on the LAN. */
export async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
  host = '127.0.0.1',
): Promise<TestServer> {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.writeHead(500);
      response.end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address: AddressInfo | string | null = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('A TCP listener reports an AddressInfo');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        // A handler that never answers would otherwise hold close() open.
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
