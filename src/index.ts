/**
 * Advertise and discover MCP servers.
 *
 * A server describes itself with an MCP Server Card (SEP-2127) and a host lists its cards in an AI
 * Catalog at `/.well-known/ai-catalog.json`. This package builds and validates both, serves them with
 * the CORS and caching headers the spec asks for, and on the client side fetches a host's catalog and
 * every card in it, bounded in time and size. LAN advertising and browsing over mDNS is the separate
 * `@cubicecho/mcp-discovery/mdns` export.
 */

export { hostSlug } from './card/host-slug.ts';
export {
  type CardConnection,
  cardConnection,
  createServerCard,
  type Icon,
  type Input,
  iconSchema,
  inputSchema,
  type KeyValueInput,
  keyValueInputSchema,
  parseServerCard,
  type Remote,
  type Repository,
  remoteSchema,
  repositorySchema,
  SERVER_CARD_PATH,
  SERVER_CARD_SCHEMA_URL,
  type ServerCard,
  type ServerCardFields,
  serverCardSchema,
  serverCardUrl,
  TRANSPORT_SSE,
  TRANSPORT_STREAMABLE_HTTP,
} from './card/server-card.ts';
export {
  AI_CATALOG_SPEC_VERSION,
  type AiCatalog,
  type AiCatalogFields,
  aiCatalogLinkHeader,
  aiCatalogSchema,
  airIdentifier,
  type CatalogEntry,
  catalogEntrySchema,
  createAiCatalog,
  type HostInfo,
  hostInfoSchema,
  inlineServerCardEntry,
  parseAiCatalog,
  parseInlineServerCard,
  type ServerCardEntry,
  serverCardEntries,
  serverCardEntry,
} from './catalog/ai-catalog.ts';
export {
  type DiscoveredServer,
  type Discovery,
  type DiscoveryFailure,
  discover,
  discoverCatalog,
} from './client/discover.ts';
export { type FetchOptions, fetchAiCatalog, fetchServerCard } from './client/fetch-document.ts';
export { AI_CATALOG_MEDIA_TYPE, AI_CATALOG_WELL_KNOWN_PATH, SERVER_CARD_MEDIA_TYPE } from './core/consts.ts';
export { FETCH_DEFAULTS, type FetchSettings, SERVE_DEFAULTS, type ServeSettings } from './core/defaults.ts';
export { DiscoveryError, DocumentFetchError, InvalidDocumentError } from './core/errors.ts';
export {
  type AdvertisedEndpoint,
  type CardContext,
  type DiscoveryMiddleware,
  discoveryMiddleware,
  type EndpointSource,
} from './serve/discovery-middleware.ts';
export { type DocumentRequest, type DocumentResponse, documentResponse } from './serve/document-response.ts';
export {
  aiCatalogHandler,
  type DocumentHandler,
  type DocumentSource,
  documentHandler,
  serverCardHandler,
  writeDocument,
} from './serve/node-handler.ts';
export { requestOrigin } from './serve/request-origin.ts';
