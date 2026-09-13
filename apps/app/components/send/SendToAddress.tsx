"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUnits, isAddress, parseUnits } from "viem";
import { useConfig, useSendTransaction, useSwitchChain } from "wagmi";
import { useCreditLine } from "../../hooks/useCreditLine";
import { CREDITCOIN_CHAIN_ID, explorerTx } from "../../lib/comacard/contracts";
import { awaitSuccess } from "../../lib/comacard/tx";
import { Button, Keypad, PendingLabel, TransactionStatus } from "../ui";
import { SubHeader } from "../ui/SubHeader";
import { QrScanButton } from "./QrScanButton";

/**
 * Sending credit on to someone else, which is two transactions and is presented as two.
 *
 * `draw()` ends in `Address.sendValue(payable(msg.sender), amount)`. The credit line pays the
 * borrower and nobody else, so reaching another wallet means drawing first and then transferring —
 * an ordinary native send the credit line knows nothing about. Collapsing the two into one button
 * would be claiming a transfer feature this product does not have, and the second signature would
 * arrive as a surprise.
 *
 * **The address is checked, and the network is stated.** tCTC is Creditcoin's native coin and EVM
 * addresses are the same shape everywhere, so an Ethereum address pastes cleanly and the transfer
 * succeeds — on Creditcoin, to an address whose owner may have no Creditcoin wallet. That is the
 * expensive mistake available on this screen and the easy one to make, so the chain is named next to
 * the field rather than assumed.
 */

const fmt = (value: bigint, digits = 4): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: digits });

function parse(text: string): bigint {
  try {
    return parseUnits(text === "" || text === "." ? "0" : text, 18);
  } catch {
    return 0n;
  }
}

export function SendToAddress() {
  const router = useRouter();
  const config = useConfig();
  const { available, draw, onCreditcoin } = useCreditLine();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0");
  const [step, setStep] = useState<"address" | "amount" | "done">("address");
  const [phase, setPhase] = useState<"idle" | "drawing" | "sending">("idle");
  const [failed, setFailed] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  const ceiling = available ?? 0n;
  const entered = parse(amount);
  const exceeded = entered > ceiling;
  const valid = isAddress(to.trim());

  const onSend = async () => {
    if (phase !== "idle" || entered <= 0n || exceeded || !valid) return;
    setFailed(null);
    // Local, not the state: `phase` inside the catch is whatever it was when this closure was
    // created, so reading it there would always say "idle" and mis-report which half failed.
    let reached: "draw" | "transfer" = "draw";
    try {
      if (!onCreditcoin) await switchChainAsync({ chainId: CREDITCOIN_CHAIN_ID });

      // One: the credit line pays this wallet. Nothing can skip it.
      setPhase("drawing");
      const drawn = await draw(entered);
      await awaitSuccess(config, drawn, CREDITCOIN_CHAIN_ID);

      // Two: an ordinary transfer of what just arrived. A separate signature, and said so up front.
      reached = "transfer";
      setPhase("sending");
      const sent = await sendTransactionAsync({
        to: to.trim() as `0x${string}`,
        value: entered,
        chainId: CREDITCOIN_CHAIN_ID,
      });
      await awaitSuccess(config, sent, CREDITCOIN_CHAIN_ID);

      setHash(sent);
      setStep("done");
    } catch (cause) {
      // The draw may have landed while the transfer did not, and that is worth saying exactly:
      // the money is in their wallet, not lost.
      setFailed(
        reached === "transfer"
          ? "The credit reached your wallet but the transfer did not. Nothing is lost — send it from your wallet, or try again."
          : cause instanceof Error
            ? cause.message.split("\n")[0]
            : String(cause),
      );
    } finally {
      setPhase("idle");
    }
  };

  if (step === "done") {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center">
          <TransactionStatus
            status="confirmed"
            size="large"
            href={hash ? explorerTx(CREDITCOIN_CHAIN_ID, hash) : undefined}
          />
          <p className="mt-5 max-w-[280px] text-center text-[13px] leading-snug text-muted">
            {fmt(entered)} tCTC sent. You owe it back to your card, whoever ends up holding it.
          </p>
        </div>
        <Button onClick={() => router.push("/home")}>Done</Button>
      </div>
    );
  }

  if (step === "address") {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title="To another wallet" />

        <div
          className={`flex items-center gap-2 rounded-[16px] border bg-white px-4 py-3 ${
            to && !valid ? "border-neg" : "border-line"
          }`}
        >
          <label className="min-w-0 grow">
            <span className="block text-[11.5px] font-medium text-muted">Wallet address</span>
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className="mt-0.5 w-full bg-transparent font-mono text-[14px] outline-none placeholder:text-faint"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard
                .readText()
                .then(setTo)
                .catch(() => {})
            }
            className="h-9 shrink-0 rounded-full bg-pill px-3.5 text-[13px] font-semibold text-pill-ink"
          >
            Paste
          </button>
          <QrScanButton onFound={setTo} />
        </div>

        {to && !valid ? (
          <p className="mt-2 px-1 text-[12px] text-neg">That is not a wallet address.</p>
        ) : (
          // The mistake this screen makes easy, named before it is made.
          <p className="mt-2 px-1 text-[12px] leading-snug text-muted">
            Goes to this address <strong className="font-semibold">on Creditcoin</strong>. An
            address from another network has the same shape and will still accept it — the money
            lands where nobody can reach it.
          </p>
        )}

        <div className="mt-auto">
          <Button onClick={() => setStep("amount")} disabled={!valid}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title="To another wallet" />

      <p className="mb-1 text-center text-[13px] text-muted">
        To <span className="font-mono">{`${to.slice(0, 6)}…${to.slice(-4)}`}</span> · {fmt(ceiling)}{" "}
        tCTC available
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

      {failed ? <TransactionStatus status="failed" detail={failed} className="mb-3" /> : null}

      <div className="mt-auto">
        <Button
          onClick={onSend}
          disabled={phase !== "idle" || switching || entered <= 0n || exceeded}
        >
          {switching ? (
            "Switching…"
          ) : phase === "drawing" ? (
            <PendingLabel status="signing" />
          ) : phase === "sending" ? (
            <PendingLabel status="confirming" />
          ) : (
            "Send"
          )}
        </Button>
        <p className="mt-2 text-center text-[12px] leading-snug text-muted">
          Two signatures: the credit reaches your wallet, then goes on. You pay it back either way.
        </p>
      </div>
    </div>
  );
}
