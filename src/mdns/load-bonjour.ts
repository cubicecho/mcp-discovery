/**
 * Loads bonjour-service, the optional peer dependency every mDNS function needs.
 */

import type BonjourModule from 'bonjour-service';

/** The bonjour-service class. */
export type Bonjour = BonjourModule.Bonjour;

/** A service bonjour-service published or found. */
export type BonjourService = BonjourModule.Service;

/**
 * Imports bonjour-service on first use, so the rest of this package works without it.
 *
 * @returns The Bonjour class.
 * @throws If bonjour-service is not installed, saying how to install it.
 */
export async function loadBonjour(): Promise<typeof BonjourModule.Bonjour> {
  try {
    const { Bonjour } = await import('bonjour-service');
    return Bonjour;
  } catch (cause) {
    throw new Error('mDNS needs the optional peer dependency bonjour-service: npm install bonjour-service', {
      cause,
    });
  }
}

/**
 * Stops everything a Bonjour instance published and closes its socket.
 *
 * @param bonjour - The instance to shut down.
 */
export function shutDown(bonjour: Bonjour): Promise<void> {
  return new Promise((resolve) => {
    // Unpublishing sends goodbye packets (TTL 0), so browsers drop the host at once instead of on expiry.
    bonjour.unpublishAll(() => bonjour.destroy(() => resolve()));
  });
}
