/**
 * Watching the local network for MCP servers: mDNS finds the hosts, and their AI Catalogs say what they serve.
 */

import { discoverCatalog } from '../client/discover.ts';
import { type FetchSettings, MDNS_DEFAULTS, type MdnsSettings } from '../core/defaults.ts';
import { watchHosts } from './browse.ts';
import { createServerTracker, type LanServer, type ServerWatchHandlers } from './server-tracker.ts';

/** A running server watch. */
export interface ServerWatch {
  /** The servers currently known. */
  servers: () => LanServer[];
  /** Re-reads every known host's catalog now, instead of waiting for the next refresh. */
  refresh: () => Promise<void>;
  /** Stops browsing and refreshing. */
  stop: () => Promise<void>;
}

/**
 * Watches the network for MCP servers, reporting each as it appears, changes and goes.
 *
 * @param handlers - Told about servers and errors.
 * @param [overrides] - mDNS settings to change; `refreshMs` is how often catalogs are re-read.
 * @param [fetchOverrides] - Fetch settings for the catalogs and cards.
 * @returns The watch, to stop when done.
 * @throws If bonjour-service is not installed.
 *
 * @remarks
 * Anything on the LAN can advertise, and a card is unauthenticated: decide what to connect to by policy,
 * not by a card's name alone. A process that also advertises sees itself; skip its own instance name.
 */
export async function watchServers(
  handlers: ServerWatchHandlers,
  overrides: Partial<MdnsSettings> = {},
  fetchOverrides: Partial<FetchSettings> = {},
): Promise<ServerWatch> {
  const { refreshMs } = { ...MDNS_DEFAULTS, ...overrides };
  const tracker = createServerTracker(handlers, (catalogUrl) => discoverCatalog(catalogUrl, fetchOverrides));
  const hostWatch = await watchHosts({
    // hostUp reports a catalog that can't be read through onError rather than rejecting.
    onUp: (host) => void tracker.hostUp(host),
    onDown: (host) => tracker.hostDown(host),
    onError: handlers.onError,
  });
  const timer = setInterval(() => void tracker.refresh(), refreshMs);
  timer.unref();
  return {
    servers: tracker.servers,
    refresh: tracker.refresh,
    stop: async () => {
      clearInterval(timer);
      tracker.close();
      await hostWatch.stop();
    },
  };
}
