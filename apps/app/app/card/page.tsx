"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "../../components/AuthGate";
import { CardArtwork } from "../../components/card/CardArtwork";
import { CardFolder } from "../../components/motion/card-folder";
import { Button, SubHeader, Toast } from "../../components/ui";
import { useCardAccount } from "../../hooks/useCardAccount";
import { useWallet } from "../../hooks/useWallet";
import { startKyc } from "../../lib/comacard/api";

/**
 * The card screen: one card in a beUI folder, and the single next step for whoever is looking at it.
 *
 * This route is intentionally standalone rather than inside `(app)` or `(flow)`. `(app)` would put it
 * under the three-tab nav and `(flow)` bounces every desktop visitor to /home; both would mean editing
 * a shared file to make room for it. Nothing that already renders changes because this file exists.
 *
 * The folder is deliberately NOT `disabled` while the card is unissued: that prop drops the whole
 * component to `opacity-50`, which turns the black card a washed grey and reads as a rendering bug
 * rather than as an empty wallet. The masked digits already say there is nothing to reveal.
 *
 * The card is never fabricated. Issuance (number, expiry, CVV) is a separate backend endpoint that
 * does not exist yet, so until `card.number` arrives the folder renders its masked state and the
 * status block says why. A card is a claim about a real identity; a plausible-looking placeholder is
 * the one thing this screen must not show.
 */

type Step = {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
};

export default function CardPage() {
  return (
    <AuthGate>
      <main className="relative min-h-dvh bg-bg px-5 pb-10 pt-[52px]">
        <CardScreen />
      </main>
    </AuthGate>
  );
}

function CardScreen() {
  const { address } = useWallet();
  const { account, error, loading, refresh } = useCardAccount();
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Didit runs in its own tab and reports the verdict through a webhook, so the answer never comes
  // back to the call that opened it. Re-reading whenever this tab regains focus is what turns a
  // finished verification into an unlocked card without asking the user to reload.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const verify = useCallback(async () => {
    if (!address) return;
    setStarting(true);
    const result = await startKyc(address);
    setStarting(false);
    if (!result.ok) {
      setToast(`Could not start verification: ${result.message}`);
      return;
    }
    window.open(result.value.url, "_blank", "noopener,noreferrer");
  }, [address]);

  const holder = account?.card.holder ?? "Comacard holder";
  const step = describe({ account, error, loading, verify, starting });

  return (
    <>
      <div className="stagger">
        <SubHeader title="Your card" />

        <div className="flex justify-center py-2">
          <CardFolder
            title={holder}
            cardNumber={account?.card.number ?? ""}
            expiry={account?.card.expiry ?? "••/••"}
            cvv={account?.card.cvv ?? "•••"}
            detailsVisible={detailsVisible}
            onDetailsVisibleChange={setDetailsVisible}
            className="w-full max-w-[340px]"
            card={
              <CardArtwork
                holder={holder}
                number={account?.card.number}
                expiry={account?.card.expiry}
                detailsVisible={detailsVisible}
              />
            }
          />
        </div>

        <section className="mt-7 rounded-[16px] border border-line bg-white px-4 py-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
          <h2 className="text-[15px] font-semibold">{step.title}</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted">{step.body}</p>
          {step.action ? (
            <Button
              type="button"
              className="mt-4"
              onClick={step.action.onClick}
              disabled={step.action.disabled || step.action.busy}
            >
              {step.action.busy ? "Opening…" : step.action.label}
            </Button>
          ) : null}
        </section>

        {account?.credit ? (
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="Score" value={String(account.credit.score)} />
            <Stat label="Limit" value={`${account.credit.limitCtc} CTC`} />
            <Stat label="Spendable" value={`${account.card.spendableCtc} CTC`} />
          </dl>
        ) : null}
      </div>

      {/* Outside `.stagger`: `.stagger > *` animates every direct child to `opacity: 1`, and an
          animation beats a utility class, so a Toast in there stays visible with an empty message. */}
      <Toast open={!!toast} message={toast ?? ""} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-white px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="mt-1 truncate text-[13px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * One state, one sentence, one thing to do. The order is the product's order: identity first,
 * then issuance, then credit. Whatever the user can act on now is what the block offers.
 */
function describe({
  account,
  error,
  loading,
  verify,
  starting,
}: {
  account: ReturnType<typeof useCardAccount>["account"];
  error: string | null;
  loading: boolean;
  verify: () => void;
  starting: boolean;
}): Step {
  if (loading) return { title: "Checking your card", body: "One moment." };

  if (!account) {
    return {
      title: "Card status unavailable",
      body: error ?? "We could not reach the card backend, so we cannot say whether your card is active.",
    };
  }

  if (!account.kyc.verified) {
    const started = account.kyc.sessionId !== null;
    return {
      title: "Verify your identity first",
      body: started
        ? "Your verification is still being reviewed. This page updates itself when the result arrives."
        : "A card can only be issued to a verified person. Verification takes a few minutes and happens with our identity provider.",
      action: { label: started ? "Continue verification" : "Verify identity", onClick: verify, busy: starting },
    };
  }

  if (!account.card.number) {
    return {
      title: "You are verified",
      body: "Your card has not been issued yet. Card issuance is still being built, so there is no card number to show.",
      action: { label: "Activate card", onClick: () => undefined, disabled: true },
    };
  }

  if (account.card.reason === "overdue") {
    return {
      title: "Card paused",
      body: "Your repayment is past due, so the card cannot be used until the balance is settled.",
    };
  }

  if (account.card.reason === "no_credit") {
    return {
      title: "No credit available",
      body: "Lock collateral to raise your limit. Nothing can be spent until there is available credit.",
    };
  }

  return {
    title: "Card is active",
    body: `You can spend up to ${account.card.spendableCtc} CTC.`,
  };
}
