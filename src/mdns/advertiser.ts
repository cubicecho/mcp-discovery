/**
 * Keeping an mDNS announcement in step with a setting that can change while the process runs.
 */

import { type Advertisement, type AdvertiseOptions, advertise } from './advertise.ts';

/** What the advertiser needs from its host. */
export interface AdvertiserDeps {
  /** Whether the host should be announced; read on every `sync`, so it can follow a live setting. */
  isWanted: () => boolean;
  /** What to announce; read when an announcement starts, so a changed port or path takes effect on the next one. */
  options: () => AdvertiseOptions;
  /** Told when the announcement starts or stops, and why one could not start. */
  log: (message: string) => void;
  /**
   * Starts an announcement; replaced in tests.
   *
   * @defaultValue `advertise`
   */
  start?: (options: AdvertiseOptions) => Promise<Advertisement>;
}

/** Keeps the announcement in step with `isWanted()`. */
export interface Advertiser {
  /** Starts or stops the announcement to match `isWanted()` as it is when this call runs. */
  sync: () => Promise<void>;
  /** Stops the announcement, if any; call on shutdown so browsers drop the host at once. */
  close: () => Promise<void>;
}

/**
 * An advertiser that announces nothing until the first `sync`.
 *
 * @param deps - The setting, what to announce, the log and optionally the announcer.
 * @returns The advertiser.
 *
 * @remarks
 * Calls run one after another, so a quick on-off-on never runs two announcements. One that fails (the name is
 * taken, multicast is blocked) is logged and the host carries on; the next `sync` tries again.
 */
export function createAdvertiser(deps: AdvertiserDeps): Advertiser {
  const start = deps.start ?? advertise;
  let current: Advertisement | null = null;
  let queue: Promise<void> = Promise.resolve();

  const stop = async (): Promise<void> => {
    if (!current) {
      return;
    }
    const stopping = current;
    current = null;
    await stopping.stop();
    deps.log('LAN discovery: stopped advertising');
  };

  const apply = async (): Promise<void> => {
    const isWanted = deps.isWanted();
    if (isWanted === false) {
      await stop();
      return;
    }
    if (current) {
      return;
    }
    const options = deps.options();
    try {
      current = await start({ onError: (error) => deps.log(`LAN discovery: ${error.message}`), ...options });
      deps.log(`LAN discovery: advertising "${options.name}" on port ${options.port}`);
    } catch (error) {
      deps.log(`LAN discovery: could not advertise: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const enqueue = (step: () => Promise<void>): Promise<void> => {
    queue = queue.then(step, step);
    return queue;
  };

  return { sync: () => enqueue(apply), close: () => enqueue(stop) };
}
