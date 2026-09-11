"use client";
import { useEffect } from "react";
import { Button, Card, Skeleton, Toast } from "../../../components/ui";
import { useNav } from "../../../hooks/useNav";
import { AssetHero } from "../../../components/home/AssetHero";
import { AssetRow } from "../../../components/home/AssetRow";
import { ActivityList } from "../../../components/activity/ActivityList";
import { useWalletAssets } from "../../../hooks/useWalletAssets";
import { useTransactions } from "../../../hooks/useTransactions";
import { useCardAccount } from "../../../hooks/useCardAccount";
import { useKycStart } from "../../../hooks/useKycStart";
import { CardFolderPanel } from "../../../components/card/CardFolderPanel";
import { KycSheet } from "../../../components/card/KycSheet";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { DesktopOverview } from "../../../components/home/DesktopOverview";

function CoinStackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-ink-2" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </svg>
  );
}

function EmptyAssetsMobile() {
  return (
    <div className="flex flex-col items-center px-5 py-7 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.2)]">
        <CoinStackIcon />
      </div>
      <p className="mt-3 text-[13.5px] font-semibold text-ink">Nothing in this wallet yet</p>
      <p className="mt-1 max-w-[230px] text-[12.5px] leading-snug text-muted">Fund it with Sepolia ETH or testnet CTC and the balances will show here.</p>
    </div>
  );
}

function MobileHome() {
  const nav = useNav();
  const { loading, assets, totalUsd } = useWalletAssets();
  const { loading: txLoading, items: transactions } = useTransactions();
  const { account, refresh } = useCardAccount();
  const { verify, url: kycUrl, close: closeKyc, starting, error: kycError, clearError } = useKycStart();
  const funded = assets.some((a) => a.amount > 0n);

  // Didit answers through a webhook, never to the tab that opened it, so the card unlocks on the
  // way back rather than on a response.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!kycError) return;
    const timer = setTimeout(clearError, 4000);
    return () => clearTimeout(timer);
  }, [kycError, clearError]);

  // Depositing into a card nobody has issued yet is not a thing you can do, so until identity
  // clears the primary action is the step that actually unblocks the user.
  const needsVerification = account !== null && !account.kyc.verified;
  const preview = transactions.slice(0, 3);
  const hasMore = transactions.length > 3;

  return (
    <div>
      <div className="stagger">
      {loading ? (
        <div className="py-[30px] text-center">
          <Skeleton className="mx-auto h-4 w-28" />
          <Skeleton className="mx-auto mt-3 h-[46px] w-[210px] rounded-lg" />
        </div>
      ) : (
        <AssetHero assets={assets} totalUsd={totalUsd} />
      )}
      <CardFolderPanel account={account} className="mb-[26px]" />

      {needsVerification ? (
        <Button className="mb-[22px]" onClick={verify} disabled={starting}>
          {starting ? "Opening…" : "Verify identity"}
        </Button>
      ) : (
        <Button className="mb-[22px]" onClick={() => nav.forward("/deposit")}>Deposit</Button>
      )}

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Assets</h2>
      <Card className="mb-[22px] px-5 py-1">
        {loading ? (
          <div className="flex flex-col gap-4 py-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-[13px]">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : !funded ? (
          <EmptyAssetsMobile />
        ) : (
          <div className="fade-in">{assets.map((a, i) => <AssetRow key={a.token} asset={a} first={i === 0} />)}</div>
        )}
      </Card>

      <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Transactions</h2>
      <Card className="px-5 pb-2 pt-1">
        <ActivityList
          items={preview}
          loading={txLoading}
          reviewed
          emptyTitle="No transactions yet"
          emptyDescription="Locks, draws and repayments will show here once they are on chain."
        />
        {hasMore && (
          <button
            onClick={() => nav.forward("/transactions")}
            className="mt-1.5 flex w-full items-center justify-center border-t border-line pb-[3px] pt-[13px] text-[13.5px] font-medium text-muted"
          >
            View all transactions
          </button>
        )}
      </Card>
      </div>

      <KycSheet
        open={!!kycUrl}
        url={kycUrl}
        verified={!!account?.kyc.verified}
        onClose={closeKyc}
        onPoll={refresh}
      />
      <Toast open={!!kycError} message={kycError ?? ""} />
    </div>
  );
}

export default function HomePage() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopOverview /> : <MobileHome />;
}
