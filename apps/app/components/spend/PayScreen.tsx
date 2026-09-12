"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useSwitchChain } from "wagmi";
import { useCreditLine } from "../../hooks/useCreditLine";
import { CREDITCOIN_CHAIN_ID, explorerTx } from "../../lib/comacard/contracts";
import { Button, TransactionStatus } from "../ui";
import { SubHeader } from "../ui/SubHeader";

/**
 * Paying the card balance off.
 *
 * **One button, for the whole balance, and that is a correctness decision rather than a
 * simplification.** Only a payment that clears the balance to zero closes a credit cycle and counts
 * toward the score; a partial payment reduces the debt and earns nothing. An amount field here
 * would invite the one action that quietly wastes the cycle, so there isn't one.
 *
 * **The sixty-second rule is the other trap.** `minCycleDuration` on the deployed line is 60
 * seconds, and a balance settled faster than that clears the debt while the score stays exactly
 * where it was — no error, no explanation. So the button waits, visibly, and says why. Someone who
 * spent and paid within a few seconds would otherwise conclude the scoring is broken.
 *
 * The exact amount matters too: `repay()` reverts when `msg.value` exceeds the debt, so the figure
 * is read from the account row rather than rounded for display and sent back.
 */

const MIN_CYCLE_SECONDS = 60;

const fmt = (value: bigint, digits = 4): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: digits });

export function PayScreen() {
  const router = useRouter();
  const { drawn, drawnAt, repay, txStatus, hash, error, reset, onCreditcoin } = useCreditLine();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [busy, setBusy] = useState(false);

  // Read after mount and ticked, never during render: a clock read while rendering bakes the
  // server's time into the HTML and makes the render impure.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // The first read is deferred to a frame rather than run in the effect body, which is what the
    // lint rule asks for and what `useTransactions` already does. Until it lands `now` is null and
    // the countdown simply does not render.
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    const frame = requestAnimationFrame(tick);
    const timer = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);

  const owed = drawn ?? 0n;
  const openedAt = Number(drawnAt ?? 0n);
  const heldFor = now !== null && openedAt > 0 ? now - openedAt : null;
  const secondsLeft = heldFor === null ? null : Math.max(0, MIN_CYCLE_SECONDS - heldFor);
  const tooSoon = secondsLeft !== null && secondsLeft > 0;

  const onPay = async () => {
    if (busy || owed <= 0n || tooSoon) return;
    setBusy(true);
    try {
      if (!onCreditcoin) await switchChainAsync({ chainId: CREDITCOIN_CHAIN_ID });
      await repay(owed);
    } catch {
      // Surfaced through `txStatus`; caught only to stop an unhandled rejection.
    } finally {
      setBusy(false);
    }
  };

  if (txStatus === "confirmed") {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center">
          <TransactionStatus
            status="confirmed"
            size="large"
            href={hash ? explorerTx(CREDITCOIN_CHAIN_ID, hash) : undefined}
          />
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

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title="Pay" />

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="text-[15px] font-medium text-muted">You owe</div>
        <div className="mt-2 whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] tabular-nums">
          {fmt(owed)} tCTC
        </div>
        {owed > 0n ? (
          <p className="mt-4 max-w-[260px] text-center text-[12.5px] leading-snug text-muted">
            Paying the full balance is what closes the cycle and raises your score. Part of it
            settles the debt and counts for nothing.
          </p>
        ) : null}
      </div>

      {txStatus ? (
        <TransactionStatus
          status={txStatus}
          detail={error ? error.message.split("\n")[0] : undefined}
          href={hash ? explorerTx(CREDITCOIN_CHAIN_ID, hash) : undefined}
          className="mb-3"
        />
      ) : null}

      <div className="mt-auto">
        {owed <= 0n ? (
          <Button onClick={() => router.push("/home")}>Back to home</Button>
        ) : (
          <>
            <Button onClick={onPay} disabled={busy || switching || tooSoon}>
              {switching
                ? "Switching…"
                : busy
                  ? "Confirm in your wallet…"
                  : tooSoon
                    ? `Wait ${secondsLeft}s`
                    : `Pay ${fmt(owed)} tCTC`}
            </Button>
            {tooSoon ? (
              <p className="mt-2 text-center text-[12px] leading-snug text-muted">
                A cycle has to stay open for a minute before it counts. Paying now would settle the
                balance and leave your score where it is.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
