/**
 * The TXT record an `_mcp._tcp` service carries: where on the host the MCP endpoint and the AI Catalog are.
 *
 * There is no MCP standard for this; the layout is this package's, versioned by `txtvers`. A record from
 * someone else's `_mcp._tcp` service still parses, with defaults for whatever it leaves out.
 */

import { AI_CATALOG_WELL_KNOWN_PATH } from '../core/consts.ts';

/** The DNS-SD service type, which bonjour-service turns into `_mcp._tcp`. */
export const MCP_SERVICE_TYPE = 'mcp';

/** The TXT layout version this package writes. */
const TXT_VERSION = '1';

/** The endpoint path assumed when a record names none, and advertised when none is given. */
export const DEFAULT_ENDPOINT_PATH = '/mcp';

/** The value a flag key carries when it is on; a bare key does not survive bonjour-service's decoding. */
const FLAG_ON = '1';

/** The keys of the TXT record. */
const TxtKey = { Version: 'txtvers', Path: 'path', Catalog: 'catalog', Tls: 'tls' } as const;

/** Where on an advertised host its MCP documents are. */
export interface McpTxtRecord {
  /** Path of the main streamable-HTTP endpoint. */
  path: string;
  /** Path of the host's AI Catalog. */
  catalogPath: string;
  /** The host speaks HTTPS. */
  tls: boolean;
}

/**
 * Whether a value from the network is safe to resolve against the host as a path.
 *
 * @param value - A TXT value.
 * @returns true for an absolute path; false for anything else, including `//other-host/…`.
 */
function isLocalPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && value.startsWith('//') === false;
}

/**
 * The TXT record for an advertised host.
 *
 * @param record - Where the endpoint and catalog are.
 * @returns Key-value pairs for bonjour-service's `txt`.
 * @throws If a path is not absolute, since a client would resolve it against the wrong place.
 */
export function buildTxtRecord(record: McpTxtRecord): Record<string, string> {
  for (const path of [record.path, record.catalogPath]) {
    if (isLocalPath(path) === false) {
      throw new Error(`An advertised path starts with a single "/"; got "${path}"`);
    }
  }
  const txt: Record<string, string> = {
    [TxtKey.Version]: TXT_VERSION,
    [TxtKey.Path]: record.path,
    [TxtKey.Catalog]: record.catalogPath,
  };
  if (record.tls) {
    txt[TxtKey.Tls] = FLAG_ON;
  }
  return txt;
}

/**
 * Reads a TXT record from the network, falling back to defaults for missing or unsafe values.
 *
 * @param txt - The decoded record, or undefined when the service had none.
 * @returns Where the endpoint and catalog are; `/mcp` and the well-known catalog when unstated.
 */
export function parseTxtRecord(txt: Readonly<Record<string, unknown>> | undefined): McpTxtRecord {
  const path = txt?.[TxtKey.Path];
  const catalogPath = txt?.[TxtKey.Catalog];
  return {
    path: isLocalPath(path) ? path : DEFAULT_ENDPOINT_PATH,
    catalogPath: isLocalPath(catalogPath) ? catalogPath : AI_CATALOG_WELL_KNOWN_PATH,
    tls: txt?.[TxtKey.Tls] === FLAG_ON,
  };
}
