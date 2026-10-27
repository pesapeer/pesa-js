# Instructions for AI agents

This file is for coding agents that integrate Pesa.js into a merchant site
or that change this repository. Humans: read README.md first.

## What this package is

- `@pesa/checkout-js` is the loader for the Pesa Card Element and Express
  Element. The elements are iframes served by `checkout.pesa.co`.
- The merchant page never sees card data. Do not write code that tries to.
- CDN: `https://js.pesa.co/v1/pesa.js`. npm: `@pesa/checkout-js`.

## Hard rules

1. Never log, store or send `clientSecret` anywhere except to Pesa.js.
2. Never fulfil an order from `pay()` or a `result` event. The server
   fulfils only on `intent.state_changed` or `GET /v1/intents/{reference}`.
3. Never put the Pesa API key in browser code.
4. Never change the iframe `sandbox` or the message origin checks.
5. Never add a dependency to this package. It has none at runtime.

## Integrate Pesa.js into a site (steps in order)

1. Server: create the intent with `POST /v1/intents`. Return `id`,
   `clientSecret` and `checkoutUrl` to the page. Return nothing else from
   the response.
2. Page: load the script. Prefer the script tag. Use npm only with a
   bundler.
3. Page: `const pesa = Pesa()`.
4. Page: `pesa.mountExpress('#express', { intentId, clientSecret })`.
   Skip this step if the merchant does not want wallets or pay by bank.
5. Page: `const card = pesa.mountCard('#card', { intentId, clientSecret })`.
6. Page: enable the pay button on `card.on('change', e => e.complete)`.
7. Page: `await card.pay()` on click. Show the outcome from
   `result.state`. Handle `open` as "declined, try another card".
8. Server: handle the `intent.state_changed` webhook. Fulfil on
   `settled`, or on `authorized` when the merchant captures by hand.
9. Server: set `returnUrl` on the intent to a page that reads
   `intent=<id>&state=<state>` and shows the outcome. 3-D Secure fallback
   and pay by bank return there.

Result states from `pay()`: `succeeded`, `requires_action`, `open`,
`failed`, `invalid`. Attempt states: `captured`, `authorized`, `declined`,
`failed`, `requires_3ds`.

A full example is in `README.md` and `example/index.html`. A skill with
the same steps is in `skills/pesa-checkout-web/SKILL.md`.

## Change this repository

Layout:

| Path | Content |
|---|---|
| `src/index.ts` | `Pesa()` factory, `PesaClient`. |
| `src/element.ts` | `CardElement`: iframe mount, events, `pay()`. |
| `src/challenge.ts` | 3-D Secure modal and fallback. |
| `src/messages.ts` | Message types and result types. |
| `test/` | vitest + jsdom. |
| `scripts/build.mjs` | esbuild. Outputs `dist/`. |
| `.github/workflows/ci.yml` | Typecheck, test, build on push and PR. |
| `.github/workflows/release.yml` | Publish on a signed `v*` tag. |

Commands:

```
npm ci
npm run typecheck
npm test
npm run build
```

Rules for changes:

- Run all three commands before you finish. All must pass.
- Add a test for every behaviour change in `test/element.test.ts`.
- Keep the public API in `src/index.ts` stable. A breaking change needs a
  major version and a CHANGELOG entry under "Changed" or "Removed".
- Add a line to `CHANGELOG.md` under "Unreleased" for every user-visible
  change.
- Do not edit `dist/`. The build makes it.
- Do not edit `.github/allowed_signers` or `.github/verify-tag.sh`.
- Do not create tags. A maintainer pushes release tags from a signed commit.
- Do not add `Co-Authored-By` or similar trailers to commit messages.

## Terms

| Term | Meaning |
|---|---|
| intent | A payment the merchant server created on the Pesa API. |
| client secret | A per-intent token for the browser. It is not the API key. |
| attempt | One try to pay an intent, by card, wallet or bank. |
| checkout service | `checkout.pesa.co`. It serves the elements and takes the card. |
| gateway | The Pesa API that owns intents and sends events. |
