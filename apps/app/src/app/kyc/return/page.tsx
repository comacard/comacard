import Link from "next/link";

/**
 * Where Didit sends the user afterwards (KYC_CALLBACK_URL). The webhook, not
 * this page, is what updates the record; this page only tells the user what
 * Didit said and sends them back to the card, which re-fetches.
 */
export default async function KycReturn({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const approved = status === "Approved";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="text-sm uppercase tracking-widest text-ink/60">Verification</p>
      <h1 className="text-3xl font-semibold">{status ?? "Finished"}</h1>
      <p className="text-ink/70">
        {approved
          ? "Your identity is verified. Your card unlocks as soon as the confirmation lands."
          : "Didit is still processing or needs another look. Your card updates automatically."}
      </p>
      <Link href="/" className="mt-4 rounded-full bg-ink px-6 py-3 text-canvas">
        Back to card
      </Link>
    </main>
  );
}
