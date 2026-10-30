# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `locale` on `mountCard` and `mountExpress`: `en`, `fr`, `fr-CA` or
  `zh-Hans`. The elements, their `change` and `result` messages and the
  3-D Secure pages use it; the iframe titles and the 3-D Secure fallback
  link follow it too. Exported as the `Locale` type.
- Saved cards: the Card Element shows the customer's cards on file and a
  "Save this card for next time" box. `change` events carry
  `savedCardSelected` and `saveCard`.
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
