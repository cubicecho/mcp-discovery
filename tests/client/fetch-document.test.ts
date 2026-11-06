import { afterEach, describe, expect, it } from 'vitest';
import { fetchAiCatalog, fetchServerCard } from '../../src/client/fetch-document.ts';
import { SERVER_CARD_MEDIA_TYPE } from '../../src/core/consts.ts';
import { DocumentFetchError, InvalidDocumentError } from '../../src/core/errors.ts';
import { serverCardHandler } from '../../src/serve/node-handler.ts';
import { sampleCard, startServer, type TestServer } from '../helpers.ts';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('fetchServerCard', () => {
  it('asks for the card media type and validates the answer', async () => {
    const card = sampleCard();
    let accept: string | undefined;
    const handler = serverCardHandler(() => card);
    server = await startServer(async (request, response) => {
      accept = request.headers.accept;
      await handler(request, response);
    });

    await expect(fetchServerCard(`${server.origin}/mcp/server-card`)).resolves.toEqual(card);
    expect(accept).toBe(SERVER_CARD_MEDIA_TYPE);
  });

  it('carries the status of an error response', async () => {
    server = await startServer((_request, response) => {
      response.writeHead(503, 'Service Unavailable');
      response.end();
    });
    const failure = fetchServerCard(`${server.origin}/x`);
    await expect(failure).rejects.toThrow(DocumentFetchError);
    await expect(failure).rejects.toMatchObject({ status: 503, message: expect.stringContaining('503') });
  });

  it('rejects a body that is not JSON', async () => {
    server = await startServer((_request, response) => {
      response.end('<html>');
    });
    await expect(fetchServerCard(`${server.origin}/x`)).rejects.toThrow(InvalidDocumentError);
  });

  it('rejects a body past the size cap, declared or streamed', async () => {
    const big = JSON.stringify({ padding: 'x'.repeat(2000) });
    server = await startServer((request, response) => {
      const declares = request.url === '/declared';
      response.writeHead(200, declares ? { 'Content-Length': String(big.length) } : {});
      response.end(big);
    });
    for (const path of ['/declared', '/streamed']) {
      await expect(fetchServerCard(`${server.origin}${path}`, { maxDocumentBytes: 1000 })).rejects.toThrow(
        /larger than 1000 bytes/,
      );
    }
  });

  it('times out a host that never answers', async () => {
    server = await startServer(() => undefined);
    await expect(fetchServerCard(`${server.origin}/x`, { timeoutMs: 50 })).rejects.toThrow(/timed out after 50 ms/);
  });

  it('honours the caller abort signal', async () => {
    server = await startServer(() => undefined);
    const controller = new AbortController();
    const failure = fetchServerCard(`${server.origin}/x`, {}, { signal: controller.signal });
    controller.abort();
    await expect(failure).rejects.toMatchObject({
      status: null,
      message: expect.stringContaining('could not be fetched'),
    });
  });
});

describe('fetchAiCatalog', () => {
  it('uses the fetch it is given', async () => {
    const fetch = async () => Response.json({ specVersion: '1.0', entries: [] });
    await expect(fetchAiCatalog('https://nowhere.test/catalog', {}, { fetch })).resolves.toEqual({
      specVersion: '1.0',
      entries: [],
    });
  });
});
