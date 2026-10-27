import { openChallenge, type Challenge } from "./challenge";
import {
  isElementMessage,
  type BankMessage,
  type ChangeEvent,
  type ElementMessage,
  type PayResult,
  type ResultMessage,
  type SubmitMessage,
} from "./messages";

export interface MountCardOptions {
  intentId: string;
  clientSecret: string;
  /** Styling tokens the element applies. Validated by the edge. At most 4 KB as JSON. */
  appearance?: Record<string, unknown>;
  /** The merchant page's origin, when it differs from window.location.origin (an embedded widget, say). */
  origin?: string;
}

export interface CardElementEvents {
  ready: () => void;
  change: (e: ChangeEvent) => void;
  result: (r: PayResult) => void;
}

export interface CardElementConfig {
  checkoutOrigin: string;
  challengeLoadTimeoutMs: number;
  navigate: (url: string) => void;
  window: Window;
  /** Which element the iframe renders: the card fields, or the wallet and bank buttons. */
  view?: ElementView;
}

export type ElementView = "card" | "express";

const defaultHeight = 220;
const maxAppearanceBytes = 4096;

type Listener = (payload?: unknown) => void;

export class CardElement {
  private readonly iframe: HTMLIFrameElement;
  private readonly listeners = new Map<keyof CardElementEvents, Set<Listener>>();
  private readonly onMessage: (e: MessageEvent) => void;
  private ready = false;
  private mounted = true;
  private pending: { resolve: (r: PayResult) => void; reject: (e: Error) => void } | null = null;
  private challenge: Challenge | null = null;
  private readonly intentId: string;

  constructor(container: Element, opts: MountCardOptions, private readonly cfg: CardElementConfig) {
    this.intentId = opts.intentId;
    const view = cfg.view ?? "card";
    this.iframe = cfg.window.document.createElement("iframe");
    this.iframe.src = elementURL(cfg.checkoutOrigin, opts, cfg.window.location.origin, view);
    this.iframe.setAttribute("title", view === "express" ? "Express payment" : "Card details");
    this.iframe.setAttribute("allow", "payment");
    this.iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin");
    this.iframe.setAttribute("scrolling", "no");
    this.iframe.setAttribute("style", `border:0;width:100%;height:${defaultHeight}px;display:block`);
    this.iframe.setAttribute("data-pesa-element", view);

    this.onMessage = (e) => this.receive(e);
    cfg.window.addEventListener("message", this.onMessage);
    container.appendChild(this.iframe);
  }

  on<K extends keyof CardElementEvents>(event: K, fn: CardElementEvents[K]): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener);
    return this;
  }

  off<K extends keyof CardElementEvents>(event: K, fn: CardElementEvents[K]): this {
    this.listeners.get(event)?.delete(fn as Listener);
    return this;
  }

  focus(): void {
    this.iframe.focus();
  }

  /**
   * Submits the card. Resolves with the state the browser saw once the
   * attempt is no longer pending, after any 3-D Secure challenge. The
   * merchant backend must still trust only the gateway event or
   * GET /v1/intents/{reference}.
   */
  pay(): Promise<PayResult> {
    if (!this.mounted) return Promise.reject(new Error("The card element is not mounted."));
    if (this.pending) return Promise.reject(new Error("A payment is already in progress."));
    return new Promise<PayResult>((resolve, reject) => {
      this.pending = { resolve, reject };
      if (this.ready) this.submit();
    });
  }

  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.cfg.window.removeEventListener("message", this.onMessage);
    this.challenge?.close();
    this.challenge = null;
    this.iframe.remove();
    this.pending?.reject(new Error("The card element was unmounted."));
    this.pending = null;
    this.listeners.clear();
  }

  private submit(): void {
    const msg: SubmitMessage = { type: "pesa:submit" };
    this.iframe.contentWindow?.postMessage(msg, this.cfg.checkoutOrigin);
  }

  /** Starts a pay-by-bank attempt, as the element's own button would. The browser then goes to the bank. */
  payByBank(): void {
    if (!this.mounted) throw new Error("The element is not mounted.");
    const msg: BankMessage = { type: "pesa:bank" };
    this.iframe.contentWindow?.postMessage(msg, this.cfg.checkoutOrigin);
  }

  private isFromElement(e: MessageEvent): boolean {
    return e.origin === this.cfg.checkoutOrigin && e.source === this.iframe.contentWindow;
  }

  private receive(e: MessageEvent): void {
    if (!this.mounted || !this.isFromElement(e) || !isElementMessage(e.data)) return;
    const msg: ElementMessage = e.data;
    switch (msg.type) {
      case "pesa:ready":
        this.ready = true;
        this.emit("ready");
        if (this.pending) this.submit();
        return;
      case "pesa:change":
        this.emit("change", { complete: msg.complete, brand: msg.brand, error: msg.error });
        return;
      case "pesa:resize":
        if (Number.isFinite(msg.height) && msg.height > 0) this.iframe.style.height = `${Math.ceil(msg.height)}px`;
        return;
      case "pesa:result":
        this.result(msg);
        return;
    }
  }

  private result(msg: ResultMessage): void {
    const out: PayResult = { state: msg.state, intentId: msg.intentId || this.intentId, intentState: msg.intentState, attempt: msg.attempt };
    if (msg.attempt?.method === "bank" && msg.attempt.state === "awaiting_confirmation" && msg.attempt.authorisationUrl) {
      // The iframe cannot send the top window to the bank; this script can.
      // The bank returns the payer to the checkout, which sends them on to
      // the intent's returnUrl.
      this.emit("result", out);
      this.cfg.navigate(msg.attempt.authorisationUrl);
      return;
    }
    if (msg.challengeUrl && msg.attempt?.state === "requires_3ds") {
      if (!this.challenge) {
        this.challenge = openChallenge(this.cfg.window.document, msg.challengeUrl, {
          loadTimeoutMs: this.cfg.challengeLoadTimeoutMs,
          navigate: this.cfg.navigate,
        });
      }
      return;
    }
    this.challenge?.close();
    this.challenge = null;
    this.emit("result", out);
    const p = this.pending;
    this.pending = null;
    p?.resolve(out);
  }

  private emit<K extends keyof CardElementEvents>(event: K, payload?: Parameters<CardElementEvents[K]>[0]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }
}

export function elementURL(checkoutOrigin: string, opts: MountCardOptions, pageOrigin: string, view: ElementView = "card"): string {
  if (!opts.intentId) throw new Error("mount needs intentId.");
  if (!opts.clientSecret) throw new Error("mount needs clientSecret.");
  const params = new URLSearchParams();
  params.set("t", opts.clientSecret);
  params.set("origin", opts.origin ?? pageOrigin);
  if (view !== "card") params.set("view", view);
  if (opts.appearance) params.set("a", encodeAppearance(opts.appearance));
  return `${checkoutOrigin}/c/${encodeURIComponent(opts.intentId)}/element?${params.toString()}`;
}

export function encodeAppearance(appearance: Record<string, unknown>): string {
  const json = JSON.stringify(appearance);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > maxAppearanceBytes) throw new Error(`appearance exceeds ${maxAppearanceBytes} bytes as JSON.`);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
