import { describe, expect, it } from 'vitest';
import { toMcpHost } from '../../src/mdns/browse.ts';

describe('toMcpHost', () => {
  const service = {
    name: 'MCP Router on nas',
    host: 'nas.local',
    port: 3000,
    addresses: ['fe80::1', '192.168.1.20'],
    txt: { txtvers: '1', path: '/mcp', catalog: '/.well-known/ai-catalog.json' },
  };

  it('builds the URLs from the IPv4 address and the TXT paths', () => {
    expect(toMcpHost(service)).toMatchObject({
      origin: 'http://192.168.1.20:3000',
      endpointUrl: 'http://192.168.1.20:3000/mcp',
      catalogUrl: 'http://192.168.1.20:3000/.well-known/ai-catalog.json',
    });
  });

  it('falls back to the mDNS name, and uses https when tls is on', () => {
    const host = toMcpHost({ ...service, addresses: ['fe80::1'], txt: { ...service.txt, tls: '1' } });
    expect(host.origin).toBe('https://nas.local:3000');
  });

  it('copes with a service that announced no addresses or TXT', () => {
    const host = toMcpHost({ name: 'bare', host: 'bare.local', port: 80 });
    expect(host).toMatchObject({ addresses: [], endpointUrl: 'http://bare.local/mcp' });
  });
});
