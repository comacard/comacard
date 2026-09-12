"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Address, formatUnits, parseUnits } from "viem";
import { useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { useCreditLine } from "../../hooks/useCreditLine";
import { type RemoteAsset, useRemoteCollateral } from "../../hooks/useRemoteCollateral";
import { useWallet } from "../../hooks/useWallet";
import {
  crossingTime,
  erc20Abi,
  NATIVE_SYMBOL,
  wormholeCoreAbi,
  wormholeVaultAbi,
} from "../../lib/comacard/contracts";
import { collateralValue, limitFrom } from "../../lib/comacard/credit";
import { awaitSuccess } from "../../lib/comacard/tx";
import {
  AssetIcon,
  Button,
  badgeForSymbol,
  CoinBadge,
  Keypad,
  PendingLabel,
  Skeleton,
  TransactionStatus,
} from "../ui";
import { SubHeader } from "../ui/SubHeader";

/**
 * Locking collateral on a chain Attestcoin cannot reach.
 *
 * Same promise as the Sepolia screen — the asset stays where it is and only a message crosses — but
 * three things differ enough to be worth naming.
 *
 * **The wait is minutes, and how many depends on the chain.** The vault publishes at *finalized*
 * consistency; Base, Arbitrum and Optimism finalize against Ethereum and take about fifteen minutes,
 * while BSC and Fuji finalize themselves and come back in under one. Either way the guardians sign
 * long after the lock confirms, which is
 * a deliberate choice on the contract side: this number decides how much someone may borrow, and
 * instant consistency would credit collateral a reorg could take back. Between the lock and the
 * signature the limit does not move, and a screen that says nothing about it reads as broken.
 *
 * **Wormhole charges a message fee out of the same `msg.value`.** The vault takes the fee first and
 * credits the remainder rather than crediting collateral it does not hold, so locking exactly N
 * means sending N plus the fee. It is zero on these testnets today, which is exactly why it is read
 * rather than assumed.
 *
 * **`lockToken` here is payable**, unlike the Sepolia one, for that same fee.
 */

const fmt = (value: bigint, decimals: number, maxDigits = 6): string =>
  Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    maximumFractionDigits: maxDigits,
  });

function parseAmount(text: string, decimals: number): bigint {
  try {
    return parseUnits(text === "" || text === "." ? "0" : text, decimals);
  } catch {
    return 0n;
  }
}

export function LockRemoteCollateral({ id }: { id: string }) {
  const router = useRouter();
  const config = useConfig();
  const { assets, loading } = useRemoteCollateral();
  // `WalletProvider` is the single answer to "who is connected" (apps/app/CLAUDE.md). This screen
  // was asking `config.connectors[0]` instead, which is the first REGISTERED connector rather than
  // the active one — it answered with no accounts, `who` came out undefined, and every read that
  // took it threw `Address "undefined" is invalid` before the wallet was ever opened.
  const { address } = useWallet();
  const who = address as Address | undefined;
  const { score } = useCreditLine();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync, data: hash, error, reset } = useWriteContract();

  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  // Everything that can fail before the wallet is even asked — switching chains, reading the message
  // fee, the receipt check afterwards — used to be caught and dropped, because the only error shown
  // was `useWriteContract`'s. A declined chain switch left the button idle with nothing said, which
  // is indistinguishable from the click not registering.
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const asset: RemoteAsset | null =
    assets.find((a) => a.id.toLowerCase() === id.toLowerCase()) ?? null;

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title="Lock collateral" />
        <Skeleton className="h-16 w-full rounded-[16px]" />
        <Skeleton className="mt-3 h-[300px] w-full rounded-[16px]" />
      </div>
    );
  }

  if (!asset?.vault || asset.evmChainId === null) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title="Lock collateral" />
        <p className="mt-6 text-center text-[13px] text-muted">
          That asset is not accepted as collateral.
        </p>
        <div className="mt-auto">
          <Button onClick={() => router.push("/deposit")}>Choose an asset</Button>
        </div>
      </div>
    );
  }

  // The chain's own coin, not ETH: BSC pays in BNB and Fuji in AVAX, and naming the wrong asset
  // on the screen that asks someone to part with it is the worst place to be wrong.
  const symbol = asset.native ? (NATIVE_SYMBOL[asset.wormholeChainId] ?? "ETH") : "USDC";
  const entered = parseAmount(amount, asset.decimals);
  const exceeded = entered > asset.available;
  const value = collateralValue(entered, asset.decimals, asset.price);
  const addedLimit = limitFrom(value, score ?? 0n);
  const vault = asset.vault;
  const chainId = asset.evmChainId;

  const onLock = async () => {
    if (busy || entered <= 0n || exceeded || !who) return;
    setBusy(true);
    setFailed(null);
    try {
      await switchChainAsync({ chainId });

      // The figure the lock is supposed to move, read before and after. `nativeBalanceOf` rather
      // than `balanceOf`: the vault holds native and token balances in separate maps.
      const heldByVault = async (): Promise<bigint> =>
        asset.native
          ? await readContract(config, {
              address: vault,
              abi: wormholeVaultAbi,
              functionName: "nativeBalanceOf",
              args: [who],
              chainId,
            })
          : await readContract(config, {
              address: vault,
              abi: wormholeVaultAbi,
              // `tokenBalanceOf`, and the native one above is `nativeBalanceOf`. Neither is
              // `balanceOf`: one contract holds both kinds and a single name would have to overload.
              functionName: "tokenBalanceOf",
              args: [who, `0x${asset.token.slice(26)}` as Address],
              chainId,
            });
      const before = await heldByVault();

      // Read rather than assumed: it is zero on these testnets today and governance can change it.
      const core = await readContract(config, {
        address: vault,
        abi: wormholeVaultAbi,
        functionName: "WORMHOLE",
        chainId,
      });
      const fee = await readContract(config, {
        address: core,
        abi: wormholeCoreAbi,
        functionName: "messageFee",
        chainId,
      });

      let sent: `0x${string}`;
      if (asset.native) {
        // The vault credits `msg.value - fee`, so the fee rides on top of the amount rather than
        // coming out of it. Sending only `entered` would credit slightly less than was asked for.
        sent = await writeContractAsync({
          address: vault,
          abi: wormholeVaultAbi,
          functionName: "lockNative",
          value: entered + fee,
          chainId,
        });
      } else {
        const token = `0x${asset.token.slice(26)}` as Address;
        const allowance = await readContract(config, {
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [who, vault],
          chainId,
        });
        if (allowance < entered) {
          const approval = await writeContractAsync({
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [vault, entered],
            chainId,
          });
          // An approval that reverted is followed by a lock that reverts, with nothing on screen
          // saying which of the two failed.
          await awaitSuccess(config, approval, chainId, async () => {
            const granted = await readContract(config, {
              address: token,
              abi: erc20Abi,
              functionName: "allowance",
              args: [who, vault],
              chainId,
            });
            return granted >= entered;
          });
        }
        sent = await writeContractAsync({
          address: vault,
          abi: wormholeVaultAbi,
          functionName: "lockToken",
          args: [token, entered],
          value: fee,
          chainId,
        });
      }

      await awaitSuccess(config, sent, chainId, async () => (await heldByVault()) > before);
      setDone(true);
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center">
          <TransactionStatus
            status="confirmed"
            size="large"
            href={hash && asset.explorer ? `${asset.explorer}/tx/${hash}` : undefined}
          />
          {/* The one thing this screen exists to say. Without it the wait that follows looks like a
              deposit that did not work. */}
          <p className="mt-5 max-w-[280px] text-center text-[13px] leading-snug text-muted">
            Your {symbol} is locked on {asset.chainName}. It takes{" "}
            {crossingTime(asset.wormholeChainId)} to be signed across to Creditcoin, and your limit
            moves then.
          </p>
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
      <SubHeader title={`Lock ${symbol}`} />

      <div className="mb-3 flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
        <AssetIcon chainName={asset.chainName}>
          <CoinBadge token={badgeForSymbol(symbol)} size={34} />
        </AssetIcon>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{symbol}</div>
          <div className="mt-[2px] text-[12px] text-muted">
            {fmt(asset.available, asset.decimals)} {symbol} on {asset.chainName}
          </div>
        </div>
      </div>

      {asset.pending ? (
        <div className="mb-3 rounded-[16px] border border-line bg-white px-4 py-3 text-[12.5px] leading-snug text-warn [box-shadow:0_1px_2px_rgba(17,19,22,.04)]">
          {fmt(asset.locked - asset.credited, asset.decimals)} {symbol} is already locked and
          waiting to be signed across.
        </div>
      ) : null}

      <Keypad
        value={amount}
        onChange={setAmount}
        symbol=""
        onQuick={(pct) =>
          setAmount(
            formatUnits((asset.available * BigInt(Math.round(pct * 1000))) / 1000n, asset.decimals),
          )
        }
        invalid={exceeded}
        hint={`You only have ${fmt(asset.available, asset.decimals)} ${symbol}`}
      />

      <div className="mb-3 rounded-[16px] border border-line bg-white px-4 py-3 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
        <Line label="Collateral value" value={`${fmt(value, 18, 4)} tCTC`} />
        <Line
          label={`Estimated limit at score ${score ?? 0n}`}
          value={`+${fmt(addedLimit, 18, 4)} tCTC`}
        />
      </div>

      {error || failed ? (
        <TransactionStatus
          status="failed"
          detail={(error?.message ?? failed ?? "").split("\n")[0]}
          className="mb-3"
        />
      ) : null}

      <div className="mt-auto">
        <Button onClick={onLock} disabled={busy || switching || entered <= 0n || exceeded}>
          {switching ? (
            `Switching to ${asset.chainName}…`
          ) : busy ? (
            // No `txStatus` here: this screen drives its own write, so the phase it can report is
            // the signature it is waiting on.
            <PendingLabel status="signing" />
          ) : (
            `Lock ${symbol}`
          )}
        </Button>
        <p className="mt-2 text-center text-[12px] leading-snug text-muted">
          Signed across to Creditcoin in {crossingTime(asset.wormholeChainId)}. Your {symbol} stays
          on {asset.chainName}.
        </p>
      </div>
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
