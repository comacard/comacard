"use client";
import { useState } from "react";
import QRCode from "react-qr-code";
import { CopyButton } from "../ui";

/**
 * Sign this deposit from the phone instead of from this browser.
 *
 * The case it exists for: the app is open on a laptop and the wallet lives on a phone. Before this,
 * that meant WalletConnect or giving up. Now the confirmed amount becomes a QR code the phone's
 * wallet can open directly.
 *
 * **What the code contains is a function call, not an address.** See `lib/comacard/eip681.ts` for
 * the full reasoning; the short version is that a bare vault address would be a trap. The vaults
 * have no `receive()`, so native coin sent to one reverts, and an ERC20 sent to one arrives and is
 * never credited to anybody, with no rescue path. Encoding `lockNative` means a wallet either opens
 * the right confirmation or fails to open anything.
 *
 * **Collapsed by default, and never the only way through.** Wallet support for function-call URIs is
 * uneven: MetaMask Mobile has shipped this broken more than once, most recently in 2026. The button
 * that signs through the connected wallet stays exactly where it was, and this sits under a
 * disclosure beneath it. If the QR does nothing in somebody's wallet, the screen still works.
 *
 * The URI is shown as text under the code as well, because a person who cannot scan it can still
 * read it, and because a QR nobody can verify is a QR nobody should sign.
 */
export function DepositQr({
  uri,
  chainName,
  amount,
}: {
  uri: string;
  /** Named on screen: a wallet that opens this will be asked to switch, and should expect it. */
  chainName: string;
  /** Already formatted with its symbol. The figure in the code, restated where it can be read. */
  amount: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-muted transition-colors hover:text-ink"
      >
        {open ? "Hide QR code" : "Sign from your phone instead"}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="rounded-[16px] border border-line bg-white p-4 text-center">
          {/* White plate under the code regardless of the surface behind it: a QR needs the
              contrast between its own two colours, and a tinted background is where scanners
              start failing in a room with bad light. */}
          <div className="mx-auto w-fit rounded-[12px] bg-white p-3">
            <QRCode
              value={uri}
              size={168}
              // Q corrects a quarter of the code, which is the level to use when the thing being
              // scanned is a screen someone is holding at an angle.
              level="Q"
              title={`Deposit ${amount} on ${chainName}`}
            />
          </div>

          <p className="mt-3 text-[13px] font-semibold">
            {amount} on {chainName}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-muted">
            Open your wallet app, scan this, and confirm there. It opens the same deposit this
            screen would sign, on the same network.
          </p>

          <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-pill px-3 py-2 text-left">
            <code className="min-w-0 flex-1 break-all font-mono text-[10.5px] leading-tight text-pill-ink">
              {uri}
            </code>
            <CopyButton value={uri} />
          </div>

          {/* Said plainly rather than discovered when nothing happens. */}
          <p className="mt-2 text-[11.5px] leading-snug text-muted">
            Some wallets cannot open a request like this yet. If yours does nothing, use the button
            above instead.
          </p>
        </div>
      ) : null}
    </div>
  );
}
