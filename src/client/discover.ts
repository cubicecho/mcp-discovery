/**
 * Domain-level discovery: read a host's AI Catalog, then every Server Card it lists.
 */

import type { ServerCard } from '../card/server-card.ts';
import {
  type AiCatalog,
  parseInlineServerCard,
  type ServerCardEntry,
  serverCardEntries,
} from '../catalog/ai-catalog.ts';
import { AI_CATALOG_WELL_KNOWN_PATH } from '../core/consts.ts';
import type { FetchSettings } from '../core/defaults.ts';
import { DiscoveryError } from '../core/errors.ts';
import { type FetchOptions, fetchAiCatalog, fetchServerCard } from './fetch-document.ts';

/** A server found in a catalog, with the card that describes it. */
export interface DiscoveredServer {
  entry: ServerCardEntry;
  card: ServerCard;
  /** Where the card was fetched from, or null when the catalog carried it inline. */
  cardUrl: string | null;
}

/** A catalog entry whose card could not be read. */
export interface DiscoveryFailure {
  entry: ServerCardEntry;
  error: DiscoveryError;
}

/** What `discover` found on a host. */
export interface Discovery {
  /** The catalog's URL. */
  catalogUrl: string;
  catalog: AiCatalog;
  /** Every card that was read, in catalog order. */
  servers: DiscoveredServer[];
  /** Every card entry that failed, in catalog order. */
  failures: DiscoveryFailure[];
}

type EntryResult = { server: DiscoveredServer } | { failure: DiscoveryFailure };

/**
 * Reads the card one catalog entry points at or carries.
 *
 * @param entry - A card entry.
 * @param catalogUrl - The catalog's URL; a relative entry URL resolves against it.
 * @param overrides - Fetch settings to change.
 * @param options - Abort signal and fetch implementation.
 * @returns The server, or the failure when the card could not be read.
 * @throws Anything that is not a {@link DiscoveryError}, which would be a bug rather than a bad host.
 */
async function readEntry(
  entry: ServerCardEntry,
  catalogUrl: string,
  overrides: Partial<FetchSettings>,
  options: FetchOptions,
): Promise<EntryResult> {
  try {
    if (entry.url === undefined) {
      return { server: { entry, card: parseInlineServerCard(entry, catalogUrl), cardUrl: null } };
    }
    const cardUrl = new URL(entry.url, catalogUrl).href;
    return { server: { entry, card: await fetchServerCard(cardUrl, overrides, options), cardUrl } };
  } catch (error) {
    if (error instanceof DiscoveryError) {
      return { failure: { entry, error } };
    }
    throw error;
  }
}

/**
 * Discovers the MCP servers a host advertises, from its `/.well-known/ai-catalog.json`.
 *
 * @param origin - The host, e.g. `http://router.local:3000`; any path on it is ignored.
 * @param [overrides] - Fetch settings to change, applied to every fetch.
 * @param [options] - Abort signal and fetch implementation.
 * @returns The catalog, the servers read from it, and the entries that failed.
 * @throws {@link DocumentFetchError} If the catalog itself could not be fetched.
 * @throws {@link InvalidDocumentError} If the catalog is not a valid 1.x catalog.
 */
export function discover(
  origin: string,
  overrides: Partial<FetchSettings> = {},
  options: FetchOptions = {},
): Promise<Discovery> {
  return discoverCatalog(new URL(AI_CATALOG_WELL_KNOWN_PATH, origin).href, overrides, options);
}

/**
 * Discovers the MCP servers an AI Catalog lists, wherever the catalog is served (e.g. an mDNS host's `catalogUrl`).
 *
 * @param catalogUrl - The catalog's URL; relative card URLs in it resolve against this.
 * @param [overrides] - Fetch settings to change, applied to every fetch.
 * @param [options] - Abort signal and fetch implementation.
 * @returns The catalog, the servers read from it, and the entries that failed.
 * @throws {@link DocumentFetchError} If the catalog itself could not be fetched.
 * @throws {@link InvalidDocumentError} If the catalog is not a valid 1.x catalog.
 *
 * @remarks
 * Cards are fetched in parallel, and one that fails is reported in `failures` without failing the rest.
 * Card contents are advisory: verify them against the live connection before relying on them.
 */
export async function discoverCatalog(
  catalogUrl: string,
  overrides: Partial<FetchSettings> = {},
  options: FetchOptions = {},
): Promise<Discovery> {
  const catalog = await fetchAiCatalog(catalogUrl, overrides, options);
  const results = await Promise.all(
    serverCardEntries(catalog).map((entry) => readEntry(entry, catalogUrl, overrides, options)),
  );
  const servers = results.flatMap((result) => ('server' in result ? [result.server] : []));
  const failures = results.flatMap((result) => ('failure' in result ? [result.failure] : []));
  return { catalogUrl, catalog, servers, failures };
}
