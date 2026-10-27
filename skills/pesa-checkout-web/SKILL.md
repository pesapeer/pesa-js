---
name: pesa-checkout-web
description: Add Pesa card, Apple Pay, Google Pay and pay-by-bank checkout to a web page with Pesa.js. Use when a site must take a payment on a Pesa intent in the browser.
---

# Pesa Checkout on the web

## When to use this skill

The merchant has a Pesa account and an API key on the server. The site
must take a payment in the browser. The site must stay out of PCI scope.

## Steps

1. Server: create an intent.

   ```
   POST /v1/intents
   { "amount": 2500, "currency": "GBP", "reference": "order-1001",   // field names: see the Pesa API reference
     "returnUrl": "https://shop.example/pay/return" }
   ```

   Keep `id`, `clientSecret` and `checkoutUrl` from the response. Send
   `id` and `clientSecret` to the page. Do not log `clientSecret`.

2. Page: load the script.

   ```html
   <script src="https://js.pesa.co/v1/pesa.js"></script>
   ```

3. Page: mount the elements and pay.

   ```js
   const pesa = Pesa();
   const express = pesa.mountExpress('#express', { intentId, clientSecret });
   express.on('result', showOutcome);

   const card = pesa.mountCard('#card', { intentId, clientSecret });
   card.on('change', (e) => { payButton.disabled = !e.complete; });
   payButton.onclick = async () => showOutcome(await card.pay());

   function showOutcome(r) {
     if (r.state === 'succeeded') { /* show paid */ }
     else if (r.state === 'open') { /* declined; the customer can try again */ }
     else if (r.state === 'requires_action') { /* Pesa.js is sending the browser to the bank */ }
     else { /* failed or invalid: show r.attempt?.failureReason */ }
   }
   ```

4. Server: handle the `intent.state_changed` webhook. Fulfil the order on
   `state: settled`. Fulfil on `authorized` only when the merchant
   captures by hand. Or read `GET /v1/intents/{reference}`.

5. Server: make the `returnUrl` page read `intent` and `state` from the
   query string and show the outcome.

## Checks before you finish

- [ ] The API key is on the server only.
- [ ] `clientSecret` is not logged and not stored.
- [ ] Order fulfilment uses the webhook or the intent read. Not `pay()`.
- [ ] `returnUrl` is set and the page exists.
- [ ] A decline (`state: open`) lets the customer try again.

## Reference

Full API: `README.md` in https://github.com/pesapeer/pesa-js.
