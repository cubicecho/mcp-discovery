/**
 * LAN advertising and browsing for MCP hosts over mDNS / DNS-SD, as `_mcp._tcp` services.
 *
 * A separate entry point, `@cubicecho/mcp-discovery/mdns`, because it needs the optional peer dependency
 * bonjour-service. mDNS only says where a host is; its AI Catalog, read with `discoverCatalog`, says what it serves.
 */

export { MDNS_DEFAULTS, type MdnsSettings } from './core/defaults.ts';
export { AdvertiseError, type Advertisement, type AdvertiseOptions, advertise } from './mdns/advertise.ts';
export {
  type FoundService,
  findHosts,
  type HostWatch,
  type HostWatchHandlers,
  type McpHost,
  toMcpHost,
  watchHosts,
} from './mdns/browse.ts';
export {
  type CatalogReader,
  createServerTracker,
  type LanServer,
  type ServerTracker,
  type ServerWatchHandlers,
} from './mdns/server-tracker.ts';
export {
  buildTxtRecord,
  DEFAULT_ENDPOINT_PATH,
  MCP_SERVICE_TYPE,
  type McpTxtRecord,
  parseTxtRecord,
} from './mdns/txt-record.ts';
export { type ServerWatch, watchServers } from './mdns/watch-servers.ts';
