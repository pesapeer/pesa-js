# Pesa Checkout for the web (Pesa.js)

[![CI](https://github.com/pesapeer/pesa-js/actions/workflows/ci.yml/badge.svg)](https://github.com/pesapeer/pesa-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@pesa/checkout-js.svg)](https://www.npmjs.com/package/@pesa/checkout-js)

Pesa.js is the browser script for Pesa card payments. It mounts two
elements into your page:

- The **Card Element**: card fields for the customer.
- The **Express Element**: Apple Pay, Google Pay and pay-by-bank buttons.

Both elements are iframes served by `checkout.pesa.co`. Card data stays
inside the iframes. Your page never sees it. Your page stays on PCI SAQ A.

## Install

Use the script tag. The CDN copy is the copy that Pesa certifies.

```html
<script src="https://js.pesa.co/v1/pesa.js"></script>
```

For bundlers, install the npm package:

```
npm install @pesa/checkout-js
```

```js
import { Pesa } from "@pesa/checkout-js";
```

The npm package is only the loader. The elements always load from
`checkout.pesa.co`.

## How a payment works

1. Your server creates an intent: `POST /v1/intents` on the Pesa API.
2. The response has `id`, `clientSecret` and `checkoutUrl`.
   `clientSecret` is in the create response only. Do not log it.
3. Your server gives `id` and `clientSecret` to the page.
4. The page mounts the elements and calls `pay()`.
5. Your server waits for the `intent.state_changed` event, or reads
   `GET /v1/intents/{reference}`. Then it fulfils the order.

## Example

```html
<script src="https://js.pesa.co/v1/pesa.js"></script>
<div id="express"></div>
<div id="card"></div>
<button id="pay" disabled>Pay</button>
<script>
  const pesa = Pesa();
  const payButton = document.querySelector('#pay');

  // One-tap methods. Renders nothing when the intent offers none.
  const express = pesa.mountExpress('#express', { intentId, clientSecret });
  express.on('result', (r) => {
    // r = { state, intentId, intentState, attempt }
  });

  const card = pesa.mountCard('#card', {
    intentId,
    clientSecret,
    appearance: { theme: 'pesa' },
  });
  card.on('change', (e) => {
    // e = { complete, brand, error?, savedCardSelected, saveCard }
    payButton.disabled = !e.complete;
  });

  payButton.onclick = async () => {
    const result = await card.pay();
    // result.state: succeeded | requires_action | open | failed | invalid
    // result.attempt.state: captured | authorized | declined | failed | ...
  };
</script>
```

No front-end work? Send the customer to the hosted checkout page instead:

```js
pesa.redirectToCheckout({ checkoutUrl });
```

`checkoutUrl` comes from the same create response.

## The trust rule

`pay()` returns what the browser saw. Use it for the screen only. For
example, show a tick or enable the button again after a decline.

**Your server must fulfil the order only on the gateway event or on a read
of the intent.** A client result can be forged. A gateway event cannot.

- Event: `intent.state_changed` with `state: settled`, or `authorized`
  for manual capture.
- Read: `GET /v1/intents/{reference}`.

## API

### `Pesa(options?)` → client

| Option | Default | Meaning |
|---|---|---|
| `checkoutUrl` | `https://checkout.pesa.co` | Base URL of the checkout service. Only the origin is used. |
| `challengeLoadTimeoutMs` | `10000` | Wait time for the 3-D Secure page in the modal. After this, the full window goes to the issuer page. |

### `client.mountCard(target, options)` → `CardElement`

| Field | Meaning |
|---|---|
| `target` | A CSS selector or an element. The iframe is appended inside it at full width. |
| `intentId` | From the create response. |
| `clientSecret` | From the create response. |
| `appearance` | Optional style tokens. Max 4 KB as JSON. |
| `origin` | Optional. The page origin the element answers to. Default: `window.location.origin`. |

`CardElement` methods:

- `on(event, fn)` and `off(event, fn)`. Events: `ready`, `change`, `result`.
- `pay()` → `Promise<PayResult>`. Submits the card. On `requires_3ds`, it
  opens the challenge in a modal iframe. If the issuer page does not load
  in time, it sends the full window to the issuer page. The return page
  sends the browser back to the intent's `returnUrl`. The promise resolves
  when the attempt is no longer pending. It rejects on `unmount()` or on a
  second concurrent call.
- `unmount()`.
- `focus()`.

Saved cards: when the intent names a `customerReference`, the element shows
the customer's saved cards above the card fields. The first is chosen. The
customer can pick "Use another card" to type a new one, and tick "Save this
card for next time". `pay()` works the same either way. The `change` event
says which: `savedCardSelected` is true while a saved card is chosen, and
`saveCard` is true while the box is ticked. The page never sees the card or
its token.

### `client.mountExpress(target, options)` → element

Options are the same as `mountCard` without `appearance`.

- Mounts the one-tap methods the intent offers: Apple Pay (Safari with a
  card in Wallet), Google Pay, and pay by bank when the intent has a
  `bankAccount`.
- Each button completes the payment by itself. Listen for `result`.
- The wallet sheets run inside the iframe (`allow="payment"`).
- A bank attempt gives `result` with `state: "requires_action"` and
  `attempt.method: "bank"`. Pesa.js then sends the browser to the bank.
  The bank returns the customer to the checkout. The checkout sends them
  to the intent's `returnUrl` with `intent=<id>&state=<state>`.
- `payByBank()` starts the bank attempt from your own button.

### `client.redirectToCheckout({ checkoutUrl })`

Navigates to the hosted checkout. Refuses a URL on another origin.

## Message contract with the iframes

Pesa.js reads a message only when `origin` equals the checkout origin and
`source` equals the iframe window.

Element to page:

| `type` | Fields |
|---|---|
| `pesa:ready` | none |
| `pesa:change` | `complete`, `brand`, `error?`, `savedCardSelected`, `saveCard` |
| `pesa:resize` | `height` in px |
| `pesa:result` | `state`, `intentId`, `intentState?`, `attempt?`, `challengeUrl?` |

`attempt` has `method`, `state`, `card?`, and `authorisationUrl?` on a bank
attempt. `challengeUrl` is present while `attempt.state == requires_3ds`.
The element posts a second `pesa:result` when the challenge is done.

Page to element: `pesa:submit` (Card Element), `pesa:bank` (Express Element).

The iframes use `sandbox="allow-scripts allow-forms allow-same-origin"`.
They cannot navigate the top window. The 3-D Secure fallback and the trip
to the bank are the page's own `location.assign`.

## For AI agents

Read [AGENTS.md](AGENTS.md). It has the integration steps in order and the
rules an agent must follow. A skill is in `skills/pesa-checkout-web/`.

## Security

Read [SECURITY.md](SECURITY.md). Report vulnerabilities to
security@pesa.co. Do not open a public issue.

## Releasing

1. Set the version in `package.json`. Move the Unreleased notes in
   `CHANGELOG.md`.
2. Tag with an SSH key listed in `.github/allowed_signers`:
   `git tag -s vX.Y.Z -m "vX.Y.Z"`. Push the tag.
3. `release.yml` verifies the tag signature, runs the tests, publishes
   `@pesa/checkout-js` to npm with provenance, and attaches `dist/` and
   `SHA256SUMS` to a GitHub release. The `js.pesa.co` CDN takes its copy
   from that release.

Repository setup: npm trusted publishing for `@pesa/checkout-js` from
`pesapeer/pesa-js` and `release.yml`. No token secret.
`.github/allowed_signers` holds the maintainers' SSH public keys.

## Development

```
npm install
npm test          # vitest + jsdom
npm run build     # dist/pesa.js, dist/pesa.<hash>.js, dist/pesa.esm.js, dist/pesa.d.ts, dist/manifest.json
```

`example/index.html` mounts the built script against an intent you paste
in.

## License

MIT. See [LICENSE](LICENSE).
