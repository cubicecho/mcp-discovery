/**
 * Fetching a discovery document from a host nobody has vetted: bounded in time and size, and validated.
 */

import { parseServerCard, type ServerCard } from '../card/server-card.ts';
import { type AiCatalog, parseAiCatalog } from '../catalog/ai-catalog.ts';
import { AI_CATALOG_MEDIA_TYPE, SERVER_CARD_MEDIA_TYPE } from '../core/consts.ts';
import { FETCH_DEFAULTS, type FetchSettings } from '../core/defaults.ts';
import { DocumentFetchError, InvalidDocumentError } from '../core/errors.ts';

/** What every fetch in this package accepts besides its settings. */
export interface FetchOptions {
  /** Abandons the fetch; combined with the timeout. */
  signal?: AbortSignal;
  /** The fetch to use, for a proxy-aware one or a test double. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Reads a response body, stopping once it passes the size cap.
 *
 * @param response - A response whose body has not been read.
 * @param url - What was fetched, for the error.
 * @param maxBytes - The largest body accepted.
 * @returns The body as text.
 * @throws {@link DocumentFetchError} If the body is larger than `maxBytes`.
 */
async function readBoundedText(response: Response, url: string, maxBytes: number): Promise<string> {
  const tooLarge = () =>
    new DocumentFetchError(
      `${url} is larger than ${maxBytes} bytes; raise maxDocumentBytes to accept it`,
      url,
      response.status,
    );
  const declaredBytes = Number(response.headers.get('content-length') ?? 0);
  if (declaredBytes > maxBytes) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) {
    return '';
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of response.body) {
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      throw tooLarge();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetches a URL and parses its body as JSON.
 *
 * @param url - What to fetch.
 * @param accept - The media type to ask for.
 * @param overrides - Fetch settings to change.
 * @param options - Abort signal and fetch implementation.
 * @returns The parsed JSON.
 * @throws {@link DocumentFetchError} On a network failure, timeout, error status or oversized body.
 * @throws {@link InvalidDocumentError} If the body is not JSON.
 */
async function fetchJson(
  url: string,
  accept: string,
  overrides: Partial<FetchSettings>,
  options: FetchOptions,
): Promise<unknown> {
  const { timeoutMs, maxDocumentBytes } = { ...FETCH_DEFAULTS, ...overrides };
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let text: string;
  try {
    const response = await fetchImpl(url, { headers: { Accept: accept }, signal });
    if (response.ok === false) {
      await response.body?.cancel();
      throw new DocumentFetchError(
        `${url} answered ${response.status} ${response.statusText}`.trim(),
        url,
        response.status,
      );
    }
    text = await readBoundedText(response, url, maxDocumentBytes);
  } catch (cause) {
    if (cause instanceof DocumentFetchError) {
      throw cause;
    }
    const timedOut = timeout.aborted;
    const reason = timedOut ? `timed out after ${timeoutMs} ms` : 'could not be fetched';
    throw new DocumentFetchError(`${url} ${reason}`, url, null, { cause });
  }

  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new InvalidDocumentError(`${url} did not return JSON`, url, { cause });
  }
}

/**
 * Fetches and validates a Server Card.
 *
 * @param url - The card's URL, e.g. from {@link serverCardUrl} or a catalog entry.
 * @param [overrides] - Fetch settings to change.
 * @param [options] - Abort signal and fetch implementation.
 * @returns The card.
 * @throws {@link DocumentFetchError} If it could not be fetched.
 * @throws {@link InvalidDocumentError} If it is not a valid card.
 */
export async function fetchServerCard(
  url: string,
  overrides: Partial<FetchSettings> = {},
  options: FetchOptions = {},
): Promise<ServerCard> {
  return parseServerCard(await fetchJson(url, SERVER_CARD_MEDIA_TYPE, overrides, options), url);
}

/**
 * Fetches and validates an AI Catalog.
 *
 * @param url - The catalog's URL.
 * @param [overrides] - Fetch settings to change.
 * @param [options] - Abort signal and fetch implementation.
 * @returns The catalog.
 * @throws {@link DocumentFetchError} If it could not be fetched.
 * @throws {@link InvalidDocumentError} If it is not a valid 1.x catalog.
 */
export async function fetchAiCatalog(
  url: string,
  overrides: Partial<FetchSettings> = {},
  options: FetchOptions = {},
): Promise<AiCatalog> {
  return parseAiCatalog(await fetchJson(url, AI_CATALOG_MEDIA_TYPE, overrides, options), url);
}
