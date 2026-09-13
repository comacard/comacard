"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Scan a wallet address off a QR code, using the browser's own decoder.
 *
 * `BarcodeDetector` rather than a bundled decoder. It is native on Chrome and Android WebView — the
 * phones this demo runs on — and adding a QR library the day before a submission buys support for
 * browsers nobody is demoing from, at the cost of a dependency that touches the camera. Where it is
 * missing the button does not render at all: a scan button that opens a viewfinder and never decodes
 * is worse than a Paste field on its own.
 *
 * The stream is stopped in every exit path, including the one where the component unmounts mid-scan.
 * A camera light left on after the sheet closes reads as the app still watching.
 */

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => Detector;
  }
}

export function QrScanButton({ onFound }: { onFound: (text: string) => void }) {
  /**
   * `useSyncExternalStore` rather than an effect. Reading a browser capability is exactly what its
   * third argument — the server snapshot — exists for: it returns `false` during SSR and the real
   * answer on the client, with no hydration mismatch, no state set inside an effect, and no frame of
   * delay. The subscribe function is a no-op because support does not change while the page is open.
   */
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof window.BarcodeDetector === "function",
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let frame = 0;

    const stop = () => {
      cancelForFrame();
      for (const track of stream.current?.getTracks() ?? []) track.stop();
      stream.current = null;
    };
    const cancelForFrame = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    void (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          for (const track of media.getTracks()) track.stop();
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
        }
        const detector = new (window.BarcodeDetector as NonNullable<typeof window.BarcodeDetector>)(
          {
            formats: ["qr_code"],
          },
        );
        const tick = async () => {
          if (cancelled || !video.current) return;
          try {
            const [found] = await detector.detect(video.current);
            if (found?.rawValue) {
              onFound(found.rawValue.trim());
              setOpen(false);
              return;
            }
          } catch {
            // A frame that cannot be decoded is the normal case, not an error.
          }
          frame = requestAnimationFrame(() => void tick());
        };
        frame = requestAnimationFrame(() => void tick());
      } catch (cause) {
        // Refusing the camera is a choice, not a fault, so it is stated plainly and the field stays.
        setFailed(
          cause instanceof Error && cause.name === "NotAllowedError"
            ? "Camera access was declined. Paste the address instead."
            : "No camera available. Paste the address instead.",
        );
        setOpen(false);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onFound]);

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Scan a QR code"
        onClick={() => {
          setFailed(null);
          setOpen(true);
        }}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-pill"
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18" />
        </svg>
      </button>

      {failed ? <p className="mt-2 text-[12px] text-neg">{failed}</p> : null}

      {open ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/90">
          {/* Decorative: the viewfinder carries no information a screen reader can use, and the
              instruction below it is the accessible version of the same thing. The attribute sits on
              the wrapper rather than the <video> because a media element counts as focusable — it is
              not, without `controls`, but hiding a container that holds no control is the same thing
              said in a way that is true whether or not controls appear later. */}
          <div aria-hidden="true" className="min-h-0 flex-1">
            <video ref={video} className="h-full w-full object-cover" playsInline muted>
              <track kind="captions" />
            </video>
          </div>
          <div className="p-5 pb-9 text-center">
            <p className="text-[13.5px] text-white/80">Point the camera at a wallet QR code</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 h-11 rounded-full bg-white px-6 text-[14px] font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
