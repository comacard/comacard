"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useSwitchChain } from "wagmi";
import { useCreditLine } from "../../hooks/useCreditLine";
import { CREDITCOIN_CHAIN_ID, explorerTx } from "../../lib/comacard/contracts";
import { Button, Keypad, PendingLabel, TransactionStatus } from "../ui";
import { SubHeader } from "../ui/SubHeader";

/**
 * Drawing against the card's limit, into the holder's own wallet.
 *
 * **Titled "To my wallet", not "Spend".** This screen is what `SendPicker`'s first row opens, so it
 * carries that row's words: a title that renamed itself between the tap and the screen would read
 * as a different destination. The old title was "Spend", and it was the more flattering word and
 * the less true one — there is no merchant and no payment rail here, so the tCTC lands in the
 * holder's own wallet, a cash advance rather than a purchase. The line under the button has always
 * said so; the title now agrees with it.
 *
 * The file keeps the name `SpendScreen`, and `SpentTotal` keeps "Spent from your card". Those name
 * a limit consumed, which is still the right word for a card meant to be spent at a merchant one
 * day; "Send" describes only what this particular control does today.
 *
 * Both writes here are on **Creditcoin**, not Sepolia. That is the opposite of the deposit screen,
 * and getting it backwards produces a signature that fails on a chain mismatch, so the switch is
 * done for the user instead of being asked for.
 */

function parse(text: string): bigint {
  try {
    return parseUnits(text === "" || text === "." ? "0" : text, 18);
  } catch {
    return 0n;
  }
}

const fmt = (value: bigint, digits = 4): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: digits });

export function SpendScreen() {
  const router = useRouter();
  const { available, draw, txStatus, hash, error, reset, onCreditcoin } = useCreditLine();
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);

  const ceiling = available ?? 0n;
  const entered = parse(amount);
  const exceeded = entered > ceiling;

  const onSpend = async () => {
    if (busy || entered <= 0n || exceeded) return;
    setBusy(true);
    try {
      if (!onCreditcoin) await switchChainAsync({ chainId: CREDITCOIN_CHAIN_ID });
      await draw(entered);
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
      <SubHeader title="To my wallet" />

      <p className="mb-1 text-center text-[13px] text-muted">
        {fmt(ceiling)} tCTC available on your card
      </p>

      <Keypad
        value={amount}
        onChange={setAmount}
        symbol=""
        onQuick={(pct) =>
          setAmount(formatUnits((ceiling * BigInt(Math.round(pct * 1000))) / 1000n, 18))
        }
        invalid={exceeded}
        hint={`Your card has ${fmt(ceiling)} tCTC`}
      />

      {/* Only `failed` gets a pill. It carries a reason and an explorer link, which have nowhere to
          go inside a button; the in-flight states report from the button itself. */}
      {txStatus === "failed" ? (
        <TransactionStatus
          status="failed"
          detail={error ? error.message.split("\n")[0] : undefined}
          href={hash ? explorerTx(CREDITCOIN_CHAIN_ID, hash) : undefined}
          className="mb-3"
        />
      ) : null}

      <div className="mt-auto">
        <Button onClick={onSpend} disabled={busy || switching || entered <= 0n || exceeded}>
          {switching ? (
            "Switching…"
          ) : busy ? (
            <PendingLabel status={txStatus === "confirming" ? "confirming" : "signing"} />
          ) : (
            "Send"
          )}
        </Button>
        {/* Said before the signature, not after. There is no merchant in this demo, and a screen
            that implied a purchase would leave the holder looking for one. */}
        <p className="mt-2 text-center text-[12px] text-muted">
          The tCTC arrives in your wallet. You pay it back to raise your limit.
        </p>
      </div>
    </div>
  );
}
