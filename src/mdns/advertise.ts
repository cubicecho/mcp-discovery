/**
 * Advertising an MCP host on the local network as an `_mcp._tcp` service.
 */

import { hostname } from 'node:os';
import { AI_CATALOG_WELL_KNOWN_PATH } from '../core/consts.ts';
import { MDNS_DEFAULTS, type MdnsSettings } from '../core/defaults.ts';
import { loadBonjour, shutDown } from './load-bonjour.ts';
import { errorReporter } from './report-error.ts';
import { buildTxtRecord, DEFAULT_ENDPOINT_PATH, MCP_SERVICE_TYPE } from './txt-record.ts';

/** The domain every mDNS hostname lives under. */
const MDNS_DOMAIN = '.local';

/** The announcement did not go out in time, most often because the name is already in use on the network. */
export class AdvertiseError extends Error {
  /** The instance name that was being advertised. */
  readonly serviceName: string;

  /**
   * Builds the error.
   *
   * @param message - What went wrong and what to check.
   * @param serviceName - The instance name that was being advertised.
   * @param [options] - Carries the underlying `cause`.
   */
  constructor(message: string, serviceName: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AdvertiseError';
    this.serviceName = serviceName;
  }
}

/** What to advertise. */
export interface AdvertiseOptions {
  /** The instance name people see when browsing, e.g. `MCP Router on nas`. Unique on the network. */
  name: string;
  /** The HTTP port the host listens on. */
  port: number;
  /**
   * Path of the main streamable-HTTP endpoint.
   *
   * @defaultValue `DEFAULT_ENDPOINT_PATH`
   */
  path?: string;
  /**
   * Path of the host's AI Catalog.
   *
   * @defaultValue `AI_CATALOG_WELL_KNOWN_PATH`
   */
  catalogPath?: string;
  /** The host speaks HTTPS. */
  tls?: boolean;
  /** The mDNS hostname to advertise; the machine's own name plus `.local` when unset. */
  host?: string;
  /** Told about socket errors after the announcement; they are emitted as process warnings when unset. */
  onError?: (error: Error) => void;
}

/** A running advertisement. */
export interface Advertisement {
  /** Sends goodbye packets and closes the socket. */
  stop: () => Promise<void>;
}

/**
 * Advertises an MCP host as `_mcp._tcp`, resolving once the announcement has gone out.
 *
 * @param options - The instance name, port and paths.
 * @param [overrides] - mDNS settings to change.
 * @returns The advertisement, to stop on shutdown.
 * @throws {@link AdvertiseError} If the announcement does not go out in time or the socket fails first.
 * @throws If bonjour-service is not installed.
 */
export async function advertise(
  options: AdvertiseOptions,
  overrides: Partial<MdnsSettings> = {},
): Promise<Advertisement> {
  const { announceTimeoutMs } = { ...MDNS_DEFAULTS, ...overrides };
  const {
    name,
    port,
    path = DEFAULT_ENDPOINT_PATH,
    catalogPath = AI_CATALOG_WELL_KNOWN_PATH,
    tls = false,
    host = `${hostname()}${MDNS_DOMAIN}`,
  } = options;
  const txt = buildTxtRecord({ path, catalogPath, tls });
  const Bonjour = await loadBonjour();

  let rejectStart: (error: Error) => void = () => undefined;
  let isUp = false;
  const reportLater = errorReporter(options.onError);
  const reportError = (error: Error) => {
    if (isUp === false) {
      rejectStart(error);
      return;
    }
    reportLater(error);
  };
  const bonjour = new Bonjour({}, reportError);

  try {
    await new Promise<void>((resolve, reject) => {
      rejectStart = (cause) =>
        reject(new AdvertiseError(`Advertising "${name}" failed: ${cause.message}`, name, { cause }));
      const timer = setTimeout(() => {
        reject(
          new AdvertiseError(
            `"${name}" was not announced within ${announceTimeoutMs} ms; the name may already be in use on the network`,
            name,
          ),
        );
      }, announceTimeoutMs);
      const service = bonjour.publish({ name, type: MCP_SERVICE_TYPE, port, txt, host });
      service.once('up', () => {
        clearTimeout(timer);
        isUp = true;
        resolve();
      });
    });
  } catch (error) {
    await shutDown(bonjour);
    throw error;
  }
  return { stop: () => shutDown(bonjour) };
}
