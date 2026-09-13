"use client";
import { useQuery } from "@tanstack/react-query";
import type { UsdPrices } from "../lib/comacard/prices";

/**
 * USD prices, read through this app's own route rather than from CoinGecko directly.
 *
 * See `app/api/prices/route.ts` for why the hop exists: the keyless API is rate limited per IP and
 * documents itself as unsuitable for polling, so one server-side cache serves everybody.
 *
 * An hour of `staleTime` and no refetch on focus or reconnect. These figures are decoration beside
 * numbers read from chains; re-fetching them because somebody switched tabs would spend requests to
 * change the fourth decimal of a caption.
 *
 * **Failure is empty, never zero.** The route answers `{}` when it has nothing, `usdOf` returns
 * null for a symbol with no price, and every caller falls back to showing tCTC. There is no error
 * state to render because there is nothing a person would do about it.
 */
export function usePrices(): { prices: UsdPrices; loading: boolean } {
  const query = useQuery({
    queryKey: ["comacard", "prices"],
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // One retry. If the shared cache cannot answer twice, it will not answer on a third either, and
    // the screens have somewhere to fall back to.
    retry: 1,
    queryFn: async (): Promise<UsdPrices> => {
      const response = await fetch("/api/prices", { headers: { accept: "application/json" } });
      if (!response.ok) return {};
      return (await response.json()) as UsdPrices;
    },
  });

  return { prices: query.data ?? {}, loading: query.isLoading };
}
