// The 3-D Secure challenge. The issuer's page is shown in a modal iframe over
// the merchant page. Issuer pages may refuse to be framed, so a page that has
// not loaded within `loadTimeoutMs` sends the whole window to the challenge
// instead; the edge's return page then brings the browser back to the
// merchant's returnUrl.

export interface ChallengeOptions {
  loadTimeoutMs: number;
  navigate: (url: string) => void;
}

export interface Challenge {
  close(): void;
}

const overlayStyle =
  "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center";
const frameStyle =
  "width:min(480px,96vw);height:min(640px,92vh);border:0;border-radius:12px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.35)";
const linkStyle =
  "position:absolute;bottom:16px;left:0;right:0;text-align:center;font:14px system-ui,sans-serif;color:#fff";

export function openChallenge(doc: Document, url: string, opts: ChallengeOptions): Challenge {
  const overlay = doc.createElement("div");
  overlay.setAttribute("style", overlayStyle);
  overlay.setAttribute("data-pesa-challenge", "");

  const frame = doc.createElement("iframe");
  frame.setAttribute("style", frameStyle);
  frame.setAttribute("title", "Card authentication");
  frame.setAttribute("allow", "payment");
  frame.src = url;

  const link = doc.createElement("a");
  link.setAttribute("style", linkStyle);
  link.href = url;
  link.textContent = "Having trouble? Continue on your bank's page";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    fallback();
  });

  overlay.appendChild(frame);
  overlay.appendChild(link);
  doc.body.appendChild(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    overlay.remove();
  };
  const fallback = () => {
    close();
    opts.navigate(url);
  };

  const timer = setTimeout(fallback, opts.loadTimeoutMs);
  frame.addEventListener("load", () => clearTimeout(timer));

  return { close };
}
