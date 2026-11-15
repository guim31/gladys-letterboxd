// -----------------------------------------------------------------------------
// The monitor: reads the RSS feed of every followed profile each
// `refresh_interval` minutes, publishes the devices and their states, fires
// the `new_film` scene trigger and serves the widget.
//
// Trigger: a diary entry seen for the first time. The first reading of a
// profile fires nothing (what is listed then is not news); the entries seen
// are kept under /data, so a restart fires nothing again. An entry deleted
// and re-logged on Letterboxd gets a new id: it fires again.
//
// Counts: the feed holds the 50 latest diary entries only. The films of the
// month and of the year are counted on them (by the watch date the member
// gave); when the 50 entries all fall in the period, the count is a floor
// (`partialYear` / `partialMonth`, said by the widget and the docs).
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat every
// 12 hours.
// -----------------------------------------------------------------------------

import { createLogger, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { buildDevice, deviceIds } from './device.js';
import { STATUS, describe, join, localDay, render, summary } from './i18n.js';
import { ProfileNotFoundError, fetchPoster, fetchProfile } from './letterboxd.js';

const logger = createLogger({ name: 'letterboxd' });

export const WIDGET_KEY = 'films';
export const TRIGGER = 'new_film';
export const FEED_SIZE = 50;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_TIMINGS = {
  heartbeatMs: 12 * HOUR,
  // An entry out of the feed for this long is forgotten.
  forgetAfterMs: 60 * DAY,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
};

// Scene events fired by one cycle at most: a member logging a whole festival
// at once is better summed up by the device; the rest follows next cycle.
export const MAX_EVENTS_PER_CYCLE = 10;
// Posters kept in memory (about 25 KB each).
const MAX_POSTERS = 24;
export const POSTER_KEY = /^poster-(\d{1,20})$/;

/** The day an entry counts for: the watch date given, else the day it was logged. */
const dayOf = (entry) =>
  entry.watchedOn ?? (entry.loggedAt !== null ? localDay(entry.loggedAt) : null);

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch] fetch
   * @param {boolean} [options.timers] false: no background timer (tests drive the cycles)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, store, fetch: fetchImpl, timers = true, now, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetchImpl ?? ((...args) => fetch(...args));
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.data = emptyData();
    // username → { username, displayName, entries } of the last good reading.
    this.feeds = new Map();
    this.notFound = new Set();
    this.emptyOnce = new Set();
    this.lastSuccessAt = null;
    this.lastCycleAt = -Infinity;
    this.statusMessage = undefined;
    this.discovered = null;
    this.cycleTimer = null;
    this.running = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    this.signature = null;
    this.posters = new Map();
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    if (saved?.version === 1 && saved.profiles && typeof saved.profiles === 'object') {
      this.data = { ...emptyData(), ...saved };
    }
    this.warnAboutConfig();
    await this.publishDiscovered();
    logger.info(
      `Started: ${config.profiles.length} Letterboxd profile(s) read every ${config.refreshMinutes} min`,
    );
    this.schedule();
    this.runCycle();
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    await this.publishDiscovered(true);
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates();
    this.requestRefresh();
  }

  async reconfigure(config) {
    // A cycle already running finishes with the old configuration.
    await this.running;
    const languageChanged = config.language !== this.config?.language;
    this.config = config;
    logger.info('Configuration saved');
    this.warnAboutConfig();
    for (const username of [...this.feeds.keys()]) {
      if (!config.profiles.includes(username)) {
        this.feeds.delete(username);
      }
    }
    this.notFound = new Set([...this.notFound].filter((name) => config.profiles.includes(name)));
    await this.publishDiscovered(languageChanged);
    this.schedule();
    await this.runCycle();
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.cycleTimer);
    clearTimeout(this.refreshTimer);
    this.cycleTimer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => this.runCycle(), this.config.refreshMinutes * MINUTE);
    this.cycleTimer.unref?.();
  }

  warnAboutConfig() {
    const { profiles, invalidProfiles, droppedProfiles } = this.config;
    if (invalidProfiles.length > 0) {
      logger.warn(`Not a Letterboxd username, ignored: ${invalidProfiles.join(', ')}`);
    }
    if (droppedProfiles.length > 0) {
      logger.warn(`Ten profiles at most, ignored: ${droppedProfiles.join(', ')}`);
    }
    if (profiles.length === 0) {
      logger.warn('No Letterboxd profile set');
    }
  }

  /** The profiles shown in Discover: every configured one Letterboxd knows. */
  profiles() {
    return this.config.profiles
      .filter((username) => !this.notFound.has(username))
      .map((username) => ({
        username,
        displayName:
          this.feeds.get(username)?.displayName ?? this.data.profiles[username]?.displayName,
      }));
  }

  /** Publish the discovered devices when they changed (or when `force`). */
  async publishDiscovered(force = false) {
    const devices = this.profiles().map((profile) =>
      buildDevice(this.gladys, profile, this.config.language),
    );
    const signature = JSON.stringify(devices);
    if (!force && signature === this.discovered) {
      return;
    }
    this.discovered = signature;
    await this.gladys.publishDiscoveredDevices(devices);
  }

  isCreated(username) {
    const id = deviceIds(this.gladys, username).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  /** The username of a device external id, among the followed profiles. */
  usernameOf(externalId) {
    return this.config.profiles.find(
      (username) => deviceIds(this.gladys, username).device === externalId,
    );
  }

  /** The name of a profile: given in Gladys if the device exists, else Letterboxd's. */
  nameOf(username) {
    const id = deviceIds(this.gladys, username).device;
    const device = (this.gladys.devices ?? []).find((item) => item.external_id === id);
    // "Letterboxd Jane", the name published, reads "Jane" in a sentence.
    return (
      device?.name?.replace(/^Letterboxd\s+/i, '') ||
      this.feeds.get(username)?.displayName ||
      this.data.profiles[username]?.displayName ||
      username
    );
  }

  // --- Cycles ------------------------------------------------------------------

  runCycle() {
    if (this.running || this.stopped) {
      return this.running;
    }
    this.running = this.cycle()
      .catch((err) => this.failed('cycle', 'error', 'Refresh cycle failed', err))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async cycle() {
    this.lastCycleAt = this.now();
    const fired = [];
    let reached = 0;
    let unreachable = 0;
    for (const username of this.config.profiles) {
      let feed;
      try {
        feed = await fetchProfile(this.fetch, username);
        reached += 1;
      } catch (err) {
        if (err instanceof ProfileNotFoundError) {
          reached += 1;
          this.feeds.delete(username);
          if (!this.notFound.has(username)) {
            this.notFound.add(username);
            logger.warn(`Profile not found on Letterboxd: ${username}`);
          }
        } else {
          unreachable += 1;
          this.failed(`profile:${username}`, 'warn', `Reading ${username} failed: ${err.message}`);
        }
        continue;
      }
      // A feed suddenly empty after a full one is more likely a glitch of the
      // site than a member deleting their whole diary: kept once.
      if (
        feed.items === 0 &&
        (this.feeds.get(username)?.entries.length ?? 0) > 0 &&
        !this.emptyOnce.has(username)
      ) {
        this.emptyOnce.add(username);
        logger.debug(`${username}: empty feed, the previous reading is kept`);
        reached += 1;
        continue;
      }
      this.emptyOnce.delete(username);
      if (this.notFound.delete(username)) {
        logger.info(`Profile found on Letterboxd: ${username}`);
      }
      this.recovered(`profile:${username}`, `${username} read again`);
      this.feeds.set(username, { username, ...feed });
      fired.push(...this.detectChanges(username, feed));
      logger.debug(`${username}: ${feed.entries.length} diary entries in the feed`);
    }
    if (reached > 0 || this.config.profiles.length === 0) {
      this.recovered('api', 'Letterboxd answers again');
      this.lastSuccessAt = this.now();
    } else if (unreachable > 0) {
      this.failed('api', 'warn', 'Letterboxd unreachable');
    }
    this.forgetRemovedProfiles();
    await this.fireAll(fired);
    this.store.save(this.data);
    await this.publishDiscovered();
    await this.publishStates();
    await this.updateConnectionStatus();
    this.recovered('cycle', 'Refresh cycles work again');
    const signature = JSON.stringify(
      [...this.feeds.values()].map((feed) => [feed.username, feed.entries.map((e) => e.id)]),
    );
    if (signature !== this.signature) {
      this.signature = signature;
      this.requestRefresh();
    }
  }

  /** The new entries of a profile, oldest first; remembers what was seen. */
  detectChanges(username, feed) {
    const now = this.now();
    const saved = (this.data.profiles[username] ??= { seeded: false, seen: {} });
    saved.displayName = feed.displayName ?? undefined;
    const seed = !saved.seeded;
    const fresh = [];
    for (const entry of [...feed.entries].reverse()) {
      if (saved.seen[entry.id] || seed) {
        saved.seen[entry.id] = now;
      } else {
        fresh.push({
          username,
          entry,
          mark: () => {
            saved.seen[entry.id] = now;
          },
        });
      }
    }
    const inFeed = new Set(feed.entries.map((entry) => entry.id));
    for (const [id, seenAt] of Object.entries(saved.seen)) {
      if (!inFeed.has(id) && now - seenAt > this.timings.forgetAfterMs) {
        delete saved.seen[id];
      }
    }
    if (seed) {
      saved.seeded = true;
      logger.debug(`${username}: ${feed.entries.length} entries taken as known`);
    }
    return fresh;
  }

  forgetRemovedProfiles() {
    for (const username of Object.keys(this.data.profiles)) {
      if (!this.config.profiles.includes(username)) {
        delete this.data.profiles[username];
      }
    }
  }

  /** Fire the scene events; an entry is marked seen only once Gladys accepted it. */
  async fireAll(fired) {
    fired.sort((a, b) => (a.entry.loggedAt ?? 0) - (b.entry.loggedAt ?? 0));
    for (const [index, change] of fired.entries()) {
      if (index >= MAX_EVENTS_PER_CYCLE) {
        logger.debug(`${fired.length - index} more film(s) left for the next cycle`);
        break;
      }
      // A film logged is ordinary news: the logs do not keep it.
      logger.debug(`New film for ${change.username}: entry ${change.entry.id}`);
      try {
        await this.gladys.publishSceneEvent(TRIGGER, this.eventData(change.username, change.entry));
        this.recovered('scene', 'Scene triggers work again');
        change.mark();
      } catch (err) {
        this.failed('scene', 'warn', `Firing the scene trigger failed: ${err.message}`);
      }
    }
  }

  /** The flat data of a scene event (fields, then variables of the manifest). */
  eventData(username, entry) {
    const member = this.nameOf(username);
    return {
      device: deviceIds(this.gladys, username).device,
      watch: entry.rewatch ? 'rewatch' : 'first_time',
      member,
      title: entry.title,
      year: entry.year ?? 0,
      rating: entry.rating ?? 0,
      liked: entry.liked ? 1 : 0,
      url: entry.url,
      summary: summary(member, entry, this.config.language),
    };
  }

  // --- States ------------------------------------------------------------------

  /** Counts and averages of a profile at the current time. */
  statsOf(username) {
    const feed = this.feeds.get(username);
    if (!feed) {
      return null;
    }
    const today = localDay(this.now());
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);
    const ofYear = feed.entries.filter((entry) => dayOf(entry)?.startsWith(year));
    const ofMonth = ofYear.filter((entry) => dayOf(entry).startsWith(month));
    const rated = ofYear.filter((entry) => entry.rating !== null);
    // The feed is full and its oldest entry was logged within the period:
    // older entries of the period may be out of the feed.
    const loggedDays = feed.entries
      .filter((entry) => entry.loggedAt !== null)
      .map((entry) => localDay(entry.loggedAt));
    const oldest = loggedDays.length > 0 ? loggedDays.reduce((a, b) => (a < b ? a : b)) : null;
    const full = feed.entries.length >= FEED_SIZE && oldest !== null;
    return {
      last: feed.entries[0] ?? null,
      month: ofMonth.length,
      year: ofYear.length,
      average:
        rated.length > 0
          ? Math.round((rated.reduce((sum, entry) => sum + entry.rating, 0) / rated.length) * 10) /
            10
          : 0,
      partialMonth: full && oldest >= `${month}-01`,
      partialYear: full && oldest >= `${year}-01-01`,
    };
  }

  statesOf(username) {
    const stats = this.statsOf(username);
    if (!stats) {
      return [];
    }
    const ids = deviceIds(this.gladys, username);
    return [
      {
        device_feature_external_id: ids.lastFilm,
        text: describe(stats.last, this.config.language),
      },
      { device_feature_external_id: ids.lastRating, state: stats.last?.rating ?? 0 },
      { device_feature_external_id: ids.month, state: stats.month },
      { device_feature_external_id: ids.year, state: stats.year },
      { device_feature_external_id: ids.average, state: stats.average },
    ];
  }

  async publishStates() {
    const states = this.config.profiles
      .filter((username) => this.isCreated(username))
      .flatMap((username) => this.statesOf(username));
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next cycle (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  async updateConnectionStatus() {
    const { profiles, invalidProfiles, droppedProfiles } = this.config;
    const parts = [];
    if (this.failing.has('api')) {
      parts.push(render(STATUS, 'apiDown'));
    }
    if (profiles.length === 0) {
      parts.push(render(STATUS, 'noProfile'));
    }
    if (this.notFound.size > 0) {
      parts.push(render(STATUS, 'notFound', { values: [...this.notFound].join(', ') }));
    }
    if (invalidProfiles.length > 0) {
      parts.push(render(STATUS, 'invalid', { values: invalidProfiles.join(', ') }));
    }
    if (droppedProfiles.length > 0) {
      parts.push(render(STATUS, 'dropped', { values: droppedProfiles.join(', ') }));
    }
    const message = parts.length > 0 ? join(...parts) : undefined;
    const connected = !this.failing.has('api') && this.lastSuccessAt !== null;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events -----------------------------------------------------------

  async onDeviceCreated(device) {
    const username = this.usernameOf(device?.external_id);
    if (!username) {
      return;
    }
    if (!this.feeds.has(username)) {
      await this.runCycle();
    }
    // Every state of the new device is published again, even unchanged.
    const ids = deviceIds(this.gladys, username);
    for (const [key, id] of Object.entries(ids)) {
      if (key !== 'device') {
        this.gladys.forgetPublishedStates?.(id);
      }
    }
    await this.publishStates();
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    if (!this.usernameOf(device?.external_id)) {
      return;
    }
    // Read again only if the last cycle is older than half the interval.
    if (this.now() - this.lastCycleAt >= (this.config.refreshMinutes * MINUTE) / 2) {
      await this.runCycle();
    } else {
      await this.publishStates();
    }
  }

  // --- Widget -------------------------------------------------------------------

  /** The diary entry of an id, among the feeds read. */
  entryById(id) {
    for (const feed of this.feeds.values()) {
      const entry = feed.entries.find((item) => item.id === id);
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  /** onWidgetGetImage: the poster of a diary entry, raw base64. */
  async posterImage(imageKey) {
    const id = POSTER_KEY.exec(String(imageKey))?.[1];
    const url = id ? this.entryById(id)?.poster : null;
    if (!url) {
      throw new Error(`Unknown image ${imageKey}`);
    }
    if (this.posters.has(url)) {
      return this.posters.get(url);
    }
    const image = await fetchPoster(this.fetch, url);
    const problems = validateWidgetImage(image);
    if (problems.length > 0) {
      throw new Error(`Poster ${imageKey} refused: ${problems.join('; ')}`);
    }
    this.posters.set(url, image);
    if (this.posters.size > MAX_POSTERS) {
      this.posters.delete(this.posters.keys().next().value);
    }
    return image;
  }

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }
}

function emptyData() {
  return { version: 1, profiles: {} };
}
