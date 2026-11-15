# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-15

### Added

- One device per followed Letterboxd profile (ten at most), read from its public
  RSS feed: last film watched, rating of the last film, films watched this month
  and this year, average rating of the year.
- Scene trigger "new film watched", filtered by profile and by first watch or
  rewatch, with the title, year, rating, like, link and a ready-made sentence.
- Dashboard widget "Letterboxd films": the latest films of one profile or of
  all, with their poster (can be turned off), stars and watch date.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-letterboxd/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-letterboxd/releases/tag/v1.0.0
