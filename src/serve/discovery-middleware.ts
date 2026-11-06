/**
 * Everything a server needs to be discoverable over HTTP: its AI Catalog and a Server Card per MCP endpoint.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { SERVER_CARD_PATH, type ServerCard, serverCardUrl } from '../card/server-card.ts';
import { createAiCatalog, serverCardEntry } from '../catalog/ai-catalog.ts';
import { AI_CATALOG_MEDIA_TYPE, AI_CATALOG_WELL_KNOWN_PATH, SERVER_CARD_MEDIA_TYPE } from '../core/consts.ts';
import type { ServeSettings } from '../core/defaults.ts';
import { writeDocument } from './node-handler.ts';
import { requestOrigin } from './request-origin.ts';

/** What a card builder is told about the request it answers. */
export interface CardContext {
  /** The endpoint's URL as this client reached it, for the card's `remotes`. */
  endpointUrl: string;
  request: IncomingMessage;
}

/** One MCP endpoint a server advertises. */
export interface AdvertisedEndpoint {
  /** The endpoint's path, e.g. `/mcp` or `/mcp/w/team`. Its card is served at this plus `/server-card`. */
  path: string;
  /** The catalog entry's id; see `airIdentifier`. */
  identifier: string;
  /** Builds the endpoint's card for a request. */
  card: (context: CardContext) => ServerCard | Promise<ServerCard>;
}

/** Lists the endpoints to advertise, asked per request so it can follow config changes. */
export type EndpointSource = (request: IncomingMessage) => AdvertisedEndpoint[] | Promise<AdvertisedEndpoint[]>;

/** Express-style middleware: it answers discovery requests and passes every other request to `next`. */
export type DiscoveryMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) => void;

/**
 * Middleware that serves `/.well-known/ai-catalog.json` and each endpoint's `<path>/server-card`.
 *
 * @param endpoints - The endpoints to advertise.
 * @param [overrides] - Serving settings to change.
 * @returns The middleware; mount it at the root, before any auth guard, since discovery documents are public.
 *
 * @remarks
 * Every URL in the documents is built from the origin the request arrived at, so a client on the LAN is
 * told LAN addresses and one on localhost is told localhost. Errors from `endpoints` or a card go to `next`.
 */
export function discoveryMiddleware(
  endpoints: EndpointSource,
  overrides: Partial<ServeSettings> = {},
): DiscoveryMiddleware {
  const answer = async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const isCatalog = pathname === AI_CATALOG_WELL_KNOWN_PATH;
    const isCard = pathname.endsWith(SERVER_CARD_PATH);
    if (isCatalog === false && isCard === false) {
      return false;
    }
    const origin = requestOrigin(request);
    const listed = await endpoints(request);
    if (isCatalog) {
      const entries = listed.map((endpoint) =>
        serverCardEntry(endpoint.identifier, serverCardUrl(new URL(endpoint.path, origin).href)),
      );
      writeDocument(request, response, createAiCatalog({ entries }), AI_CATALOG_MEDIA_TYPE, overrides);
      return true;
    }
    const cardUrl = new URL(pathname, origin).href;
    const endpoint = listed.find((candidate) => serverCardUrl(new URL(candidate.path, origin).href) === cardUrl);
    if (!endpoint) {
      return false;
    }
    const endpointUrl = new URL(endpoint.path, origin).href;
    writeDocument(request, response, await endpoint.card({ endpointUrl, request }), SERVER_CARD_MEDIA_TYPE, overrides);
    return true;
  };

  return (request, response, next) => {
    answer(request, response).then(
      (answered) => {
        if (answered === false) {
          next();
        }
      },
      (error: unknown) => next(error),
    );
  };
}
