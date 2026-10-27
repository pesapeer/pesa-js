# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `mountExpress`: Apple Pay, Google Pay and pay by bank on an intent, each a
  one-tap button inside the element iframe; `payByBank()` for a merchant's
  own button. A bank attempt sends the browser to the bank.

### Changed
- `PayResult.state` is now what the edge reports: `succeeded`,
  `requires_action`, `open`, `failed` or `invalid`; the intent's own state is
  `intentState`. `Attempt` carries `method` and, on a bank attempt,
  `authorisationUrl`.

## [0.1.0] - 2026-10-24

### Added
- First release: card payment on a Pesa intent, 3-D Secure, pinned transport.
