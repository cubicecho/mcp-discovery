/**
 * Working out the origin a request reached this server at, so a document can name URLs the client can use.
 */

import type { IncomingMessage } from 'node:http';

/**
 * The `scheme://host[:port]` a request was addressed to, from its `Host` header.
 *
 * @param request - An incoming request.
 * @returns E.g. `http://192.168.1.20:3000`.
 * @throws If the request has no `Host` header, which every HTTP/1.1 request carries.
 *
 * @remarks
 * The header is client-supplied, which is safe here: it only shapes the document that same client receives.
 * Behind a TLS-terminating proxy the scheme reads as `http`; serve the card from the proxy's URL instead.
 */
export function requestOrigin(request: IncomingMessage): string {
  const { host } = request.headers;
  if (!host) {
    throw new Error('The request has no Host header, so the URL it reached cannot be known');
  }
  // A TLS socket carries `encrypted: true`; a plain one has no such property.
  const isEncrypted = 'encrypted' in request.socket && request.socket.encrypted === true;
  return new URL(`${isEncrypted ? 'https' : 'http'}://${host}`).origin;
}
