/**
 * Request handlers for Node's `http` server, which Express 5 and most other Node frameworks also accept.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerCard } from '../card/server-card.ts';
import type { AiCatalog } from '../catalog/ai-catalog.ts';
import { AI_CATALOG_MEDIA_TYPE, SERVER_CARD_MEDIA_TYPE } from '../core/consts.ts';
import type { ServeSettings } from '../core/defaults.ts';
import { documentResponse } from './document-response.ts';

/**
 * Where a handler gets the document it serves, asked once per request so it can follow config changes.
 *
 * @typeParam T - The document type.
 */
export type DocumentSource<T> = (request: IncomingMessage) => T | Promise<T>;

/** A Node request handler; it rejects when the document source throws. */
export type DocumentHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

/**
 * Writes a discovery document as the response to a request.
 *
 * @param request - The request, for its method and `If-None-Match`.
 * @param response - Where to write.
 * @param document - The document.
 * @param mediaType - Its `Content-Type`.
 * @param [overrides] - Serving settings to change.
 */
export function writeDocument(
  request: IncomingMessage,
  response: ServerResponse,
  document: unknown,
  mediaType: string,
  overrides: Partial<ServeSettings> = {},
): void {
  // Node always sets `method` on a server's request; it is optional only for client-side messages.
  const method = request.method ?? 'GET';
  const ifNoneMatch = request.headers['if-none-match'];
  const { status, headers, body } = documentResponse(document, mediaType, { method, ifNoneMatch }, overrides);
  response.writeHead(status, headers);
  response.end(body);
}

/**
 * A handler that serves one kind of discovery document.
 *
 * @typeParam T - The document type.
 * @param mediaType - The document's `Content-Type`.
 * @param source - Returns the document for a request.
 * @param [overrides] - Serving settings to change.
 * @returns The handler.
 */
export function documentHandler<T>(
  mediaType: string,
  source: DocumentSource<T>,
  overrides: Partial<ServeSettings> = {},
): DocumentHandler {
  return async (request, response) => {
    writeDocument(request, response, await source(request), mediaType, overrides);
  };
}

/**
 * A handler that serves a Server Card, for `<streamable-http-url>/server-card`.
 *
 * @param source - Returns the card for a request.
 * @param [overrides] - Serving settings to change.
 * @returns The handler.
 */
export function serverCardHandler(
  source: DocumentSource<ServerCard>,
  overrides: Partial<ServeSettings> = {},
): DocumentHandler {
  return documentHandler(SERVER_CARD_MEDIA_TYPE, source, overrides);
}

/**
 * A handler that serves an AI Catalog, for `/.well-known/ai-catalog.json`.
 *
 * @param source - Returns the catalog for a request.
 * @param [overrides] - Serving settings to change.
 * @returns The handler.
 */
export function aiCatalogHandler(
  source: DocumentSource<AiCatalog>,
  overrides: Partial<ServeSettings> = {},
): DocumentHandler {
  return documentHandler(AI_CATALOG_MEDIA_TYPE, source, overrides);
}
