import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cardConnection,
  createServerCard,
  parseServerCard,
  SERVER_CARD_SCHEMA_URL,
  serverCardSchema,
  serverCardUrl,
} from '../../src/card/server-card.ts';
import { InvalidDocumentError } from '../../src/core/errors.ts';

// Vendored from modelcontextprotocol/ext-server-card at 526201bb, the snapshot SEP-2127 was accepted on.
const FIXTURES = join(import.meta.dirname, '../fixtures/server-card');

/** Every fixture in one of the folders, as [file, parsed JSON]. */
function fixtures(folder: 'valid' | 'invalid'): [string, unknown][] {
  const dir = join(FIXTURES, folder);
  return readdirSync(dir).map((file) => [file, JSON.parse(readFileSync(join(dir, file), 'utf8'))]);
}

describe('serverCardSchema conformance', () => {
  it.each(fixtures('valid'))('accepts %s', (_file, card) => {
    expect(serverCardSchema.safeParse(card).success).toBe(true);
  });

  it.each(fixtures('invalid'))('rejects %s', (_file, card) => {
    expect(serverCardSchema.safeParse(card).success).toBe(false);
  });
});

describe('createServerCard', () => {
  const fields = { name: 'com.example/weather', version: '1.0.0', description: 'Forecasts.' };

  it('adds the v1 $schema', () => {
    expect(createServerCard(fields).$schema).toBe(SERVER_CARD_SCHEMA_URL);
  });

  it('keeps fields the schema does not know', () => {
    const card = createServerCard({ ...fields, futureField: { a: 1 } });
    expect(card.futureField).toEqual({ a: 1 });
  });

  it.each([
    ['a name without a slash', { name: 'weather' }],
    ['a description over 100 characters', { description: 'x'.repeat(101) }],
    ['a caret range', { version: '^1.2.3' }],
    ['an x range', { version: '1.x' }],
    ['a star range', { version: '1.*' }],
    ['a remote URL that is not http', { remotes: [{ type: 'streamable-http', url: 'ftp://host/mcp' }] }],
  ] as const)('rejects %s', (_label, change) => {
    expect(() => createServerCard({ ...fields, ...change })).toThrow(InvalidDocumentError);
  });

  it('accepts prerelease versions and templated remotes', () => {
    const card = createServerCard({
      ...fields,
      version: '2.1.0-alpha',
      remotes: [{ type: 'streamable-http', url: '{base}/mcp', variables: { base: { isRequired: true } } }],
    });
    expect(card.remotes?.[0]?.url).toBe('{base}/mcp');
  });
});

describe('parseServerCard', () => {
  it('names the source and the failing field', () => {
    expect(() => parseServerCard({ $schema: SERVER_CARD_SCHEMA_URL }, 'http://host/mcp/server-card')).toThrow(
      /http:\/\/host\/mcp\/server-card is not a valid Server Card:[\s\S]*name/,
    );
  });
});

describe('serverCardUrl', () => {
  it.each([
    ['https://host/mcp', 'https://host/mcp/server-card'],
    ['https://host/mcp/', 'https://host/mcp/server-card'],
    ['http://host:3000/mcp/w/team?x=1#y', 'http://host:3000/mcp/w/team/server-card'],
    ['https://host', 'https://host/server-card'],
  ])('%s → %s', (input, expected) => {
    expect(serverCardUrl(input)).toBe(expected);
  });
});

describe('cardConnection', () => {
  const base = { name: 'com.example/weather', version: '1.0.0', description: 'Forecasts.' };

  it('picks the first usable streamable-HTTP remote and lists the headers left to the caller', () => {
    const card = createServerCard({
      ...base,
      remotes: [
        { type: 'sse', url: 'https://example.com/sse' },
        { type: 'streamable-http', url: '{base}/mcp' },
        {
          type: 'streamable-http',
          url: 'https://example.com/mcp',
          headers: [
            { name: 'Authorization', isRequired: true, isSecret: true },
            { name: 'X-Fixed', isRequired: true, value: 'yes' },
            { name: 'X-Optional' },
          ],
        },
      ],
    });
    expect(cardConnection(card)).toEqual({ url: 'https://example.com/mcp', requiredHeaders: ['Authorization'] });
  });

  it('is null when no remote can be used as it stands', () => {
    expect(cardConnection(createServerCard(base))).toBeNull();
    expect(
      cardConnection(createServerCard({ ...base, remotes: [{ type: 'sse', url: 'https://x.com/sse' }] })),
    ).toBeNull();
  });
});
