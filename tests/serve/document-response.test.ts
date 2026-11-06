import { describe, expect, it } from 'vitest';
import { SERVER_CARD_MEDIA_TYPE } from '../../src/core/consts.ts';
import { SERVE_DEFAULTS } from '../../src/core/defaults.ts';
import { documentResponse } from '../../src/serve/document-response.ts';
import { sampleCard } from '../helpers.ts';

const card = sampleCard();

/** The response to a request for `card`. */
function respond(method: string, ifNoneMatch?: string) {
  return documentResponse(card, SERVER_CARD_MEDIA_TYPE, { method, ifNoneMatch });
}

describe('documentResponse', () => {
  it('serves the JSON with the media type, open CORS, caching and an ETag', () => {
    const { status, headers, body } = respond('GET');
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual(card);
    expect(headers).toMatchObject({
      'Content-Type': SERVER_CARD_MEDIA_TYPE,
      'Content-Length': String(Buffer.byteLength(body)),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'ETag',
      'Cache-Control': `public, max-age=${SERVE_DEFAULTS.maxAgeSeconds}`,
    });
    expect(headers.ETag).toMatch(/^"[\w-]+"$/);
  });

  it('gives the same document the same ETag, and a changed one a new ETag', () => {
    const changed = documentResponse({ ...card, version: '9.9.9' }, SERVER_CARD_MEDIA_TYPE, { method: 'GET' });
    expect(respond('GET').headers.ETag).toBe(respond('GET').headers.ETag);
    expect(changed.headers.ETag).not.toBe(respond('GET').headers.ETag);
  });

  it.each([
    ['the exact tag', (tag: string) => tag],
    ['the weak form', (tag: string) => `W/${tag}`],
    ['a list holding it', (tag: string) => `"other", ${tag}`],
    ['a star', () => '*'],
  ])('answers 304 with no body for %s', (_label, header) => {
    const { headers } = respond('GET');
    const notModified = respond('GET', header(headers.ETag ?? ''));
    expect(notModified.status).toBe(304);
    expect(notModified.body).toBe('');
    expect(notModified.headers.ETag).toBe(headers.ETag);
  });

  it('answers 200 for a stale tag', () => {
    expect(respond('GET', '"stale"').status).toBe(200);
  });

  it('answers HEAD with the headers and no body', () => {
    const head = respond('head');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['Content-Length']).toBe(respond('GET').headers['Content-Length']);
  });

  it('answers a CORS preflight with 204', () => {
    const preflight = respond('OPTIONS');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['Access-Control-Allow-Methods']).toBe('GET');
  });

  it('answers other methods with 405 and Allow', () => {
    const post = respond('POST');
    expect(post.status).toBe(405);
    expect(post.headers.Allow).toBe('GET, HEAD, OPTIONS');
  });

  it('takes a max age override', () => {
    const { headers } = documentResponse(card, SERVER_CARD_MEDIA_TYPE, { method: 'GET' }, { maxAgeSeconds: 60 });
    expect(headers['Cache-Control']).toBe('public, max-age=60');
  });
});
