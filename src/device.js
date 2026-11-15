// -----------------------------------------------------------------------------
// One Gladys device per followed Letterboxd profile (platform id: the
// username, in lower case: Letterboxd usernames are case-insensitive).
//
// Features (couples checked against the Gladys front, see
// test/gladys-rules.test.js):
//   - last_film       text/text: the film logged last, "Mouse (2026) · ★★★★";
//   - last_rating     unknown/unknown, 0 to 5 by half stars, 0 = not rated;
//   - films_month     counter-sensor/integer: diary entries watched this month;
//   - films_year      counter-sensor/integer: the same this year;
//   - average_rating  unknown/unknown: average rating of this year's rated
//                     entries, 0 = none.
// The two ratings share `unknown/unknown`, the two counters
// `counter-sensor/integer`: a type alone on a device shows its generic label
// on the dashboard instead of the feature name. The counts come from the feed,
// which holds the 50 latest entries only (see src/monitor.js).
//
// Published with should_poll: false: the refresh runs in the container.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';
import { NAMES } from './i18n.js';

export const DEVICE_TYPE = 'profile';
export const FEATURE_KEYS = {
  LAST_FILM: 'last_film',
  LAST_RATING: 'last_rating',
  MONTH: 'films_month',
  YEAR: 'films_year',
  AVERAGE: 'average_rating',
};

export const MAX_COUNT = 10000;

/** External ids of the device of `username` and of its features. */
export function deviceIds(gladys, username) {
  const ids = gladys.externalIds(DEVICE_TYPE, username);
  return {
    device: ids.device,
    lastFilm: ids.feature(FEATURE_KEYS.LAST_FILM),
    lastRating: ids.feature(FEATURE_KEYS.LAST_RATING),
    month: ids.feature(FEATURE_KEYS.MONTH),
    year: ids.feature(FEATURE_KEYS.YEAR),
    average: ids.feature(FEATURE_KEYS.AVERAGE),
  };
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const counter = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, TYPES.SENSOR.INTEGER, {
    keep_history: true,
    min: 0,
    max: MAX_COUNT,
  });

const rating = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.UNKNOWN, TYPES.UNKNOWN.UNKNOWN, {
    keep_history: true,
    min: 0,
    max: 5,
  });

/** The discovery payload of the device of a profile. */
export function buildDevice(gladys, { username, displayName }, language = 'fr') {
  const ids = deviceIds(gladys, username);
  const names = NAMES[language] ?? NAMES.fr;
  return {
    name: `Letterboxd ${displayName || username}`,
    external_id: ids.device,
    model: 'Letterboxd',
    should_poll: false,
    params: [{ name: 'username', value: username }],
    features: [
      sensor(names.last_film, ids.lastFilm, DEVICE_FEATURE_CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
        keep_history: false,
        min: 0,
        max: 0,
      }),
      rating(names.last_rating, ids.lastRating),
      counter(names.films_month, ids.month),
      counter(names.films_year, ids.year),
      rating(names.average_rating, ids.average),
    ],
  };
}
