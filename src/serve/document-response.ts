/**
 * The HTTP response for a discovery document, worked out without any server framework.
 *
 * Applies what the Server Card spec asks of a host: open CORS, a public cache lifetime, an ETag,
 * and `304 Not Modified` when the client already holds the current version.
 */

import { createHash } from 'node:crypto';
import { SERVE_DEFAULTS, type ServeSettings } from '../core/defaults.ts';

/** The methods a discovery document answers. */
const HttpMethod = { Get: 'GET', Head: 'HEAD', Options: 'OPTIONS' } as const;

/** The statuses a discovery document answers with. */
const HttpStatus = { Ok: 200, NoContent: 204, NotModified: 304, MethodNotAllowed: 405 } as const;

/** What `Allow` lists on a 405. */
const ALLOWED_METHODS = [HttpMethod.Get, HttpMethod.Head, HttpMethod.Options].join(', ');

/** The CORS headers the Server Card spec requires; safe because the documents are public and read-only. */
const CORS_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': HttpMethod.Get,
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag',
});

/** The parts of a request that decide the response. */
export interface DocumentRequest {
  /** The HTTP method, any case. */
  method: string;
  /** The `If-None-Match` header, when the client sent one. */
  ifNoneMatch?: string;
}

/** A response ready to write to any server. */
export interface DocumentResponse {
  status: number;
  headers: Record<string, string>;
  /** The JSON text; empty for HEAD, OPTIONS, 304 and 405. */
  body: string;
}

/**
 * A strong ETag for a document body: its SHA-256, base64url.
 *
 * @param body - The exact bytes served.
 * @returns The quoted tag.
 */
function entityTag(body: string): string {
  return `"${createHash('sha256').update(body).digest('base64url')}"`;
}

/**
 * Whether an `If-None-Match` header names this tag, using the weak comparison RFC 9110 asks for.
 *
 * @param ifNoneMatch - The header: `*`, or a comma-separated list of tags.
 * @param tag - The current tag.
 * @returns true when the client's copy is current.
 */
function matchesEntityTag(ifNoneMatch: string, tag: string): boolean {
  const opaque = (value: string) => value.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((candidate) => candidate.trim() === '*' || opaque(candidate) === opaque(tag));
}

/**
 * Works out the response to a request for a discovery document.
 *
 * @param document - The card or catalog to serve; serialised as JSON.
 * @param mediaType - Its `Content-Type`, e.g. `SERVER_CARD_MEDIA_TYPE`.
 * @param request - The method and `If-None-Match`.
 * @param [overrides] - Serving settings to change.
 * @returns The status, headers and body.
 */
export function documentResponse(
  document: unknown,
  mediaType: string,
  request: DocumentRequest,
  overrides: Partial<ServeSettings> = {},
): DocumentResponse {
  const { maxAgeSeconds } = { ...SERVE_DEFAULTS, ...overrides };
  const method = request.method.toUpperCase();

  if (method === HttpMethod.Options) {
    return { status: HttpStatus.NoContent, headers: { ...CORS_HEADERS }, body: '' };
  }
  const isReadMethod = method === HttpMethod.Get || method === HttpMethod.Head;
  if (isReadMethod === false) {
    return { status: HttpStatus.MethodNotAllowed, headers: { ...CORS_HEADERS, Allow: ALLOWED_METHODS }, body: '' };
  }

  const body = JSON.stringify(document);
  const tag = entityTag(body);
  const cacheHeaders = { ...CORS_HEADERS, ETag: tag, 'Cache-Control': `public, max-age=${maxAgeSeconds}` };

  const isCurrent = request.ifNoneMatch !== undefined && matchesEntityTag(request.ifNoneMatch, tag);
  if (isCurrent) {
    return { status: HttpStatus.NotModified, headers: cacheHeaders, body: '' };
  }
  const headers = {
    ...cacheHeaders,
    'Content-Type': mediaType,
    'Content-Length': String(Buffer.byteLength(body)),
  };
  return { status: HttpStatus.Ok, headers, body: method === HttpMethod.Head ? '' : body };
}
