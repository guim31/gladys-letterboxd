// -----------------------------------------------------------------------------
// Letterboxd client: the public RSS feed of a profile,
// https://letterboxd.com/<username>/rss/ (no account, no key: Letterboxd's API
// is granted on request only). The feed holds the 50 latest diary entries
// (films logged, with the watch date, the rating, the like and the rewatch
// flag) and the latest lists, newest first. Lists are not films: ignored.
//
// The watchlist has no feed (/watchlist/rss/ answers 403) and its page is
// built for browsers: the integration does without it.
//
// A small dependency-free parser: the feed is regular, generated XML.
// -----------------------------------------------------------------------------

export const SITE_URL = 'https://letterboxd.com';
export const USER_AGENT =
  'gladys-letterboxd (Gladys Assistant integration; +https://github.com/guim31/gladys-letterboxd)';
const TIMEOUT_MS = 20000;
// A feed of 50 entries weighs about 100 KB; the reviews make it longer.
const MAX_FEED_BYTES = 2 * 1024 * 1024;
// Posters served to the widget: Letterboxd resizes on its CDN, the core takes
// 300 KB at most.
const POSTER_HOSTS = new Set(['a.ltrbxd.com']);
const MAX_POSTER_BYTES = 300 * 1024;

export class ProfileNotFoundError extends Error {
  constructor(username) {
    super(`Letterboxd profile "${username}" not found`);
    this.name = 'ProfileNotFoundError';
    this.username = username;
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Entities of an XML text decoded. */
function entities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) => {
    if (code[0] === '#') {
      const point =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** XML text: CDATA sections taken as they are, entities decoded elsewhere. */
export function decode(text) {
  return String(text ?? '')
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part) => (part.startsWith('<![CDATA[') ? part.slice(9, -3) : entities(part)))
    .join('')
    .trim();
}

function tag(xml, name) {
  const escaped = name.replace(':', '\\:');
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`).exec(xml);
  return match ? decode(match[1]) : null;
}

/** The poster of an entry, at the size of a widget thumbnail (230 × 345). */
export function posterOf(description) {
  const src = /<img\s[^>]*src="([^"]+)"/i.exec(description ?? '')?.[1];
  if (!src) {
    return null;
  }
  try {
    const url = new URL(decode(src));
    if (url.protocol !== 'https:' || !POSTER_HOSTS.has(url.hostname)) {
      return null;
    }
    url.pathname = url.pathname.replace(/-0-\d+-0-\d+-crop\./, '-0-230-0-345-crop.');
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * One diary entry of the feed, or null for a list (or anything else).
 * `watchedOn` is the calendar date the member gave ("2026-11-14", no time
 * zone); `loggedAt` the time it was logged (ms).
 */
export function parseEntry(item) {
  const guid = tag(item, 'guid') ?? '';
  const match = /^letterboxd-(review|watch)-(\d+)$/.exec(guid);
  const title = tag(item, 'letterboxd:filmTitle');
  if (!match || !title) {
    return null;
  }
  const watchedOn = tag(item, 'letterboxd:watchedDate');
  const rating = Number(tag(item, 'letterboxd:memberRating'));
  const year = Number(tag(item, 'letterboxd:filmYear'));
  const loggedAt = Date.parse(tag(item, 'pubDate') ?? '');
  return {
    id: match[2],
    kind: match[1],
    title,
    year: Number.isInteger(year) && year > 0 ? year : null,
    // Half stars, 0.5 to 5; no rating: null.
    rating: rating >= 0.5 && rating <= 5 ? Math.round(rating * 2) / 2 : null,
    watchedOn: /^\d{4}-\d{2}-\d{2}$/.test(watchedOn ?? '') ? watchedOn : null,
    loggedAt: Number.isFinite(loggedAt) ? loggedAt : null,
    rewatch: tag(item, 'letterboxd:rewatch') === 'Yes',
    liked: tag(item, 'letterboxd:memberLike') === 'Yes',
    review: match[1] === 'review',
    url: tag(item, 'link') ?? '',
    poster: posterOf(tag(item, 'description')),
  };
}

/** The feed: the member's display name and diary entries, newest logged first. */
export function parseFeed(xml) {
  const channel = /<channel>([\s\S]*?)(?:<item>|<\/channel>)/.exec(xml)?.[1] ?? '';
  const title = tag(channel, 'title') ?? '';
  if (!/<rss[\s>]/.test(xml) || !/<channel>/.test(xml)) {
    throw new Error('not an RSS feed');
  }
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const entries = items
    .map(parseEntry)
    .filter(Boolean)
    .sort((a, b) => (b.loggedAt ?? 0) - (a.loggedAt ?? 0) || Number(b.id) - Number(a.id));
  return {
    displayName: title.replace(/^Letterboxd\s*-\s*/, '').trim() || null,
    entries,
    items: items.length,
  };
}

// Redirects are refused: the host checked is the host read.
async function get(fetchImpl, url, accept, maxBytes) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Refused before the body is read when the server says it is too large.
  const length = Number(response.headers?.get?.('content-length'));
  if (length > maxBytes) {
    throw new Error(`${new URL(url).hostname}: ${length} bytes, ${maxBytes} at most`);
  }
  return response;
}

/** Read the feed of `username`. Throws ProfileNotFoundError on a 404. */
export async function fetchProfile(fetchImpl, username) {
  const url = `${SITE_URL}/${encodeURIComponent(username)}/rss/`;
  const response = await get(
    fetchImpl,
    url,
    'application/rss+xml, application/xml',
    MAX_FEED_BYTES,
  );
  if (response.status === 404) {
    throw new ProfileNotFoundError(username);
  }
  if (response.status !== 200) {
    throw new Error(`letterboxd.com: HTTP ${response.status}`);
  }
  const text = await response.text();
  if (text.length > MAX_FEED_BYTES) {
    throw new Error('letterboxd.com: feed too large');
  }
  try {
    return parseFeed(text);
  } catch (err) {
    throw new Error(`letterboxd.com: ${err.message}`, { cause: err });
  }
}

/** The bytes of a poster (JPEG from the Letterboxd CDN), as raw base64. */
export async function fetchPoster(fetchImpl, url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !POSTER_HOSTS.has(parsed.hostname)) {
    throw new Error('not a Letterboxd poster');
  }
  const response = await get(fetchImpl, url, 'image/jpeg, image/webp, image/png', MAX_POSTER_BYTES);
  if (response.status !== 200) {
    throw new Error(`poster: HTTP ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > MAX_POSTER_BYTES) {
    throw new Error(`poster: ${body.length} bytes`);
  }
  return body.toString('base64');
}
