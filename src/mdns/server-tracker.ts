/**
 * Turning hosts that come and go into MCP servers that come and go, by reading each host's AI Catalog.
 *
 * Kept apart from mDNS so it can be driven, and tested, by anything that reports hosts.
 */

import { type CardConnection, cardConnection, type ServerCard } from '../card/server-card.ts';
import type { Discovery } from '../client/discover.ts';
import type { McpHost } from './browse.ts';
import { errorReporter } from './report-error.ts';

/** An MCP server found on the network. */
export interface LanServer {
  /** Unique on the network: the host's instance name and the card's name, `<instance>/<card name>`. */
  key: string;
  host: McpHost;
  card: ServerCard;
  /** Where the card was read from, or null when the catalog carried it inline. */
  cardUrl: string | null;
  /** How to connect, or null when the card offers no usable streamable-HTTP remote. */
  connection: CardConnection | null;
}

/** What a server watch tells its caller. */
export interface ServerWatchHandlers {
  /** A server appeared, or its card, card URL or host address changed. */
  onUp: (server: LanServer) => void;
  /** A server's host left, or its catalog stopped listing it. */
  onDown?: (server: LanServer) => void;
  /** A catalog or card could not be read, or a socket failed; emitted as process warnings when unset. */
  onError?: (error: Error) => void;
}

/** Reads the catalog at a URL; `discoverCatalog` with the caller's fetch settings. */
export type CatalogReader = (catalogUrl: string) => Promise<Discovery>;

/** Tracks the servers on a set of hosts. */
export interface ServerTracker {
  /** A host appeared or changed; its catalog is read, and the differences reported. */
  hostUp: (host: McpHost) => Promise<void>;
  /** A host left; every server it had is reported down. */
  hostDown: (host: McpHost) => void;
  /** Re-reads every known host's catalog. */
  refresh: () => Promise<void>;
  /** The servers currently known. */
  servers: () => LanServer[];
  /** Stops reporting; reads still in flight are dropped. */
  close: () => void;
}

/**
 * What a server looks like to a caller, so an unchanged re-read reports nothing.
 *
 * @param server - A server.
 * @returns A string equal for two reads that a caller can't tell apart.
 */
function fingerprint(server: LanServer): string {
  return JSON.stringify([server.card, server.cardUrl, server.host.origin]);
}

/**
 * A tracker that reports servers through `handlers`.
 *
 * @param handlers - Told about servers coming, changing and going, and about errors.
 * @param readCatalog - Reads a host's catalog.
 * @returns The tracker.
 */
export function createServerTracker(handlers: ServerWatchHandlers, readCatalog: CatalogReader): ServerTracker {
  const report = errorReporter(handlers.onError);
  /** The latest record of each host, by instance name. */
  const hosts = new Map<string, McpHost>();
  /** Each host's servers, by key. */
  const known = new Map<string, Map<string, LanServer>>();
  /** Each host's last read, so two reads of one host never overlap. */
  const reads = new Map<string, Promise<void>>();
  let isClosed = false;

  const sync = async (host: McpHost): Promise<void> => {
    let discovery: Discovery;
    try {
      discovery = await readCatalog(host.catalogUrl);
    } catch (error) {
      report(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const isCurrent = isClosed === false && hosts.get(host.name) === host;
    if (isCurrent === false) {
      return;
    }
    for (const failure of discovery.failures) {
      report(failure.error);
    }
    const next = new Map<string, LanServer>();
    for (const { card, cardUrl } of discovery.servers) {
      const key = `${host.name}/${card.name}`;
      next.set(key, { key, host, card, cardUrl, connection: cardConnection(card) });
    }
    const previous = known.get(host.name) ?? new Map<string, LanServer>();
    known.set(host.name, next);
    for (const [key, server] of previous) {
      if (next.has(key) === false) {
        handlers.onDown?.(server);
      }
    }
    for (const [key, server] of next) {
      const before = previous.get(key);
      const isNewOrChanged = before === undefined || fingerprint(before) !== fingerprint(server);
      if (isNewOrChanged) {
        handlers.onUp(server);
      }
    }
  };

  const hostUp = (host: McpHost): Promise<void> => {
    hosts.set(host.name, host);
    const read = (reads.get(host.name) ?? Promise.resolve()).then(() => sync(host));
    reads.set(host.name, read);
    return read;
  };

  const hostDown = (host: McpHost): void => {
    hosts.delete(host.name);
    const servers = known.get(host.name) ?? new Map<string, LanServer>();
    known.delete(host.name);
    if (isClosed) {
      return;
    }
    for (const server of servers.values()) {
      handlers.onDown?.(server);
    }
  };

  return {
    hostUp,
    hostDown,
    refresh: async () => {
      await Promise.all([...hosts.values()].map(hostUp));
    },
    servers: () => [...known.values()].flatMap((servers) => [...servers.values()]),
    close: () => {
      isClosed = true;
    },
  };
}
