// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake letterboxd.com serving
// the RSS feeds recorded in test/fixtures (anonymized), a manual clock, a
// temporary /data, and the integration wired on top through registerHandlers.
// Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Paris';

export const read = (name) =>
  readFileSync(new URL(`../fixtures/letterboxd/${name}`, import.meta.url), 'utf8');

// The feeds were recorded on 15/11/2026 around 09:30 UTC.
export const START = Date.parse('2026-11-15T10:00:00Z');

// Two active profiles: A logs lists and reviews (100 items, 50 diary
// entries), B mostly watches without rating, with rewatches.
export const A = 'cinephile_a';
export const B = 'cinephile_b';
// A profile that exists and never logged anything.
export const EMPTY = 'quiet_member';
export const EMPTY_FEED = `<?xml version='1.0' encoding='utf-8'?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
	<channel>
		<title>Letterboxd - Quiet Member</title>
		<link>https://letterboxd.com/quiet_member/</link>
		<description>Letterboxd - Quiet Member</description>
	</channel>
</rss>`;

// A JPEG header, enough for the SDK's image check.
export const POSTER = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffc0000b08015900e6010111003fffd9',
  'hex',
);

/** A new diary entry, copied from the first one of a feed. */
export function newEntry(feed, { id, title, rating = '3.5', rewatch = 'No', loggedAt, watched }) {
  const date = new Date(loggedAt).toUTCString().replace('GMT', '+0000');
  const item = `<item> <title>${title}, 2026 - ★★★½</title> <link>https://letterboxd.com/x/film/${id}/</link> <guid isPermaLink="false">letterboxd-watch-${id}</guid> <pubDate>${date}</pubDate> <letterboxd:watchedDate>${watched}</letterboxd:watchedDate> <letterboxd:rewatch>${rewatch}</letterboxd:rewatch> <letterboxd:filmTitle>${title}</letterboxd:filmTitle> <letterboxd:filmYear>2026</letterboxd:filmYear> ${rating ? `<letterboxd:memberRating>${rating}</letterboxd:memberRating>` : ''} <letterboxd:memberLike>Yes</letterboxd:memberLike> <tmdb:movieId>1</tmdb:movieId> <description><![CDATA[ <p><img src="https://a.ltrbxd.com/resized/film-poster/1/x-${id}-0-600-0-900-crop.jpg?v=1"/></p> ]]></description> <dc:creator>X</dc:creator> </item>`;
  return feed.replace(/(<\/atom:link>|<atom:link [^>]*\/>)/, `$1\n${item}`);
}

/** Fake letterboxd.com. `site.down`: 'network', a status (503) or false. */
export function createSite() {
  const site = {
    feeds: new Map([
      [A, read(`rss-${A}.xml`)],
      [B, read(`rss-${B}.xml`)],
      [EMPTY, EMPTY_FEED],
    ]),
    down: false,
    requests: [],

    async fetch(input, init = {}) {
      const url = new URL(input);
      site.requests.push({ url, headers: init.headers });
      if (site.down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (site.down) {
        return { status: site.down, text: async () => 'Service Unavailable' };
      }
      if (url.hostname === 'a.ltrbxd.com') {
        return { status: 200, arrayBuffer: async () => POSTER };
      }
      const user = /^\/([^/]+)\/rss\/$/.exec(url.pathname)?.[1];
      const feed = user && site.feeds.get(user);
      if (!feed) {
        return { status: 404, text: async () => '<html>Sorry, we can’t find the page</html>' };
      }
      return { status: 200, text: async () => feed };
    },
  };
  return site;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.site] from createSite
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  config = { profiles: `${A}, ${B}` },
  devices = [],
  site = createSite(),
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-letterboxd-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, { store, fetch: site.fetch, timers, now: clock.now });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, site, clock, store, dataDir };
}

/** Create every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
  return world.fake.discoveredDevices;
}

/** Run one refresh cycle, `minutes` later. */
export async function cycle(world, minutes = 60) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.runCycle();
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
