/** How discovery documents are served. */
export interface ServeSettings {
  /** How long a client may reuse a document before asking again, in seconds. */
  maxAgeSeconds: number;
}

/** The serving defaults; the max age is the one the Server Card spec recommends. */
export const SERVE_DEFAULTS: Readonly<ServeSettings> = Object.freeze({
  maxAgeSeconds: 3600,
});

/** How discovery documents are fetched. */
export interface FetchSettings {
  /** How long one document fetch may take, headers and body together, in ms. */
  timeoutMs: number;
  /** The largest document accepted, in bytes. */
  maxDocumentBytes: number;
}

/** How mDNS advertising and browsing behave. */
export interface MdnsSettings {
  /** How long `findHosts` listens before answering, in ms. */
  browseMs: number;
  /** How long `advertise` waits for its announcement to go out before giving up, in ms. */
  announceTimeoutMs: number;
  /** How often `watchServers` re-reads every known host's catalog, to catch endpoints added or removed, in ms. */
  refreshMs: number;
}

/** The mDNS defaults; probing alone takes about 750 ms. */
export const MDNS_DEFAULTS: Readonly<MdnsSettings> = Object.freeze({
  browseMs: 3000,
  announceTimeoutMs: 5000,
  refreshMs: 300_000,
});

/** The fetching defaults. */
export const FETCH_DEFAULTS: Readonly<FetchSettings> = Object.freeze({
  timeoutMs: 5000,
  maxDocumentBytes: 1_048_576,
});
