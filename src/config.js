// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Minutes between two readings of every profile. The RSS feeds are public
// pages: a film logged is seldom urgent, and the integration stays a light
// visitor (one request per profile per reading).
export const REFRESH_INTERVALS = ['30', '60', '120', '360'];

// Profiles followed at most: one request each per reading.
export const MAX_PROFILES = 10;

export const DEFAULT_CONFIG = {
  profiles: '',
  refresh_interval: '60',
  language: 'fr',
};

// Letterboxd usernames: letters, digits and underscores (2 to 15 on sign-up;
// a little more is accepted here, the site is the judge).
const USERNAME = /^[a-z0-9_]{1,30}$/i;
// A profile link copied from the site gives its username.
const PROFILE_LINK = /letterboxd\.com\/([^/?#\s]+)/i;
// Pages of the site that are not profiles.
const NOT_PROFILES = new Set([
  'film',
  'films',
  'list',
  'lists',
  'members',
  'journal',
  'search',
  'about',
  'apps',
  'pro',
  'api',
  'settings',
  'activity',
]);

/**
 * Split a typed list of profiles: usernames or profile links, separated by
 * commas, semicolons, spaces or new lines. Usernames are case-insensitive on
 * Letterboxd: they are kept in lower case, duplicates dropped.
 * @returns {{ profiles: string[], invalid: string[], dropped: string[] }}
 */
export function parseProfiles(text) {
  const profiles = [];
  const invalid = [];
  for (const token of String(text ?? '').split(/[\s,;]+/)) {
    if (token === '') {
      continue;
    }
    const name = (PROFILE_LINK.exec(token)?.[1] ?? token.replace(/^@/, '')).toLowerCase();
    if (!USERNAME.test(name) || NOT_PROFILES.has(name)) {
      invalid.push(token);
    } else if (!profiles.includes(name)) {
      profiles.push(name);
    }
  }
  return {
    profiles: profiles.slice(0, MAX_PROFILES),
    invalid,
    dropped: profiles.slice(MAX_PROFILES),
  };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const parsed = parseProfiles(source.profiles);
  const refresh = String(source.refresh_interval ?? '');
  return {
    profiles: parsed.profiles,
    invalidProfiles: parsed.invalid,
    droppedProfiles: parsed.dropped,
    refreshMinutes: Number(
      REFRESH_INTERVALS.includes(refresh) ? refresh : DEFAULT_CONFIG.refresh_interval,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
