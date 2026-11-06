import { afterEach, describe, expect, it } from 'vitest';
import { serverCardUrl } from '../../src/card/server-card.ts';
import { createAiCatalog, inlineServerCardEntry, serverCardEntry } from '../../src/catalog/ai-catalog.ts';
import { discover } from '../../src/client/discover.ts';
import { AI_CATALOG_WELL_KNOWN_PATH } from '../../src/core/consts.ts';
import { DocumentFetchError, InvalidDocumentError } from '../../src/core/errors.ts';
import { aiCatalogHandler, serverCardHandler } from '../../src/serve/node-handler.ts';
import { sampleCard, startServer, type TestServer } from '../helpers.ts';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('discover, against a host served by this package', () => {
  it('reads cards by absolute URL, relative URL and inline, and reports the ones that fail', async () => {
    const weather = sampleCard('io.github.cubicecho/weather');
    const notes = sampleCard('io.github.cubicecho/notes');
    const inline = sampleCard('io.github.cubicecho/inline');
    let origin = '';

    const routes: Record<string, ReturnType<typeof serverCardHandler>> = {
      [AI_CATALOG_WELL_KNOWN_PATH]: aiCatalogHandler(() =>
        createAiCatalog({
          entries: [
            serverCardEntry('urn:air:test:mcp:weather', serverCardUrl(`${origin}/mcp/weather`)),
            serverCardEntry('urn:air:test:mcp:notes', '/mcp/notes/server-card'),
            inlineServerCardEntry('urn:air:test:mcp:inline', inline),
            serverCardEntry('urn:air:test:mcp:missing', '/mcp/missing/server-card'),
            serverCardEntry('urn:air:test:mcp:broken', '/mcp/broken/server-card'),
          ],
        }),
      ),
      '/mcp/weather/server-card': serverCardHandler(() => weather),
      '/mcp/notes/server-card': serverCardHandler(() => notes),
      '/mcp/broken/server-card': async (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{"name":"broken"}');
      },
    };
    server = await startServer(async (request, response) => {
      const route = routes[request.url ?? ''];
      if (route) {
        await route(request, response);
        return;
      }
      response.writeHead(404);
      response.end();
    });
    origin = server.origin;

    const found = await discover(`${origin}/some/page`);

    expect(found.catalogUrl).toBe(`${origin}${AI_CATALOG_WELL_KNOWN_PATH}`);
    expect(found.servers.map((s) => [s.card.name, s.cardUrl])).toEqual([
      [weather.name, `${origin}/mcp/weather/server-card`],
      [notes.name, `${origin}/mcp/notes/server-card`],
      [inline.name, null],
    ]);
    expect(found.failures.map((f) => [f.entry.identifier, f.error.constructor])).toEqual([
      ['urn:air:test:mcp:missing', DocumentFetchError],
      ['urn:air:test:mcp:broken', InvalidDocumentError],
    ]);
    const [missing] = found.failures;
    expect(missing?.error).toMatchObject({ status: 404 });
  });

  it('throws when the host has no catalog', async () => {
    server = await startServer((_request, response) => {
      response.writeHead(404);
      response.end();
    });
    await expect(discover(server.origin)).rejects.toThrow(DocumentFetchError);
  });
});
