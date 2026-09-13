"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUnits } from "viem";
import { useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { type CollateralAsset, useCollateral } from "../../hooks/useCollateral";
import {
  explorerTx,
  SEPOLIA_CHAIN_ID,
  SOURCE_VAULT,
  sourceVaultAbi,
} from "../../lib/comacard/contracts";
import { awaitSuccess } from "../../lib/comacard/tx";
import { AssetIcon, Button, badgeForSymbol, CoinBadge, PendingLabel, Skeleton } from "../ui";
import { SubHeader } from "../ui/SubHeader";
import { TransactionStatus } from "../ui/TransactionStatus";

/**
 * Taking back collateral that was proved from Sepolia by Attestcoin.
 *
 * **Half of this path is ours and half is the holder's, and until now neither half existed here.**
 * `SourceVault.approveTokenRelease` is `onlyRole(OPERATOR_ROLE)`, and `unlockToken` then pays out up
 * to whatever was approved. So a release is two steps by two different people. The app had a screen
 * for neither, which meant a cardholder who repaid in full and asked how to get their deposit back
 * had no answer on Sepolia at all. Axel asked exactly that this afternoon, which is why this exists.
 *
 * This screen is the holder's half. It cannot approve anything and does not pretend to: when the
 * allowance is zero it says so plainly, names who clears it, and stops. When it is not zero, the
 * button is a real `unlockToken` and the money lands in the wallet.
 *
 * **Why not just hide the screen when nothing is approved.** Because "you cannot withdraw this" and
 * "nobody has approved it yet" are different sentences and only the second one is true. Hiding it
 * is how the collateral list ended up looking like a feature that failed to load.
 *
 * **Why Sepolia is not like the Wormhole chains.** Collateral there comes home without anyone's
 * permission: `ReleaseRelay` holds the operator role and relays what the guardians signed. Sepolia
 * has no such relay, because Attestcoin writability is still in third-party audit and Creditcoin
 * cannot write back to Ethereum, so the operator is still a person. That is the honest difference
 * and #13 is where it is being discussed.
 */

const fmt = (value: bigint, decimals: number, digits = 4): string =>
  Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits });

export function ReleaseSepolia({ slug }: { slug: string }) {
  const router = useRouter();
  const config = useConfig();
  const { assets, loading, error } = useCollateral();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [done, setDone] = useState(false);

  const asset: CollateralAsset | null =
    assets.find((a) => a.slug.toLowerCase() === slug.toLowerCase()) ?? null;

  const onClaim = async () => {
    if (busy || !asset || asset.releasable <= 0n || !SOURCE_VAULT) return;
    setBusy(true);
    setFailed(null);
    try {
      await switchChainAsync({ chainId: SEPOLIA_CHAIN_ID });

      // The native asset and an ERC20 are different functions on the same vault, and the token one
      // needs the address. `token === null` is how this type spells "the chain's own coin".
      const sent =
        asset.token === null
          ? await writeContractAsync({
              address: SOURCE_VAULT,
              abi: sourceVaultAbi,
              functionName: "unlock",
              args: [asset.releasable],
              chainId: SEPOLIA_CHAIN_ID,
            })
          : await writeContractAsync({
              address: SOURCE_VAULT,
              abi: sourceVaultAbi,
              functionName: "unlockToken",
              args: [asset.token, asset.releasable],
              chainId: SEPOLIA_CHAIN_ID,
            });

      await awaitSuccess(config, sent, SEPOLIA_CHAIN_ID);
      setHash(sent);
      setDone(true);
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message.split("\n")[0] : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !asset) {
    return (
      <div className="stagger">
        <SubHeader title="Withdraw" />
        <Skeleton className="h-[72px] rounded-[16px]" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="stagger">
        <SubHeader title="Withdraw" />
        <p className="mt-8 text-center text-[13.5px] text-muted">
          {error ? "Could not read your collateral." : "Nothing of yours is held on Sepolia."}
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center">
          <TransactionStatus
            status="confirmed"
            size="large"
            href={hash ? explorerTx(SEPOLIA_CHAIN_ID, hash) : undefined}
          />
          <p className="mt-5 max-w-[280px] text-center text-[13px] leading-snug text-muted">
            Your {asset.symbol} is back in your wallet on Ethereum Sepolia.
          </p>
        </div>
        <Button onClick={() => router.push("/home")}>Done</Button>
      </div>
    );
  }

  const claimable = asset.releasable > 0n;

  return (
    <div className="flex flex-1 flex-col">
      <SubHeader title={`Withdraw ${asset.symbol}`} />

      <div className="mb-3 flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
        <AssetIcon chainName="Sepolia">
          <CoinBadge token={badgeForSymbol(asset.symbol)} size={34} />
        </AssetIcon>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{asset.symbol}</div>
          <div className="mt-[2px] text-[12px] text-muted">
            {fmt(asset.proved, asset.decimals)} {asset.symbol} on Ethereum Sepolia
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="text-[15px] font-medium text-muted">
          {claimable ? "Ready to withdraw" : "Cleared for withdrawal"}
        </div>
        <div className="mt-2 whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] tabular-nums">
          {fmt(asset.releasable, asset.decimals)} {asset.symbol}
        </div>

        {claimable ? null : (
          /* The one thing a person needs here, said rather than implied by an absent button. It
             names who clears it and does not promise when, because nothing here knows when. */
          <p className="mt-4 max-w-[290px] text-[12.5px] leading-snug text-muted">
            Collateral on Ethereum is cleared for release by us, not by you. Attestcoin cannot write
            back to Ethereum yet, so that half is still approved by hand. Ask in the team channel
            and this button turns on.
          </p>
        )}

        {failed ? <TransactionStatus status="failed" detail={failed} className="mt-4" /> : null}
      </div>

      <div className="mt-auto">
        <Button onClick={onClaim} disabled={!claimable || busy || switching}>
          {switching ? (
            "Switching to Sepolia…"
          ) : busy ? (
            <PendingLabel status="signing" />
          ) : claimable ? (
            `Withdraw ${fmt(asset.releasable, asset.decimals)} ${asset.symbol}`
          ) : (
            "Nothing cleared yet"
          )}
        </Button>
        {claimable ? (
          <p className="mt-2 text-center text-[12px] leading-snug text-muted">
            One signature on Sepolia. The vault pays it straight to your wallet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
