import { describe, expect, it } from 'vitest';
import {
  aiCatalogLinkHeader,
  airIdentifier,
  createAiCatalog,
  inlineServerCardEntry,
  parseAiCatalog,
  parseInlineServerCard,
  serverCardEntries,
  serverCardEntry,
} from '../../src/catalog/ai-catalog.ts';
import { SERVER_CARD_MEDIA_TYPE } from '../../src/core/consts.ts';
import { InvalidDocumentError } from '../../src/core/errors.ts';
import { sampleCard } from '../helpers.ts';

describe('createAiCatalog', () => {
  it('writes specVersion 1.0 and keeps the entries', () => {
    const entry = serverCardEntry('urn:air:example.com:mcp:weather', 'https://example.com/mcp/server-card');
    expect(createAiCatalog({ entries: [entry] })).toEqual({ specVersion: '1.0', entries: [entry] });
  });

  it('rejects an entry with both url and data', () => {
    const entry = { ...inlineServerCardEntry('urn:air:x.com:mcp:a', sampleCard()), url: 'https://x.com' };
    expect(() => createAiCatalog({ entries: [entry] })).toThrow(/exactly one of `url` or `data`/);
  });

  it('rejects an entry with neither', () => {
    expect(() => createAiCatalog({ entries: [{ identifier: 'a', type: SERVER_CARD_MEDIA_TYPE }] })).toThrow(
      InvalidDocumentError,
    );
  });
});

describe('parseAiCatalog', () => {
  it('accepts a later 1.x minor and keeps its unknown fields', () => {
    const catalog = parseAiCatalog({ specVersion: '1.7', entries: [], signature: { alg: 'ES256' } }, 'test');
    expect(catalog.signature).toEqual({ alg: 'ES256' });
  });

  it.each(['2.0', '1', 'one'])('rejects specVersion %s', (specVersion) => {
    expect(() => parseAiCatalog({ specVersion, entries: [] }, 'test')).toThrow(InvalidDocumentError);
  });
});

describe('serverCardEntries', () => {
  it('keeps only Server Card entries, in order', () => {
    const first = serverCardEntry('a', 'https://x.com/a/server-card');
    const second = inlineServerCardEntry('b', sampleCard());
    const skill = { identifier: 'c', type: 'application/agent-skills+zip', url: 'https://x.com/c.zip' };
    const catalog = createAiCatalog({ entries: [first, skill, second] });
    expect(serverCardEntries(catalog).map((entry) => entry.identifier)).toEqual(['a', 'b']);
  });
});

describe('parseInlineServerCard', () => {
  it('names the entry when its card is invalid', () => {
    const entry = { identifier: 'urn:air:x.com:mcp:bad', type: SERVER_CARD_MEDIA_TYPE, data: { name: 'bad' } } as const;
    expect(() => parseInlineServerCard(entry, 'https://x.com/catalog')).toThrow(/entry urn:air:x.com:mcp:bad/);
  });
});

describe('airIdentifier', () => {
  it('builds an MCP urn:air', () => {
    expect(airIdentifier('example.com', 'weather')).toBe('urn:air:example.com:mcp:weather');
  });

  it.each([
    ['', 'weather'],
    ['example.com', 'a:b'],
  ])('rejects publisher %j and name %j', (publisher, name) => {
    expect(() => airIdentifier(publisher, name)).toThrow(/colon-free/);
  });
});

describe('aiCatalogLinkHeader', () => {
  it('points at the catalog with the ai-catalog relation', () => {
    expect(aiCatalogLinkHeader('/.well-known/ai-catalog.json')).toBe(
      '</.well-known/ai-catalog.json>; rel="ai-catalog"',
    );
  });
});
