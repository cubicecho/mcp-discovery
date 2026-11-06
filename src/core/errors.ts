/** Any failure to read a discovery document; `discover()` reports these per entry. */
export class DiscoveryError extends Error {
  /** Where the document was read from: a URL, or a label for an inline one. */
  readonly source: string;

  /**
   * Builds the error.
   *
   * @param message - What went wrong and what to check.
   * @param source - Where the document was read from.
   * @param [options] - Carries the underlying `cause`.
   */
  constructor(message: string, source: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.source = source;
  }
}

/** A document could not be fetched: network failure, timeout, an error status or an oversized body. */
export class DocumentFetchError extends DiscoveryError {
  /** The HTTP status, or null when no response arrived. */
  readonly status: number | null;

  /**
   * Builds the error.
   *
   * @param message - What went wrong and what to check.
   * @param source - The URL that was fetched.
   * @param status - The HTTP status, or null when no response arrived.
   * @param [options] - Carries the underlying `cause`.
   */
  constructor(message: string, source: string, status: number | null, options?: ErrorOptions) {
    super(message, source, options);
    this.status = status;
  }
}

/** A document arrived but is not valid JSON, or does not match its schema. */
export class InvalidDocumentError extends DiscoveryError {}
