/* eslint-disable @next/next/no-img-element -- tiny static icons that must paint the moment
   they appear; next/image defers them, and one mishandles a local SVG. The biome-ignore
   comments below have to sit directly above each tag, so a second next-line directive
   cannot also be there, hence file scope. */
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button, CoinBadge, Toast } from "../components/ui";
import type { TokenSym } from "../components/ui/CoinBadge";
import { useWallet } from "../hooks/useWallet";
import { migrateStorageKeys, STORAGE } from "../lib/storage";
import { USER_CLOSED_MODAL, WalletError } from "../lib/wallet-error";
import styles from "./Onboarding.module.css";

type TourScreen = {
  title: string;
  body: string;
  visual: ReactNode;
};

const ONBOARDING_DONE_KEY = STORAGE.onboardingDone;

/**
 * Three beats, in the order the product works: put something down, watch the limit it buys grow as
 * you repay, spend it. Copy picked by Axel.
 */
const TOUR: TourScreen[] = [
  {
    title: "Put down what you\nalready hold",
    body: "Lock an asset on its own chain. It stays there, and your card is sized against it",
    visual: <CollateralVisual />,
  },
  {
    title: "Your limit is earned,\nnot bought",
    body: "Repay in full and the same collateral buys a bigger limit next time",
    visual: <LimitChartVisual />,
  },
  {
    title: "Spend it\nlike a card",
    body: "What the card is allowed is yours to spend. Pay it back and you keep it",
    visual: <CardVisual />,
  },
];

export default function Landing() {
  // Outside `WalletProvider`, so this screen runs the one-time key move itself.
  migrateStorageKeys();
  const router = useRouter();
  const { connect, address, hydrated } = useWallet();
  const [mode, setMode] = useState<"tour" | "connect" | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // A returning user with a re-verified session skips onboarding entirely (STE-43). The wallet is
  // hydrated (and verified) in WalletProvider, so we only react to it here. `replace`, not `push`,
  // keeps the landing out of history so Back from /home doesn't return to onboarding.
  useEffect(() => {
    if (hydrated && address) router.replace("/home");
  }, [hydrated, address, router]);

  useEffect(() => {
    if (!hydrated || address) return;
    let nextMode: "tour" | "connect" = "tour";
    try {
      nextMode = window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1" ? "connect" : "tour";
    } catch {
      nextMode = "tour";
    }
    const id = window.setTimeout(() => setMode(nextMode), 0);
    return () => window.clearTimeout(id);
  }, [hydrated, address]);

  // Auto-dismiss the connect-error toast so it doesn't linger.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  // Keep `/` as a splash/router while WalletProvider re-verifies a saved session.
  if (!hydrated || address || mode === null) return <SplashScreen />;

  async function onConnect() {
    setError(null);
    try {
      await connect();
      router.replace("/home");
    } catch (e) {
      // Dismissing the wallet picker (kit code -1) isn't a failure, so stay quiet.
      if (e instanceof WalletError && e.code === USER_CLOSED_MODAL) return;
      setError(e instanceof Error ? e.message : "Couldn't connect your wallet. Please try again.");
    }
  }

  const finishOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    } catch {
      /* storage can be unavailable; still let the user continue */
    }
    setMode("connect");
  };

  if (mode === "connect") {
    return <ConnectScreen error={error} onBack={() => setMode("tour")} onConnect={onConnect} />;
  }

  const last = step === TOUR.length - 1;
  const t = TOUR[step];

  return (
    <main className={`${styles.screen} ${styles.tourScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          {step > 0 ? (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setStep(step - 1)}
              className={styles.backButton}
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          ) : (
            <span aria-hidden="true" className={styles.headerSpacer} />
          )}
          <BrandMark compact />
          <button type="button" className={styles.skipButton} onClick={finishOnboarding}>
            Skip
          </button>
        </header>

        <section className={styles.tourBody}>
          <div key={step} className={styles.visualStage}>
            {t.visual}
          </div>
          <div className={styles.tourCopy}>
            <h1 className={styles.tourTitle}>{t.title}</h1>
            <p className={styles.tourText}>{t.body}</p>
            <Stepper current={step} total={TOUR.length + 1} />
          </div>
        </section>

        <div className={styles.ctaStack}>
          <Button
            onClick={() => {
              if (!last) {
                setStep(step + 1);
                return;
              }
              finishOnboarding();
            }}
          >
            {last ? "Continue" : "Next"}
          </Button>
        </div>
        <Toast open={!!error} message={error ?? ""} />
      </div>
    </main>
  );
}

function SplashScreen() {
  return (
    <main className={`${styles.screen} ${styles.splashScreen}`} aria-label="Loading Comacard">
      <BrandMark />
      <span className={styles.splashPulse} aria-hidden="true" />
    </main>
  );
}

function ConnectScreen({
  error,
  onBack,
  onConnect,
}: {
  error: string | null;
  onBack: () => void;
  onConnect: () => void;
}) {
  return (
    <main className={`${styles.screen} ${styles.tourScreen} ${styles.connectScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          <button type="button" aria-label="Back" onClick={onBack} className={styles.backButton}>
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <BrandMark compact />
          <span aria-hidden="true" className={styles.headerSpacer} />
        </header>

        <section className={styles.tourBody}>
          <div
            key="connect-wallet"
            className={`${styles.visualStage} ${styles.connectVisualStage}`}
          >
            <div className={styles.connectVisual} aria-hidden="true">
              <WalletIcon kind="metamask" />
              <WalletIcon kind="walletconnect" />
              <WalletIcon kind="ledger" />
              <WalletIcon kind="rabby" />
              <span className={styles.walletShadow} />
            </div>
          </div>
          <div className={styles.tourCopy}>
            <h1>Connect your wallet</h1>
            {/* "open your card", not "start earning". The old line promised a yield this product
                does not pay, on the last screen before somebody decides. It survived the sweep that
                removed the ported product's name because the name was what the sweep looked for and
                the promise is not a name. */}
            <p>Link your wallet to open your card.</p>
            <Stepper current={3} total={TOUR.length + 1} />
          </div>
        </section>
        <div className={styles.ctaStack}>
          <Button onClick={onConnect}>Connect wallet</Button>
        </div>
        <Toast open={!!error} message={error ?? ""} />
      </div>
    </main>
  );
}

function WalletIcon({ kind }: { kind: "metamask" | "walletconnect" | "ledger" | "rabby" }) {
  const src = {
    metamask: "/wallets/metamask.png",
    walletconnect: "/wallets/walletconnect.png",
    ledger: "/wallets/ledger.png",
    rabby: "/wallets/rabby.png",
  }[kind];

  return (
    <span className={`${styles.walletFloat} ${styles[`wallet${kind}`]}`}>
      {/* biome-ignore lint/performance/noImgElement: static asset that must paint the moment the step appears; next/image defers it */}
      <img src={src} alt="" className={styles.walletIconImage} />
    </span>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.brand} ${compact ? styles.brandCompact : ""}`}>
      <Image
        src="/brand/comacard-logo.png"
        alt="Comacard"
        width={1024}
        height={1024}
        className={styles.brandLogo}
        priority
      />
    </div>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    // A step indicator is a progress bar, not a group of controls, which is
    // both the honest role and the one that carries the numbers.
    <div
      className={styles.stepper}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Onboarding step ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length literal array, the index is the identity
        <span key={i} className={i === current ? styles.stepActive : ""} />
      ))}
    </div>
  );
}

/**
 * Three assets a holder could put down, each named with the chain it stays on.
 *
 * The chain is the second line rather than a yield figure, because the chain is the claim this
 * screen is making: the asset does not move. It also matches the "Assets held" card the holder
 * meets on Home, so the first thing they see in the tour is the thing they will actually use.
 */
function CollateralVisual() {
  return (
    <div className={styles.assetStack} aria-hidden="true">
      <AssetRow asset="USDT" chain="BSC Testnet" value="1,200.00" token="USDT" />
      <AssetRow asset="CTC" chain="Creditcoin" value="5,420.00" token="CTC" highlight />
      <AssetRow asset="USDC" chain="Ethereum Sepolia" value="2,416.00" token="USDC" />
    </div>
  );
}

/**
 * The card, and the one figure a holder spends against.
 *
 * The two screens before this are about what backs the card and how the limit grows. This one is
 * the proof it can be used: the phone shows Home as it actually renders, and the floating card is
 * a draw that has happened with the repayment still to come, because a limit nobody has spent is
 * a claim rather than a card.
 */
function CardVisual() {
  return (
    <div className={styles.agentPanel} aria-hidden="true">
      <div className={styles.phoneMock}>
        <div className={styles.phoneIsland} />
        <div className={styles.phoneContent}>
          <div className={styles.homeHeroMini}>
            <span>Spendable</span>
            <b>35.0097 tCTC</b>
            <em>of 41.4594 allowed</em>
          </div>
          <div className={styles.homeButtonMini}>Send</div>
          <span className={styles.homeSectionMini}>Your card</span>
          <div className={styles.cardMini}>
            <span className={styles.cardMiniChip} />
            <b>Comacard</b>
            <em>0000 0000 0000 5058</em>
          </div>
        </div>
      </div>
      <div className={styles.safeExitCard}>
        <span className={styles.safeExitIcon}>
          <svg
            aria-hidden="true"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div className={styles.safeExitText}>
          <strong>Spent 13 tCTC</strong>
          <span>Pay it back to close the cycle</span>
        </div>
        <b>Repay</b>
      </div>
    </div>
  );
}

function LimitChartVisual() {
  const bars = [28, 34, 42, 49, 55, 62, 68, 73, 79, 84, 89, 94];
  return (
    <div className={styles.chartPanel} aria-hidden="true">
      <div className={styles.chartHeader}>
        <div>
          <span>Your limit</span>
          <strong>41.4594 tCTC</strong>
        </div>
        <b>score 42</b>
      </div>
      <div className={styles.earningBars}>
        {bars.map((height, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length literal array, the index is the identity
          <span key={i} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  chain,
  value,
  token,
  highlight = false,
  loading = false,
}: {
  asset: string;
  /** Where it stays. This is the point of the screen, so it gets the second line. */
  chain: string;
  value: string;
  token: TokenSym;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`${styles.assetRow} ${highlight ? styles.assetRowActive : ""}`}>
      {loading ? (
        <span className={styles.tokenSkeleton} />
      ) : (
        <CoinBadge token={token} size={44} className={styles.tokenLogo} />
      )}
      {loading ? (
        <>
          <span className={`${styles.assetText} ${styles.assetSkeletonText}`}>
            <i />
            <i />
          </span>
          <span className={`${styles.assetValue} ${styles.assetSkeletonValue}`}>
            <i />
            <i />
          </span>
        </>
      ) : (
        <>
          <span className={styles.assetText}>
            <strong>{asset}</strong>
            <span className={styles.assetChain}>{chain}</span>
          </span>
          <span className={styles.assetValue}>
            <b>{value}</b>
          </span>
        </>
      )}
    </div>
  );
}
