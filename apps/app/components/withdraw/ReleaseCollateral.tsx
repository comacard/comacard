"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Address, formatUnits, parseUnits } from "viem";
import { useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { useCollateral } from "../../hooks/useCollateral";
import { useCreditLine } from "../../hooks/useCreditLine";
import { type RemoteAsset, useRemoteCollateral } from "../../hooks/useRemoteCollateral";
import { useRemoteWithdrawals } from "../../hooks/useRemoteWithdrawals";
import {
  CREDITCOIN_CHAIN_ID,
  NATIVE_SYMBOL,
  REMOTE_HUB,
  remoteHubAbi,
  wormholeCoreAbi,
  wormholeVaultAbi,
} from "../../lib/comacard/contracts";
import { amountFromValue, releasableValue } from "../../lib/comacard/credit";
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
 * Taking cross-chain collateral home.
 *
 * This is the half of the Wormhole path that used to need us. `WormholeVault.approveRelease` is
 * operator-gated and the operator was the team, which is honest and custodial: a borrower's
 * collateral came back when we said so. A `ReleaseRelay` holds that role on each chain now and
 * approves nothing of its own accord — it relays what the guardians signed, and the guardians only
 * sign what Creditcoin published after checking the debt still stands up.
 *
 * **Three steps, and the screen has to be honest that it is three.**
 *
 * 1. `requestRelease` on Creditcoin. This is where it can be refused.
 * 2. The guardians sign and the worker relays it. Nothing for the user to do, but it is real time —
 *    well under a minute for BSC and Fuji, fifteen to twenty for the three L2s, which publish at
 *    finalized consistency and so finalize against Ethereum.
 * 3. **A second transaction the user signs.** The relay approves; it does not push funds, because
 *    the vault never sends to an address it was not asked to. A screen that said "withdrawn" after
 *    step 2 would be lying, so step 3 is a state of its own and it leads whenever it is available.
 *
 * **The maximum is computed rather than discovered.** `requestRelease` debits first and then asks
 * the credit line what the limit is worth without the collateral, reverting
 * `ReleaseWouldStrandDebt(drawn, remainingLimit)` if the borrower would be left owing more than the
 * remainder supports. Letting someone find that edge by hitting it costs gas and returns two
 * numbers instead of an action, so `releasableValue` solves the same inequality the other way and
 * the keypad is capped by it. The refusal is still handled — the contract is the authority and this
 * is a mirror of its arithmetic — but it should not be how anyone learns the rule.
 *
 * **Only the Wormhole path works this way.** Collateral proved from Sepolia by Attestcoin is
 * released by a person, because Attestcoin writability is in third-party audit and Creditcoin
 * cannot write back to Ethereum. That asymmetry is deliberate and worth saying out loud rather than
 * calling the whole product non-custodial.
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

/** `ReleaseWouldStrandDebt` is the one revert a person can act on, so it is the one that gets words. */
function explain(message: string): string {
  const first = message.split("\n")[0] ?? message;
  if (/ReleaseWouldStrandDebt/.test(message)) {
    return "That would leave you owing more than the rest of your collateral supports. Repay some of your balance first, or withdraw less.";
  }
  return first;
}

export function ReleaseCollateral({ id }: { id: string }) {
  const router = useRouter();
  const config = useConfig();
  const { assets, loading, refresh } = useRemoteCollateral();
  // A request the borrower has already made. Read rather than remembered, so leaving the screen
  // between asking and claiming does not erase every trace of it but a limit that dropped.
  const { items: withdrawals, refresh: refreshWithdrawals } = useRemoteWithdrawals();
  const { totalValue } = useCollateral();
  const { drawn, score } = useCreditLine();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync, data: hash, error, reset } = useWriteContract();
  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  // Everything that can fail before the wallet is even asked — switching chains, reading the message
  // fee, the receipt check afterwards — used to be caught and dropped, because the only error shown
  // was `useWriteContract`'s. A declined chain switch left the button idle with nothing said, which
  // is indistinguishable from the click not registering.
  const [failed, setFailed] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const asset = assets.find((a) => a.id.toLowerCase() === id.toLowerCase()) ?? null;

  if (loading && !asset) {
    return (
      <div className="stagger">
        <SubHeader title="Withdraw" />
        <Skeleton className="h-[72px] rounded-[16px]" />
      </div>
    );
  }
  // Nothing to take: either the id names an asset that was never listed, or it is listed and this
  // wallet has none of it. `useRemoteCollateral` returns every listed asset rather than only the
  // held ones, so a zero balance reaches here as a real asset and would otherwise be offered a
  // keypad that can only ever produce a disabled button. An approved-but-unclaimed release still
  // counts as something to do, even once the collateral has left the hub's books.
  if (!asset || (asset.credited <= 0n && asset.releasable <= 0n)) {
    return (
      <div className="stagger">
        <SubHeader title="Withdraw" />
        <p className="mt-8 text-center text-[13.5px] text-muted">
          {asset
            ? `Nothing of yours is held on ${asset.chainName}.`
            : "Nothing on this chain is backing your limit."}
        </p>
      </div>
    );
  }

  // BNB on BSC, AVAX on Fuji. Calling it ETH on the screen that hands money back is the same
  // mistake as calling it ETH on the one that takes it.
  const symbol = asset.native ? (NATIVE_SYMBOL[asset.wormholeChainId] ?? "ETH") : "USDC";
  const entered = parseAmount(amount, asset.decimals);
  // Requested and not yet taken. `approvedAt` is what separates "the guardians are signing" from
  // "the money is sitting in the vault waiting for you", and only the second is the borrower's move.
  const open = withdrawals.filter((w) => w.assetId.toLowerCase() === asset.id.toLowerCase());
  const awaitingGuardians = open.find((w) => w.approvedAt === null) ?? null;

  // What the debt allows, converted into this asset. Capped by what is actually credited: freeing
  // value says nothing about which asset it can come out of.
  const freeValue = releasableValue(totalValue ?? 0n, drawn ?? 0n, score ?? 0n);
  const byDebt = amountFromValue(freeValue, asset.decimals, asset.price);
  const max = byDebt < asset.credited ? byDebt : asset.credited;
  const exceeded = entered > max;

  const onRequest = async () => {
    if (busy || entered <= 0n || exceeded || !REMOTE_HUB) return;
    setBusy(true);
    setFailed(null);
    try {
      await switchChainAsync({ chainId: CREDITCOIN_CHAIN_ID });

      // Read rather than assumed: zero on this testnet today, and governance can change it.
      const core = await readContract(config, {
        address: REMOTE_HUB,
        abi: remoteHubAbi,
        functionName: "wormhole",
        chainId: CREDITCOIN_CHAIN_ID,
      });
      const fee = await readContract(config, {
        address: core,
        abi: wormholeCoreAbi,
        functionName: "messageFee",
        chainId: CREDITCOIN_CHAIN_ID,
      });

      const sent = await writeContractAsync({
        address: REMOTE_HUB,
        abi: remoteHubAbi,
        functionName: "requestRelease",
        args: [asset.wormholeChainId, asset.token, entered],
        value: fee,
        chainId: CREDITCOIN_CHAIN_ID,
      });
      await awaitSuccess(config, sent, CREDITCOIN_CHAIN_ID);
      setRequested(true);
      refresh();
      refreshWithdrawals();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const onClaim = async () => {
    const chainId = asset.evmChainId;
    const vault = asset.vault;
    if (busy || !chainId || !vault || asset.releasable <= 0n) return;
    setBusy(true);
    setFailed(null);
    try {
      await switchChainAsync({ chainId });
      const who = (await config.connectors[0]?.getAccounts().then((a) => a[0])) as Address;
      const token = `0x${asset.token.slice(26)}` as Address;

      const sent = asset.native
        ? await writeContractAsync({
            address: vault,
            abi: wormholeVaultAbi,
            functionName: "unlockNative",
            args: [asset.releasable],
            chainId,
          })
        : await writeContractAsync({
            address: vault,
            abi: wormholeVaultAbi,
            functionName: "unlockToken",
            args: [token, asset.releasable],
            chainId,
          });

      // Read back what the transaction was sent to change rather than trusting its receipt: these
      // RPCs return a status-1 receipt for transactions they afterwards report as unknown.
      await awaitSuccess(config, sent, chainId, async () => {
        const left = asset.native
          ? await readContract(config, {
              address: vault,
              abi: wormholeVaultAbi,
              functionName: "nativeReleasable",
              args: [who],
              chainId,
            })
          : await readContract(config, {
              address: vault,
              abi: wormholeVaultAbi,
              functionName: "tokenReleasable",
              args: [who, token],
              chainId,
            });
        return left < asset.releasable;
      });
      setClaimed(true);
      refresh();
      refreshWithdrawals();
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (claimed) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center">
          <TransactionStatus
            status="confirmed"
            size="large"
            href={hash && asset.explorer ? `${asset.explorer}/tx/${hash}` : undefined}
          />
          <p className="mt-5 max-w-[280px] text-center text-[13px] leading-snug text-muted">
            Your {symbol} is back in your wallet on {asset.chainName}.
          </p>
        </div>
        <Button
          onClick={() => {
            reset();
            router.push("/home");
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  // Step 2. Said plainly, because between the request and the signature nothing on Home changes
  // except the limit going down, and a screen that stayed silent would read as a withdrawal that
  // did not work.
  if ((requested || awaitingGuardians !== null) && asset.releasable <= 0n) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center">
          <TransactionStatus status="confirmed" size="large" />
          {awaitingGuardians ? (
            <p className="mt-4 text-[15px] font-semibold tabular-nums">
              {fmt(awaitingGuardians.amount, awaitingGuardians.decimals)} {symbol} on its way
            </p>
          ) : null}
          <p className="mt-3 max-w-[300px] text-center text-[13px] leading-snug text-muted">
            Creditcoin has published the release. The guardians sign it in under a minute on BSC and
            Fuji, and in fifteen to twenty minutes on the L2s. You sign once more to take it — come
            back to this screen and the button will be here.
          </p>
        </div>
        <Button onClick={() => router.push("/home")}>Done</Button>
      </div>
    );
  }

  // Step 3 leads whenever it is available, including on a fresh visit: an approved release the
  // borrower has not taken is the most actionable thing on this screen.
  if (asset.releasable > 0n) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title={`Withdraw ${symbol}`} />
        <Row asset={asset} symbol={symbol} />

        <div className="mt-3 rounded-[16px] border border-line bg-white px-4 py-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
          <div className="text-[13px] text-muted">Ready to withdraw</div>
          <div className="mt-1 text-[26px] font-semibold leading-none tracking-[-.02em] tabular-nums">
            {fmt(asset.releasable, asset.decimals)} {symbol}
          </div>
          <p className="mt-2.5 text-[12.5px] leading-snug text-muted">
            Approved on {asset.chainName}. It stays in the vault until you take it — the relay
            grants permission, it never sends.
          </p>
        </div>

        {error || failed ? (
          <TransactionStatus
            status="failed"
            detail={explain(error?.message ?? failed ?? "")}
            className="mt-3"
          />
        ) : null}

        <div className="mt-auto">
          <Button onClick={onClaim} disabled={busy || switching}>
            {switching ? (
              `Switching to ${asset.chainName}…`
            ) : busy ? (
              <PendingLabel status="signing" />
            ) : (
              `Withdraw ${fmt(asset.releasable, asset.decimals)} ${symbol}`
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title={`Withdraw ${symbol}`} />
      <Row asset={asset} symbol={symbol} />

      <Keypad
        value={amount}
        onChange={setAmount}
        symbol=""
        onQuick={(pct) =>
          setAmount(formatUnits((max * BigInt(Math.round(pct * 1000))) / 1000n, asset.decimals))
        }
        invalid={exceeded}
        hint={
          max < asset.credited
            ? `Your balance holds the rest. You can take ${fmt(max, asset.decimals)} ${symbol}`
            : `You have ${fmt(max, asset.decimals)} ${symbol} here`
        }
      />

      {max < asset.credited ? (
        <div className="mb-3 rounded-[16px] border border-line bg-white px-4 py-3 text-[12.5px] leading-snug text-warn [box-shadow:0_1px_2px_rgba(17,19,22,.04)]">
          {fmt(asset.credited - max, asset.decimals)} {symbol} of this is backing what you have
          already spent. Repay your balance to free it.
        </div>
      ) : null}

      {error || failed ? (
        <TransactionStatus
          status="failed"
          detail={explain(error?.message ?? failed ?? "")}
          className="mb-3"
        />
      ) : null}

      <div className="mt-auto">
        <Button onClick={onRequest} disabled={busy || switching || entered <= 0n || exceeded}>
          {switching ? (
            "Switching to Creditcoin…"
          ) : busy ? (
            <PendingLabel status="signing" />
          ) : (
            `Withdraw ${symbol}`
          )}
        </Button>
        <p className="mt-2 text-center text-[12px] leading-snug text-muted">
          Your limit drops now. The {symbol} comes back on {asset.chainName}, and you sign once more
          to take it.
        </p>
      </div>
    </div>
  );
}

function Row({ asset, symbol }: { asset: RemoteAsset; symbol: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
      <AssetIcon chainName={asset.chainName}>
        <CoinBadge token={badgeForSymbol(symbol)} size={34} />
      </AssetIcon>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{symbol}</div>
        <div className="mt-[2px] text-[12px] text-muted">
          {fmt(asset.credited, asset.decimals)} {symbol} backing your limit on {asset.chainName}
        </div>
      </div>
    </div>
  );
}
