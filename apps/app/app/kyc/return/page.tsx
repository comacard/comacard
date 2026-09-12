import Link from "next/link";

/**
 * Where Didit sends the user after verification (`KYC_CALLBACK_URL`).
 *
 * **This page has no logic on purpose, and must not grow any.** The verdict reaches us through
 * Didit's webhook to `apps/kyc`, never through this redirect, so anything decided here from the
 * query string would be a second source of truth for whether someone is verified — and the one a
 * user can edit in their address bar. The page says what Didit said and sends them back.
 *
 * It carries the route name from the app this one replaced, because the KYC service on Railway is
 * configured with the path. Renaming it here without repointing `KYC_CALLBACK_URL` would land every
 * verified user on a 404, and it would fail quietly: the webhook still records them, so only the
 * person verifying would ever see it.
 *
 * The card screen re-reads on focus, so a user who closes this tab instead of tapping through still
 * gets their card the moment the webhook lands.
 */
export default async function KycReturn({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const approved = status === "Approved";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 bg-bg px-5 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Verification</p>
      <h1 className="text-[28px] font-semibold tracking-[-.02em]">
        {approved ? "All done" : (status ?? "Finished")}
      </h1>
      <p className="max-w-[300px] text-[13.5px] leading-snug text-muted">
        {approved
          ? "Your identity is verified. Your card unlocks as soon as the confirmation reaches us."
          : "Didit is still reviewing, or needs another look. Your card updates on its own when the result arrives."}
      </p>
      <Link
        href="/card"
        className="mt-4 inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold text-[#f8f8f8] no-underline [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),0_10px_22px_-10px_rgba(0,0,0,.42)]"
      >
        Back to your card
      </Link>
    </main>
  );
}
