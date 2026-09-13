"use client";
import { useState } from "react";
import { formatUnits } from "viem";
import type { CollateralAsset } from "../../hooks/useCollateral";
import type { RemoteAsset } from "../../hooks/useRemoteCollateral";
import { NATIVE_SYMBOL } from "../../lib/comacard/contracts";
import { AssetIcon, badgeForSymbol, CoinBadge, LoadMore, Section, Skeleton } from "../ui";
import type { TokenSym } from "../ui/CoinBadge";

/**
 * What the limit is built on, one row per asset.
 *
 * The column that matters is **proved**, not locked. A deposit sitting in the Sepolia vault raises
 * nothing until Attestcoin has carried it across, which takes seven to nine minutes. During that
 * window the two numbers genuinely disagree, and a row that showed only the locked amount would be
 * claiming credit the chain has not granted yet. So a crossing asset says so, in words.
 *
 * Assets with nothing in them are dropped rather than listed at zero: three empty stablecoin rows
 * tell the holder nothing except that the screen has rows.
 *
 * **A read still in flight is a skeleton, never an absence.** The two carriers are read from
 * different chains and arrive seconds apart: Sepolia answers in well under a second and the
 * Wormhole hub sits on Creditcoin, whose RPC takes about four seconds a call and is asked several
 * times. Rendering only what had landed meant the card appeared complete, with BNB simply missing,
 * and then grew a row underneath the reader. A short row of placeholders says "there is more" for
 * the same reason an unread figure is a dash rather than a zero.
 *
 * **Every row carries its network, and no row is a link.** Both of those are corrections.
 *
 * The network, because USDC on Base and USDC on Arbitrum are different assets in different vaults:
 * two rows reading "USDC" with no chain would be indistinguishable and wrong. The Sepolia rows used
 * to spend that line on "Released by us, not by you", which answered a question about withdrawal on
 * a list that is not about withdrawal, and left the one fact every other row showed missing from
 * these two.
 *
 * No link, because only the Wormhole rows had one. A chevron on one row and not the next reads as a
 * feature that failed to load rather than as a property of the carrier, and the list was the wrong
 * place to carry that distinction anyway: it exists to say what backs the limit. Withdrawal lives in
 * the overflow menu, where it can list only what is actually withdrawable without half the rows
 * having to explain themselves.
 */
const BADGE: Record<string, TokenSym> = { ETH: "ETH", tWETH: "ETH", tUSDC: "USDC", tUSDT: "USDC" };

/** Rows visible before "Load more". Four fills the card without turning Home into a scroll. */
const PAGE = 4;

/** Attestcoin proves Sepolia and Ethereum mainnet only, and the deployed line is bound to Sepolia. */
const ATTESTCOIN_NETWORK = "Ethereum Sepolia";

function amount(value: bigint, decimals: number, symbol: string): string {
  const n = Number(formatUnits(value, decimals));
  const digits = n > 0 && n < 1 ? 4 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${symbol}`;
}

/** Credit-asset value of a holding: price is per WHOLE unit, so scale by the token's own decimals. */
function valueCtc(asset: CollateralAsset, held: bigint): string {
  const whole = Number(formatUnits(held, asset.decimals));
  const price = Number(formatUnits(asset.price, 18));
  return (whole * price).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function remoteValueCtc(asset: RemoteAsset): string {
  const whole = Number(formatUnits(asset.credited, asset.decimals));
  const price = Number(formatUnits(asset.price, 18));
  return (whole * price).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

/**
 * One row, and the two carriers now produce the same one.
 *
 * `note` is the only thing that varies between them, and it is the network in both cases except
 * while an Attestcoin deposit is still crossing, which is temporary and worth saying over the
 * network name because it is the reason the figure looks short.
 */
function Row({
  badge,
  chainName,
  symbol,
  note,
  noteWarn = false,
  held,
  value,
  first,
}: {
  badge: TokenSym;
  chainName: string;
  symbol: string;
  note: string;
  noteWarn?: boolean;
  held: string;
  value: string;
  first: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 py-3.5 ${first ? "" : "border-t border-line"}`}>
      <AssetIcon chainName={chainName} badgeSize={14}>
        <CoinBadge token={badge} size={32} />
      </AssetIcon>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{symbol}</div>
        <div className={`mt-0.5 text-[11.5px] ${noteWarn ? "text-warn" : "text-muted"}`}>
          {note}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[14px] font-semibold tabular-nums">{held}</div>
        <div className="text-[11.5px] text-muted tabular-nums">{value} tCTC</div>
      </div>
    </div>
  );
}

export function CollateralList({
  assets,
  remote = [],
  loading = false,
  className = "mt-4",
}: {
  assets: CollateralAsset[];
  remote?: RemoteAsset[];
  /** True while either carrier is still being read. See the note above on why this is not absence. */
  loading?: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(PAGE);

  const held = assets.filter((a) => a.locked > 0n || a.proved > 0n);
  const heldRemote = remote.filter((a) => a.credited > 0n);

  // Flattened before paging, so "Load more" counts rows rather than carriers. Paging each list
  // separately would show four of one and none of the other and call that a page.
  const rows = [
    ...held.map((asset) => ({
      key: asset.token ?? "native",
      badge: BADGE[asset.symbol] ?? ("CTC" as TokenSym),
      chainName: "Sepolia",
      symbol: asset.symbol,
      note: asset.crossing
        ? `${amount(asset.locked - asset.proved, asset.decimals, asset.symbol)} still crossing`
        : ATTESTCOIN_NETWORK,
      noteWarn: asset.crossing,
      held: amount(asset.proved, asset.decimals, asset.symbol),
      value: valueCtc(asset, asset.proved),
    })),
    ...heldRemote.map((asset) => {
      const symbol = asset.native ? (NATIVE_SYMBOL[asset.wormholeChainId] ?? "ETH") : "USDC";
      return {
        key: asset.id,
        badge: badgeForSymbol(symbol),
        chainName: asset.chainName,
        symbol,
        note: asset.chainName,
        noteWarn: false,
        held: amount(asset.credited, asset.decimals, symbol),
        value: remoteValueCtc(asset),
      };
    }),
  ];

  // Nothing read yet and something still coming: placeholders rather than an empty screen.
  if (rows.length === 0 && loading) {
    return (
      <Section title="Assets held" className={className}>
        <div className="rounded-[16px] border border-line bg-white px-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`flex items-center gap-3 py-3.5 ${i === 0 ? "" : "border-t border-line"}`}
            >
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-[13px] w-16 rounded" />
                <Skeleton className="mt-1.5 h-[11px] w-24 rounded" />
              </div>
              <div className="flex flex-col items-end">
                <Skeleton className="h-[13px] w-20 rounded" />
                <Skeleton className="mt-1.5 h-[11px] w-14 rounded" />
              </div>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (rows.length === 0) return null;
  const visible = rows.slice(0, shown);

  return (
    <Section title="Assets held" className={className}>
      <div className="rounded-[16px] border border-line bg-white px-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
        {visible.map(({ key, ...row }, i) => (
          <Row key={key} {...row} first={i === 0} />
        ))}
        {loading ? (
          <div className="flex items-center gap-3 border-t border-line py-3.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[13px] w-16 rounded" />
              <Skeleton className="mt-1.5 h-[11px] w-24 rounded" />
            </div>
          </div>
        ) : null}
        {visible.length < rows.length ? (
          <LoadMore onClick={() => setShown((n) => n + PAGE)} />
        ) : null}
      </div>
    </Section>
  );
}
