"use client";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useSwitchChain } from "wagmi";
import { type CollateralAsset, useCollateral } from "../../hooks/useCollateral";
import { useCreditLine } from "../../hooks/useCreditLine";
import { useRemoteCollateral } from "../../hooks/useRemoteCollateral";
import { explorerTx, NATIVE_SYMBOL, SEPOLIA_CHAIN_ID } from "../../lib/comacard/contracts";
import { collateralValue, limitFrom } from "../../lib/comacard/credit";
import {
  AssetIcon,
  Button,
  badgeForSymbol,
  CoinBadge,
  PendingLabel,
  Skeleton,
  TransactionStatus,
} from "../ui";
import { Drawer } from "../ui/Drawer";

/**
 * The desktop half of the deposit flow, as two in-drawer steps: pick an asset, then an amount.
 *
 * Same two writes as `LockCollateral` on mobile and the same maths, deliberately reusing
 * `useCollateral`, `useCreditLine` and `lib/comacard/credit` rather than restating any of it. The
 * only real difference is the input: a plain `<input>` here, where a numeric keypad would be the
 * wrong instrument for a keyboard.
 *
 * This replaced a drawer that funded Stellar buckets with USDC, EURC and CETES. None of those
 * assets exist in this protocol, so the screen was offering deposits that could never settle.
 */

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

export function LockCollateralDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { assets, loading } = useCollateral();
  // Chains Attestcoin cannot reach. Listed here too, because a desktop visitor reaching the deposit
  // drawer and a mobile one reaching /deposit must be offered the same assets.
  const { assets: remote } = useRemoteCollateral();
  const { lock, lockToken, score, txStatus, hash, error, reset, onSepolia } = useCreditLine();
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const [picked, setPicked] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const asset: CollateralAsset | null =
    assets.find((a) => (a.token ?? "native") === picked) ?? null;

  const close = () => {
    onClose();
    setPicked(null);
    setAmount("");
    reset();
  };

  const decimals = asset?.decimals ?? 18;
  const entered = asset ? parseAmount(amount, decimals) : 0n;
  const exceeded = asset ? entered > asset.available : false;
  const value = asset ? collateralValue(entered, decimals, asset.price) : 0n;
  const addedLimit = limitFrom(value, score ?? 0n);

  const onLock = async () => {
    if (!asset || busy || entered <= 0n || exceeded) return;
    setBusy(true);
    try {
      // The wallet normally sits on Creditcoin, where the limit lives, while both writes are on
      // Sepolia. Switching here rather than disabling the button keeps the common case actionable.
      if (!onSepolia) await switchChainAsync({ chainId: SEPOLIA_CHAIN_ID });
      if (asset.token) await lockToken(asset.token, entered);
      else await lock(entered);
    } catch {
      // Reported through `txStatus`; swallowed only to stop an unhandled rejection.
    } finally {
      setBusy(false);
    }
  };

  const confirmed = txStatus === "confirmed";

  return (
    <Drawer open={open} onClose={close} label={asset ? `Lock ${asset.symbol}` : "Deposit"}>
      {/* Done is its own view. The picker and the amount both exist to help decide how much, and
          once the transaction has landed there is no decision left to help with. */}
      {confirmed ? (
        <div className="flex min-h-[320px] flex-col">
          <div className="flex flex-1 flex-col items-center justify-center">
            <TransactionStatus
              status="confirmed"
              size="large"
              href={hash ? explorerTx(SEPOLIA_CHAIN_ID, hash) : undefined}
            />
          </div>
          <Button onClick={close}>Done</Button>
        </div>
      ) : asset === null ? (
        <div>
          {loading ? (
            <div className="flex flex-col gap-3 py-2">
              <Skeleton className="h-14 w-full rounded-[14px]" />
              <Skeleton className="h-14 w-full rounded-[14px]" />
            </div>
          ) : assets.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">
              Could not read the accepted assets from the chain.
            </p>
          ) : (
            assets.map((row, i) => (
              <button
                key={row.token ?? "native"}
                type="button"
                onClick={() => setPicked(row.token ?? "native")}
                className={`flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:bg-[#f4f4f4] ${
                  i === 0 ? "" : "border-t border-line"
                }`}
              >
                <AssetIcon chainName="Sepolia">
                  <CoinBadge token={badgeForSymbol(row.symbol)} size={36} />
                </AssetIcon>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{row.symbol}</span>
                  <span className="mt-[2px] block truncate text-[12px] text-muted">Sepolia</span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                  {fmt(row.available, row.decimals)} {row.symbol}
                </span>
              </button>
            ))
          )}

          {/* Cross-chain assets send the visitor to the full-page flow rather than continuing in
              the drawer: locking one switches the wallet to another chain, and a drawer is the
              wrong frame for a step that big. */}
          {remote.length > 0 ? (
            <>
              <div className="mt-4 mb-1 px-1 text-[12px] font-semibold text-muted">
                From another chain
              </div>
              {remote.map((row) => {
                const sym = row.native ? (NATIVE_SYMBOL[row.wormholeChainId] ?? "ETH") : "USDC";
                return (
                  <a
                    key={row.id}
                    href={`/deposit/x/${row.id}`}
                    className="flex w-full items-center gap-3 border-t border-line py-3.5 text-left no-underline transition-colors hover:bg-[#f4f4f4]"
                  >
                    <AssetIcon chainName={row.chainName}>
                      <CoinBadge token={badgeForSymbol(sym)} size={36} />
                    </AssetIcon>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{sym}</span>
                      <span className="mt-[2px] block truncate text-[12px] text-muted">
                        {row.chainName}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">
                      {fmt(row.available, row.decimals)} {sym}
                    </span>
                  </a>
                );
              })}
            </>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <CoinBadge token={badgeForSymbol(asset.symbol)} size={34} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{asset.name}</div>
              <div className="mt-[2px] text-[12px] text-muted">
                {fmt(asset.available, decimals)} {asset.symbol} available on Sepolia
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setAmount("");
              }}
              className="shrink-0 text-[12.5px] font-medium text-muted underline underline-offset-2"
            >
              Change
            </button>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-muted">Amount</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              className={`h-12 w-full rounded-[14px] border bg-white px-4 text-[18px] font-semibold tabular-nums outline-none ${
                exceeded ? "border-neg text-neg" : "border-line"
              }`}
            />
            {exceeded && (
              <span className="mt-1.5 block text-[12.5px] font-medium text-neg">
                You only have {fmt(asset.available, decimals)} {asset.symbol}
              </span>
            )}
          </label>

          <div className="rounded-[14px] border border-line bg-white px-4 py-3">
            <Row label="Collateral value" value={`${fmt(value, 18, 4)} tCTC`} />
            <Row
              label={`Estimated limit at score ${score ?? 0n}`}
              value={`+${fmt(addedLimit, 18, 4)} tCTC`}
            />
          </div>

          {txStatus === "failed" ? (
            <TransactionStatus
              status="failed"
              detail={error ? error.message.split("\n")[0] : undefined}
              href={hash ? explorerTx(SEPOLIA_CHAIN_ID, hash) : undefined}
            />
          ) : null}

          <Button onClick={onLock} disabled={busy || switching || entered <= 0n || exceeded}>
            {switching ? (
              "Switching…"
            ) : busy ? (
              <PendingLabel status={txStatus === "confirming" ? "confirming" : "signing"} />
            ) : (
              `Lock ${asset.symbol}`
            )}
          </Button>
        </div>
      )}
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}
