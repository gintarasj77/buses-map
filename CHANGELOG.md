# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Request correlation headers (`x-request-id`) for API responses.
- Playwright smoke test covering app load, map render, and API responsiveness.

### Changed

- CI now installs Chromium and runs `npm run test:e2e`.
- Proxy layer now emits structured request lifecycle and retry logs.

### Fixed

- Retry/timeout events are now observable with request-scoped log context.

## [0.1.1] - 2026-02-24

### Added

- Release process docs: `CHANGELOG.md` and `RELEASE_CHECKLIST.md`.
- Configurable upstream resilience env vars:
  - `UPSTREAM_TIMEOUT_MS`
  - `UPSTREAM_RETRIES`
- Additional backend tests for API proxy retry and timeout behavior.

### Changed

- Updated README with release-process links and server resilience settings.
- API proxy now retries transient upstream statuses (`429`, `5xx`) with short backoff.

### Fixed

- API proxy now returns `504 Upstream timeout` when upstream requests exceed timeout.

## [0.1.0] - 2026-02-24

### Added

- Unit tests for transit parsing/decoding logic.
- Backend API proxy tests with mocked upstream fetch.
- CI workflow that runs lint, tests, and build.

### Changed

- Simplified architecture to focus on Bus 117 single-route behavior.
- Material-inspired dark UI refresh.
- README restructured with setup, API, testing, and troubleshooting sections.

### Fixed

- Removed tracking script from `index.html`.
- Added clear empty-feed and stale-data status messages in UI.
