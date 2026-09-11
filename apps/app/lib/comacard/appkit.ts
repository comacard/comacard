import type { AppKit } from "@reown/appkit";
import { metadata, networks, projectId, wagmiAdapter } from "./wagmi";

/**
 * The one AppKit instance, built lazily in the browser.
 *
 * Reown's own guidance is to call `createAppKit` at module scope, and this does exactly that in
 * effect: it runs once, on first need, and every later caller gets the same instance. What it
 * deliberately avoids is running during **server** rendering. `Web3Provider` is a client component,
 * but Next still evaluates its module graph on the server, and a static `createAppKit` there pulls
 * the connector stack into the SSR bundle. That is how the ethers adapter took every route down
 * with an unresolvable `@x402/*` import; the shape of that failure is not adapter-specific, so the
 * guard stays.
 *
 * `Web3Provider` warms this from an effect, so the modal is built and ready before anyone taps
 * Connect rather than on the tap itself.
 */

const METAMASK_ID = "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96";
const RABBY_ID = "18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1";

let instance: AppKit | null = null;
let building: Promise<AppKit> | null = null;

export function getAppKit(): Promise<AppKit> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("AppKit is client-only"));
  }
  if (instance) return Promise.resolve(instance);
  if (!building) {
    building = (async () => {
      const { createAppKit } = await import("@reown/appkit/react");
      instance = createAppKit({
        adapters: [wagmiAdapter],
        networks,
        // Sepolia, the first entry, is what AppKit connects on. See the ordering note in wagmi.ts:
        // leading with Creditcoin fails the connect for any wallet that has not added CC3.
        defaultNetwork: networks[0],
        projectId,
        metadata,
        featuredWalletIds: [METAMASK_ID, RABBY_ID],
        // Email and social sign-in mint a wallet with no on-chain history, which is the entire
        // product. On-ramp and swaps are out of scope.
        features: { email: false, socials: false, onramp: false, swaps: false, analytics: false },
        themeMode: "light",
      });
      return instance;
    })();
    // A failed build must not be cached, or every later attempt replays the same error.
    building.catch(() => {
      building = null;
    });
  }
  return building;
}
