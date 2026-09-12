"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits, parseUnits } from "viem";
import { useSwitchChain } from "wagmi";
import { badgeForSymbol, Button, CoinBadge, Keypad, PendingLabel, Skeleton, TransactionStatus } from "../ui";
import { SubHeader } from "../ui/SubHeader";
import { assetBySlug, useCollateral, type CollateralAsset } from "../../hooks/useCollateral";
import { useCreditLine } from "../../hooks/useCreditLine";
import { collateralValue, limitFrom } from "../../lib/comacard/credit";
import { explorerTx, SEPOLIA_CHAIN_ID } from "../../lib/comacard/contracts";

/**
 * Locking one asset as collateral, for real, against the deployed `SourceVault`.
 *
 * Two signing paths, and which one runs is decided by whether the asset has a token address rather
 * than by its symbol. Native ETH goes through `lock()` with a value; every listed ERC20 goes
 * through `lockToken()`, which needs an allowance first and is therefore **two** wallet prompts.
 * The button says "Lock" either way: the allowance is plumbing, and naming it in the label made the
 * two paths look like two different products. The wallet announces the approval itself.
 *
 * Both writes are on Sepolia. The wallet usually sits on Creditcoin, since that is where the limit
 * and the card live, so the chain is checked up front and switching is offered as its own step
 * instead of letting the signature fail with a chain-mismatch error nobody can act on.
 *
 * The "adds to your limit" figure is an estimate from `lib/comacard/credit`, and it is labelled as
 * one. The real limit is read off the contract after the proof lands; quoting an estimate as if it
 * were the limit is how a screen ends up lying about money.
 */

const FAUCET_WHOLE_TOKENS = 1_000n;

function decimalsFor(asset: CollateralAsset): number {
  return asset.decimals;
}

/** Parses the keypad string without throwing on the half-typed states it passes through ("1."). */
function parseAmount(text: string, decimals: number): bigint {
  try {
    return parseUnits(text === "" || text === "." ? "0" : text, decimals);
  } catch {
    return 0n;
  }
}

function fmt(value: bigint, decimals: number, maxDigits = 6): string {
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDigits });
}

export function LockCollateral({ sym }: { sym: string }) {
  const router = useRouter();
  const { assets, loading } = useCollateral();
  const { lock, lockToken, mint, score, txStatus, hash, error, reset, onSepolia } = useCreditLine();
  const { switchChain, isPending: switching } = useSwitchChain();

  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  const asset = assetBySlug(assets, sym);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title="Lock collateral" />
        <Skeleton className="h-16 w-full rounded-[16px]" />
        <Skeleton className="mt-3 h-[300px] w-full rounded-[16px]" />
      </div>
    );
  }

  // A typo'd deep link refuses rather than defaulting into whichever asset happens to be first.
  // Locking the wrong asset is not recoverable from this screen.
  if (!asset) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title="Lock collateral" />
        <p className="mt-6 text-center text-[13px] text-muted">
          {sym.toUpperCase()} is not accepted as collateral.
        </p>
        <div className="mt-auto">
          <Button onClick={() => router.push("/deposit")}>Choose an asset</Button>
        </div>
      </div>
    );
  }

  const decimals = decimalsFor(asset);
  const entered = parseAmount(amount, decimals);
  const empty = asset.available === 0n;
  const exceeded = entered > asset.available;
  const value = collateralValue(entered, decimals, asset.price);
  // What the same collateral supports at today's score. The score is what makes this worth
  // showing: the identical lock buys more credit later, which is the whole product.
  const addedLimit = limitFrom(value, score ?? 0n);

  const quick = (pct: number) => {
    const part = (asset.available * BigInt(Math.round(pct * 1000))) / 1000n;
    setAmount(formatUnits(part, decimals));
  };

  const onLock = async () => {
    if (busy || entered <= 0n || exceeded) return;
    setBusy(true);
    try {
      if (asset.token) await lockToken(asset.token, entered);
      else await lock(entered);
    } catch {
      // `txStatus` already reports the failure; swallowing here only stops an unhandled rejection.
    } finally {
      setBusy(false);
    }
  };

  const onMint = async () => {
    if (busy || !asset.token) return;
    setBusy(true);
    try {
      await mint(asset.token, FAUCET_WHOLE_TOKENS);
    } catch {
      /* reported through txStatus */
    } finally {
      setBusy(false);
    }
  };

  /**
   * Done is its own screen, not a panel bolted under the form.
   *
   * The header, the asset card and its balance all exist to help someone decide an amount. Once the
   * transaction has landed there is no decision left, and leaving them up asks the reader to work
   * out which parts still apply. So the confirmed state keeps one thing: that it worked, centred,
   * with the way out underneath.
   */
  if (txStatus === "confirmed") {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center">
          <TransactionStatus
            status="confirmed"
            size="large"
            href={hash ? explorerTx(SEPOLIA_CHAIN_ID, hash) : undefined}
          />
        </div>
        <Button
          onClick={() => {
            reset();
            setAmount("0");
            router.push("/home");
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title={`Lock ${asset.symbol}`} />

      <div className="mb-3 flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
        <CoinBadge token={badgeForSymbol(asset.symbol)} size={34} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{asset.name}</div>
          <div className="mt-[2px] text-[12px] text-muted">
            {fmt(asset.available, decimals)} {asset.symbol} available on Sepolia
          </div>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col">
          <p className="mt-2 text-[13px] leading-snug text-muted">
            You hold no {asset.symbol} on Sepolia, so there is nothing to lock yet.
          </p>
          {txStatus === "failed" ? (
            <TransactionStatus
              status="failed"
              detail={error ? error.message.split("\n")[0] : undefined}
              href={hash ? explorerTx(SEPOLIA_CHAIN_ID, hash) : undefined}
              className="mt-4"
            />
          ) : null}
          <div className="mt-auto flex flex-col gap-2.5">
            {asset.faucetable ? (
              // Only offered for a token that actually answered `FAUCET_LIMIT`. A mint button on a
              // token without a faucet is a button that reverts in the user's wallet.
              <Button onClick={onMint} disabled={busy || !onSepolia}>
                {busy ? "Minting…" : `Mint ${FAUCET_WHOLE_TOKENS.toLocaleString("en-US")} ${asset.symbol}`}
              </Button>
            ) : (
              <p className="text-center text-[12.5px] text-muted">
                Sepolia ETH comes from Google Cloud&apos;s faucet. There is a link on your Account
                screen.
              </p>
            )}
            {!onSepolia && asset.faucetable ? (
              <Button
                onClick={() => switchChain({ chainId: SEPOLIA_CHAIN_ID })}
                disabled={switching}
              >
                {switching ? "Switching…" : "Switch to Sepolia"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <Keypad
            value={amount}
            onChange={setAmount}
            symbol=""
            onQuick={quick}
            invalid={exceeded}
            hint={`You only have ${fmt(asset.available, decimals)} ${asset.symbol}`}
          />

          <div className="mb-3 rounded-[16px] border border-line bg-white px-4 py-3 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
            <Line label="Collateral value" value={`${fmt(value, 18, 4)} tCTC`} />
            <Line
              label={`Estimated limit at score ${score ?? 0n}`}
              value={`+${fmt(addedLimit, 18, 4)} tCTC`}
            />
          </div>

          {txStatus === "failed" ? (
            <TransactionStatus
              status="failed"
              detail={error ? error.message.split("\n")[0] : undefined}
              href={hash ? explorerTx(SEPOLIA_CHAIN_ID, hash) : undefined}
              className="mb-3"
            />
          ) : null}

          <div className="mt-auto">
            {onSepolia ? (
              <Button onClick={onLock} disabled={busy || entered <= 0n || exceeded}>
                {busy ? (
                  <PendingLabel status={txStatus === "confirming" ? "confirming" : "signing"} />
                ) : (
                  `Lock ${asset.symbol}`
                )}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => switchChain({ chainId: SEPOLIA_CHAIN_ID })}
                  disabled={switching}
                >
                  {switching ? "Switching…" : "Switch to Sepolia"}
                </Button>
                <p className="mt-2 text-center text-[12px] text-muted">
                  Collateral is locked on Sepolia, where it stays.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}
