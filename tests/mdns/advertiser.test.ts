import { describe, expect, it, vi } from 'vitest';
import type { Advertisement } from '../../src/mdns/advertise.ts';
import { createAdvertiser } from '../../src/mdns/advertiser.ts';

/** An advertiser over a fake announcer, with the setting under the test's control. */
function setup() {
  const setting = { on: false, port: 3000 };
  const stop = vi.fn(async () => undefined);
  const start = vi.fn(async (): Promise<Advertisement> => ({ stop }));
  const log = vi.fn();
  const advertiser = createAdvertiser({
    isWanted: () => setting.on,
    options: () => ({ name: 'MCP Skills on nas', port: setting.port }),
    log,
    start,
  });
  return { advertiser, setting, start, stop, log };
}

describe('createAdvertiser', () => {
  it('announces nothing while the setting is off', async () => {
    const { advertiser, start } = setup();
    await advertiser.sync();
    expect(start).not.toHaveBeenCalled();
  });

  it('starts once when the setting turns on, and stops when it turns off', async () => {
    const { advertiser, setting, start, stop } = setup();
    setting.on = true;
    await advertiser.sync();
    await advertiser.sync();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ name: 'MCP Skills on nas', port: 3000 }));
    setting.on = false;
    await advertiser.sync();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('reads what to announce when it starts, so a new port takes effect on the next start', async () => {
    const { advertiser, setting, start } = setup();
    setting.on = true;
    await advertiser.sync();
    setting.on = false;
    await advertiser.sync();
    setting.port = 4000;
    setting.on = true;
    await advertiser.sync();
    expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ port: 4000 }));
  });

  it('never runs two announcements at once, even when a sync arrives mid-start', async () => {
    const { advertiser, setting, start, stop } = setup();
    let finishStart: () => void = () => undefined;
    start.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = () => resolve({ stop });
        }),
    );
    setting.on = true;
    const first = advertiser.sync();
    const second = advertiser.sync();
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    finishStart();
    await Promise.all([first, second]);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('acts on the setting as it is when a queued sync runs', async () => {
    const { advertiser, setting, start } = setup();
    setting.on = true;
    const first = advertiser.sync();
    setting.on = false;
    await Promise.all([first, advertiser.sync()]);
    expect(start).not.toHaveBeenCalled();
  });

  it('logs a failed announcement, carries on, and tries again on the next sync', async () => {
    const { advertiser, setting, start, log } = setup();
    start.mockRejectedValueOnce(new Error('the name may already be in use'));
    setting.on = true;
    await advertiser.sync();
    expect(log).toHaveBeenCalledWith('LAN discovery: could not advertise: the name may already be in use');
    await advertiser.sync();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('stops on close, whatever the setting says', async () => {
    const { advertiser, setting, stop } = setup();
    setting.on = true;
    await advertiser.sync();
    await advertiser.close();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
