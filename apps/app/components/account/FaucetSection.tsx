"use client";

import { useEffect, useRef, useState } from "react";
import { TextMorph } from "torph/react";
import { formatUnits } from "viem";
import { badgeForSymbol, CoinBadge, Spinner, SuccessCheck } from "../ui";
import type { TokenSym } from "../ui/CoinBadge";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useCollateral } from "../../hooks/useCollateral";
import { useCreditLine } from "../../hooks/useCreditLine";
import { SEPOLIA_CHAIN_ID } from "../../lib/comacard/contracts";

/**
 * Where testnet funds come from, and the two kinds are not the same kind of thing.
 *
 * **Gas comes from somebody else.** Google's Sepolia faucet is a captcha-gated form, so it cannot
 * be called from a browser. That row is a link: nothing is minted here, a request is made elsewhere
 * and the ETH turns up later.
 *
 * **Collateral tokens are minted here, for real.** The listed Sepolia tokens are `TestToken`s whose
 * `faucet()` is public with no owner and no cooldown, verified by minting the same token twice in a
 * row from the same wallet. Every row reads "Request" so the section looks like one thing rather
 * than two; what separates them is what happens on tap, and the wallet's own prompt makes a
 * signature unmistakable without the label having to warn about it first.
 *
 * **A request is not finished when it is signed.** The balance on the row only moves once the
 * transaction is mined, so the button waits for the receipt, then invalidates the collateral query
 * so react-query refetches the balance underneath it. Showing a tick at signature time would claim
 * tokens that have not arrived; refetching without waiting would read the old balance and look
 * broken.
 *
 * **Mint switches the chain itself.** The wallet normally sits on Creditcoin, because that is
 * where the limit and the card live, while `faucet()` is on Sepolia. Disabling the button in that
 * state made the common case look broken: a greyed-out control with no way to act on it. So the
 * button stays live and does the switch first, then mints. The wallet still asks before switching,
 * so nothing happens behind the user's back.
 *
 * The token list is read from the chain, never hardcoded: listing a token is a governance call.
 */

type ExternalFaucet = { token: TokenSym; name: string; href: string };

const EXTERNAL: ExternalFaucet[] = [
  {
    token: "ETH",
    name: "Sepolia ETH",
    href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  },
];

const panel = [
  "flex items-center gap-3 rounded-[16px] border border-line bg-white",
  "[box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]",
  "px-4 py-3.5",
].join(" ");

const pill =
  "flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-[#f8f8f8] no-underline transition-transform active:scale-[.985] disabled:opacity-55 [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),inset_0_-9px_16px_-9px_rgba(0,0,0,.6),0_10px_22px_-10px_rgba(0,0,0,.42)]";

function amountLabel(value: bigint, decimals: number, symbol: string): string {
  const n = Number(formatUnits(value, decimals));
  const digits = n > 0 && n < 1 ? 4 : 2;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${symbol}`;
}

/**
 * How many WHOLE tokens one tap mints.
 *
 * Scaled by the token's own price so a tap is worth about the same whatever the asset: `price` is
 * credit-asset wei per whole token, so 1000 tCTC of value is `1000e18 / price` tokens. That gives
 * 1000 tUSDC and 1 tWETH from the same rule, rather than a per-symbol table that goes stale the
 * moment a token is listed or repriced. Clamped to the contract's own 100,000 per-call ceiling,
 * above which `faucet()` reverts rather than clamping for us.
 */
type Phase = "switching" | "processing" | "confirming" | "done";

/**
 * One morphing label across the whole request, so it reads as a single thing progressing.
 *
 * "Request" and "Requesting" share their whole stem, and "Confirming" shares its tail with both, so
 * the letters that stay stay put and only the ends move.
 */
const LABEL: Record<Phase | "idle", string> = {
  idle: "Request",
  switching: "Switching",
  processing: "Requesting",
  confirming: "Confirming",
  done: "Received",
};

function mintAmount(price: bigint): bigint {
  if (price === 0n) return 1n;
  const whole = (1000n * 10n ** 18n) / price;
  if (whole < 1n) return 1n;
  return whole > 100_000n ? 100_000n : whole;
}

export function FaucetSection({ compact = false }: { compact?: boolean }) {
  const { assets } = useCollateral();
  const { mint, onSepolia } = useCreditLine();
  const { switchChainAsync } = useSwitchChain();
  /**
   * Which rows are working, and what each is doing.
   *
   * A map rather than a single value, because a single one greyed out every row the moment any one
   * of them was tapped: three dead buttons to report one busy request. Each row now carries only
   * its own state, and a second request can start while the first is still in the wallet, which is
   * what the wallet's own prompt queue already supports.
   */
  const [pending, setPending] = useState<Record<string, Phase>>({});
  const config = useConfig();
  const queryClient = useQueryClient();
  // Cleared on unmount so a tick that outlives the screen cannot set state on a dead component.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const handles = timers.current;
    return () => {
      for (const handle of handles) clearTimeout(handle);
    };
  }, []);

  const mintable = assets.filter((asset) => asset.faucetable && asset.token !== null);

  const setPhase = (token: string, phase: Phase | null) =>
    setPending((current) => {
      if (phase === null) {
        const rest = { ...current };
        delete rest[token];
        return rest;
      }
      return { ...current, [token]: phase };
    });

  const onMint = async (token: `0x${string}`, price: bigint) => {
    if (pending[token]) return;
    try {
      // Awaited, not fired and forgotten: minting on the wrong chain reverts, and wagmi resolves
      // this only once the wallet has actually moved. A declined switch throws, which skips the
      // mint — the right outcome, since the user just said no.
      if (!onSepolia) {
        setPhase(token, "switching");
        await switchChainAsync({ chainId: SEPOLIA_CHAIN_ID });
      }
      setPhase(token, "processing");
      const hash = await mint(token, mintAmount(price));

      // Signed is not mined. The tokens do not exist until this resolves.
      setPhase(token, "confirming");
      await waitForTransactionReceipt(config, { hash, chainId: SEPOLIA_CHAIN_ID });

      // The balance on this row comes from `useCollateral`. Invalidating is what turns a landed
      // transaction into a number the holder can see, without a reload.
      await queryClient.invalidateQueries({ queryKey: ["comacard", "collateral"] });

      setPhase(token, "done");
      timers.current.push(setTimeout(() => setPhase(token, null), 2200));
    } catch {
      // Reported by the wallet itself; swallowed here only to stop an unhandled rejection.
      setPhase(token, null);
    }
  };

  const rowClass = compact
    ? "flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left"
    : panel;

  return (
    <section className={compact ? "px-2 pb-1 pt-1.5" : "mt-5"}>
      <h2
        className={
          compact
            ? "mb-2 px-1 text-[12px] font-semibold text-muted"
            : "ml-1 mb-2.5 text-sm font-medium text-muted"
        }
      >
        Faucet
      </h2>
      <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
        {/* Name only. These rows carry no balance: a gas balance is a wallet readout, and this
            screen is for getting funds, not for reporting how many you have. The mintable rows
            below DO show one, because it is the feedback that a mint landed. */}
        {EXTERNAL.map((row) => (
          <div key={row.token} className={rowClass}>
            <CoinBadge token={row.token} size={compact ? 28 : 40} />
            <div className={`min-w-0 flex-1 ${compact ? "text-sm font-semibold" : "font-semibold"}`}>
              {row.name}
            </div>
            <a href={row.href} target="_blank" rel="noreferrer" className={pill}>
              Request
            </a>
          </div>
        ))}

        {mintable.map((asset) => {
          const phase = pending[asset.token as string];
          return (
            <div key={asset.token} className={rowClass}>
              <CoinBadge token={badgeForSymbol(asset.symbol)} size={compact ? 28 : 40} />
              <div className="min-w-0 flex-1">
                <div className={compact ? "text-sm font-semibold" : "font-semibold"}>
                  {asset.symbol}
                </div>
                {compact ? null : (
                  <div className="mt-[3px] text-[12px] text-muted tabular-nums">
                    {amountLabel(asset.available, asset.decimals, asset.symbol)}
                  </div>
                )}
              </div>
              {/* One morphing label instead of three that swap. "Request" and "Requesting" share
                  their whole stem, and holding those letters in place is what makes the change read
                  as this request progressing rather than a new button appearing. */}
              <button
                type="button"
                className={pill}
                disabled={Boolean(phase)}
                onClick={() => void onMint(asset.token as `0x${string}`, asset.price)}
              >
                {phase === "done" ? (
                  <SuccessCheck size={14} className="-ml-0.5 shrink-0" />
                ) : phase ? (
                  <Spinner size={14} className="-ml-0.5 shrink-0" />
                ) : null}
                <TextMorph numbers={false}>{LABEL[phase ?? "idle"]}</TextMorph>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
