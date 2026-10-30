// The postMessage contract between the merchant page (this script) and the
// Card Element iframe served by the checkout edge. Both sides check the
// origin and the window before reading a message, so a message is trusted
// only after `isFromElement` says so.

export type CardBrand = "visa" | "mastercard" | "amex" | "unionpay" | "card" | "";

export type AttemptState =
  | "pending"
  | "requires_3ds"
  | "authorized"
  | "captured"
  | "declined"
  | "failed"
  | "cancelled"
  | "refunded"
  | "unknown"
  // Pay by bank: the payer approves at their bank, then the bank settles.
  | "awaiting_confirmation"
  | "dispatched"
  | "settled";

export type AttemptMethod = "card" | "apple_pay" | "google_pay" | "bank";

export type IntentState = "open" | "authorized" | "settled" | "expired" | "cancelled";

export interface Attempt {
  method?: AttemptMethod;
  state: AttemptState;
  /** Where the payer's browser must go to approve a bank attempt. */
  authorisationUrl?: string;
  card?: { brand?: CardBrand; last4?: string };
  failureReason?: string;
  declineCode?: string;
}

export interface ChangeEvent {
  complete: boolean;
  brand: CardBrand;
  error?: string;
  /** True while the payer has one of their saved cards chosen instead of typing a card. */
  savedCardSelected: boolean;
  /** True while the payer has ticked "Save this card for next time" on a new card. */
  saveCard: boolean;
}

/** What `pay()` resolves with: the state as the browser saw it. */
export interface PayResult {
  /**
   * `succeeded` once the intent is settled or authorized; `requires_action` while the payer is with
   * their issuer or bank; `open` with no attempt; `failed` on a decline or when nothing could be sent;
   * `invalid` when the card fields are incomplete.
   */
  state: "succeeded" | "requires_action" | "open" | "failed" | "invalid";
  intentId: string;
  /** The intent's state as the browser saw it. */
  intentState?: IntentState;
  attempt?: Attempt;
  /** Field errors, with `invalid`. */
  errors?: Record<string, string>;
  /** The message shown in the element, with `failed`. */
  error?: string;
}

// Element → parent.
export type ReadyMessage = { type: "pesa:ready" };
export type ChangeMessage = { type: "pesa:change" } & ChangeEvent;
export type ResultMessage = { type: "pesa:result"; challengeUrl?: string } & PayResult;
export type ResizeMessage = { type: "pesa:resize"; height: number };
export type ElementMessage = ReadyMessage | ChangeMessage | ResultMessage | ResizeMessage;

// Parent → element.
export type SubmitMessage = { type: "pesa:submit" };
export type BankMessage = { type: "pesa:bank" };

export function isElementMessage(data: unknown): data is ElementMessage {
  if (typeof data !== "object" || data === null) return false;
  const t = (data as { type?: unknown }).type;
  return t === "pesa:ready" || t === "pesa:change" || t === "pesa:result" || t === "pesa:resize";
}
