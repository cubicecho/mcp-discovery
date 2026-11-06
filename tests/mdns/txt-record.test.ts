import { describe, expect, it } from 'vitest';
import { AI_CATALOG_WELL_KNOWN_PATH } from '../../src/core/consts.ts';
import { buildTxtRecord, DEFAULT_ENDPOINT_PATH, parseTxtRecord } from '../../src/mdns/txt-record.ts';

describe('buildTxtRecord', () => {
  it('writes the version and both paths, and tls only when on', () => {
    expect(buildTxtRecord({ path: '/mcp', catalogPath: '/catalog.json', tls: false })).toEqual({
      txtvers: '1',
      path: '/mcp',
      catalog: '/catalog.json',
    });
    expect(buildTxtRecord({ path: '/mcp', catalogPath: '/c', tls: true }).tls).toBe('1');
  });

  it.each(['mcp', '//evil.example/mcp', 'https://evil.example/mcp'])('rejects the path %s', (path) => {
    expect(() => buildTxtRecord({ path, catalogPath: '/c', tls: false })).toThrow(/single "\/"/);
  });
});

describe('parseTxtRecord', () => {
  it('round-trips what buildTxtRecord writes', () => {
    const record = { path: '/mcp/w/team', catalogPath: '/catalog.json', tls: true };
    expect(parseTxtRecord(buildTxtRecord(record))).toEqual(record);
  });

  it('fills in defaults for a record that is missing or from someone else', () => {
    const defaults = { path: DEFAULT_ENDPOINT_PATH, catalogPath: AI_CATALOG_WELL_KNOWN_PATH, tls: false };
    expect(parseTxtRecord(undefined)).toEqual(defaults);
    expect(parseTxtRecord({ version: '0.0.1', endpoint: 'x' })).toEqual(defaults);
  });

  it('ignores paths that would point at another host', () => {
    const record = parseTxtRecord({ path: '//evil.example/mcp', catalog: 'https://evil.example/c' });
    expect(record.path).toBe(DEFAULT_ENDPOINT_PATH);
    expect(record.catalogPath).toBe(AI_CATALOG_WELL_KNOWN_PATH);
  });
});
