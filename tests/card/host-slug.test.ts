import { describe, expect, it } from 'vitest';
import { hostSlug } from '../../src/card/host-slug.ts';
import { createServerCard } from '../../src/card/server-card.ts';

describe('hostSlug', () => {
  it.each([
    ['NAS', 'nas'],
    ['my_box.lan', 'my-box'],
    ['linux-dev.local', 'linux-dev'],
    ['--edge--', 'edge'],
    ['---', 'host'],
    ['', 'host'],
  ])('%j → %s', (hostname, expected) => {
    expect(hostSlug(hostname)).toBe(expected);
  });

  it('answers the fallback it is given when nothing is usable', () => {
    expect(hostSlug('___', 'router')).toBe('router');
  });

  it('stays within one DNS label, without a dash left at the cut', () => {
    const slug = hostSlug(`${'a'.repeat(62)}_b`);
    expect(slug).toBe('a'.repeat(62));
    expect(hostSlug('x'.repeat(80))).toHaveLength(63);
  });

  it('makes a namespace a card name accepts', () => {
    const card = createServerCard({
      name: `io.github.cubicecho.test.${hostSlug('My_Box.lan')}/skills`,
      version: '1.0.0',
      description: 'Skills.',
    });
    expect(card.name).toBe('io.github.cubicecho.test.my-box/skills');
  });
});
