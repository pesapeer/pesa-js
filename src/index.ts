// Pesa.js: the merchant-side loader for Pesa card acquiring.
//
//   const pesa = Pesa();
//   const express = pesa.mountExpress('#express', { intentId, clientSecret });   // Apple Pay, Google Pay, pay by bank
//   const card = pesa.mountCard('#card', { intentId, clientSecret });
//   const result = await card.pay();
//
// The card fields and the wallet buttons live in iframes on checkout.pesa.co;
// this script only mounts them, relays submit, shows the 3-D Secure
// challenge and sends the browser to the payer's bank. No card data or
// wallet token ever reaches the merchant page.

import { CardElement, type MountCardOptions } from "./element";

export type { MountCardOptions, CardElementEvents, ElementView } from "./element";
export type { Attempt, AttemptMethod, AttemptState, CardBrand, ChangeEvent, IntentState, PayResult } from "./messages";
export type { Locale } from "./strings";
export { CardElement };

export interface PesaOptions {
  /** Base URL of the checkout edge. */
  checkoutUrl?: string;
  /** How long the 3-D Secure modal waits for the issuer page before sending the whole window there. */
  challengeLoadTimeoutMs?: number;
}

export interface PesaClient {
  mountCard(target: string | Element, opts: MountCardOptions): CardElement;
  /**
   * Mounts the one-tap methods the intent offers: Apple Pay (Safari), Google Pay
   * and pay by bank. Each button pays on its own; listen for `result`. Nothing
   * renders when the intent offers none of them.
   */
  mountExpress(target: string | Element, opts: MountCardOptions): CardElement;
  /** Sends the browser to the hosted checkout an intent's create response named. */
  redirectToCheckout(opts: { checkoutUrl: string }): void;
}

const defaultCheckoutUrl = "https://checkout.pesa.co";
const defaultChallengeLoadTimeoutMs = 10_000;

export function Pesa(options: PesaOptions = {}): PesaClient {
  const win = window;
  const checkoutOrigin = new URL(options.checkoutUrl ?? defaultCheckoutUrl).origin;
  const challengeLoadTimeoutMs = options.challengeLoadTimeoutMs ?? defaultChallengeLoadTimeoutMs;
  const navigate = (url: string) => win.location.assign(url);

  return {
    mountCard(target, opts) {
      return new CardElement(find(target, "mountCard"), opts, { checkoutOrigin, challengeLoadTimeoutMs, navigate, window: win });
    },
    mountExpress(target, opts) {
      return new CardElement(find(target, "mountExpress"), opts, { checkoutOrigin, challengeLoadTimeoutMs, navigate, window: win, view: "express" });
    },
    redirectToCheckout({ checkoutUrl }) {
      const url = new URL(checkoutUrl, checkoutOrigin);
      if (url.origin !== checkoutOrigin) throw new Error("redirectToCheckout: not a Pesa checkout URL.");
      navigate(url.toString());
    },
  };
}

function find(target: string | Element, what: string): Element {
  const container = typeof target === "string" ? window.document.querySelector(target) : target;
  if (!container) throw new Error(`${what}: nothing matches ${String(target)}.`);
  return container;
}

export default Pesa;
