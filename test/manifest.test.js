// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, LANGUAGES, REFRESH_INTERVALS } from '../src/config.js';
import { TRIGGER, WIDGET_KEY } from '../src/monitor.js';
import { WIDGETS } from '../src/widgets.js';
import { A, createWorld, cycle, newEntry } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const { gladys: registered, app } = await createWorld({ connect: false });
await app.stop();
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const field = (list, key) => list.find((entry) => entry.key === key);

test('identity: name, image, cover, cloud transport, categories', () => {
  assert.equal(manifest.name, 'Letterboxd');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-letterboxd:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-letterboxd/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['leisure', 'multimedia']);
  assert.equal(manifest.gladys_version, '>=5.1.0');
});

test('version, package and image tag agree', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the defaults of the manifest are those of the code', () => {
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    assert.deepEqual(field(manifest.config_schema, key).default, value, key);
  }
  assert.deepEqual(
    field(manifest.config_schema, 'refresh_interval').options.map((o) => o.value),
    REFRESH_INTERVALS,
  );
  assert.deepEqual(
    field(manifest.config_schema, 'language').options.map((o) => o.value),
    LANGUAGES,
  );
});

test('every widget has its handler, and no action is declared', () => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
  assert.equal(manifest.actions, undefined);
  assert.equal(manifest.scene_actions, undefined);
  assert.deepEqual(keysOf(manifest.scene_triggers), [TRIGGER]);
  assert.deepEqual(keysOf(field(manifest.widgets, WIDGET_KEY).settings), [
    'device',
    'show_posters',
  ]);
});

test('a scene event carries the fields and the variables of the trigger', async (t) => {
  const world = await createWorld({ config: { profiles: A } });
  t.after(() => world.app.stop());
  world.site.feeds.set(
    A,
    newEntry(world.site.feeds.get(A), {
      id: '1600000010',
      title: 'Check',
      loggedAt: world.clock.time,
      watched: '2026-11-15',
    }),
  );
  await cycle(world);
  const [event] = world.fake.sceneEvents;
  const trigger = field(manifest.scene_triggers, TRIGGER);
  const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
  assert.deepEqual(Object.keys(event.data).sort(), declared.sort());
  for (const variable of trigger.variables) {
    assert.equal(typeof event.data[variable.key], variable.type, variable.key);
  }
  const watch = field(trigger.fields, 'watch').options.map((o) => o.value);
  assert.ok(watch.includes(event.data.watch));
});
