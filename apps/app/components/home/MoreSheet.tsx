"use client";
import type { ReactNode } from "react";
import type { RemoteAsset } from "../../hooks/useRemoteCollateral";
import { NATIVE_SYMBOL } from "../../lib/comacard/contracts";
import { BottomSheet } from "../ui";

/**
 * What the `···` pill opens.
 *
 * I argued against an overflow at first, on the grounds that a menu holding nothing is furniture.
 * That was right about a menu of invented actions and wrong about this one: there are three real
 * things a cardholder can do that have nowhere else to sit on Home: take a deposit back, get test
 * tokens, and read the full history. Two of them were only reachable through Account.
 *
 * **Withdraw only lists what can actually be withdrawn.** A deposit that arrived by Wormhole has a
 * trustless release path: `requestRelease` on Creditcoin, the guardians, then the holder's own
 * signature. One proved from Sepolia by Attestcoin does not, because `SourceVault.approveRelease` is
 * gated on the team while Attestcoin writability is in third-party audit and Creditcoin cannot write
 * back to Ethereum. Offering a control that ends in "ask us" is worse than not offering it, so those
 * assets simply do not appear here.
 *
 * This sheet is the only place withdrawal is offered. `CollateralList` used to carry a chevron on
 * the Wormhole rows and a line of explanation on the others, which made a list about what backs the
 * limit spend half its space on a different subject.
 */

function Row({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-[13px] rounded-[16px] px-3 py-3 text-left transition-colors hover:bg-pill"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pill text-ink-2">
        {icon}
      </span>
      <span className="min-w-0 grow">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] text-muted">{description}</span>
      </span>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="shrink-0 text-faint"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

const icon = (d: string) => (
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
    <path d={d} />
  </svg>
);

export function MoreSheet({
  open,
  onClose,
  remote,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  remote: RemoteAsset[];
  onNavigate: (href: string) => void;
}) {
  const withdrawable = remote.filter((a) => a.credited > 0n || a.releasable > 0n);
  const go = (href: string) => {
    onClose();
    onNavigate(href);
  };

  return (
    <BottomSheet open={open} onClose={onClose} label="More">
      <div className="px-3 pb-2 pt-1">
        {withdrawable.length > 0 ? (
          <>
            <h2 className="mb-1 px-3 text-[12px] font-semibold text-muted">Withdraw</h2>
            {withdrawable.map((asset) => {
              const symbol = asset.native
                ? (NATIVE_SYMBOL[asset.wormholeChainId] ?? "ETH")
                : "USDC";
              return (
                <Row
                  key={asset.id}
                  icon={icon("M12 19V5M5 12l7-7 7 7")}
                  title={`Take back ${symbol}`}
                  description={`Held on ${asset.chainName}`}
                  onClick={() => go(`/withdraw/x/${asset.id}`)}
                />
              );
            })}
          </>
        ) : null}

        <h2 className="mb-1 mt-2 px-3 text-[12px] font-semibold text-muted">General</h2>
        <Row
          icon={icon("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01")}
          title="All transactions"
          description="Deposits, spending and payments"
          onClick={() => go("/transactions")}
        />
        <Row
          icon={icon("M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6")}
          title="Get test tokens"
          description="Mint collateral on Sepolia from the faucet"
          onClick={() => go("/account")}
        />
      </div>
    </BottomSheet>
  );
}
