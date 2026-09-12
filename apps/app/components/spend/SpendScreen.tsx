"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useSwitchChain } from "wagmi";
import { useCreditLine } from "../../hooks/useCreditLine";
import { CREDITCOIN_CHAIN_ID, explorerTx } from "../../lib/comacard/contracts";
import { Button, Keypad, TransactionStatus } from "../ui";
import { SubHeader } from "../ui/SubHeader";

/**
 * Spending against the card's limit.
 *
 * The contract calls this `draw`, and nothing here does. A cardholder spends; only a lender draws,
 * and naming the button after the ledger entry rather than the act is how a screen ends up
 * needing a glossary. The same goes for the rest of this surface: the balance is what you owe, not
 * "outstanding principal", and settling it is paying, not repaying a facility.
 *
 * What it actually does is honest about where the money goes: there is no merchant in this demo,
 * so the CTC lands in the holder's own wallet on Creditcoin. The copy says that rather than
 * implying a purchase happened somewhere.
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
      <SubHeader title="Spend" />

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

      {txStatus ? (
        <TransactionStatus
          status={txStatus}
          detail={error ? error.message.split("\n")[0] : undefined}
          href={hash ? explorerTx(CREDITCOIN_CHAIN_ID, hash) : undefined}
          className="mb-3"
        />
      ) : null}

      <div className="mt-auto">
        <Button onClick={onSpend} disabled={busy || switching || entered <= 0n || exceeded}>
          {switching ? "Switching…" : busy ? "Confirm in your wallet…" : "Spend"}
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
