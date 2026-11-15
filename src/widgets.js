// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `films`.
//
// The latest films logged, as a `card-list` (8 rows at most, the core's cap):
// poster thumbnail, "Title (year)", the stars, the member and the watch date.
// Tapping a row opens the core's detail panel (rating, watch date, rewatch,
// like) with a link to the entry on Letterboxd.
//
// Settings: `device`, one profile (its name, then the films of the month and
// of the year as caption) or, empty, every profile mixed, newest first; and
// `show_posters`, off to load no poster from Letterboxd's servers.
// Budget: 2 texts, 1 card-list.
// -----------------------------------------------------------------------------

import { clip, filmOf, formatDay, formatNumber, stars } from './i18n.js';
import { WIDGET_KEY } from './monitor.js';

export const MAX_ITEMS = 8;
export const TTL_SECONDS = 900;

export const TEXT = {
  title: { en: 'Letterboxd', fr: 'Letterboxd', de: 'Letterboxd', es: 'Letterboxd' },
  waiting: {
    en: 'Waiting for Letterboxd…',
    fr: 'En attente de Letterboxd…',
    de: 'Warte auf Letterboxd…',
    es: 'Esperando a Letterboxd…',
  },
  latest: {
    en: 'Latest films watched',
    fr: 'Derniers films vus',
    de: 'Zuletzt gesehene Filme',
    es: 'Últimas películas vistas',
  },
  none: {
    en: 'No film logged yet',
    fr: 'Aucun film enregistré pour l’instant',
    de: 'Noch kein Film eingetragen',
    es: 'Ninguna película registrada todavía',
  },
  counts: {
    en: '{month} this month · {year} this year',
    fr: '{month} ce mois-ci · {year} cette année',
    de: '{month} im Monat · {year} im Jahr',
    es: '{month} este mes · {year} este año',
  },
  atLeast: { en: '{n}+', fr: '{n}+', de: '{n}+', es: '{n}+' },
  rewatch: { en: 'Rewatch', fr: 'Revu', de: 'Erneut', es: 'De nuevo' },
  notRated: { en: 'Not rated', fr: 'Sans note', de: 'Ohne Bewertung', es: 'Sin nota' },
  rating: { en: 'Rating', fr: 'Note', de: 'Bewertung', es: 'Nota' },
  watched: { en: 'Watched', fr: 'Vu le', de: 'Gesehen am', es: 'Vista el' },
  member: { en: 'Member', fr: 'Membre', de: 'Mitglied', es: 'Miembro' },
  liked: { en: 'Liked ♥', fr: 'Aimé ♥', de: 'Gefällt ♥', es: 'Le gustó ♥' },
  review: {
    en: 'With a review',
    fr: 'Avec une critique',
    de: 'Mit einer Kritik',
    es: 'Con una reseña',
  },
  open: {
    en: 'On Letterboxd',
    fr: 'Sur Letterboxd',
    de: 'Auf Letterboxd',
    es: 'En Letterboxd',
  },
};

const LANGS = ['en', 'fr', 'de', 'es'];
const t = (text, language, values = {}) =>
  (text[language] ?? text.en).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);

/** One row of the list, and its detail panel. */
export function itemOf(entry, member, language, { posters = true, showMember = true } = {}) {
  const colon = language === 'fr' ? ' : ' : ': ';
  const rating = entry.rating
    ? `${stars(entry.rating)} (${formatNumber(entry.rating, language)}/5)`
    : t(TEXT.notRated, language);
  const day = formatDay(entry.watchedOn, language);
  const item = {
    title: clip(filmOf(entry), 60),
    subtitle: clip(
      [entry.rating ? stars(entry.rating) : t(TEXT.notRated, language), showMember && member, day]
        .filter(Boolean)
        .join(' · '),
      60,
    ),
    description: [
      `${t(TEXT.rating, language)}${colon}${rating}`,
      day && `${t(TEXT.watched, language)}${colon}${day}`,
      `${t(TEXT.member, language)}${colon}${member}`,
      entry.rewatch && t(TEXT.rewatch, language),
      entry.liked && t(TEXT.liked, language),
      entry.review && t(TEXT.review, language),
    ]
      .filter(Boolean)
      .join('\n'),
    links: entry.url ? [{ url: entry.url, label: t(TEXT.open, language) }] : [],
  };
  if (entry.rewatch) {
    item.badge = { text: t(TEXT.rewatch, language), color: 'info' };
  }
  if (posters && entry.poster) {
    item.image = `poster-${entry.id}`;
  }
  return item;
}

const count = (value, partial, language) =>
  partial ? t(TEXT.atLeast, language, { n: value }) : String(value);

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { settings = {}, language = 'en' } = {}) {
      const lang = LANGS.includes(language) ? language : 'en';
      const posters = settings.show_posters !== false;
      const chosen = settings.device ? monitor.usernameOf(settings.device) : null;
      const usernames = chosen ? [chosen] : monitor.config.profiles;
      const read = usernames.filter((username) => monitor.feeds.has(username));
      const rows = read
        .flatMap((username) =>
          monitor.feeds.get(username).entries.map((entry) => ({ username, entry })),
        )
        .sort((a, b) => (b.entry.loggedAt ?? 0) - (a.entry.loggedAt ?? 0))
        .slice(0, MAX_ITEMS)
        .map(({ username, entry }) =>
          itemOf(entry, monitor.nameOf(username), lang, { posters, showMember: !chosen }),
        );
      let caption = t(TEXT.latest, lang);
      if (read.length === 0) {
        caption = t(TEXT.waiting, lang);
      } else if (rows.length === 0) {
        caption = t(TEXT.none, lang);
      } else if (chosen) {
        const stats = monitor.statsOf(chosen);
        caption = t(TEXT.counts, lang, {
          month: count(stats.month, stats.partialMonth, lang),
          year: count(stats.year, stats.partialYear, lang),
        });
      }
      const components = [
        {
          type: 'text',
          variant: 'heading',
          text: chosen ? monitor.nameOf(chosen) : t(TEXT.title, lang),
        },
        { type: 'text', variant: 'caption', text: caption },
      ];
      if (rows.length > 0) {
        components.push({ type: 'card-list', display: 'list', items: rows });
      }
      return { ttl_seconds: TTL_SECONDS, components };
    },
  },
};
