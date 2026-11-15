# Letterboxd for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that follows the films watched on
[Letterboxd](https://letterboxd.com), the social network of film lovers: the last film each followed profile logged,
its rating, the films of the month and of the year, a scene trigger at every new film and a dashboard widget with the
latest posters.

Not affiliated with Letterboxd. It reads the public RSS feed of each profile, without an account.

## Features

- One device per followed profile (ten at most): last film watched (text), rating of the last film (0.5 to 5, 0 =
  not rated), films watched this month and this year, average rating of the year.
- Scene trigger **new film watched**, filtered by profile and by first watch / rewatch, with the title, year, rating,
  like, link and a ready-made sentence in English, French, German or Spanish.
- Dashboard widget **Letterboxd films**: the latest films of one profile or of all, with their poster (served by the
  integration, can be turned off), stars and watch date; a tap opens the details and the Letterboxd entry.
- Documentation in [English](docs/en.md), [French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md).

## Requirements

- Gladys Assistant 5.1 or later, with Internet access.
- One or more **public** Letterboxd profiles. No Letterboxd account, password or API key is needed.

## Installation

In Gladys: **Integrations → Install from GitHub**, address `https://github.com/guim31/gladys-letterboxd`. Then type
the usernames to follow in the configuration, save, and create the devices in the **Discover** tab.

## How it works

- Every `refresh_interval` minutes (one hour by default), the integration reads
  `https://letterboxd.com/<username>/rss/` for each profile, with an honest User-Agent: one request per profile.
- The feed holds the 50 latest diary entries (and the latest lists, ignored). The counts of the month and of the year
  are computed on them, by the watch date, in the time zone of Gladys.
- The entries already seen are kept in `/data`, so the trigger fires once per film, never at the first reading nor
  after a restart.

## Limitations

- **Counts limited to the feed**: a member who logged more than 50 films this year gets a floor (the widget says
  "50+").
- **No watchlist**: Letterboxd gives it no feed (`/watchlist/rss/` answers 403) and its page is built for browsers;
  the integration does without it rather than scrape it.
- Only diary entries: a film marked as watched without a diary entry is not in the feed.
- Developed without a Letterboxd account of its own, against real public feeds and the SDK's fake Gladys; not yet on a
  real Gladys instance: feedback welcome.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake letterboxd.com serving two real feeds recorded on 15/11/2026,
anonymized (usernames replaced, reviews removed: `test/fixtures/letterboxd/`): never the network.

## Credits

- Data, posters and the Letterboxd logo: [Letterboxd](https://letterboxd.com) (Letterboxd Limited). The logo on the
  cover comes from Letterboxd's [brand page](https://letterboxd.com/about/brand/) and stays theirs.
- Built on the [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js) and the official
  JavaScript template.

## License

[Apache 2.0](LICENSE).
