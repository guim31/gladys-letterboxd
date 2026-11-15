// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, a profile missing, Letterboxd lost and back, a configuration
// saved), never one line per refresh cycle nor per film logged; a failure that
// repeats at every cycle is logged once, plus one line when it is over.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A, captureLogs, createAll, createWorld, cycle, newEntry } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  await world(t);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [letterboxd] Started: 2 Letterboxd profile(s) read every 60 min',
  ]);
});

test('normal cycles write nothing at info, new films included', async (t) => {
  const w = await world(t);
  await createAll(w);
  const lines = captureLogs(t, 'info');
  w.site.feeds.set(
    A,
    newEntry(w.site.feeds.get(A), {
      id: '1600000009',
      title: 'Quiet',
      loggedAt: w.clock.time,
      watched: '2026-11-15',
    }),
  );
  for (let i = 0; i < 3; i += 1) {
    await cycle(w);
  }
  assert.equal(w.fake.sceneEvents.length, 1);
  assert.deepEqual(lines, []);
});

test('LOG_LEVEL=debug shows the cycles', async (t) => {
  const lines = captureLogs(t, 'debug');
  const w = await world(t);
  await cycle(w);
  assert.ok(lines.some((line) => /cinephile_a: 50 diary entries in the feed/.test(line.text)));
});

test('Letterboxd down at every cycle: one warning per profile, then one line at recovery', async (t) => {
  const w = await world(t, { config: { profiles: A } });
  const lines = captureLogs(t, 'info');
  w.site.down = 503;
  for (let i = 0; i < 4; i += 1) {
    await cycle(w);
  }
  assert.deepEqual(lines.map(strip), [
    '[WARN] [letterboxd] Reading cinephile_a failed: letterboxd.com: HTTP 503',
    '[WARN] [letterboxd] Letterboxd unreachable',
  ]);
  w.site.down = false;
  await cycle(w);
  assert.deepEqual(lines.slice(2).map(strip), [
    '[INFO] [letterboxd] cinephile_a read again',
    '[INFO] [letterboxd] Letterboxd answers again',
  ]);
});

test('a missing profile is said once', async (t) => {
  const lines = captureLogs(t, 'info');
  const w = await world(t, { config: { profiles: 'nobody_here' } });
  for (let i = 0; i < 3; i += 1) {
    await cycle(w);
  }
  assert.deepEqual(lines.map(strip), [
    '[INFO] [letterboxd] Started: 1 Letterboxd profile(s) read every 60 min',
    '[WARN] [letterboxd] Profile not found on Letterboxd: nobody_here',
  ]);
});
