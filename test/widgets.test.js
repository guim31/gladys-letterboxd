// -----------------------------------------------------------------------------
// The `films` widget, through the fake Gladys (as the core asks for it), and
// checked by the SDK's validateWidgetContent.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { deviceIds } from '../src/device.js';
import { MAX_ITEMS } from '../src/widgets.js';
import { A, B, createAll, createWorld, cycle } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, options) {
  const ack = await w.fake.widgetGet('films', options);
  assert.equal(ack.success, true, ack.error);
  const found = validateWidgetContent(ack.data.content);
  assert.deepEqual(found.problems ?? found, [], 'valid widget content');
  return ack.data.content;
}

const texts = (c) => c.components.filter((item) => item.type === 'text');

for (const language of ['en', 'fr', 'de', 'es']) {
  test(`every profile mixed, newest first, valid (${language})`, async (t) => {
    const w = await world(t);
    const c = await content(w, { language });
    assert.ok(texts(c).length <= 2);
    const list = c.components.find((item) => item.type === 'card-list');
    assert.equal(list.items.length, MAX_ITEMS);
    assert.equal(list.items[0].title, 'Mouse (2026)');
    assert.equal(list.items[0].image, 'poster-1587386844');
    assert.ok(list.items.every((item) => item.links[0].url.startsWith('https://letterboxd.com/')));
  });
}

test('one profile: its name in Gladys, the counts, no member in the rows', async (t) => {
  const w = await world(t);
  const [, device] = await createAll(w);
  await w.fake.deviceUpdated({ ...device, name: 'Letterboxd Camille' });
  const c = await content(w, {
    language: 'fr',
    settings: { device: deviceIds(w.gladys, B).device },
  });
  assert.deepEqual(
    texts(c).map((item) => item.text),
    ['Camille', '0 ce mois-ci · 22 cette année'],
  );
  const list = c.components.find((item) => item.type === 'card-list');
  assert.equal(list.items[0].subtitle, '★★★★★ · sam. 31 oct.');
  const tenet = list.items.find((item) => item.title === 'Tenet (2020)');
  assert.ok(!tenet || tenet.badge.text === 'Revu');
});

test('a floor count reads "50+"', async (t) => {
  const w = await world(t);
  const c = await content(w, {
    language: 'en',
    settings: { device: deviceIds(w.gladys, A).device },
  });
  assert.equal(texts(c)[1].text, '6 this month · 50+ this year');
});

test('posters can be turned off, and are served by the integration', async (t) => {
  const w = await world(t);
  const c = await content(w, { settings: { show_posters: false } });
  const list = c.components.find((item) => item.type === 'card-list');
  assert.ok(list.items.every((item) => item.image === undefined));
  const ack = await w.fake.widgetGetImage('poster-1587386844');
  assert.equal(ack.success, true, ack.error);
  assert.ok(ack.data.image.startsWith('/9j/'));
  const posters = w.site.requests.filter((r) => r.url.hostname === 'a.ltrbxd.com').length;
  await w.fake.widgetGetImage('poster-1587386844');
  assert.equal(w.site.requests.filter((r) => r.url.hostname === 'a.ltrbxd.com').length, posters);
  assert.equal((await w.fake.widgetGetImage('poster-1')).success, false);
  assert.equal((await w.fake.widgetGetImage('../etc')).success, false);
});

test('before the first reading: waiting', async (t) => {
  const w = await world(t, { connect: false });
  w.site.down = 'network';
  await w.gladys.connect();
  await w.app.ready;
  await w.monitor.running;
  const c = await content(w, { language: 'en' });
  assert.deepEqual(
    texts(c).map((item) => item.text),
    ['Letterboxd', 'Waiting for Letterboxd…'],
  );
});

test('a new film nudges the widget', async (t) => {
  const w = await world(t);
  const before = w.fake.widgetRefreshes.length;
  await cycle(w);
  assert.equal(w.fake.widgetRefreshes.length, before);
  w.site.feeds.delete(A);
  await cycle(w);
  assert.equal(w.fake.widgetRefreshes.length, before + 1);
});
