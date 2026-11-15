// -----------------------------------------------------------------------------
// Texts produced by the container, in the four languages of the Gladys
// interface: feature names, the text state of the latest film, the scene
// summaries, the connection status. Dates use TZ, the time zone of Gladys.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    last_film: 'Last film watched',
    last_rating: 'Rating of the last film',
    films_month: 'Films watched this month',
    films_year: 'Films watched this year',
    average_rating: 'Average rating this year',
  },
  fr: {
    last_film: 'Dernier film vu',
    last_rating: 'Note du dernier film',
    films_month: 'Films vus ce mois-ci',
    films_year: 'Films vus cette année',
    average_rating: 'Note moyenne cette année',
  },
  de: {
    last_film: 'Zuletzt gesehener Film',
    last_rating: 'Bewertung des letzten Films',
    films_month: 'Filme diesen Monat',
    films_year: 'Filme dieses Jahr',
    average_rating: 'Durchschnittsbewertung dieses Jahr',
  },
  es: {
    last_film: 'Última película vista',
    last_rating: 'Nota de la última película',
    films_month: 'Películas vistas este mes',
    films_year: 'Películas vistas este año',
    average_rating: 'Nota media este año',
  },
};

export const PHRASES = {
  en: {
    none: 'No film logged yet',
    notRated: 'not rated',
    rewatch: 'rewatch',
    watched: (member, film) => `${member} watched ${film}`,
    rewatched: (member, film) => `${member} rewatched ${film}`,
    rated: (value) => `, rated ${value}/5`,
  },
  fr: {
    none: 'Aucun film enregistré pour l’instant',
    notRated: 'sans note',
    rewatch: 'revu',
    watched: (member, film) => `${member} a vu ${film}`,
    rewatched: (member, film) => `${member} a revu ${film}`,
    rated: (value) => `, noté ${value}/5`,
  },
  de: {
    none: 'Noch kein Film eingetragen',
    notRated: 'ohne Bewertung',
    rewatch: 'erneut gesehen',
    watched: (member, film) => `${member} hat ${film} gesehen`,
    rewatched: (member, film) => `${member} hat ${film} erneut gesehen`,
    rated: (value) => `, Bewertung ${value}/5`,
  },
  es: {
    none: 'Ninguna película registrada todavía',
    notRated: 'sin nota',
    rewatch: 'vista de nuevo',
    watched: (member, film) => `${member} ha visto ${film}`,
    rewatched: (member, film) => `${member} ha vuelto a ver ${film}`,
    rated: (value) => `, con una nota de ${value}/5`,
  },
};

/** Messages of the connection status: always the four languages (core 5.2+). */
export const STATUS = {
  initFailed: {
    en: 'The integration could not start: see its logs.',
    fr: 'L’intégration n’a pas pu démarrer : voir ses journaux.',
    de: 'Die Integration konnte nicht starten: Sieh in ihre Protokolle.',
    es: 'La integración no pudo iniciarse: consulte sus registros.',
  },
  apiDown: {
    en: 'Letterboxd cannot be reached.',
    fr: 'Letterboxd est injoignable.',
    de: 'Letterboxd ist nicht erreichbar.',
    es: 'No se puede acceder a Letterboxd.',
  },
  noProfile: {
    en: 'No Letterboxd profile set: add one in the configuration.',
    fr: 'Aucun profil Letterboxd : ajoutez-en un dans la configuration.',
    de: 'Kein Letterboxd-Profil: Füge eines in der Konfiguration hinzu.',
    es: 'Ningún perfil de Letterboxd: añada uno en la configuración.',
  },
  notFound: {
    en: 'Profile not found on Letterboxd: {values}.',
    fr: 'Profil introuvable sur Letterboxd : {values}.',
    de: 'Profil auf Letterboxd nicht gefunden: {values}.',
    es: 'Perfil no encontrado en Letterboxd: {values}.',
  },
  invalid: {
    en: 'Not a Letterboxd username, ignored: {values}.',
    fr: 'Pas un nom d’utilisateur Letterboxd, ignoré : {values}.',
    de: 'Kein Letterboxd-Benutzername, ignoriert: {values}.',
    es: 'No es un nombre de usuario de Letterboxd, ignorado: {values}.',
  },
  dropped: {
    en: 'Ten profiles at most, ignored: {values}.',
    fr: 'Dix profils au plus, ignorés : {values}.',
    de: 'Höchstens zehn Profile, ignoriert: {values}.',
    es: 'Diez perfiles como máximo, ignorados: {values}.',
  },
};

/** A message of STATUS in every language, `{name}` placeholders filled. */
export function render(messages, key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      messages[key][language].replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match),
    ]),
  );
}

/** Several messages of every language, one after the other. */
export function join(...messages) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [language, messages.map((m) => m[language]).join(' ')]),
  );
}

export const phrases = (language) => PHRASES[language] ?? PHRASES.en;

/** "Mouse (2026)". */
export const filmOf = (entry) => (entry.year ? `${entry.title} (${entry.year})` : entry.title);

/** "★★★½"; empty without a rating. */
export const stars = (rating) =>
  rating ? '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '') : '';

/** 3.5 → "3.5" (en) or "3,5" (fr, de, es). */
export const formatNumber = (value, language) =>
  new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, { maximumFractionDigits: 1 }).format(
    value,
  );

/** The text state of the last film: "Mouse (2026) · ★★★★". */
export function describe(entry, language) {
  const p = phrases(language);
  if (!entry) {
    return p.none;
  }
  const parts = [filmOf(entry), entry.rating ? stars(entry.rating) : p.notRated];
  if (entry.rewatch) {
    parts.push(p.rewatch);
  }
  return parts.join(' · ');
}

/** The sentence of a scene event: "Cinephile_A watched Mouse (2026), rated 4/5." */
export function summary(member, entry, language) {
  const p = phrases(language);
  const film = filmOf(entry);
  const head = entry.rewatch ? p.rewatched(member, film) : p.watched(member, film);
  return `${head}${entry.rating ? p.rated(formatNumber(entry.rating, language)) : ''}.`;
}

/** "Sat 14 Nov" in the language, for a calendar date "2026-11-14". */
export function formatDay(day, language) {
  if (!day) {
    return '';
  }
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, date));
}

/** "14:05" in the time zone of Gladys. */
export function formatTime(ms, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms);
}

/** The calendar day of `ms` in the time zone of Gladys: "2026-11-14". */
export function localDay(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Text cut to `max` characters, with an ellipsis. */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}
