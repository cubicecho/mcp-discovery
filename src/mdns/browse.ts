/**
 * Finding MCP hosts on the local network, by browsing for `_mcp._tcp` services.
 */

import { isIPv4 } from 'node:net';
import { MDNS_DEFAULTS, type MdnsSettings } from '../core/defaults.ts';
import { type BonjourService, loadBonjour, shutDown } from './load-bonjour.ts';
import { errorReporter } from './report-error.ts';
import { MCP_SERVICE_TYPE, type McpTxtRecord, parseTxtRecord } from './txt-record.ts';

/** An MCP host found on the network, with the URLs to reach it. */
export interface McpHost {
  /** The advertised instance name. */
  name: string;
  /** The host's mDNS name, e.g. `nas.local`. */
  host: string;
  port: number;
  /** Every address the host announced. */
  addresses: string[];
  /** What its TXT record said, with defaults filled in. */
  txt: McpTxtRecord;
  /** `scheme://address:port`; an IPv4 address when one was announced, the mDNS name otherwise. */
  origin: string;
  /** The main MCP endpoint. */
  endpointUrl: string;
  /** The AI Catalog, for `discoverCatalog`. */
  catalogUrl: string;
}

/** What a found service has that `toMcpHost` reads. */
export type FoundService = Pick<BonjourService, 'name' | 'host' | 'port' | 'addresses' | 'txt'>;

/** What `watchHosts` tells its caller. */
export interface HostWatchHandlers {
  /** A host appeared, or changed its record. */
  onUp: (host: McpHost) => void;
  /** A host said goodbye or expired. */
  onDown?: (host: McpHost) => void;
  /** Socket errors; they are emitted as process warnings when unset. */
  onError?: (error: Error) => void;
}

/** A running watch. */
export interface HostWatch {
  /** The hosts currently known. */
  hosts: () => McpHost[];
  /** Stops browsing and closes the socket. */
  stop: () => Promise<void>;
}

/**
 * Turns a found `_mcp._tcp` service into the URLs a client needs.
 *
 * @param service - A service from a bonjour-service browser.
 * @returns The host.
 */
export function toMcpHost(service: FoundService): McpHost {
  const txt = parseTxtRecord(service.txt);
  const addresses = service.addresses ?? [];
  // IPv4 first: a link-local IPv6 address needs a zone id a URL can't carry, and not every client resolves .local.
  const address = addresses.find((candidate) => isIPv4(candidate)) ?? service.host;
  const origin = new URL(`${txt.tls ? 'https' : 'http'}://${address}:${service.port}`).origin;
  return {
    name: service.name,
    host: service.host,
    port: service.port,
    addresses,
    txt,
    origin,
    endpointUrl: new URL(txt.path, origin).href,
    catalogUrl: new URL(txt.catalogPath, origin).href,
  };
}

/**
 * Browses for MCP hosts until stopped, reporting each as it comes and goes.
 *
 * @param handlers - Called as hosts appear and disappear.
 * @returns The watch, to stop when done.
 * @throws If bonjour-service is not installed.
 */
export async function watchHosts(handlers: HostWatchHandlers): Promise<HostWatch> {
  const Bonjour = await loadBonjour();
  const bonjour = new Bonjour({}, errorReporter(handlers.onError));
  const browser = bonjour.find({ type: MCP_SERVICE_TYPE });
  const report = (service: BonjourService) => handlers.onUp(toMcpHost(service));
  browser.on('up', report);
  browser.on('txt-update', report);
  browser.on('srv-update', report);
  browser.on('down', (service) => handlers.onDown?.(toMcpHost(service)));
  return {
    hosts: () => browser.services.map(toMcpHost),
    stop: () => {
      browser.stop();
      return shutDown(bonjour);
    },
  };
}

/**
 * Listens for MCP hosts for a while, then lists what answered.
 *
 * @param [overrides] - mDNS settings to change; `browseMs` is how long to listen.
 * @returns The hosts, one per advertised instance.
 * @throws If bonjour-service is not installed.
 */
export async function findHosts(overrides: Partial<MdnsSettings> = {}): Promise<McpHost[]> {
  const { browseMs } = { ...MDNS_DEFAULTS, ...overrides };
  const watch = await watchHosts({ onUp: () => undefined });
  await new Promise((resolve) => setTimeout(resolve, browseMs));
  const hosts = watch.hosts();
  await watch.stop();
  return hosts;
}
