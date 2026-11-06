import { describe, expect, it } from 'vitest';
import type { ServerCard } from '../../src/card/server-card.ts';
import { createAiCatalog } from '../../src/catalog/ai-catalog.ts';
import type { Discovery } from '../../src/client/discover.ts';
import { DocumentFetchError } from '../../src/core/errors.ts';
import { type McpHost, toMcpHost } from '../../src/mdns/browse.ts';
import { createServerTracker, type LanServer } from '../../src/mdns/server-tracker.ts';
import { sampleCard } from '../helpers.ts';

/** A host as `watchHosts` would report it. */
function host(name: string, address = '192.168.1.20'): McpHost {
  return toMcpHost({ name, host: `${name}.local`, port: 3000, addresses: [address], txt: {} });
}

/** A catalog read that found these cards. */
function found(catalogUrl: string, cards: ServerCard[]): Discovery {
  return {
    catalogUrl,
    catalog: createAiCatalog({ entries: [] }),
    servers: cards.map((card) => ({
      entry: { identifier: card.name, type: 'application/mcp-server-card+json', data: card },
      card,
      cardUrl: null,
    })),
    failures: [],
  };
}

/** A tracker over a fake network whose catalogs the test sets, recording every report. */
function setup() {
  const catalogs = new Map<string, ServerCard[] | Error>();
  const events: string[] = [];
  const errors: Error[] = [];
  const tracker = createServerTracker(
    {
      onUp: (server: LanServer) => events.push(`up ${server.key}`),
      onDown: (server: LanServer) => events.push(`down ${server.key}`),
      onError: (error) => errors.push(error),
    },
    async (catalogUrl) => {
      const result = catalogs.get(catalogUrl) ?? [];
      if (result instanceof Error) {
        throw result;
      }
      return found(catalogUrl, result);
    },
  );
  return { tracker, catalogs, events, errors };
}

describe('createServerTracker', () => {
  const nas = host('nas');
  const weather = sampleCard('io.github.cubicecho/weather');
  const notes = sampleCard('io.github.cubicecho/notes');

  it('reports a host’s servers up, keyed by instance and card name, with how to connect', async () => {
    const { tracker, catalogs, events } = setup();
    catalogs.set(nas.catalogUrl, [weather]);
    await tracker.hostUp(nas);
    expect(events).toEqual(['up nas/io.github.cubicecho/weather']);
    expect(tracker.servers()[0]?.connection).toEqual({ url: 'https://example.com/mcp', requiredHeaders: [] });
  });

  it('reports only what changed when a catalog is read again', async () => {
    const { tracker, catalogs, events } = setup();
    catalogs.set(nas.catalogUrl, [weather]);
    await tracker.hostUp(nas);
    await tracker.refresh();
    catalogs.set(nas.catalogUrl, [{ ...weather, version: '2.0.0' }, notes]);
    await tracker.refresh();
    catalogs.set(nas.catalogUrl, [notes]);
    await tracker.refresh();
    expect(events).toEqual([
      'up nas/io.github.cubicecho/weather',
      'up nas/io.github.cubicecho/weather',
      'up nas/io.github.cubicecho/notes',
      'down nas/io.github.cubicecho/weather',
    ]);
  });

  it('reports a server again when its host moves to a new address', async () => {
    const { tracker, catalogs, events } = setup();
    const moved = host('nas', '192.168.1.99');
    catalogs.set(nas.catalogUrl, [weather]);
    catalogs.set(moved.catalogUrl, [weather]);
    await tracker.hostUp(nas);
    await tracker.hostUp(moved);
    expect(events).toHaveLength(2);
    expect(tracker.servers()[0]?.host.origin).toBe('http://192.168.1.99:3000');
  });

  it('reports every server down when its host leaves', async () => {
    const { tracker, catalogs, events } = setup();
    catalogs.set(nas.catalogUrl, [weather, notes]);
    await tracker.hostUp(nas);
    tracker.hostDown(nas);
    expect(events.slice(2)).toEqual(['down nas/io.github.cubicecho/weather', 'down nas/io.github.cubicecho/notes']);
    expect(tracker.servers()).toEqual([]);
  });

  it('reports a catalog that cannot be read and keeps what it knew', async () => {
    const { tracker, catalogs, events, errors } = setup();
    catalogs.set(nas.catalogUrl, [weather]);
    await tracker.hostUp(nas);
    catalogs.set(nas.catalogUrl, new DocumentFetchError('down for a moment', nas.catalogUrl, 503));
    await tracker.refresh();
    expect(errors.map((error) => error.message)).toEqual(['down for a moment']);
    expect(events).toEqual(['up nas/io.github.cubicecho/weather']);
    expect(tracker.servers()).toHaveLength(1);
  });

  it('drops a read that finishes after its host left, or after close', async () => {
    const { tracker, catalogs, events } = setup();
    catalogs.set(nas.catalogUrl, [weather]);
    const pending = tracker.hostUp(nas);
    tracker.hostDown(nas);
    await pending;
    const other = host('other', '192.168.1.30');
    catalogs.set(other.catalogUrl, [notes]);
    const late = tracker.hostUp(other);
    tracker.close();
    await late;
    expect(events).toEqual([]);
  });
});
