"use client";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function BottomSheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  // Mount flag gates createPortal to client-only; SSR has no document.body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Escape closes, the same as Dialog and Drawer. Without it the only way out
  // of this sheet is a mouse on the scrim.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: presentational scrim; the keyboard path out is Escape, handled above */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same */}
      <div
        data-testid="scrim"
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        data-testid="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        className={`fixed inset-x-0 bottom-0 z-[51] max-h-[90%] overflow-y-auto rounded-t-sheet border-t border-white bg-card px-5 pb-6 pt-2 transition-transform ${open ? "translate-y-0" : "pointer-events-none translate-y-full"}`}
      >
        <div className="mx-auto mb-4 mt-1.5 h-[5px] w-10 rounded-full bg-black/10" />
        {children}
      </div>
    </>,
    document.body,
  );
}
