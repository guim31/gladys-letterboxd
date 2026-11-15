// -----------------------------------------------------------------------------
// The monitor: devices, states, the `new_film` trigger, persistence, missing
// profiles and outages, against the fake Gladys and the fake letterboxd.com.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { deviceIds } from '../src/device.js';
import { MAX_EVENTS_PER_CYCLE } from '../src/monitor.js';
import {
  A,
  B,
  EMPTY,
  createAll,
  createSite,
  createWorld,
  cycle,
  newEntry,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const HOUR = 3600 * 1000;
const state = (w, username, key) =>
  w.fake.lastState(w.gladys.externalIds('profile', username).feature(key));

test('one device per profile, read without polling by Gladys', async (t) => {
  const w = await world(t);
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => [device.name, device.external_id, device.should_poll]),
    [
      ['Letterboxd cinephile_a', deviceIds(w.gladys, A).device, false],
      ['Letterboxd Cinephile_B', deviceIds(w.gladys, B).device, false],
    ],
  );
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('states of a created device: last film, ratings and counts of the feed', async (t) => {
  const w = await world(t);
  await createAll(w);
  assert.equal(state(w, A, 'last_film'), 'Mouse (2026) · ★★★★');
  assert.equal(state(w, A, 'last_rating'), 4);
  assert.equal(state(w, A, 'films_month'), 6);
  assert.equal(state(w, A, 'films_year'), 50);
  assert.equal(state(w, A, 'average_rating'), 3.1);
  assert.equal(state(w, B, 'last_film'), 'You Can See Everything (2026) · ★★★★★');
  assert.equal(state(w, B, 'films_month'), 0);
  assert.equal(state(w, B, 'films_year'), 22);
  // A's 50 entries all fall in 2026: the year count is a floor.
  assert.equal(w.monitor.statsOf(A).partialYear, true);
  assert.equal(w.monitor.statsOf(B).partialYear, false);
});

test('nothing is published for a device not created in Gladys', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.states.length, 0);
});

test('the first reading fires nothing; a new film fires once, with its data', async (t) => {
  const w = await world(t, { config: { profiles: A, language: 'en' } });
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, 0);
  const site = w.site;
  site.feeds.set(
    A,
    newEntry(site.feeds.get(A), {
      id: '1600000001',
      title: 'Sirāt',
      loggedAt: w.clock.time,
      watched: '2026-11-15',
      rewatch: 'Yes',
    }),
  );
  await cycle(w);
  await cycle(w);
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: 'new_film',
      data: {
        device: deviceIds(w.gladys, A).device,
        watch: 'rewatch',
        member: A,
        title: 'Sirāt',
        year: 2026,
        rating: 3.5,
        liked: 1,
        url: 'https://letterboxd.com/x/film/1600000001/',
        summary: 'cinephile_a rewatched Sirāt (2026), rated 3.5/5.',
      },
    },
  ]);
});

test('the summary in French, without rating', async (t) => {
  const w = await world(t, { config: { profiles: A } });
  w.site.feeds.set(
    A,
    newEntry(w.site.feeds.get(A), {
      id: '1600000002',
      title: 'Nouvelle Vague',
      rating: '',
      loggedAt: w.clock.time,
      watched: '2026-11-15',
    }),
  );
  await cycle(w);
  assert.equal(w.fake.sceneEvents[0].data.summary, 'cinephile_a a vu Nouvelle Vague (2026).');
  assert.equal(w.fake.sceneEvents[0].data.rating, 0);
  assert.equal(w.fake.sceneEvents[0].data.watch, 'first_time');
});

test('a restart fires nothing again; a refused event is sent at the next cycle', async (t) => {
  const site = createSite();
  const first = await createWorld({ config: { profiles: A }, site });
  site.feeds.set(
    A,
    newEntry(site.feeds.get(A), {
      id: '1600000003',
      title: 'One',
      loggedAt: first.clock.time,
      watched: '2026-11-15',
    }),
  );
  const publish = t.mock.method(first.gladys, 'publishSceneEvent', async () => {
    throw new Error('HTTP 429');
  });
  await cycle(first);
  assert.equal(publish.mock.callCount(), 1);
  publish.mock.restore();
  await cycle(first);
  assert.equal(first.fake.sceneEvents.length, 1);
  await first.app.stop();

  const second = await createWorld({ config: { profiles: A }, site, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  await cycle(second);
  assert.equal(second.fake.sceneEvents.length, 0);
});

test('a burst of films is spread over the cycles, oldest first', async (t) => {
  const w = await world(t, { config: { profiles: A } });
  let feed = w.site.feeds.get(A);
  for (let i = 0; i < 14; i += 1) {
    feed = newEntry(feed, {
      id: `17000000${String(i).padStart(2, '0')}`,
      title: `Film ${i}`,
      loggedAt: w.clock.time + i * 1000,
      watched: '2026-11-15',
    });
  }
  w.site.feeds.set(A, feed);
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, MAX_EVENTS_PER_CYCLE);
  assert.equal(w.fake.sceneEvents[0].data.title, 'Film 0');
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, 14);
  assert.equal(w.fake.sceneEvents.at(-1).data.title, 'Film 13');
});

test('a profile without activity: a device with no film, zero counts', async (t) => {
  const w = await world(t, { config: { profiles: EMPTY } });
  await createAll(w);
  assert.equal(w.fake.discoveredDevices[0].name, 'Letterboxd Quiet Member');
  assert.equal(state(w, EMPTY, 'last_film'), 'Aucun film enregistré pour l’instant');
  assert.equal(state(w, EMPTY, 'last_rating'), 0);
  assert.equal(state(w, EMPTY, 'films_year'), 0);
  assert.equal(state(w, EMPTY, 'average_rating'), 0);
});

test('a missing profile is said in the status and not discovered', async (t) => {
  const w = await world(t, { config: { profiles: `${A}, nobody_here, not!valid` } });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.external_id),
    [deviceIds(w.gladys, A).device],
  );
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(
    w.fake.connectionStatus.message.fr,
    'Profil introuvable sur Letterboxd : nobody_here. Pas un nom d’utilisateur Letterboxd, ignoré : not!valid.',
  );
  assert.deepEqual(Object.keys(w.fake.connectionStatus.message), ['en', 'fr', 'de', 'es']);
});

test('Letterboxd down: disconnected with a message, then back', async (t) => {
  const w = await world(t);
  await createAll(w);
  w.site.down = 'network';
  await cycle(w);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.connectionStatus.message.en, 'Letterboxd cannot be reached.');
  // The last good reading is kept.
  assert.equal(state(w, A, 'last_rating'), 4);
  w.site.down = false;
  await cycle(w);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('no profile configured: said in the status', async (t) => {
  const w = await world(t, { config: {} });
  assert.equal(w.fake.discoveredDevices.length, 0);
  assert.match(w.fake.connectionStatus.message.en, /No Letterboxd profile set/);
});

test('reconfiguring drops a profile and its memory', async (t) => {
  const w = await world(t);
  await w.monitor.reconfigure(normalizeConfig({ profiles: B }));
  assert.equal(w.fake.discoveredDevices.length, 1);
  assert.deepEqual(Object.keys(w.monitor.data.profiles), [B]);
  assert.equal(w.monitor.feeds.has(A), false);
});

test('the container refreshes on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const w = await world(t, { timers: true, config: { profiles: A, refresh_interval: '30' } });
  const before = w.site.requests.length;
  t.mock.timers.tick(30 * 60 * 1000);
  await w.monitor.running;
  assert.equal(w.site.requests.length, before + 1);
});

test('states are published with a 12-hour heartbeat (the SDK keeps the clock)', async (t) => {
  const w = await world(t);
  await createAll(w);
  const publish = t.mock.method(w.gladys, 'publishChangedStates');
  await cycle(w);
  assert.equal(publish.mock.callCount(), 1);
  assert.deepEqual(publish.mock.calls[0].arguments[1], { heartbeat: 12 * HOUR });
  assert.equal(publish.mock.calls[0].arguments[0].length, 10);
});
