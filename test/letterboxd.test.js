// -----------------------------------------------------------------------------
// The RSS client, on the feeds recorded on 15/11/2026 (anonymized).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProfiles, normalizeConfig, MAX_PROFILES } from '../src/config.js';
import {
  ProfileNotFoundError,
  USER_AGENT,
  decode,
  fetchPoster,
  fetchProfile,
  parseFeed,
  posterOf,
} from '../src/letterboxd.js';
import { A, B, EMPTY, EMPTY_FEED, createSite, read } from './helpers/world.js';

test('a feed gives the diary entries, newest first, lists left out', () => {
  const feed = parseFeed(read(`rss-${A}.xml`));
  assert.equal(feed.items, 100);
  assert.equal(feed.entries.length, 50);
  assert.equal(feed.displayName, A);
  assert.deepEqual(feed.entries[0], {
    id: '1587386844',
    kind: 'review',
    title: 'Mouse',
    year: 2026,
    rating: 4,
    watchedOn: '2026-11-14',
    loggedAt: Date.parse('2026-11-15T04:02:07Z'),
    rewatch: false,
    liked: false,
    review: true,
    url: 'https://letterboxd.com/cinephile_a/film/mouse-2026/',
    poster:
      'https://a.ltrbxd.com/resized/film-poster/1/1/2/4/2/8/8/1124288-mouse-2026-0-230-0-345-crop.jpg?v=cdf75b6edd',
  });
  for (let i = 1; i < feed.entries.length; i += 1) {
    assert.ok(feed.entries[i - 1].loggedAt >= feed.entries[i].loggedAt);
  }
});

test('half stars, missing ratings, rewatches, likes and entities', () => {
  const feed = parseFeed(read(`rss-${B}.xml`));
  assert.equal(feed.displayName, 'Cinephile_B');
  const tenet = feed.entries.find((entry) => entry.title === 'Tenet');
  assert.equal(tenet.rating, 4.5);
  assert.equal(tenet.rewatch, true);
  assert.equal(tenet.liked, true);
  assert.ok(feed.entries.some((entry) => entry.rating === null));
  assert.ok(feed.entries.some((entry) => entry.title === "Bill & Ted's Excellent Adventure"));
  assert.equal(decode('<![CDATA[ a &amp; b ]]>'), 'a &amp; b');
  assert.equal(decode('Don&#039;t &#x2605; &unknown;'), "Don't ★ &unknown;");
});

test('a profile without activity is an empty diary, not an error', () => {
  const feed = parseFeed(EMPTY_FEED);
  assert.deepEqual(feed, { displayName: 'Quiet Member', entries: [], items: 0 });
  assert.throws(() => parseFeed('<html>Cloudflare</html>'), /not an RSS feed/);
});

test('posters: Letterboxd CDN only, at thumbnail size', () => {
  assert.equal(
    posterOf('<p><img src="https://a.ltrbxd.com/x/1-film-0-600-0-900-crop.jpg?v=1"/></p>'),
    'https://a.ltrbxd.com/x/1-film-0-230-0-345-crop.jpg?v=1',
  );
  assert.equal(posterOf('<img src="https://evil.example/x.jpg"/>'), null);
  assert.equal(posterOf('<img src="http://a.ltrbxd.com/x.jpg"/>'), null);
  assert.equal(posterOf('no image'), null);
});

test('fetchProfile: honest User-Agent, 404 is a missing profile, other errors thrown', async () => {
  const site = createSite();
  const feed = await fetchProfile(site.fetch, EMPTY);
  assert.equal(feed.entries.length, 0);
  assert.equal(site.requests[0].url.href, `https://letterboxd.com/${EMPTY}/rss/`);
  assert.equal(site.requests[0].headers['User-Agent'], USER_AGENT);
  await assert.rejects(fetchProfile(site.fetch, 'nobody_here'), ProfileNotFoundError);
  site.down = 503;
  await assert.rejects(fetchProfile(site.fetch, A), /letterboxd\.com: HTTP 503/);
  site.down = false;
  await assert.rejects(fetchPoster(site.fetch, 'https://evil.example/x.jpg'), /not a Letterboxd/);
  assert.ok((await fetchPoster(site.fetch, 'https://a.ltrbxd.com/x.jpg')).startsWith('/9j/'));
});

test('profiles: usernames or links, lower case, no duplicates, ten at most', () => {
  assert.deepEqual(parseProfiles('Dave, https://letterboxd.com/Jane/films/ ; @dave\nname!, film'), {
    profiles: ['dave', 'jane'],
    invalid: ['name!', 'film'],
    dropped: [],
  });
  const many = Array.from({ length: 12 }, (_, i) => `member${i}`).join(',');
  const parsed = parseProfiles(many);
  assert.equal(parsed.profiles.length, MAX_PROFILES);
  assert.deepEqual(parsed.dropped, ['member10', 'member11']);
  assert.deepEqual(normalizeConfig({ refresh_interval: '7', language: 'it' }), {
    profiles: [],
    invalidProfiles: [],
    droppedProfiles: [],
    refreshMinutes: 60,
    language: 'fr',
  });
});

test('no redirect followed, and a body announced too large is refused unread', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(init.redirect);
    return {
      status: 200,
      headers: new Headers({ 'content-length': String(400 * 1024) }),
      arrayBuffer: async () => assert.fail('body read'),
    };
  };
  await assert.rejects(fetchPoster(fetchImpl, 'https://a.ltrbxd.com/x.jpg'), /409600 bytes/);
  assert.deepEqual(calls, ['error']);
});
