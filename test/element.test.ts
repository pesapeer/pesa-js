import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pesa } from "../src/index";
import { encodeAppearance } from "../src/element";

const checkoutOrigin = "https://checkout.pesa.co";
const intentId = "int_01HXYZ";
const clientSecret = "cs_secret_123";

function mountedFrame(): HTMLIFrameElement {
  const f = document.querySelector("iframe[data-pesa-element=card]");
  if (!(f instanceof HTMLIFrameElement)) throw new Error("no element iframe");
  return f;
}

function fromElement(data: unknown, overrides: Partial<MessageEventInit> = {}) {
  const frame = mountedFrame();
  window.dispatchEvent(new MessageEvent("message", { data, origin: checkoutOrigin, source: frame.contentWindow, ...overrides }));
}

describe("mountCard", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="card"></div>';
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates the element iframe with the intent, secret, origin and appearance", () => {
    const pesa = Pesa();
    pesa.mountCard("#card", { intentId, clientSecret, appearance: { theme: "pesa" } });
    const frame = mountedFrame();
    const url = new URL(frame.src);
    expect(url.origin).toBe(checkoutOrigin);
    expect(url.pathname).toBe(`/c/${intentId}/element`);
    expect(url.searchParams.get("t")).toBe(clientSecret);
    expect(url.searchParams.get("origin")).toBe(window.location.origin);
    expect(url.searchParams.get("a")).toBe(encodeAppearance({ theme: "pesa" }));
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-same-origin");
    expect(frame.getAttribute("sandbox")).not.toContain("top-navigation");
  });

  it("honours a custom checkout URL and an explicit page origin", () => {
    Pesa({ checkoutUrl: "http://localhost:8080/" }).mountCard("#card", { intentId, clientSecret, origin: "https://shop.example" });
    const url = new URL(mountedFrame().src);
    expect(url.origin).toBe("http://localhost:8080");
    expect(url.searchParams.get("origin")).toBe("https://shop.example");
  });

  it("refuses an oversized appearance", () => {
    expect(() => Pesa().mountCard("#card", { intentId, clientSecret, appearance: { pad: "x".repeat(5000) } })).toThrow(/4096/);
  });

  it("accepts an element as the target and refuses a missing selector", () => {
    const el = document.getElementById("card")!;
    Pesa().mountCard(el, { intentId, clientSecret });
    expect(el.querySelector("iframe")).not.toBeNull();
    expect(() => Pesa().mountCard("#nope", { intentId, clientSecret })).toThrow(/nothing matches/);
  });
});

describe("messages", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="card"></div>';
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("ignores messages from another origin or another window", () => {
    const card = Pesa().mountCard("#card", { intentId, clientSecret });
    const change = vi.fn();
    card.on("change", change);
    fromElement({ type: "pesa:change", complete: true, brand: "visa" }, { origin: "https://evil.example" });
    fromElement({ type: "pesa:change", complete: true, brand: "visa" }, { source: window });
    expect(change).not.toHaveBeenCalled();
    fromElement({ type: "pesa:change", complete: true, brand: "visa" });
    expect(change).toHaveBeenCalledWith({ complete: true, brand: "visa", error: undefined, savedCardSelected: false, saveCard: false });
  });

  it("reports a chosen saved card and the payer's consent to save a new one", () => {
    const card = Pesa().mountCard("#card", { intentId, clientSecret });
    const change = vi.fn();
    card.on("change", change);
    fromElement({ type: "pesa:change", complete: true, brand: "visa", savedCardSelected: true, saveCard: false });
    expect(change).toHaveBeenLastCalledWith({ complete: true, brand: "visa", error: undefined, savedCardSelected: true, saveCard: false });
    fromElement({ type: "pesa:change", complete: false, brand: "", error: "Enter your card number.", savedCardSelected: false, saveCard: true });
    expect(change).toHaveBeenLastCalledWith({ complete: false, brand: "", error: "Enter your card number.", savedCardSelected: false, saveCard: true });
    fromElement({ type: "pesa:change", complete: true, brand: "visa", savedCardSelected: "yes", saveCard: 1 });
    expect(change).toHaveBeenLastCalledWith({ complete: true, brand: "visa", error: undefined, savedCardSelected: false, saveCard: false });
  });

  it("emits ready and resizes the iframe", () => {
    const card = Pesa().mountCard("#card", { intentId, clientSecret });
    const ready = vi.fn();
    card.on("ready", ready);
    fromElement({ type: "pesa:ready" });
    expect(ready).toHaveBeenCalledOnce();
    fromElement({ type: "pesa:resize", height: 301.2 });
    expect(mountedFrame().style.height).toBe("302px");
  });

  it("off removes a listener", () => {
    const card = Pesa().mountCard("#card", { intentId, clientSecret });
    const change = vi.fn();
    card.on("change", change).off("change", change);
    fromElement({ type: "pesa:change", complete: false, brand: "" });
    expect(change).not.toHaveBeenCalled();
  });
});

describe("pay", () => {
  let posted: unknown[];

  beforeEach(() => {
    document.body.innerHTML = '<div id="card"></div>';
    posted = [];
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  function spyPost() {
    const frame = mountedFrame();
    const target = frame.contentWindow as Window;
    vi.spyOn(target, "postMessage").mockImplementation((data: unknown, origin?: unknown) => {
      posted.push({ data, origin });
    });
  }

  it("submits once the element is ready and resolves on the result", async () => {
    const card = Pesa().mountCard("#card", { intentId, clientSecret });
    spyPost();
    const result = vi.fn();
    card.on("result", result);
    const p = card.pay();
    expect(posted).toHaveLength(0);
    fromElement({ type: "pesa:ready" });
    expect(posted).toEqual([{ data: { type: "pesa:submit" }, origin: checkoutOrigin }]);
    fromElement({ type: "pesa:result", state: "succeeded", intentId, intentState: "settled", attempt: { state: "captured", card: { brand: "visa", last4: "1111" } } });
    await expect(p).resolves.toEqual({ state: "succeeded", intentId, intentState: "settled", attempt: { state: "captured", card: { brand: "visa", last4: "1111" } } });
    expect(result).toHaveBeenCalledOnce();
  });

  it("submits at once when already ready and refuses a second pay in flight", async () => {
    const card = Pesa().mountCard("#card", { intentId, clientSecret });
    spyPost();
    fromElement({ type: "pesa:ready" });
    const p = card.pay();
    expect(posted).toHaveLength(1);
    await expect(card.pay()).rejects.toThrow(/already in progress/);
    fromElement({ type: "pesa:result", state: "failed", intentId, intentState: "open", attempt: { state: "declined", failureReason: "Declined." } });
    await expect(p).resolves.toMatchObject({ state: "failed", intentState: "open", attempt: { state: "declined" } });
  });

  it("opens the challenge modal on requires_3ds and resolves on the final result", async () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const card = Pesa({ challengeLoadTimeoutMs: 10_000 }).mountCard("#card", { intentId, clientSecret });
    spyPost();
    fromElement({ type: "pesa:ready" });
    const p = card.pay();
    const challengeUrl = `${checkoutOrigin}/c/${intentId}/challenge?t=${clientSecret}`;
    fromElement({ type: "pesa:result", state: "requires_action", intentId, attempt: { state: "requires_3ds" }, challengeUrl });
    const overlay = document.querySelector("[data-pesa-challenge]");
    expect(overlay).not.toBeNull();
    const challengeFrame = overlay!.querySelector("iframe") as HTMLIFrameElement;
    expect(challengeFrame.src).toBe(challengeUrl);
    challengeFrame.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(20_000);
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector("[data-pesa-challenge]")).not.toBeNull();
    fromElement({ type: "pesa:result", state: "succeeded", intentId, intentState: "settled", attempt: { state: "captured" } });
    expect(document.querySelector("[data-pesa-challenge]")).toBeNull();
    await expect(p).resolves.toMatchObject({ state: "succeeded" });
  });

  it("falls back to a full-page redirect when the challenge page does not load in time", () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign, origin: "http://localhost:3000" } as Location);
    const card = Pesa({ challengeLoadTimeoutMs: 10_000 }).mountCard("#card", { intentId, clientSecret });
    spyPost();
    fromElement({ type: "pesa:ready" });
    void card.pay().catch(() => {});
    const challengeUrl = `${checkoutOrigin}/c/${intentId}/challenge?t=x`;
    fromElement({ type: "pesa:result", state: "requires_action", intentId, attempt: { state: "requires_3ds" }, challengeUrl });
    vi.advanceTimersByTime(9_999);
    expect(assign).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(assign).toHaveBeenCalledWith(challengeUrl);
    expect(document.querySelector("[data-pesa-challenge]")).toBeNull();
  });

  it("rejects a pending pay on unmount and stops listening", async () => {
    const card = Pesa().mountCard("#card", { intentId, clientSecret });
    spyPost();
    const p = card.pay();
    card.unmount();
    await expect(p).rejects.toThrow(/unmounted/);
    expect(document.querySelector("iframe")).toBeNull();
    await expect(card.pay()).rejects.toThrow(/not mounted/);
  });
});

describe("redirectToCheckout", () => {
  it("navigates only to the checkout origin", () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign } as Location);
    const pesa = Pesa();
    pesa.redirectToCheckout({ checkoutUrl: `${checkoutOrigin}/c/${intentId}?t=abc` });
    expect(assign).toHaveBeenCalledWith(`${checkoutOrigin}/c/${intentId}?t=abc`);
    expect(() => pesa.redirectToCheckout({ checkoutUrl: "https://evil.example/c/x" })).toThrow(/not a Pesa checkout URL/);
  });
});

describe("mountExpress", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="express"></div>';
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function expressFrame(): HTMLIFrameElement {
    const f = document.querySelector("iframe[data-pesa-element=express]");
    if (!(f instanceof HTMLIFrameElement)) throw new Error("no express iframe");
    return f;
  }

  it("mounts the express view of the element", () => {
    Pesa().mountExpress("#express", { intentId, clientSecret });
    const url = new URL(expressFrame().src);
    expect(url.pathname).toBe(`/c/${intentId}/element`);
    expect(url.searchParams.get("view")).toBe("express");
    expect(url.searchParams.get("t")).toBe(clientSecret);
    expect(expressFrame().getAttribute("allow")).toBe("payment");
  });

  it("relays payByBank and sends the browser to the bank on the element's answer", () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign, origin: "http://localhost:3000" } as Location);
    const express = Pesa().mountExpress("#express", { intentId, clientSecret });
    const frame = expressFrame();
    const posted: unknown[] = [];
    Object.defineProperty(frame, "contentWindow", { value: { postMessage: (data: unknown) => posted.push(data) } });
    const result = vi.fn();
    express.on("result", result);
    express.payByBank();
    expect(posted).toEqual([{ type: "pesa:bank" }]);
    const authorisationUrl = "https://bank.example/authorise/1";
    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "pesa:result", state: "requires_action", intentId, intentState: "open", attempt: { method: "bank", state: "awaiting_confirmation", authorisationUrl } },
      origin: checkoutOrigin, source: frame.contentWindow,
    }));
    expect(assign).toHaveBeenCalledWith(authorisationUrl);
    expect(result).toHaveBeenCalledWith(expect.objectContaining({ state: "requires_action", attempt: expect.objectContaining({ method: "bank" }) }));
  });

  it("reports a wallet result like a card result", () => {
    const express = Pesa().mountExpress("#express", { intentId, clientSecret });
    const result = vi.fn();
    express.on("result", result);
    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "pesa:result", state: "succeeded", intentId, intentState: "settled", attempt: { method: "google_pay", state: "captured", card: { brand: "visa", last4: "4242" } } },
      origin: checkoutOrigin, source: expressFrame().contentWindow,
    }));
    expect(result).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded", intentState: "settled" }));
  });
});
