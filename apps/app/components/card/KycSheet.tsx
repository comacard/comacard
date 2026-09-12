"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TextMorph } from "torph/react";

/**
 * Identity verification, inside the app rather than in a new tab.
 *
 * Didit's hosted flow embeds: it sends neither `X-Frame-Options` nor a `frame-ancestors` policy, so
 * a cross-origin iframe loads it in full. This was measured, not assumed.
 *
 * **`allow="camera; microphone"` is the whole thing.** Framing policy and permission policy are
 * separate gates: without that attribute the page still renders and then dies at the face-check
 * step with `NotAllowedError: Permission denied`, which looks like a broken product rather than a
 * missing attribute. Both were verified against a live session.
 *
 * The verdict does NOT come back through the iframe. Didit reports it by webhook to our KYC
 * service, so the only honest completion signal is re-reading our own backend; `onPoll` is called
 * on a timer while this is open. Nothing here listens for a `postMessage` from Didit, because they
 * document none and building on an undocumented one would break silently.
 *
 * When that poll comes back verified the sheet takes over the screen itself: the iframe is replaced
 * by a success state and then it closes. Leaving Didit's own "you're done" page up is how someone
 * ends up staring at a finished flow wondering whether the app noticed.
 *
 * **The embed can be blocked, and not by Didit.** Brave's shields refuse a cross-origin frame on a
 * localhost page ("the connection is blocked because it was initiated by a public page..."), and
 * some in-app browsers do the same. A cross-origin frame cannot be inspected, so there is no honest
 * way to detect it from here: the escape hatch is therefore always visible rather than revealed
 * after a failure that this component cannot see.
 */
export function KycSheet({
  open,
  url,
  verified = false,
  onClose,
  onPoll,
}: {
  open: boolean;
  url: string | null;
  /** True once our own backend says the webhook landed. Flips this sheet to its success state. */
  verified?: boolean;
  onClose: () => void;
  onPoll: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal needs a client-only gate
  useEffect(() => setMounted(true), []);

  const done = open && verified;

  // Let the success state be read before it disappears. Long enough to register, short enough that
  // nobody reaches for the close button first.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(onClose, 2600);
    return () => clearTimeout(timer);
  }, [done, onClose]);

  // Ask our backend whether the webhook has landed yet. Only while the sheet is open, so a closed
  // sheet costs nothing.
  useEffect(() => {
    if (!open || verified) return;
    const id = setInterval(onPoll, 4000);
    return () => clearInterval(id);
  }, [open, verified, onPoll]);

  // A verification flow behind a scrolling page is disorienting, and on iOS the background scrolls
  // under a fixed overlay unless the body is pinned.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open || !url) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verify your identity"
      className="fixed inset-0 z-[60] flex flex-col bg-card"
    >
      <header className="flex h-[54px] shrink-0 items-center justify-between px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close verification"
          className="grid h-[38px] w-[38px] place-items-center rounded-full border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <span className="text-[15px] font-semibold">Verify your identity</span>
        {/* Balances the close button so the title sits centred. */}
        <span aria-hidden="true" className="h-[38px] w-[38px]" />
      </header>

      {done ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
          <span className="grid h-[86px] w-[86px] place-items-center rounded-full bg-pos/10 text-pos motion-safe:animate-[rise_.5s_cubic-bezier(0.16,1,0.3,1)_both]">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <TextMorph numbers={false} className="text-[22px] font-semibold tracking-[-.02em]">
            Your card is ready
          </TextMorph>
          <p className="max-w-[260px] text-[13.5px] leading-snug text-muted">
            Identity verified. Your card number is on the card now.
          </p>
        </div>
      ) : (
        <iframe
          src={url}
          title="Identity verification"
          // Without this the flow renders and then fails at the camera step.
          allow="camera; microphone; fullscreen"
          className="min-h-0 w-full flex-1 border-0"
        />
      )}

      {!done && (
        <footer className="shrink-0 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 text-center">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-line bg-white text-[14px] font-semibold text-ink-2 no-underline [box-shadow:inset_0_1px_0_rgba(255,255,255,.85),0_8px_18px_-10px_rgba(0,0,0,.18)]"
          >
            Not loading? Open in a new tab
          </a>
          <p className="mt-2 text-[12px] text-muted">
            This page updates itself once you finish, wherever you finish it.
          </p>
        </footer>
      )}
    </div>,
    document.body,
  );
}
