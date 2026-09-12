"use client";
import { useState } from "react";
import type { WalletAsset } from "../../hooks/useWalletAssets";
import { toNumber } from "../../hooks/useWalletAssets";
import { BucketToggle } from "../bucket/BucketToggle";
import { CountUp } from "../ui";

/**
 * Home's headline figure: everything the wallet holds, in USD, with the same cycle pill the bucket
 * hero used. Tapping through moves from the total to each asset's own balance.
 *
 * When a price cannot be read the total is not rendered as $0.00. A zero balance and an unknown
 * price look identical in dollars and mean opposite things, so the unknown says so.
 */
const dec = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AssetHero({
  assets,
  totalUsd,
}: {
  assets: WalletAsset[];
  totalUsd: number | null;
}) {
  const views = [
    {
      label: "Total value",
      name: "All assets",
      token: undefined,
      text: totalUsd === null ? "unavailable" : `$${dec(totalUsd)}`,
      valueNum: totalUsd ?? 0,
      fmt: (n: number) => (totalUsd === null ? "unavailable" : `$${dec(n)}`),
    },
    ...assets.map((a) => {
      const digits = (v: number) => (v > 0 && v < 1 ? 4 : 2);
      const amount = toNumber(a.amount, a.decimals);
      return {
        label: a.name,
        name: a.symbol,
        token: a.token,
        text: `${dec(amount)} ${a.symbol}`,
        valueNum: amount,
        fmt: (n: number) =>
          `${n.toLocaleString("en-US", { minimumFractionDigits: digits(amount), maximumFractionDigits: digits(amount) })} ${a.symbol}`,
      };
    }),
  ];

  const [i, setI] = useState(0);
  const index = Math.min(i, views.length - 1);
  const v = views[index] ?? views[0]!;

  return (
    <div className="py-[30px] text-center">
      <div className="text-[15px] font-medium text-muted">{v.label}</div>
      {/*
        `key` remounts CountUp whenever the view changes, so each one counts up from zero.
        Without it the animation runs from the PREVIOUS view's number, and cycling 7,999.98 tCTC to
        0.0071 ETH counts down through "3,025.5521 ETH" — a figure that means nothing in either
        unit, and long enough to wrap the symbol onto its own line.

        `clamp` because the widest string here is a token balance, not a dollar amount: "7,999.98
        tCTC" at a fixed 54px overflows a 390px phone.
      */}
      <CountUp
        key={v.name}
        animateOnMount
        from={0}
        value={v.valueNum}
        format={v.fmt}
        className="mt-2 block whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
      />
      <BucketToggle
        views={views}
        index={index}
        onCycle={() => setI((n) => (n + 1) % views.length)}
      />
    </div>
  );
}
