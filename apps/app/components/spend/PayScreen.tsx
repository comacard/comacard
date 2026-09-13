"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useSwitchChain } from "wagmi";
import { useCreditLine } from "../../hooks/useCreditLine";
import { quickAmount } from "../../lib/comacard/amount";
import { CREDITCOIN_CHAIN_ID, explorerTx } from "../../lib/comacard/contracts";
import { Button, Keypad, PendingLabel, TransactionStatus } from "../ui";
import { SubHeader } from "../ui/SubHeader";

/**
 * Repaying the card balance.
 *
 * **The amount is typed, and Max is exact.** This was one button for the whole balance, on the
 * grounds that only a payment clearing the balance closes a cycle and a partial one earns nothing.
 * That is true about the scoring and it was the wrong reason: a card does not refuse a payment
 * because it earns the payer nothing, and a person who can pay half should be able to.
 *
 * Max does not go through `quickAmount`. Every other screen can round a quick amount down and lose
 * a speck harmlessly; here the last wei is the difference between closing a cycle and not, so
 * pressing Max records that it was pressed and sends `undefined`, which makes `repay` use the debt
 * it reads from the chain itself.
 *
 * **The sixty-second rule is the other trap.** `minCycleDuration` on the deployed line is 60
 * seconds, and a balance settled faster than that clears the debt while the score stays exactly
 * where it was: no error, no explanation. So the button waits, visibly, and says why. Someone who
 * spent and paid within a few seconds would otherwise conclude the scoring is broken.
 *
 * The exact amount matters either way: `repay()` reverts when `msg.value` exceeds the debt rather
 * than refunding, so `repay` re-reads the account row one call before sending and clamps to it.
 */

const MIN_CYCLE_SECONDS = 60;

/**
 * The one repayment revert a person can do something about.
 *
 * `RepaymentExceedsDebt(sent, outstanding)` carries both figures, so the screen can say which is
 * which instead of "transaction failed". It should be unreachable now that `repay` re-reads the
 * debt before sending, but the contract is the authority and a race is still a race.
 */
function explainRepay(message: string): string {
  if (/RepaymentExceedsDebt/.test(message)) {
    return "Your balance moved while this was being sent. Nothing was paid. Open the screen again and it will settle the new figure.";
  }
  return message.split("\n")[0] ?? message;
}

function parse(text: string): bigint {
  try {
    return parseUnits(text === "" || text === "." ? "0" : text, 18);
  } catch {
    return 0n;
  }
}

const fmt = (value: bigint, digits = 4): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: digits });

export function PayScreen() {
  const router = useRouter();
  const { drawn, drawnAt, repay, txStatus, hash, error, reset, onCreditcoin } = useCreditLine();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [busy, setBusy] = useState(false);
  // The chain switch and the fresh debt read both sit outside `useWriteContract`, so their failures
  // reached `txStatus` as nothing at all.
  const [failed, setFailed] = useState<string | null>(null);
  const [amount, setAmount] = useState("0");
  /**
   * Max was pressed and the field has not been edited since.
   *
   * Carried as a flag rather than inferred by comparing the typed figure to the balance, because
   * the typed figure is a rounded decimal string and the balance is wei: they will not match, and a
   * person who types the displayed balance by hand has not asked to clear the cycle to the wei.
   */
  const [wantsAll, setWantsAll] = useState(false);

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

  const entered = parse(amount);
  const exceeded = entered > owed;
  /**
   * In flight, from the first tap to the receipt.
   *
   * `busy` alone was the bug: it clears the moment `writeContractAsync` resolves, which is when the
   * wallet is signed rather than when the transaction lands. For the four-ish seconds Creditcoin
   * takes to mine it, the button went back to reading "Repay 13 tCTC" as though nothing had
   * happened, and then the success screen appeared out of nowhere. `txStatus` covers that gap.
   */
  const pending = busy || txStatus === "signing" || txStatus === "confirming";

  const onPay = async () => {
    if (pending || owed <= 0n || tooSoon || entered <= 0n || exceeded) return;
    setBusy(true);
    setFailed(null);
    try {
      if (!onCreditcoin) await switchChainAsync({ chainId: CREDITCOIN_CHAIN_ID });
      // `undefined` for Max, so `repay` sends the debt it reads from the chain rather than the
      // rounded decimal on this screen. Anything else goes as typed and is clamped there.
      await repay(wantsAll ? undefined : entered);
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (txStatus === "confirmed") {
    return (
      <div className="flex flex-1 flex-col">
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
    <div className="flex flex-1 flex-col">
      <SubHeader title="Repay" />

      {owed <= 0n ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="text-[15px] font-medium text-muted">Current balance</div>
            <div className="mt-2 whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] tabular-nums">
              0 tCTC
            </div>
          </div>
          <Button onClick={() => router.push("/home")}>Back to home</Button>
        </>
      ) : (
        <>
          {/* "Current balance", the same words this screen already uses in its zero state a few
              lines up, so one screen does not call one figure by two names. */}
          <p className="mb-1 text-center text-[13px] text-muted">
            Current balance {fmt(owed)} tCTC
          </p>

          <Keypad
            value={amount}
            onChange={(next) => {
              setAmount(next);
              // Typing after Max means the figure is now theirs, so the exact-balance shortcut no
              // longer applies.
              setWantsAll(false);
            }}
            symbol=""
            onQuick={(pct) => {
              setWantsAll(pct === 1);
              setAmount(pct === 1 ? fmt(owed, 18) : quickAmount(owed, pct, 18));
            }}
            invalid={exceeded}
            hint={`Your balance is ${fmt(owed)} tCTC`}
          />

          {failed ? (
            <TransactionStatus status="failed" detail={explainRepay(failed)} className="mb-3" />
          ) : null}

          {txStatus === "failed" ? (
            <TransactionStatus
              status="failed"
              detail={error ? error.message.split("\n")[0] : undefined}
              href={hash ? explorerTx(CREDITCOIN_CHAIN_ID, hash) : undefined}
              className="mb-3"
            />
          ) : null}

          <div className="mt-auto">
            <Button
              onClick={onPay}
              disabled={pending || switching || tooSoon || entered <= 0n || exceeded}
            >
              {switching ? (
                "Switching…"
              ) : pending ? (
                <PendingLabel status={txStatus === "confirming" ? "confirming" : "signing"} />
              ) : tooSoon ? (
                `Wait ${secondsLeft}s`
              ) : (
                "Repay"
              )}
            </Button>
            {tooSoon ? (
              <p className="mt-2 text-center text-[12px] leading-snug text-muted">
                A cycle has to stay open for a minute before it counts. Paying now would settle the
                balance and leave your score where it is.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
